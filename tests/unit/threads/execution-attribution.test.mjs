import { expect } from 'chai'

import {
  build_execution_attribution,
  would_downgrade_per_user_container,
  is_per_user_container
} from '#libs-server/threads/execution-attribution.mjs'

describe('execution-attribution', () => {
  describe('build_execution_attribution', () => {
    it('builds a host attribution with nulled runtime fields', () => {
      const exec = build_execution_attribution({
        mode: 'host',
        machine_id: 'macbook'
      })
      expect(exec).to.deep.equal({
        mode: 'host',
        machine_id: 'macbook',
        container_runtime: null,
        container_name: null
      })
    })

    it('builds a shared container attribution', () => {
      const exec = build_execution_attribution({
        mode: 'container',
        container_name: 'base-container',
        container_runtime: 'docker',
        machine_id: 'storage'
      })
      expect(exec).to.deep.equal({
        mode: 'container',
        machine_id: 'storage',
        container_runtime: 'docker',
        container_name: 'base-container'
      })
    })

    it('derives base-user-<name> for per-user containers', () => {
      const exec = build_execution_attribution({
        mode: 'container',
        username: 'arrin',
        container_runtime: 'docker',
        machine_id: 'storage'
      })
      expect(exec.container_name).to.equal('base-user-arrin')
      expect(is_per_user_container(exec.container_name)).to.equal(true)
    })

    it('rejects host mode with username', () => {
      expect(() =>
        build_execution_attribution({
          mode: 'host',
          username: 'arrin',
          machine_id: 'macbook'
        })
      ).to.throw(/host mode cannot carry username/)
    })

    it('rejects container mode without container_name or username', () => {
      expect(() =>
        build_execution_attribution({
          mode: 'container',
          machine_id: 'storage'
        })
      ).to.throw(/requires container_name or username/)
    })

    it('rejects unknown modes', () => {
      expect(() =>
        build_execution_attribution({ mode: 'wat', machine_id: null })
      ).to.throw(/mode must be 'host' or 'container'/)
    })

    it('honors explicit machine_id=null without invoking registry resolution', () => {
      const exec = build_execution_attribution({
        mode: 'host',
        machine_id: null
      })
      expect(exec.machine_id).to.equal(null)
    })
  })

  describe('would_downgrade_per_user_container', () => {
    const per_user = {
      mode: 'container',
      machine_id: 'storage',
      container_runtime: 'docker',
      container_name: 'base-user-arrin'
    }
    const shared = {
      mode: 'container',
      machine_id: 'storage',
      container_runtime: 'docker',
      container_name: 'base-container'
    }
    const host = {
      mode: 'host',
      machine_id: 'macbook',
      container_runtime: null,
      container_name: null
    }

    it('returns false when no existing per-user stamp', () => {
      expect(would_downgrade_per_user_container(null, host)).to.equal(false)
      expect(would_downgrade_per_user_container(shared, host)).to.equal(false)
    })

    it('returns true when overwriting per-user with shared container', () => {
      expect(would_downgrade_per_user_container(per_user, shared)).to.equal(
        true
      )
    })

    it('returns true when overwriting per-user with host', () => {
      expect(would_downgrade_per_user_container(per_user, host)).to.equal(true)
    })

    it('returns true when overwriting per-user with null', () => {
      expect(would_downgrade_per_user_container(per_user, null)).to.equal(true)
    })

    it('returns false when overwriting per-user with another per-user stamp', () => {
      const other = { ...per_user, container_name: 'base-user-zoe' }
      expect(would_downgrade_per_user_container(per_user, other)).to.equal(
        false
      )
    })
  })
})
