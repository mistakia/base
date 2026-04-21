/* global describe, it, beforeEach, afterEach */

import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import {
  run_reconcile_sweep,
  _reset_sweep_state_for_tests
} from '#libs-server/embedded-database-index/sync/reconcile-sweep.mjs'

function make_metrics() {
  const counters = new Map()
  const timings = new Map()
  return {
    increment(name, delta = 1) {
      if (delta === 0) return
      counters.set(name, (counters.get(name) || 0) + delta)
    },
    timing(name, duration_ms) {
      timings.set(name, duration_ms)
    },
    counters,
    timings
  }
}

function make_index_manager() {
  const sync_calls = []
  const remove_calls = []
  return {
    sync_calls,
    remove_calls,
    async sync_entity(args) {
      sync_calls.push(args)
      return { success: true, sqlite_synced: true }
    },
    async remove_entity(args) {
      remove_calls.push(args)
    },
    _metrics: null
  }
}

async function write_entity_file({ dir, relative_path, updated_at }) {
  const absolute_path = path.join(dir, relative_path)
  await fs.mkdir(path.dirname(absolute_path), { recursive: true })
  const body = `---
title: Fixture
type: task
base_uri: user:${relative_path}
updated_at: '${updated_at}'
---

Fixture body.
`
  await fs.writeFile(absolute_path, body)
  return absolute_path
}

describe('run_reconcile_sweep', () => {
  let tmpdir

  beforeEach(async () => {
    _reset_sweep_state_for_tests()
    tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'reconcile-sweep-'))
  })

  afterEach(async () => {
    _reset_sweep_state_for_tests()
    if (tmpdir) {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => {})
    }
  })

  it('calls sync_entity for missing rows', async () => {
    const relative_path = 'task/missing-fixture.md'
    await write_entity_file({
      dir: tmpdir,
      relative_path,
      updated_at: '2026-04-20T00:00:00.000Z'
    })

    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map([[`user:${relative_path}`, Date.now()]])
    const db_map = new Map()

    const result = await run_reconcile_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => file_map,
      load_db_map: async () => db_map
    })

    expect(result.ran).to.equal(true)
    expect(result.missing).to.equal(1)
    expect(manager.sync_calls).to.have.lengthOf(1)
    expect(manager.sync_calls[0].base_uri).to.equal(`user:${relative_path}`)
    expect(manager.remove_calls).to.have.lengthOf(0)
    expect(metrics.counters.get('reconcile_missing')).to.equal(1)
    expect(metrics.counters.get('reconciliations')).to.equal(1)
  })

  it('calls sync_entity for drifted rows', async () => {
    const relative_path = 'task/drifted-fixture.md'
    await write_entity_file({
      dir: tmpdir,
      relative_path,
      updated_at: '2026-04-20T10:00:00.000Z'
    })

    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map([[`user:${relative_path}`, Date.now()]])
    const db_map = new Map([
      [`user:${relative_path}`, Date.parse('2026-04-01T00:00:00.000Z')]
    ])

    const result = await run_reconcile_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => file_map,
      load_db_map: async () => db_map
    })

    expect(result.drift).to.equal(1)
    expect(manager.sync_calls).to.have.lengthOf(1)
    expect(metrics.counters.get('reconcile_drift')).to.equal(1)
  })

  it('is a no-op for in-sync rows', async () => {
    const relative_path = 'task/in-sync-fixture.md'
    await write_entity_file({
      dir: tmpdir,
      relative_path,
      updated_at: '2026-04-20T10:00:00.000Z'
    })
    const absolute_path = path.join(tmpdir, relative_path)
    const stat = await fs.stat(absolute_path)

    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map([[`user:${relative_path}`, stat.mtimeMs]])
    const db_map = new Map([[`user:${relative_path}`, stat.mtimeMs]])

    const result = await run_reconcile_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => file_map,
      load_db_map: async () => db_map
    })

    expect(result.missing).to.equal(0)
    expect(result.drift).to.equal(0)
    expect(result.orphaned).to.equal(0)
    expect(manager.sync_calls).to.have.lengthOf(0)
    expect(manager.remove_calls).to.have.lengthOf(0)
  })

  it('calls remove_entity for orphaned rows', async () => {
    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map()
    const db_map = new Map([
      [`user:task/ghost.md`, Date.parse('2026-04-01T00:00:00.000Z')]
    ])

    const result = await run_reconcile_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => file_map,
      load_db_map: async () => db_map
    })

    expect(result.orphaned).to.equal(1)
    expect(manager.remove_calls).to.have.lengthOf(1)
    expect(manager.remove_calls[0].base_uri).to.equal('user:task/ghost.md')
    expect(metrics.counters.get('reconcile_orphans')).to.equal(1)
  })

  it('returns immediately when re-entered during active sweep', async () => {
    const metrics = make_metrics()
    const manager = make_index_manager()

    let resolve_first
    const first_file_map = new Promise((resolve) => {
      resolve_first = resolve
    })

    const first = run_reconcile_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => first_file_map,
      load_db_map: async () => new Map()
    })

    let first_result
    try {
      // Give the first sweep a tick to mark sweep_in_progress
      await new Promise((resolve) => setImmediate(resolve))

      const second = await run_reconcile_sweep({
        user_base_directory: tmpdir,
        index_manager: manager,
        metrics,
        load_file_map: async () => new Map(),
        load_db_map: async () => new Map()
      })

      expect(second.ran).to.equal(false)
    } finally {
      resolve_first(new Map())
      first_result = await first
    }

    expect(first_result.ran).to.equal(true)
  })

  it('treats rows with null updated_at as missing, not drift-with-skip', async () => {
    const relative_path = 'task/null-updated.md'
    await write_entity_file({
      dir: tmpdir,
      relative_path,
      updated_at: '2026-04-20T10:00:00.000Z'
    })

    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map([[`user:${relative_path}`, Date.now()]])
    // Simulate a corrupt DB row whose updated_at was null / unparseable.
    const db_map = new Map([[`user:${relative_path}`, 0]])

    const result = await run_reconcile_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => file_map,
      load_db_map: async () => db_map
    })

    expect(result.missing).to.equal(1)
    expect(result.drift).to.equal(0)
    expect(manager.sync_calls).to.have.lengthOf(1)
  })

  it('syncs drifted rows even when frontmatter updated_at is missing', async () => {
    const relative_path = 'task/no-frontmatter-timestamp.md'
    const absolute_path = path.join(tmpdir, relative_path)
    await fs.mkdir(path.dirname(absolute_path), { recursive: true })
    await fs.writeFile(
      absolute_path,
      `---
title: Missing timestamp
type: task
base_uri: user:${relative_path}
---

Body.
`
    )

    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map([[`user:${relative_path}`, Date.now()]])
    const db_map = new Map([
      [`user:${relative_path}`, Date.parse('2026-04-01T00:00:00.000Z')]
    ])

    const result = await run_reconcile_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => file_map,
      load_db_map: async () => db_map
    })

    expect(result.drift).to.equal(1)
    expect(manager.sync_calls).to.have.lengthOf(1)
  })

  it('increments reconcile_missing, reconcile_drift, reconcile_orphans counters per category', async () => {
    const missing_path = 'task/miss.md'
    const drift_path = 'task/drift.md'
    await write_entity_file({
      dir: tmpdir,
      relative_path: missing_path,
      updated_at: '2026-04-20T00:00:00.000Z'
    })
    await write_entity_file({
      dir: tmpdir,
      relative_path: drift_path,
      updated_at: '2026-04-20T00:00:00.000Z'
    })

    const metrics = make_metrics()
    const manager = make_index_manager()

    const now = Date.now()
    const file_map = new Map([
      [`user:${missing_path}`, now],
      [`user:${drift_path}`, now]
    ])
    const db_map = new Map([
      [`user:${drift_path}`, Date.parse('2026-04-01T00:00:00.000Z')],
      [`user:task/orphan.md`, Date.parse('2026-04-01T00:00:00.000Z')]
    ])

    await run_reconcile_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => file_map,
      load_db_map: async () => db_map
    })

    expect(metrics.counters.get('reconcile_missing')).to.equal(1)
    expect(metrics.counters.get('reconcile_drift')).to.equal(1)
    expect(metrics.counters.get('reconcile_orphans')).to.equal(1)
    expect(metrics.counters.get('reconciliations')).to.equal(1)
  })
})
