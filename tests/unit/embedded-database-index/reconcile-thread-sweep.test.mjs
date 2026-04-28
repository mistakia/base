/* global describe, it, beforeEach, afterEach */

import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import {
  run_reconcile_thread_sweep,
  _reset_thread_sweep_state_for_tests
} from '#libs-server/embedded-database-index/sync/reconcile-thread-sweep.mjs'

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
    async sync_thread(args) {
      sync_calls.push(args)
      return { success: true }
    },
    async remove_thread(args) {
      remove_calls.push(args)
    },
    _metrics: null
  }
}

async function write_thread_metadata({ dir, thread_id, updated_at }) {
  const thread_path = path.join(dir, 'thread', thread_id)
  await fs.mkdir(thread_path, { recursive: true })
  const metadata_path = path.join(thread_path, 'metadata.json')
  await fs.writeFile(
    metadata_path,
    JSON.stringify({ thread_id, updated_at }, null, 2)
  )
  return metadata_path
}

describe('run_reconcile_thread_sweep', () => {
  let tmpdir

  beforeEach(async () => {
    _reset_thread_sweep_state_for_tests()
    tmpdir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'reconcile-thread-sweep-')
    )
  })

  afterEach(async () => {
    _reset_thread_sweep_state_for_tests()
    if (tmpdir) {
      await fs.rm(tmpdir, { recursive: true, force: true }).catch(() => {})
    }
  })

  it('calls sync_thread for missing rows', async () => {
    const thread_id = '11111111-1111-1111-1111-111111111111'
    await write_thread_metadata({
      dir: tmpdir,
      thread_id,
      updated_at: '2026-04-20T00:00:00.000Z'
    })

    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map([[thread_id, Date.now()]])
    const db_map = new Map()

    const result = await run_reconcile_thread_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => file_map,
      load_db_map: async () => db_map
    })

    expect(result.ran).to.equal(true)
    expect(result.missing).to.equal(1)
    expect(manager.sync_calls).to.have.lengthOf(1)
    expect(manager.sync_calls[0].thread_id).to.equal(thread_id)
    expect(manager.remove_calls).to.have.lengthOf(0)
    expect(metrics.counters.get('thread_reconcile_missing')).to.equal(1)
    expect(metrics.counters.get('thread_reconciliations')).to.equal(1)
  })

  it('calls sync_thread for drifted rows', async () => {
    const thread_id = '22222222-2222-2222-2222-222222222222'
    await write_thread_metadata({
      dir: tmpdir,
      thread_id,
      updated_at: '2026-04-20T10:00:00.000Z'
    })

    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map([[thread_id, Date.now()]])
    const db_map = new Map([
      [thread_id, Date.parse('2026-04-01T00:00:00.000Z')]
    ])

    const result = await run_reconcile_thread_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => file_map,
      load_db_map: async () => db_map
    })

    expect(result.drift).to.equal(1)
    expect(manager.sync_calls).to.have.lengthOf(1)
    expect(metrics.counters.get('thread_reconcile_drift')).to.equal(1)
  })

  it('is a no-op for in-sync rows', async () => {
    const thread_id = '33333333-3333-3333-3333-333333333333'
    const metadata_path = await write_thread_metadata({
      dir: tmpdir,
      thread_id,
      updated_at: '2026-04-20T10:00:00.000Z'
    })
    const stat = await fs.stat(metadata_path)

    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map([[thread_id, stat.mtimeMs]])
    const db_map = new Map([[thread_id, stat.mtimeMs]])

    const result = await run_reconcile_thread_sweep({
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

  it('logs but does not remove orphans by default', async () => {
    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map()
    const db_map = new Map([
      ['44444444-4444-4444-4444-444444444444', Date.now()]
    ])

    const result = await run_reconcile_thread_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => file_map,
      load_db_map: async () => db_map
    })

    expect(result.orphaned).to.equal(0)
    expect(result.orphans_detected).to.equal(1)
    expect(manager.remove_calls).to.have.lengthOf(0)
    expect(
      metrics.counters.get('thread_reconcile_orphans_detected')
    ).to.equal(1)
  })

  it('removes orphans when remove_orphans is true', async () => {
    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map()
    const db_map = new Map([
      ['55555555-5555-5555-5555-555555555555', Date.now()]
    ])

    const result = await run_reconcile_thread_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => file_map,
      load_db_map: async () => db_map,
      remove_orphans: true
    })

    expect(result.orphaned).to.equal(1)
    expect(manager.remove_calls).to.have.lengthOf(1)
    expect(manager.remove_calls[0].thread_id).to.equal(
      '55555555-5555-5555-5555-555555555555'
    )
    expect(metrics.counters.get('thread_reconcile_orphans')).to.equal(1)
  })

  it('returns immediately when re-entered during active sweep', async () => {
    const metrics = make_metrics()
    const manager = make_index_manager()

    let resolve_first
    const first_file_map = new Promise((resolve) => {
      resolve_first = resolve
    })

    const first = run_reconcile_thread_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_file_map: async () => first_file_map,
      load_db_map: async () => new Map()
    })

    let first_result
    try {
      await new Promise((resolve) => setImmediate(resolve))

      const second = await run_reconcile_thread_sweep({
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

  it('treats rows with null updated_at as missing', async () => {
    const thread_id = '66666666-6666-6666-6666-666666666666'
    await write_thread_metadata({
      dir: tmpdir,
      thread_id,
      updated_at: '2026-04-20T10:00:00.000Z'
    })

    const metrics = make_metrics()
    const manager = make_index_manager()

    const file_map = new Map([[thread_id, Date.now()]])
    const db_map = new Map([[thread_id, 0]])

    const result = await run_reconcile_thread_sweep({
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

  it('builds file_map from real disk by walking thread/ directory', async () => {
    const a = '77777777-7777-7777-7777-777777777777'
    const b = '88888888-8888-8888-8888-888888888888'
    await write_thread_metadata({
      dir: tmpdir,
      thread_id: a,
      updated_at: '2026-04-20T10:00:00.000Z'
    })
    await write_thread_metadata({
      dir: tmpdir,
      thread_id: b,
      updated_at: '2026-04-20T10:00:00.000Z'
    })

    const metrics = make_metrics()
    const manager = make_index_manager()

    const result = await run_reconcile_thread_sweep({
      user_base_directory: tmpdir,
      index_manager: manager,
      metrics,
      load_db_map: async () => new Map()
    })

    expect(result.missing).to.equal(2)
    expect(manager.sync_calls).to.have.lengthOf(2)
    const ids = manager.sync_calls.map((c) => c.thread_id).sort()
    expect(ids).to.deep.equal([a, b])
  })
})
