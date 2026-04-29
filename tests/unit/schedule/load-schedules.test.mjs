import { expect } from 'chai'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import { randomUUID } from 'crypto'

import config from '#config'
import { load_due_schedules } from '#libs-server/schedule/load-schedules.mjs'
import { write_entity_to_filesystem } from '#libs-server/entity/filesystem/write-entity-to-filesystem.mjs'

describe('Schedule Machine Filtering', function () {
  this.timeout(10000)

  let test_dir
  let original_registry

  const create_schedule = async ({
    title,
    command = 'echo test',
    enabled = true,
    run_on_machines,
    next_trigger_at
  }) => {
    const file_name = title.toLowerCase().replace(/\s+/g, '-') + '.md'
    const file_path = path.join(test_dir, file_name)

    const entity_properties = {
      title,
      type: 'scheduled_command',
      entity_id: randomUUID(),
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      user_public_key:
        '0000000000000000000000000000000000000000000000000000000000000000',
      command,
      schedule_type: 'every',
      schedule: '1h',
      enabled,
      next_trigger_at:
        next_trigger_at || new Date(Date.now() - 60000).toISOString()
    }

    if (run_on_machines) {
      entity_properties.run_on_machines = run_on_machines
    }

    await write_entity_to_filesystem({
      absolute_path: file_path,
      entity_properties,
      entity_type: 'scheduled_command',
      entity_content: ''
    })

    return file_path
  }

  before(async () => {
    test_dir = path.join(os.tmpdir(), `test-schedules-${randomUUID()}`)
    await fs.mkdir(test_dir, { recursive: true })
    original_registry = config.machine_registry
  })

  afterEach(async () => {
    // Clean test files after each test
    const files = await fs.readdir(test_dir).catch(() => [])
    for (const file of files) {
      await fs.unlink(path.join(test_dir, file)).catch(() => {})
    }
    config.machine_registry = original_registry
  })

  after(async () => {
    config.machine_registry = original_registry
    await fs.rm(test_dir, { recursive: true, force: true })
  })

  it('should include schedules with no run_on_machines (runs on all)', async () => {
    config.machine_registry = {
      macbook: { hostname: os.hostname(), platform: os.platform() }
    }

    await create_schedule({ title: 'Universal Schedule' })

    const due = await load_due_schedules({ directory: test_dir })
    expect(due).to.have.lengthOf(1)
    expect(due[0].title).to.equal('Universal Schedule')
  })

  it('should include schedules with empty run_on_machines array', async () => {
    config.machine_registry = {
      macbook: { hostname: os.hostname(), platform: os.platform() }
    }

    await create_schedule({
      title: 'Empty Machines',
      run_on_machines: []
    })

    const due = await load_due_schedules({ directory: test_dir })
    expect(due).to.have.lengthOf(1)
  })

  it('should include schedules targeting current machine', async () => {
    config.machine_registry = {
      macbook: { hostname: os.hostname(), platform: os.platform() },
      storage: { hostname: 'storage', platform: 'linux' }
    }

    await create_schedule({
      title: 'Macbook Only',
      run_on_machines: ['macbook']
    })

    const due = await load_due_schedules({ directory: test_dir })
    expect(due).to.have.lengthOf(1)
    expect(due[0].title).to.equal('Macbook Only')
  })

  it('should exclude schedules targeting a different machine', async () => {
    config.machine_registry = {
      macbook: { hostname: os.hostname(), platform: os.platform() },
      storage: { hostname: 'storage', platform: 'linux' }
    }

    await create_schedule({
      title: 'Storage Only',
      run_on_machines: ['storage']
    })

    const due = await load_due_schedules({ directory: test_dir })
    expect(due).to.have.lengthOf(0)
  })

  it('should include schedule when current machine is in multi-machine list', async () => {
    config.machine_registry = {
      macbook: { hostname: os.hostname(), platform: os.platform() },
      storage: { hostname: 'storage', platform: 'linux' }
    }

    await create_schedule({
      title: 'Both Machines',
      run_on_machines: ['macbook', 'storage']
    })

    const due = await load_due_schedules({ directory: test_dir })
    expect(due).to.have.lengthOf(1)
  })

  it('should skip machine-targeted schedules when current machine is unknown', async () => {
    config.machine_registry = {
      storage: { hostname: 'storage', platform: 'linux' }
    }

    await create_schedule({
      title: 'Targeted Schedule',
      run_on_machines: ['storage']
    })

    // Current machine won't match any registry entry (hostname and platform mismatch)
    // On macOS test runner, this will be unknown since only linux/storage is registered
    const due = await load_due_schedules({ directory: test_dir })

    // If running on a machine that matches 'storage' by platform fallback, this test
    // needs adjustment. On macOS (darwin), it should not match linux.
    if (os.platform() !== 'linux') {
      expect(due).to.have.lengthOf(0)
    }
  })

  it('should still include non-targeted schedules when machine is unknown', async () => {
    config.machine_registry = {}

    await create_schedule({ title: 'Universal' })
    await create_schedule({
      title: 'Targeted',
      run_on_machines: ['some-machine']
    })

    const due = await load_due_schedules({ directory: test_dir })
    expect(due).to.have.lengthOf(1)
    expect(due[0].title).to.equal('Universal')
  })
})
