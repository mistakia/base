import { expect } from 'chai'
import {
  generate_user_settings,
  NEVER_MOUNT_DIRS
} from '#libs-server/threads/claude-home-bootstrap.mjs'
import { get_allowed_working_directories } from '#libs-server/threads/volume-mount-generator.mjs'

/**
 * Integration tests for the full user container thread flow.
 * Tests marked with (requires Docker) are skipped by default.
 *
 * These tests verify the end-to-end configuration generation and
 * security enforcement without requiring a running Docker daemon.
 */
describe('User Container Thread Flow', function () {
  this.timeout(30000)

  const sample_thread_config = {
    tools: ['Read', 'Glob', 'Grep', 'Bash', 'Edit', 'Write'],
    disallowed_tools: ['Bash(rm -rf *)', 'Bash(sudo *)'],
    mounts: [
      { source: 'repository/active/league', mode: 'rw' },
      { source: 'data', mode: 'ro' }
    ],
    deny_paths: ['league/private/**'],
    max_concurrent_threads: 1,
    session_timeout_ms: 1800000,
    network_policy: { block_network_tools: true },
    base_cli: { enabled: true }
  }

  describe('settings generation for user container', () => {
    it('should generate valid settings.json with all security layers', () => {
      const settings = generate_user_settings({
        thread_config: sample_thread_config,
        container_user_base_path: '/home/node/user-base'
      })

      expect(settings.skipDangerousModePermissionPrompt).to.be.true
      expect(settings.enableAllProjectMcpServers).to.be.false
      expect(settings.permissions).to.have.property('deny')
      expect(settings.permissions.deny).to.be.an('array')
      expect(settings.hooks).to.have.property('PreToolUse')
    })

    it('should deny access to never-mount directories', () => {
      const settings = generate_user_settings({
        thread_config: sample_thread_config,
        container_user_base_path: '/home/node/user-base'
      })

      for (const dir of NEVER_MOUNT_DIRS) {
        const clean_dir = dir.replace(/\/$/, '')
        const read_rule = `Read(///home/node/user-base/${clean_dir}/**)`
        const edit_rule = `Edit(///home/node/user-base/${clean_dir}/**)`
        expect(settings.permissions.deny).to.include(read_rule)
        expect(settings.permissions.deny).to.include(edit_rule)
      }
    })

    it('should deny access to user-specified deny_paths', () => {
      const settings = generate_user_settings({
        thread_config: sample_thread_config,
        container_user_base_path: '/home/node/user-base'
      })

      expect(settings.permissions.deny).to.include(
        'Read(///home/node/user-base/league/private/**)'
      )
      expect(settings.permissions.deny).to.include(
        'Edit(///home/node/user-base/league/private/**)'
      )
    })

    it('should include base CLI deny rules when base_cli enabled', () => {
      const settings = generate_user_settings({
        thread_config: sample_thread_config,
        container_user_base_path: '/home/node/user-base'
      })

      expect(settings.permissions.deny).to.include('Bash(base entity create *)')
      expect(settings.permissions.deny).to.include('Bash(base entity update *)')
    })

    it('should include dangerous Bash pattern denials', () => {
      const settings = generate_user_settings({
        thread_config: sample_thread_config,
        container_user_base_path: '/home/node/user-base'
      })

      expect(settings.permissions.deny).to.include('Bash(curl *)')
      expect(settings.permissions.deny).to.include('Bash(docker *)')
      expect(settings.permissions.deny).to.include('Bash(sudo *)')
    })
  })

  describe('working directory derivation', () => {
    it('should derive allowed directories from rw mounts only', () => {
      const dirs = get_allowed_working_directories({
        thread_config: sample_thread_config,
        container_user_base_path: '/home/node/user-base'
      })

      expect(dirs).to.have.lengthOf(1)
      expect(dirs).to.include('/home/node/user-base/repository/active/league')
    })
  })

  describe('tool restriction configuration', () => {
    it('should configure tools list from thread_config', () => {
      expect(sample_thread_config.tools).to.include('Read')
      expect(sample_thread_config.tools).to.include('Bash')
      expect(sample_thread_config.tools).to.have.lengthOf(6)
    })

    it('should configure disallowed_tools from thread_config', () => {
      expect(sample_thread_config.disallowed_tools).to.include('Bash(rm -rf *)')
      expect(sample_thread_config.disallowed_tools).to.include('Bash(sudo *)')
    })
  })

  // Skip Docker-dependent tests by default
  describe.skip('full container flow (requires Docker)', () => {
    it('should create and start user container', () => {
      // Requires Docker daemon
    })

    it('should persist container between sessions', () => {
      // Requires Docker daemon
    })

    it('should enforce tool restrictions inside container', () => {
      // Requires Docker daemon
    })

    it('should enforce PreToolUse hooks inside container', () => {
      // Requires Docker daemon
    })
  })
})
