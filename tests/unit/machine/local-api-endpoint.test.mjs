import { expect } from 'chai'

import { get_local_api_endpoint } from '#libs-server/machine/local-api-endpoint.mjs'
import config from '#config'

describe('libs-server/machine/local-api-endpoint', () => {
  let original_registry

  beforeEach(() => {
    original_registry = config.machine_registry
  })

  afterEach(() => {
    config.machine_registry = original_registry
  })

  it('returns https when ssl_key_path is set', () => {
    config.machine_registry = {
      'test-machine': {
        hostname: 'test-machine',
        server_port: 8081,
        ssl_key_path: '/etc/letsencrypt/live/example/privkey.pem'
      }
    }
    expect(get_local_api_endpoint({ machine_id: 'test-machine' })).to.deep.equal(
      { proto: 'https', port: 8081 }
    )
  })

  it('returns http when ssl_key_path is absent', () => {
    config.machine_registry = {
      'test-machine': {
        hostname: 'test-machine',
        server_port: 8090
      }
    }
    expect(get_local_api_endpoint({ machine_id: 'test-machine' })).to.deep.equal(
      { proto: 'http', port: 8090 }
    )
  })

  it('falls back to port 8080 when machine entry is missing', () => {
    config.machine_registry = {}
    expect(
      get_local_api_endpoint({ machine_id: 'unknown' })
    ).to.deep.equal({ proto: 'http', port: 8080 })
  })
})
