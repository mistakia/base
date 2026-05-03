import { expect } from 'chai'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { randomUUID } from 'crypto'

import config from '#config'
import { load_due_schedules } from '#libs-server/schedule/load-schedules.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'
import { read_schedule_state } from '#libs-server/schedule/schedule-state.mjs'

describe('Capability deferral end-to-end (dispatcher gate)', function () {
  this.timeout(10000)

  let test_dir
  let original_registry
  let original_lan
  let original_job_tracker

  beforeEach(async () => {
    test_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'capability-deferral-'))
    original_registry = config.machine_registry
    original_lan = config.lan_networks
    original_job_tracker = config.job_tracker
    config.machine_registry = {
      probe_closed: { hostname: '127.0.0.1', reach_probe: { port: 1 } }
    }
    // Disable the http-report path -- the dispatcher gate's
    // submit_deferred_report call should silently no-op without api credentials.
    config.job_tracker = {}
  })

  afterEach(async () => {
    config.machine_registry = original_registry
    config.lan_networks = original_lan
    config.job_tracker = original_job_tracker
    await fs.rm(test_dir, { recursive: true, force: true })
  })

  const create_schedule = async ({ requires }) => {
    const file_path = path.join(test_dir, `defer-${randomUUID()}.md`)
    // last_triggered_at far enough in the past that next_trigger_at (1h later) is also past
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const props = {
      title: 'Deferral fixture',
      type: 'scheduled_command',
      entity_id: randomUUID(),
      command: 'echo ok',
      schedule_type: 'every',
      schedule: '1h',
      enabled: true,
      requires,
      last_triggered_at: past,
      created_at: past,
      updated_at: past,
      user_public_key:
        '0000000000000000000000000000000000000000000000000000000000000000',
      base_uri: `user:${path.relative('/Users/trashman/user-base', file_path)}`
    }
    await write_entity_to_filesystem({
      absolute_path: file_path,
      entity_properties: props,
      entity_type: 'scheduled_command',
      entity_content: ''
    })
    return props
  }

  it('skips an off-capability tick and writes a deferred record to .schedule-state', async () => {
    const schedule = await create_schedule({
      requires: ['reach:probe_closed']
    })

    const due = await load_due_schedules({
      directory: test_dir,
      now: new Date()
    })
    expect(due).to.have.length(0)

    const state = await read_schedule_state({ directory: test_dir })
    const entry = state[schedule.entity_id]
    expect(entry, 'state entry should exist').to.exist
    expect(entry.deferred).to.exist
    expect(entry.deferred.missing).to.deep.equal(['reach:probe_closed'])
  })
})
