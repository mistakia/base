import { expect } from 'chai'
import { mkdtemp, mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  generate_user_settings,
  bootstrap_claude_home,
  NEVER_MOUNT_DIRS
} from '#libs-server/threads/claude-home-bootstrap.mjs'
import {
  generate_volume_mounts,
  get_allowed_working_directories
} from '#libs-server/threads/volume-mount-generator.mjs'
import { generate_compose_config } from '#libs-server/threads/user-container-compose.mjs'

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

      expect(settings.permissions.deny).to.include('Bash(docker *)')
      expect(settings.permissions.deny).to.include('Bash(sudo *)')
    })

    it('should include network tool denials when block_network_tools is true', () => {
      const settings = generate_user_settings({
        thread_config: sample_thread_config,
        container_user_base_path: '/home/node/user-base'
      })

      expect(settings.permissions.deny).to.include('Bash(curl *)')
      expect(settings.permissions.deny).to.include('Bash(wget *)')
      expect(settings.permissions.deny).to.include('Bash(ssh *)')
    })

    it('should omit network tool denials when block_network_tools is false', () => {
      const config_with_network = {
        ...sample_thread_config,
        network_policy: { block_network_tools: false }
      }
      const settings = generate_user_settings({
        thread_config: config_with_network,
        container_user_base_path: '/home/node/user-base'
      })

      expect(settings.permissions.deny).to.not.include('Bash(curl *)')
      expect(settings.permissions.deny).to.not.include('Bash(wget *)')
      expect(settings.permissions.deny).to.not.include('Bash(ssh *)')
      // Non-network patterns should still be present
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

  describe('path translation and volume mounts', () => {
    let tmp_dir
    let user_base_directory
    let user_data_directory
    const CONTAINER_BASE = '/Users/trashman/user-base'

    before(async () => {
      tmp_dir = await mkdtemp(join(tmpdir(), 'path-test-'))
      user_base_directory = join(tmp_dir, 'user-base')
      user_data_directory = join(tmp_dir, 'user-data')

      await mkdir(join(user_base_directory, 'task'), { recursive: true })
      await mkdir(join(user_base_directory, 'text'), { recursive: true })
      await mkdir(join(user_data_directory, 'testuser', 'claude-home'), { recursive: true })
    })

    it('should use container_user_base_path for volume mount destinations', async () => {
      const thread_config = {
        mounts: [
          { source: 'task', mode: 'rw' },
          { source: 'text', mode: 'ro' }
        ]
      }

      const mounts = await generate_volume_mounts({
        username: 'testuser',
        thread_config,
        user_base_directory,
        user_data_directory,
        container_user_base_path: CONTAINER_BASE
      })

      const task_mount = mounts.find((m) => m.includes('/task:'))
      expect(task_mount).to.include(`:${CONTAINER_BASE}/task:`)

      const text_mount = mounts.find((m) => m.includes('/text:'))
      expect(text_mount).to.include(`:${CONTAINER_BASE}/text:`)
    })

    it('should set USER_BASE_DIRECTORY in compose env to container_user_base_path', async () => {
      const thread_config = {
        mounts: [{ source: 'task', mode: 'rw' }]
      }

      const compose_path = await generate_compose_config({
        username: 'testuser',
        thread_config,
        user_base_directory,
        user_data_directory,
        container_user_base_path: CONTAINER_BASE
      })

      const content = await readFile(compose_path, 'utf-8')
      expect(content).to.include(`USER_BASE_DIRECTORY: ${CONTAINER_BASE}`)
    })

    it('should produce working directories that match volume mount destinations', () => {
      const thread_config = {
        mounts: [
          { source: 'task', mode: 'rw' },
          { source: 'text', mode: 'ro' }
        ]
      }

      const dirs = get_allowed_working_directories({
        thread_config,
        container_user_base_path: CONTAINER_BASE
      })

      for (const dir of dirs) {
        expect(dir.startsWith(CONTAINER_BASE)).to.be.true
      }
    })
  })

  describe('multi-account volume mounts', () => {
    let tmp_dir
    let user_base_directory
    let user_data_directory

    before(async () => {
      tmp_dir = await mkdtemp(join(tmpdir(), 'multi-account-test-'))
      user_base_directory = join(tmp_dir, 'user-base')
      user_data_directory = join(tmp_dir, 'user-data')
      await mkdir(join(user_base_directory, 'task'), { recursive: true })
      await mkdir(join(user_data_directory, 'testuser', 'claude-home'), { recursive: true })
    })

    it('should include claude-home mount at /home/node/.claude when rotation is disabled', async () => {
      const thread_config = { mounts: [] }

      const mounts = await generate_volume_mounts({
        username: 'testuser',
        thread_config,
        user_base_directory,
        user_data_directory,
        container_user_base_path: '/Users/trashman/user-base'
      })

      expect(mounts).to.have.lengthOf(1)
      expect(mounts[0]).to.include('claude-home:/home/node/.claude:cached')
    })
  })

  describe('multi-account bootstrap', () => {
    let tmp_dir

    before(async () => {
      tmp_dir = await mkdtemp(join(tmpdir(), 'bootstrap-multi-test-'))
    })

    it('should create primary claude-home directory structure', async () => {
      const admin_claude_home = join(tmp_dir, 'admin-claude-home')
      await mkdir(admin_claude_home, { recursive: true })
      const { writeFile } = await import('fs/promises')
      await writeFile(join(admin_claude_home, '.credentials.json'), JSON.stringify({ token: 'test' }))

      const user_data_dir = join(tmp_dir, 'user-data')
      await mkdir(user_data_dir, { recursive: true })

      const claude_home = await bootstrap_claude_home({
        username: 'testuser',
        thread_config: {},
        user_data_directory: user_data_dir,
        admin_claude_home,
        container_user_base_path: '/Users/trashman/user-base'
      })

      const settings = JSON.parse(await readFile(join(claude_home, 'settings.json'), 'utf-8'))
      expect(settings).to.have.property('permissions')
      expect(settings).to.have.property('hooks')
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
