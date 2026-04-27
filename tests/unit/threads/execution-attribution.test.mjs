import { expect } from 'chai'

import {
  build_execution_attribution,
  would_downgrade_per_user_container,
  would_overwrite_with_different,
  is_per_user_container
} from '#libs-server/threads/execution-attribution.mjs'

describe('execution-attribution', () => {
  describe('build_execution_attribution', () => {
    it('builds a controlled_host attribution with nulled runtime fields', () => {
      const exec = build_execution_attribution({
        environment: 'controlled_host',
        machine_id: 'macbook'
      })
      expect(exec).to.deep.equal({
        environment: 'controlled_host',
        machine_id: 'macbook',
        container_runtime: null,
        container_name: null
      })
    })

    it('builds a controlled_container shared attribution', () => {
      const exec = build_execution_attribution({
        environment: 'controlled_container',
        container_name: 'base-container',
        container_runtime: 'docker',
        machine_id: 'storage'
      })
      expect(exec).to.deep.equal({
        environment: 'controlled_container',
        machine_id: 'storage',
        container_runtime: 'docker',
        container_name: 'base-container'
      })
    })

    it('derives base-user-<name> for per-user containers', () => {
      const exec = build_execution_attribution({
        environment: 'controlled_container',
        username: 'arrin',
        container_runtime: 'docker',
        machine_id: 'storage'
      })
      expect(exec.container_name).to.equal('base-user-arrin')
      expect(is_per_user_container(exec.container_name)).to.equal(true)
    })

    it('builds a provider_hosted attribution with all null infrastructure fields', () => {
      const exec = build_execution_attribution({
        environment: 'provider_hosted',
        machine_id: null
      })
      expect(exec).to.deep.equal({
        environment: 'provider_hosted',
        machine_id: null,
        container_runtime: null,
        container_name: null
      })
    })

    it('includes account_namespace when supplied for controlled_host', () => {
      const exec = build_execution_attribution({
        environment: 'controlled_host',
        machine_id: 'macbook',
        account_namespace: 'fee.trace.wrap'
      })
      expect(exec.account_namespace).to.equal('fee.trace.wrap')
    })

    it('includes account_namespace when supplied for controlled_container', () => {
      const exec = build_execution_attribution({
        environment: 'controlled_container',
        container_name: 'base-container',
        machine_id: 'storage',
        account_namespace: 'fee.trace.wrap'
      })
      expect(exec.account_namespace).to.equal('fee.trace.wrap')
    })

    it('rejects controlled_host mode with username', () => {
      expect(() =>
        build_execution_attribution({
          environment: 'controlled_host',
          username: 'arrin',
          machine_id: 'macbook'
        })
      ).to.throw(/controlled_host cannot carry username/)
    })

    it('rejects controlled_container mode without container_name or username', () => {
      expect(() =>
        build_execution_attribution({
          environment: 'controlled_container',
          machine_id: 'storage'
        })
      ).to.throw(/requires container_name or username/)
    })

    it('rejects provider_hosted mode with container_name', () => {
      expect(() =>
        build_execution_attribution({
          environment: 'provider_hosted',
          container_name: 'base-container',
          machine_id: null
        })
      ).to.throw(/provider_hosted cannot carry username or container_name/)
    })

    it('rejects unknown environments', () => {
      expect(() =>
        build_execution_attribution({ environment: 'wat', machine_id: null })
      ).to.throw(/environment must be one of/)
    })

    it('honors explicit machine_id=null without invoking registry resolution', () => {
      const exec = build_execution_attribution({
        environment: 'controlled_host',
        machine_id: null
      })
      expect(exec.machine_id).to.equal(null)
    })
  })

  describe('would_downgrade_per_user_container', () => {
    const per_user = {
      environment: 'controlled_container',
      machine_id: 'storage',
      container_runtime: 'docker',
      container_name: 'base-user-arrin'
    }
    const shared = {
      environment: 'controlled_container',
      machine_id: 'storage',
      container_runtime: 'docker',
      container_name: 'base-container'
    }
    const host = {
      environment: 'controlled_host',
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

  describe('would_overwrite_with_different', () => {
    const host_a = {
      environment: 'controlled_host',
      machine_id: 'macbook',
      container_runtime: null,
      container_name: null
    }
    const host_b = {
      environment: 'controlled_host',
      machine_id: 'storage',
      container_runtime: null,
      container_name: null
    }

    it('returns false when existing is null', () => {
      expect(would_overwrite_with_different(null, host_a)).to.equal(false)
    })

    it('returns false when incoming is null', () => {
      expect(would_overwrite_with_different(host_a, null)).to.equal(false)
    })

    it('returns false when both are identical', () => {
      expect(
        would_overwrite_with_different(host_a, { ...host_a })
      ).to.equal(false)
    })

    it('returns true when both non-null and differ', () => {
      expect(would_overwrite_with_different(host_a, host_b)).to.equal(true)
    })
  })
})
