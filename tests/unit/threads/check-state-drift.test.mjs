import { expect } from 'chai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { check_state_drift } from '#libs-server/threads/check-state-drift.mjs'
import { PROVENANCE } from '#libs-shared/timeline/entry-provenance.mjs'

const write_timeline = async (timeline_path, entries) => {
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
  await fs.writeFile(timeline_path, lines, 'utf-8')
}

const make_state_change = ({
  id = 'thread_state_1',
  timestamp = '2026-04-10T00:00:00.000Z',
  from_state = 'active',
  to_state = 'archived',
  archived_at,
  ...rest
} = {}) => {
  const metadata = { from_state, to_state }
  const reason = 'reason' in rest ? rest.reason : 'completed'
  if (reason !== undefined) metadata.reason = reason
  if (archived_at) metadata.archived_at = archived_at
  return {
    id,
    timestamp,
    type: 'system',
    system_type: 'state_change',
    content: `${from_state} -> ${to_state}`,
    metadata,
    schema_version: 2,
    provenance: PROVENANCE.RUNTIME_EVENT
  }
}

describe('check_state_drift', function () {
  this.timeout(5000)

  let tmp_dir
  let timeline_path

  beforeEach(async function () {
    tmp_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'check-state-drift-'))
    timeline_path = path.join(tmp_dir, 'timeline.jsonl')
  })

  afterEach(async function () {
    await fs.rm(tmp_dir, { recursive: true, force: true })
  })

  it('returns drift:null when metadata already archived (match)', async () => {
    await write_timeline(timeline_path, [make_state_change()])
    const result = await check_state_drift({
      thread_id: 't1',
      timeline_path,
      metadata: { thread_state: 'archived' }
    })
    expect(result).to.deep.equal({ drift: null })
  })

  it('returns drift:null when active thread has no terminal state_change', async () => {
    await write_timeline(timeline_path, [
      {
        id: 'msg-1',
        timestamp: '2026-04-10T00:00:00.000Z',
        type: 'message',
        role: 'user',
        content: 'hi'
      }
    ])
    const result = await check_state_drift({
      thread_id: 't2',
      timeline_path,
      metadata: { thread_state: 'active' }
    })
    expect(result).to.deep.equal({ drift: null })
  })

  it('reports repairable drift with full repair_inputs', async () => {
    await write_timeline(timeline_path, [
      make_state_change({
        timestamp: '2026-04-10T00:00:00.000Z',
        archived_at: '2026-04-10T00:00:00.123Z'
      })
    ])
    const result = await check_state_drift({
      thread_id: 't3',
      timeline_path,
      metadata: { thread_state: 'active' }
    })
    expect(result.drift).to.exist
    expect(result.drift.repairable).to.equal(true)
    expect(result.drift.repair_inputs).to.deep.equal({
      thread_state: 'archived',
      archived_at: '2026-04-10T00:00:00.123Z',
      archive_reason: 'completed'
    })
    expect(result.drift.terminal_entry.id).to.equal('thread_state_1')
  })

  it('falls back to terminal_entry.timestamp when archived_at absent', async () => {
    await write_timeline(timeline_path, [
      make_state_change({
        timestamp: '2026-04-10T00:00:00.000Z'
      })
    ])
    const result = await check_state_drift({
      thread_id: 't3b',
      timeline_path,
      metadata: { thread_state: 'active' }
    })
    expect(result.drift.repairable).to.equal(true)
    expect(result.drift.repair_inputs.archived_at).to.equal(
      '2026-04-10T00:00:00.000Z'
    )
  })

  it('marks drift non-repairable when reason missing', async () => {
    await write_timeline(timeline_path, [
      make_state_change({ reason: undefined })
    ])
    const result = await check_state_drift({
      thread_id: 't4',
      timeline_path,
      metadata: { thread_state: 'active' }
    })
    expect(result.drift).to.exist
    expect(result.drift.repairable).to.equal(false)
    expect(result.drift.repair_inputs).to.be.null
  })

  it('marks drift non-repairable when reason is not a valid archive reason', async () => {
    await write_timeline(timeline_path, [
      make_state_change({ reason: 'bogus' })
    ])
    const result = await check_state_drift({
      thread_id: 't4b',
      timeline_path,
      metadata: { thread_state: 'active' }
    })
    expect(result.drift.repairable).to.equal(false)
    expect(result.drift.repair_inputs).to.be.null
  })

  it('picks the last state_change entry when multiple exist', async () => {
    await write_timeline(timeline_path, [
      make_state_change({
        id: 'first_archive',
        timestamp: '2026-04-08T00:00:00.000Z',
        reason: 'completed'
      }),
      make_state_change({
        id: 'reactivate',
        timestamp: '2026-04-09T00:00:00.000Z',
        from_state: 'archived',
        to_state: 'active',
        reason: undefined
      }),
      make_state_change({
        id: 'final_archive',
        timestamp: '2026-04-10T00:00:00.000Z',
        reason: 'user_abandoned'
      })
    ])
    const result = await check_state_drift({
      thread_id: 't5',
      timeline_path,
      metadata: { thread_state: 'active' }
    })
    expect(result.drift).to.exist
    expect(result.drift.terminal_entry.id).to.equal('final_archive')
    expect(result.drift.repair_inputs.archive_reason).to.equal('user_abandoned')
  })

  it('detects drift keyed off system_type=state_change', async () => {
    await write_timeline(timeline_path, [make_state_change()])
    const result = await check_state_drift({
      thread_id: 't6',
      timeline_path,
      metadata: { thread_state: 'active' }
    })
    expect(result.drift).to.exist
    expect(result.drift.repairable).to.equal(true)
    expect(result.drift.terminal_entry.system_type).to.equal('state_change')
  })

  it('returns drift:null when timeline file is missing', async () => {
    const result = await check_state_drift({
      thread_id: 't7',
      timeline_path: path.join(tmp_dir, 'does-not-exist.jsonl'),
      metadata: { thread_state: 'active' }
    })
    expect(result).to.deep.equal({ drift: null })
  })

  it('skips unparseable lines and still finds the terminal entry', async () => {
    await fs.writeFile(
      timeline_path,
      'not json\n' + JSON.stringify(make_state_change()) + '\n',
      'utf-8'
    )
    const result = await check_state_drift({
      thread_id: 't8',
      timeline_path,
      metadata: { thread_state: 'active' }
    })
    expect(result.drift).to.exist
    expect(result.drift.repairable).to.equal(true)
  })
})
