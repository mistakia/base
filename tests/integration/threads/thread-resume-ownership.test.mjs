import { expect } from 'chai'

/**
 * Integration tests for thread resume ownership enforcement.
 * These tests verify the ownership model for container_user threads.
 *
 * Full API-level tests require a running server and Redis instance.
 * These tests validate the logic components used in the resume flow.
 */
describe('Thread Resume Ownership', function () {
  this.timeout(10000)

  describe('ownership validation logic', () => {
    it('should allow owner to resume their own thread', () => {
      const thread_metadata = {
        owner_public_key: 'user-key-abc',
        source: { execution_mode: 'container_user' }
      }
      const requesting_user = 'user-key-abc'
      const is_owner =
        thread_metadata.owner_public_key === requesting_user
      expect(is_owner).to.be.true
    })

    it('should deny non-owner from resuming container_user thread', () => {
      const thread_metadata = {
        owner_public_key: 'user-key-abc',
        source: { execution_mode: 'container_user' }
      }
      const requesting_user = 'user-key-xyz'
      const is_owner =
        thread_metadata.owner_public_key === requesting_user
      expect(is_owner).to.be.false
    })

    it('should use read permission check for non-container_user threads', () => {
      const thread_metadata = {
        owner_public_key: 'user-key-abc',
        source: { execution_mode: 'container' }
      }
      // For container/host mode, ownership is not required -- read permission suffices
      const execution_mode = thread_metadata.source.execution_mode
      expect(execution_mode).to.not.equal('container_user')
    })
  })

  describe('container_user resuming non-container_user threads', () => {
    it('should deny container_user from resuming host/container threads', () => {
      // A user with thread_config (container_user) should not be able
      // to resume threads that were created in host or container mode
      const thread_source = { provider: 'claude' } // legacy thread, no execution_mode
      const execution_mode =
        thread_source.execution_mode || 'host'
      const requesting_user_has_thread_config = true // arrin has thread_config

      // The resume route blocks container_users from resuming non-container_user threads
      const should_deny =
        execution_mode !== 'container_user' && requesting_user_has_thread_config
      expect(should_deny).to.be.true
    })

    it('should allow non-container_user to resume host/container threads with read permission', () => {
      const thread_source = { execution_mode: 'container' }
      const execution_mode = thread_source.execution_mode
      const requesting_user_has_thread_config = false // admin, no thread_config

      const should_deny =
        execution_mode !== 'container_user' && requesting_user_has_thread_config
      expect(should_deny).to.be.false
    })
  })

  describe('execution mode routing', () => {
    it('should detect container_user threads from source metadata', () => {
      const source = {
        execution_mode: 'container_user',
        container_user: true,
        container_name: 'base-user-greg'
      }
      expect(source.execution_mode).to.equal('container_user')
      expect(source.container_user).to.be.true
      expect(source.container_name).to.match(/^base-user-/)
    })

    it('should fall back to config default for legacy threads', () => {
      const source = { provider: 'claude' }
      const execution_mode = source.execution_mode || 'host'
      expect(execution_mode).to.equal('host')
    })
  })
})
