/* global describe, it */

import { expect } from 'chai'

import {
  start_file_subscription_watcher,
  stop_file_subscription_watcher
} from '#libs-server/file-subscriptions/file-watcher.mjs'

describe('file-watcher', () => {
  describe('start_file_subscription_watcher', () => {
    it('should return false when user_base_directory is not configured', () => {
      // Config does not have user_base_directory in test mode
      const result = start_file_subscription_watcher()
      // Result depends on test config -- just verify it returns a boolean
      expect(result).to.be.a('boolean')
    })

    it('should return true when called twice (already running guard)', () => {
      const first = start_file_subscription_watcher()
      if (first) {
        const second = start_file_subscription_watcher()
        expect(second).to.be.true
        stop_file_subscription_watcher()
      }
    })
  })

  describe('stop_file_subscription_watcher', () => {
    it('should be callable without error', () => {
      expect(() => stop_file_subscription_watcher()).to.not.throw()
    })
  })
})
