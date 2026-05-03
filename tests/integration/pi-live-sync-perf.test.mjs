import { describe, it, beforeEach, afterEach } from 'mocha'
import { expect } from 'chai'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

import { import_pi_sessions } from '#libs-server/integrations/pi/index.mjs'
import { clear_pi_sync_state } from '#libs-server/integrations/pi/pi-sync-state.mjs'
import {
  create_temp_test_repo,
  seed_pi_thread
} from '#tests/utils/index.mjs'

const FIXTURE = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'pi',
  'v3-multi-leaf.jsonl'
)

const append_line = async (file_path, obj) => {
  await fs.appendFile(file_path, JSON.stringify(obj) + '\n')
}

const percentile = (sorted_ns, p) => {
  const idx = Math.min(
    sorted_ns.length - 1,
    Math.floor((p / 100) * sorted_ns.length)
  )
  return sorted_ns[idx]
}

describe('pi live sync performance', function () {
  this.timeout(180_000)

  let temp_repo
  let user_base_directory
  let session_file

  beforeEach(async () => {
    temp_repo = await create_temp_test_repo({
      prefix: 'pi-perf-',
      register_directories: true
    })
    user_base_directory = temp_repo.user_path
    await fs.mkdir(path.join(user_base_directory, 'thread'), {
      recursive: true
    })
    session_file = path.join(
      os.tmpdir(),
      `pi-perf-test-${crypto.randomBytes(4).toString('hex')}.jsonl`
    )
    await fs.copyFile(FIXTURE, session_file)
  })

  afterEach(async () => {
    if (session_file) {
      await clear_pi_sync_state({ session_file })
      try {
        await fs.unlink(session_file)
      } catch {}
    }
    if (temp_repo) temp_repo.cleanup()
  })

  it('1000-tick append-and-sync: ticks 2..1000 take the delta path with p95 under 200ms', async () => {
    const thread_id = crypto.randomUUID()
    await seed_pi_thread({
      user_base_directory,
      thread_id,
      session_id: 'sess-v3-multi-branch-0'
    })

    const tick_durations_ns = []

    // First tick: full path (no sync state yet).
    const t0 = process.hrtime.bigint()
    const first = await import_pi_sessions({
      session_file,
      known_thread_id: thread_id,
      allow_updates: true,
      user_base_directory,
      bulk_import: true,
      single_leaf_only: true
    })
    const t1 = process.hrtime.bigint()
    const first_ns = t1 - t0
    expect(first.threads_updated + first.threads_created).to.be.greaterThan(0)
    expect(first.delta).to.not.equal(true)

    // Ticks 2..1000: append one entry to the active leaf, then sync.
    let parent_id = 'b'
    let delta_ticks = 0
    const TOTAL = 1000
    for (let i = 2; i <= TOTAL; i++) {
      const next_id = `c${i}`
      await append_line(session_file, {
        id: next_id,
        parentId: parent_id,
        type: 'message',
        timestamp: `2026-04-02T00:01:${String(i % 60).padStart(2, '0')}.000Z`,
        message: {
          role: i % 2 === 0 ? 'assistant' : 'user',
          content: [{ type: 'text', text: `entry ${i}` }],
          timestamp: `2026-04-02T00:01:${String(i % 60).padStart(2, '0')}.000Z`
        }
      })
      parent_id = next_id

      const start = process.hrtime.bigint()
      const result = await import_pi_sessions({
        session_file,
        known_thread_id: thread_id,
        allow_updates: true,
        user_base_directory,
        bulk_import: true,
        single_leaf_only: true
      })
      const end = process.hrtime.bigint()
      tick_durations_ns.push(end - start)
      if (result.delta === true) delta_ticks++
    }

    // Ticks 2..1000 should hit the delta path.
    expect(delta_ticks).to.be.greaterThan(TOTAL - 50)

    const sorted = [...tick_durations_ns].sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0
    )
    const p95_ns = percentile(sorted, 95)
    const p95_ms = Number(p95_ns) / 1e6
    const p50_ms = Number(percentile(sorted, 50)) / 1e6
    // eslint-disable-next-line no-console
    console.log(
      `[pi-live-sync-perf] first(full)=${(Number(first_ns) / 1e6).toFixed(1)}ms ` +
        `delta_ticks=${delta_ticks}/${TOTAL - 1} ` +
        `p50=${p50_ms.toFixed(1)}ms p95=${p95_ms.toFixed(1)}ms`
    )

    expect(p95_ms, `p95 was ${p95_ms.toFixed(1)}ms`).to.be.lessThan(200)
  })
})
