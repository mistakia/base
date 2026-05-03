import { expect } from 'chai'

import { is_per_user_container } from '#libs-server/threads/execution-attribution.mjs'

/**
 * Integration tests for thread resume ownership and dispatch derivation.
 * These are logic-only tests that mirror the resume route's permission and
 * routing decisions. Full API-level coverage requires a running server and
 * Redis instance and is exercised by the API integration suite.
 */

// Mirrors the resume route's two-step permission decision.
const decide_permission = ({ is_owner, has_read_permission }) => {
  if (is_owner) return { allowed: true }
  if (has_read_permission) return { allowed: true }
  return { allowed: false }
}

// Mirrors the resume route's local routing-variable derivation. Per the
// canonical attribution spec, container_name is non-null iff
// environment === 'controlled_container', so the routing variable derives
// from container_name alone.
const derive_execution_mode = (thread) => {
  const container_name = thread.execution?.container_name
  if (is_per_user_container(container_name)) return 'container_user'
  if (container_name) return 'container'
  return 'host'
}

describe('Thread Resume Ownership and Dispatch', function () {
  this.timeout(10000)

  describe('permission decision', () => {
    it('allows the owner to resume their own thread', () => {
      const result = decide_permission({
        is_owner: true,
        has_read_permission: false
      })
      expect(result.allowed).to.be.true
    })

    it('allows a non-owner with read permission (e.g. public_read)', () => {
      const result = decide_permission({
        is_owner: false,
        has_read_permission: true
      })
      expect(result.allowed).to.be.true
    })

    it('denies a non-owner without read permission', () => {
      const result = decide_permission({
        is_owner: false,
        has_read_permission: false
      })
      expect(result.allowed).to.be.false
    })
  })

  describe('execution-mode routing derivation', () => {
    it('routes per-user container threads via container_name prefix', () => {
      const thread = {
        execution: {
          environment: 'controlled_container',
          machine_id: 'storage',
          container_runtime: 'docker',
          container_name: 'base-user-arrin'
        }
      }
      expect(derive_execution_mode(thread)).to.equal('container_user')
    })

    it('routes shared container threads via container_name', () => {
      const thread = {
        execution: {
          environment: 'controlled_container',
          machine_id: 'storage',
          container_runtime: 'docker',
          container_name: 'base-container'
        }
      }
      expect(derive_execution_mode(thread)).to.equal('container')
    })

    it('routes host threads to host', () => {
      const thread = {
        execution: {
          environment: 'controlled_host',
          machine_id: 'macbook',
          container_runtime: null,
          container_name: null
        }
      }
      expect(derive_execution_mode(thread)).to.equal('host')
    })

    it('falls back to host when execution is null (legacy thread)', () => {
      const thread = { execution: null }
      expect(derive_execution_mode(thread)).to.equal('host')
    })

    it('falls back to host when execution is missing entirely', () => {
      const thread = {}
      expect(derive_execution_mode(thread)).to.equal('host')
    })
  })

  describe('end-to-end resume scenarios', () => {
    it('owner with thread_config resuming own per-user container thread: allowed, routes to per-user container', () => {
      const thread = {
        owner_public_key: 'user-key-arrin',
        execution: {
          environment: 'controlled_container',
          container_name: 'base-user-arrin'
        }
      }
      const requester = 'user-key-arrin'
      const permission = decide_permission({
        is_owner: thread.owner_public_key === requester,
        has_read_permission: false
      })
      expect(permission.allowed).to.be.true
      expect(derive_execution_mode(thread)).to.equal('container_user')
    })

    it('non-owner container user attempting another user-isolated thread: denied unless read permission grants it', () => {
      const thread = {
        owner_public_key: 'user-key-zoe',
        execution: {
          environment: 'controlled_container',
          container_name: 'base-user-zoe'
        }
      }
      const requester = 'user-key-arrin'
      const permission = decide_permission({
        is_owner: thread.owner_public_key === requester,
        has_read_permission: false
      })
      expect(permission.allowed).to.be.false
    })

    it('owner without thread_config resuming own host thread: allowed, routes to host', () => {
      const thread = {
        owner_public_key: 'user-key-greg',
        execution: {
          environment: 'controlled_host',
          machine_id: 'macbook',
          container_runtime: null,
          container_name: null
        }
      }
      const requester = 'user-key-greg'
      const permission = decide_permission({
        is_owner: thread.owner_public_key === requester,
        has_read_permission: false
      })
      expect(permission.allowed).to.be.true
      expect(derive_execution_mode(thread)).to.equal('host')
    })

    it('legacy thread with no execution stamp: governed solely by ownership/permission, dispatches to host', () => {
      const thread = {
        owner_public_key: 'user-key-greg',
        source: { provider: 'claude' }
      }
      const requester = 'user-key-greg'
      const permission = decide_permission({
        is_owner: thread.owner_public_key === requester,
        has_read_permission: false
      })
      expect(permission.allowed).to.be.true
      expect(derive_execution_mode(thread)).to.equal('host')
    })
  })
})
