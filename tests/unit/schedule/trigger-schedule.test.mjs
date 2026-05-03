import { expect } from 'chai'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'

import { trigger_schedule } from '#libs-server/schedule/trigger-schedule.mjs'

describe('trigger_schedule deterministic jobId', function () {
  this.timeout(5000)

  let test_dir

  beforeEach(async () => {
    test_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'trigger-sched-'))
  })

  afterEach(async () => {
    await fs.rm(test_dir, { recursive: true, force: true })
  })

  const make_schedule = (next_trigger_at) => ({
    entity_id: '00000000-1111-2222-3333-444444444444',
    title: 'Deterministic test',
    command: 'echo ok',
    schedule_type: 'every',
    schedule: '1h',
    next_trigger_at
  })

  it('emits sched:<entity>:<seconds> jobId stable across calls for the same scheduled tick', async () => {
    const calls = []
    const add_job = async (args) => {
      calls.push(args)
      return { id: args.job_id || 'cli-fallback' }
    }
    const schedule = make_schedule('2026-05-03T01:23:45.000Z')

    await trigger_schedule({ schedule, directory: test_dir, add_job })
    await trigger_schedule({ schedule, directory: test_dir, add_job })

    expect(calls).to.have.length(2)
    expect(calls[0].job_id).to.equal(calls[1].job_id)
    expect(calls[0].job_id).to.match(/^sched:00000000-1111-2222-3333-444444444444:\d+$/)
  })

  it('forwards requires, mid_flight_check, and freshness_window_ms to add_job', async () => {
    let captured = null
    const add_job = async (args) => {
      captured = args
      return { id: args.job_id || 'cli-fallback' }
    }
    const schedule = {
      ...make_schedule('2026-05-03T01:23:45.000Z'),
      requires: ['host:macbook', 'reach:storage'],
      mid_flight_check: true,
      freshness_window_ms: 9999
    }
    await trigger_schedule({ schedule, directory: test_dir, add_job })
    expect(captured.requires).to.deep.equal(['host:macbook', 'reach:storage'])
    expect(captured.mid_flight_check).to.equal(true)
    expect(captured.freshness_window_ms).to.equal(9999)
    expect(captured.metadata.schedule_entity_id).to.equal(schedule.entity_id)
  })
})
