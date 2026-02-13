import { expect } from 'chai'

import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'

const test_registry = {
  macbook: {
    hostname: 'macbook2025',
    platform: 'darwin'
  },
  storage: {
    hostname: 'storage',
    platform: 'linux'
  }
}

describe('Machine Identity', () => {
  describe('get_current_machine_id', () => {
    it('should match by exact hostname', () => {
      const result = get_current_machine_id({
        registry: test_registry,
        hostname: 'macbook2025',
        platform: 'darwin'
      })
      expect(result).to.equal('macbook')
    })

    it('should match storage server by hostname', () => {
      const result = get_current_machine_id({
        registry: test_registry,
        hostname: 'storage',
        platform: 'linux'
      })
      expect(result).to.equal('storage')
    })

    it('should fall back to platform match when hostname does not match', () => {
      const result = get_current_machine_id({
        registry: test_registry,
        hostname: 'unknown-host',
        platform: 'linux'
      })
      expect(result).to.equal('storage')
    })

    it('should prefer hostname match over platform match', () => {
      const result = get_current_machine_id({
        registry: test_registry,
        hostname: 'macbook2025',
        platform: 'linux'
      })
      expect(result).to.equal('macbook')
    })

    it('should return null for unknown machine with no platform match', () => {
      const result = get_current_machine_id({
        registry: test_registry,
        hostname: 'unknown-host',
        platform: 'freebsd'
      })
      expect(result).to.be.null
    })

    it('should return null when registry is empty', () => {
      const result = get_current_machine_id({
        registry: {},
        hostname: 'macbook2025',
        platform: 'darwin'
      })
      expect(result).to.be.null
    })

    it('should return null when registry is not configured', () => {
      const result = get_current_machine_id({
        registry: null,
        hostname: 'macbook2025',
        platform: 'darwin'
      })
      expect(result).to.be.null
    })

    it('should return null when platform match is ambiguous', () => {
      const multi_darwin_registry = {
        macbook: {
          hostname: 'macbook2025',
          platform: 'darwin'
        },
        macbook_work: {
          hostname: 'work-macbook',
          platform: 'darwin'
        }
      }
      const result = get_current_machine_id({
        registry: multi_darwin_registry,
        hostname: 'unknown-host',
        platform: 'darwin'
      })
      expect(result).to.be.null
    })

    it('should handle registry with single entry', () => {
      const single_registry = {
        only_machine: {
          hostname: 'my-host',
          platform: 'darwin'
        }
      }
      const result = get_current_machine_id({
        registry: single_registry,
        hostname: 'my-host',
        platform: 'darwin'
      })
      expect(result).to.equal('only_machine')
    })
  })
})
