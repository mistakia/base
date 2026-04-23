import { expect } from 'chai'
import { createRequire } from 'module'

import config from '#config'
import {
  get_container_runtime_name,
  get_container_compose_cmd,
  DEFAULT_RUNTIME
} from '#libs-server/container/runtime-config.mjs'

const require_ = createRequire(import.meta.url)

describe('container/runtime-config', () => {
  let original_machine_registry
  let original_container_runtime

  beforeEach(() => {
    original_machine_registry = config.machine_registry
    original_container_runtime = config.container_runtime
  })

  afterEach(() => {
    config.machine_registry = original_machine_registry
    if (original_container_runtime === undefined)
      delete config.container_runtime
    else config.container_runtime = original_container_runtime
  })

  it('returns the default runtime when no overrides exist', () => {
    config.machine_registry = {}
    delete config.container_runtime
    expect(get_container_runtime_name()).to.equal(DEFAULT_RUNTIME)
    expect(DEFAULT_RUNTIME).to.equal('docker')
  })

  it('honors a global container_runtime config value', () => {
    config.machine_registry = {}
    config.container_runtime = 'podman'
    expect(get_container_runtime_name()).to.equal('podman')
  })

  it('per-machine runtime wins over global runtime', () => {
    const os = require_('os')
    config.machine_registry = {
      [os.hostname()]: {
        hostname: os.hostname(),
        platform: os.platform(),
        container_runtime: 'nerdctl'
      }
    }
    config.container_runtime = 'podman'
    expect(get_container_runtime_name()).to.equal('nerdctl')
  })

  it('compose command joins runtime + " compose"', () => {
    config.machine_registry = {}
    config.container_runtime = 'podman'
    expect(get_container_compose_cmd()).to.equal('podman compose')
  })
})
