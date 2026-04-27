import os from 'os'
import { expect } from 'chai'

import {
  assert_on_machine,
  WrongMachineError,
  _reset_for_tests
} from '#libs-server/machine/assert-machine.mjs'
import config from '#config'

describe('libs-server/machine/assert-machine', function () {
  let original_registry
  let original_node_env

  beforeEach(() => {
    original_registry = config.machine_registry
    original_node_env = process.env.NODE_ENV
    _reset_for_tests()
  })

  afterEach(() => {
    config.machine_registry = original_registry
    process.env.NODE_ENV = original_node_env
    _reset_for_tests()
  })

  describe('storage role hostname match', () => {
    it('does not throw when hostname matches storage entry', () => {
      process.env.NODE_ENV = 'production'
      config.machine_registry = {
        storage: {
          hostname: os.hostname(),
          storage: { enabled: true }
        }
      }
      expect(() => assert_on_machine('storage')).to.not.throw()
    })

    it('throws WrongMachineError when hostname does not match', () => {
      process.env.NODE_ENV = 'production'
      config.machine_registry = {
        storage: {
          hostname: 'wrong.host',
          storage: { enabled: true }
        }
      }
      let err
      try {
        assert_on_machine('storage')
      } catch (e) {
        err = e
      }
      expect(err).to.be.instanceOf(WrongMachineError)
      expect(err.role).to.equal('storage')
      expect(err.actual).to.equal(os.hostname())
      expect(err.expected).to.equal('wrong.host')
    })

    it('throws WrongMachineError when no storage entry exists', () => {
      process.env.NODE_ENV = 'production'
      config.machine_registry = {
        macbook: { hostname: os.hostname() }
      }
      expect(() => assert_on_machine('storage')).to.throw(WrongMachineError)
    })
  })

  describe('arbitrary role', () => {
    it('does not throw when hostname matches named role', () => {
      process.env.NODE_ENV = 'production'
      config.machine_registry = {
        macbook: { hostname: os.hostname() }
      }
      expect(() => assert_on_machine('macbook')).to.not.throw()
    })

    it('throws WrongMachineError for unknown role (no registry entry)', () => {
      process.env.NODE_ENV = 'production'
      config.machine_registry = {
        storage: { hostname: 'storage.host', storage: { enabled: true } }
      }
      expect(() => assert_on_machine('nonexistent')).to.throw(WrongMachineError)
    })
  })

  describe('NODE_ENV=test bypass', () => {
    it('does not throw even when hostname does not match', () => {
      expect(process.env.NODE_ENV).to.equal('test')
      config.machine_registry = {
        storage: { hostname: 'wrong.host', storage: { enabled: true } }
      }
      expect(() => assert_on_machine('storage')).to.not.throw()
    })
  })

  describe('memoization', () => {
    it('second call for same role succeeds without re-checking config (registry wiped mid-run)', () => {
      process.env.NODE_ENV = 'production'
      config.machine_registry = {
        storage: { hostname: os.hostname(), storage: { enabled: true } }
      }
      assert_on_machine('storage')
      // Wipe registry — a non-memoized second call would throw
      config.machine_registry = {}
      expect(() => assert_on_machine('storage')).to.not.throw()
    })

    it('different roles are tracked independently', () => {
      process.env.NODE_ENV = 'production'
      config.machine_registry = {
        storage: { hostname: os.hostname(), storage: { enabled: true } },
        macbook: { hostname: os.hostname() }
      }
      assert_on_machine('storage')
      assert_on_machine('macbook')
      // Both should be memoized, wipe and confirm no throw
      config.machine_registry = {}
      expect(() => assert_on_machine('storage')).to.not.throw()
      expect(() => assert_on_machine('macbook')).to.not.throw()
    })
  })
})
