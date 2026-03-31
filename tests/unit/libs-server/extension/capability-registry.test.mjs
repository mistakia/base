/* global describe, it, beforeEach */

import { expect } from 'chai'

import {
  register,
  get,
  get_all,
  has,
  list,
  _reset
} from '#libs-server/extension/capability-registry.mjs'

describe('capability-registry', () => {
  beforeEach(() => {
    _reset()
  })

  describe('register and get', () => {
    it('should return null when no provider registered', () => {
      expect(get('notification-channel')).to.be.null
    })

    it('should return the registered module', () => {
      const module = { notify: () => {} }
      register('notification-channel', 'discord', module)
      expect(get('notification-channel')).to.equal(module)
    })

    it('should return the first-registered provider', () => {
      const module_a = { name: 'a' }
      const module_b = { name: 'b' }
      register('notification-channel', 'discord', module_a)
      register('notification-channel', 'slack', module_b)
      expect(get('notification-channel')).to.equal(module_a)
    })
  })

  describe('get_all', () => {
    it('should return empty array when no providers registered', () => {
      expect(get_all('notification-channel')).to.deep.equal([])
    })

    it('should return all provider modules in registration order', () => {
      const module_a = { name: 'a' }
      const module_b = { name: 'b' }
      register('notification-channel', 'discord', module_a)
      register('notification-channel', 'slack', module_b)

      const result = get_all('notification-channel')
      expect(result).to.have.lengthOf(2)
      expect(result[0]).to.equal(module_a)
      expect(result[1]).to.equal(module_b)
    })
  })

  describe('has', () => {
    it('should return false when no provider registered', () => {
      expect(has('queue')).to.be.false
    })

    it('should return true when a provider is registered', () => {
      register('queue', 'bullmq', {})
      expect(has('queue')).to.be.true
    })
  })

  describe('list', () => {
    it('should return empty object when nothing registered', () => {
      expect(list()).to.deep.equal({})
    })

    it('should return capability names mapped to extension names', () => {
      register('notification-channel', 'discord', {})
      register('notification-channel', 'slack', {})
      register('queue', 'bullmq', {})

      const result = list()
      expect(result).to.deep.equal({
        'notification-channel': ['discord', 'slack'],
        queue: ['bullmq']
      })
    })
  })

  describe('_reset', () => {
    it('should clear all registrations', () => {
      register('queue', 'bullmq', {})
      expect(has('queue')).to.be.true

      _reset()
      expect(has('queue')).to.be.false
      expect(get('queue')).to.be.null
      expect(get_all('queue')).to.deep.equal([])
      expect(list()).to.deep.equal({})
    })
  })
})
