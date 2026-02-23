import { expect } from 'chai'
import { mkdtemp, mkdir, writeFile, readFile, access } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

import {
  generate_user_settings,
  generate_deny_rules,
  bootstrap_claude_home,
  NEVER_MOUNT_DIRS
} from '#libs-server/threads/claude-home-bootstrap.mjs'

const CONTAINER_USER_BASE_PATH = '/home/node/user-base'

describe('claude-home-bootstrap', () => {
  describe('generate_deny_rules', () => {
    it('should include deny rules for every never-mount directory', () => {
      const thread_config = {}
      const deny = generate_deny_rules({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      for (const dir of NEVER_MOUNT_DIRS) {
        const clean_dir = dir.replace(/\/$/, '')
        const abs_path = `//${CONTAINER_USER_BASE_PATH}/${clean_dir}/**`
        expect(deny).to.include(`Read(${abs_path})`)
        expect(deny).to.include(`Edit(${abs_path})`)
      }
    })

    it('should include deny rules from thread_config.deny_paths', () => {
      const thread_config = {
        deny_paths: ['secret/**', 'private/notes/**']
      }
      const deny = generate_deny_rules({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(deny).to.include(
        `Read(//${CONTAINER_USER_BASE_PATH}/secret/**)`
      )
      expect(deny).to.include(
        `Edit(//${CONTAINER_USER_BASE_PATH}/secret/**)`
      )
      expect(deny).to.include(
        `Read(//${CONTAINER_USER_BASE_PATH}/private/notes/**)`
      )
      expect(deny).to.include(
        `Edit(//${CONTAINER_USER_BASE_PATH}/private/notes/**)`
      )
    })

    it('should include default dangerous Bash patterns', () => {
      const thread_config = {}
      const deny = generate_deny_rules({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(deny).to.include('Bash(curl *)')
      expect(deny).to.include('Bash(wget *)')
      expect(deny).to.include('Bash(sudo *)')
      expect(deny).to.include('Bash(docker *)')
      expect(deny).to.include('Bash(rm -rf *)')
    })

    it('should include base CLI deny commands when base_cli.enabled is true', () => {
      const thread_config = {
        base_cli: { enabled: true }
      }
      const deny = generate_deny_rules({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(deny).to.include('Bash(base entity create *)')
      expect(deny).to.include('Bash(base entity update *)')
      expect(deny).to.include('Bash(base schedule *)')
      expect(deny).to.include('Bash(base queue *)')
      expect(deny).to.include('Bash(base relation add *)')
      expect(deny).to.include('Bash(base entity visibility set *)')
    })

    it('should not include base CLI deny commands when base_cli is not enabled', () => {
      const thread_config = {}
      const deny = generate_deny_rules({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(deny).to.not.include('Bash(base entity create *)')
      expect(deny).to.not.include('Bash(base entity update *)')
    })

    it('should use custom deny_commands from thread_config.base_cli when provided', () => {
      const thread_config = {
        base_cli: {
          enabled: true,
          deny_commands: ['base entity delete *', 'base thread archive *']
        }
      }
      const deny = generate_deny_rules({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(deny).to.include('Bash(base entity delete *)')
      expect(deny).to.include('Bash(base thread archive *)')
      // Should not include defaults when custom list is provided
      expect(deny).to.not.include('Bash(base entity create *)')
    })

    it('should handle empty deny_paths array gracefully', () => {
      const thread_config = { deny_paths: [] }
      const deny = generate_deny_rules({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      // Should still have never-mount and default bash deny rules
      expect(deny.length).to.be.greaterThan(0)
    })
  })

  describe('generate_user_settings', () => {
    it('should include permissions.deny rules from never-mount list', () => {
      const thread_config = {}
      const settings = generate_user_settings({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(settings.permissions).to.have.property('deny')
      expect(settings.permissions.deny).to.be.an('array')

      for (const dir of NEVER_MOUNT_DIRS) {
        const clean_dir = dir.replace(/\/$/, '')
        const abs_path = `//${CONTAINER_USER_BASE_PATH}/${clean_dir}/**`
        expect(settings.permissions.deny).to.include(`Read(${abs_path})`)
        expect(settings.permissions.deny).to.include(`Edit(${abs_path})`)
      }
    })

    it('should include permissions.deny rules from thread_config.deny_paths', () => {
      const thread_config = {
        deny_paths: ['credentials/**']
      }
      const settings = generate_user_settings({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(settings.permissions.deny).to.include(
        `Read(//${CONTAINER_USER_BASE_PATH}/credentials/**)`
      )
      expect(settings.permissions.deny).to.include(
        `Edit(//${CONTAINER_USER_BASE_PATH}/credentials/**)`
      )
    })

    it('should include PreToolUse hook configuration referencing /usr/local/bin/ scripts', () => {
      const thread_config = {}
      const settings = generate_user_settings({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(settings.hooks).to.have.property('PreToolUse')
      expect(settings.hooks.PreToolUse).to.be.an('array')
      expect(settings.hooks.PreToolUse).to.have.lengthOf(2)

      const bash_hook = settings.hooks.PreToolUse.find(
        (h) => h.matcher === 'Bash'
      )
      expect(bash_hook).to.exist
      expect(bash_hook.hooks[0].command).to.equal(
        '/usr/local/bin/validate-user-command.sh'
      )

      const file_hook = settings.hooks.PreToolUse.find(
        (h) => h.matcher === 'Read|Edit|Write|Glob|Grep'
      )
      expect(file_hook).to.exist
      expect(file_hook.hooks[0].command).to.equal(
        '/usr/local/bin/validate-file-access.sh'
      )
    })

    it('should include base settings', () => {
      const thread_config = {}
      const settings = generate_user_settings({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(settings.skipDangerousModePermissionPrompt).to.equal(true)
      expect(settings.cleanupPeriodDays).to.equal(36500)
      expect(settings.enableAllProjectMcpServers).to.equal(false)
      expect(settings.includeCoAuthoredBy).to.equal(false)
    })

    it('should include env with timeout settings', () => {
      const thread_config = {}
      const settings = generate_user_settings({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      expect(settings.env).to.have.property('BASH_DEFAULT_TIMEOUT_MS', '120000')
      expect(settings.env).to.have.property('BASH_MAX_TIMEOUT_MS', '300000')
    })

    it('should include session lifecycle hooks for all event types', () => {
      const thread_config = {}
      const settings = generate_user_settings({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      const hook_types = [
        'SessionStart',
        'UserPromptSubmit',
        'PostToolUse',
        'Stop',
        'SessionEnd'
      ]

      for (const hook_type of hook_types) {
        expect(settings.hooks).to.have.property(hook_type)
        expect(settings.hooks[hook_type]).to.be.an('array')
        expect(settings.hooks[hook_type].length).to.be.greaterThan(0)
      }
    })

    it('should reference user-active-session-hook.sh in SessionStart, Stop hooks', () => {
      const thread_config = {}
      const settings = generate_user_settings({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      const session_start_hooks = settings.hooks.SessionStart[0].hooks
      expect(session_start_hooks).to.have.lengthOf(1)
      expect(session_start_hooks[0].command).to.equal(
        '/usr/local/bin/user-active-session-hook.sh'
      )
      expect(session_start_hooks[0].timeout).to.equal(5000)

      const stop_hooks = settings.hooks.Stop[0].hooks
      expect(stop_hooks).to.have.lengthOf(1)
      expect(stop_hooks[0].command).to.equal(
        '/usr/local/bin/user-active-session-hook.sh'
      )
    })

    it('should reference user-sync-session-hook.sh in UserPromptSubmit and SessionEnd hooks', () => {
      const thread_config = {}
      const settings = generate_user_settings({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      const submit_hooks = settings.hooks.UserPromptSubmit[0].hooks
      expect(submit_hooks).to.have.lengthOf(2)
      expect(submit_hooks[0].command).to.equal(
        '/usr/local/bin/user-sync-session-hook.sh'
      )
      expect(submit_hooks[0].timeout).to.equal(30000)

      const end_hooks = settings.hooks.SessionEnd[0].hooks
      expect(end_hooks).to.have.lengthOf(2)
      expect(end_hooks[0].command).to.equal(
        '/usr/local/bin/user-sync-session-hook.sh'
      )
      expect(end_hooks[0].timeout).to.equal(30000)
    })

    it('should include both active-session and sync hooks in PostToolUse', () => {
      const thread_config = {}
      const settings = generate_user_settings({
        thread_config,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      const post_tool_hooks = settings.hooks.PostToolUse[0].hooks
      expect(post_tool_hooks).to.have.lengthOf(2)
      expect(post_tool_hooks[0].command).to.include('user-active-session-hook.sh')
      expect(post_tool_hooks[1].command).to.include('user-sync-session-hook.sh')
    })
  })

  describe('bootstrap_claude_home', () => {
    let tmp_dir

    beforeEach(async () => {
      tmp_dir = await mkdtemp(join(tmpdir(), 'bootstrap-test-'))
    })

    it('should create directory structure', async () => {
      const admin_claude_home = join(tmp_dir, 'admin-claude-home')
      await mkdir(admin_claude_home, { recursive: true })
      await writeFile(
        join(admin_claude_home, '.credentials.json'),
        JSON.stringify({ token: 'test' })
      )

      const user_data_dir = join(tmp_dir, 'user-data')
      await mkdir(user_data_dir, { recursive: true })

      const claude_home = await bootstrap_claude_home({
        username: 'testuser',
        thread_config: {},
        user_data_directory: user_data_dir,
        admin_claude_home,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      // Verify directory structure
      const expected_dirs = ['projects', 'cache', 'todos', 'plans']
      for (const dir of expected_dirs) {
        const dir_exists = await access(join(claude_home, dir))
          .then(() => true)
          .catch(() => false)
        expect(dir_exists, `Directory '${dir}' should exist`).to.be.true
      }
    })

    it('should copy .credentials.json from admin source', async () => {
      const admin_claude_home = join(tmp_dir, 'admin-claude-home')
      await mkdir(admin_claude_home, { recursive: true })
      const credentials = { token: 'admin-token-abc' }
      await writeFile(
        join(admin_claude_home, '.credentials.json'),
        JSON.stringify(credentials)
      )

      const user_data_dir = join(tmp_dir, 'user-data')
      await mkdir(user_data_dir, { recursive: true })

      const claude_home = await bootstrap_claude_home({
        username: 'testuser',
        thread_config: {},
        user_data_directory: user_data_dir,
        admin_claude_home,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      const copied = JSON.parse(
        await readFile(join(claude_home, '.credentials.json'), 'utf-8')
      )
      expect(copied).to.deep.equal(credentials)
    })

    it('should generate settings.json', async () => {
      const admin_claude_home = join(tmp_dir, 'admin-claude-home')
      await mkdir(admin_claude_home, { recursive: true })
      await writeFile(
        join(admin_claude_home, '.credentials.json'),
        JSON.stringify({ token: 'test' })
      )

      const user_data_dir = join(tmp_dir, 'user-data')
      await mkdir(user_data_dir, { recursive: true })

      const claude_home = await bootstrap_claude_home({
        username: 'testuser',
        thread_config: {},
        user_data_directory: user_data_dir,
        admin_claude_home,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      const settings = JSON.parse(
        await readFile(join(claude_home, 'settings.json'), 'utf-8')
      )
      expect(settings).to.have.property('permissions')
      expect(settings).to.have.property('hooks')
      expect(settings.skipDangerousModePermissionPrompt).to.equal(true)
    })

    it('should not overwrite existing .credentials.json on second call', async () => {
      const admin_claude_home = join(tmp_dir, 'admin-claude-home')
      await mkdir(admin_claude_home, { recursive: true })
      await writeFile(
        join(admin_claude_home, '.credentials.json'),
        JSON.stringify({ token: 'original' })
      )

      const user_data_dir = join(tmp_dir, 'user-data')
      await mkdir(user_data_dir, { recursive: true })

      // First call
      const claude_home = await bootstrap_claude_home({
        username: 'testuser',
        thread_config: {},
        user_data_directory: user_data_dir,
        admin_claude_home,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      // Modify the credentials in the user's claude-home to simulate token refresh
      await writeFile(
        join(claude_home, '.credentials.json'),
        JSON.stringify({ token: 'refreshed' })
      )

      // Update admin credentials
      await writeFile(
        join(admin_claude_home, '.credentials.json'),
        JSON.stringify({ token: 'new-admin-token' })
      )

      // Second call -- should NOT overwrite
      await bootstrap_claude_home({
        username: 'testuser',
        thread_config: {},
        user_data_directory: user_data_dir,
        admin_claude_home,
        container_user_base_path: CONTAINER_USER_BASE_PATH
      })

      const credentials = JSON.parse(
        await readFile(join(claude_home, '.credentials.json'), 'utf-8')
      )
      expect(credentials.token).to.equal('refreshed')
    })

    it('should throw when admin credentials are missing', async () => {
      const admin_claude_home = join(tmp_dir, 'admin-claude-home-missing')
      // Do NOT create the admin directory or credentials file

      const user_data_dir = join(tmp_dir, 'user-data')
      await mkdir(user_data_dir, { recursive: true })

      try {
        await bootstrap_claude_home({
          username: 'testuser',
          thread_config: {},
          user_data_directory: user_data_dir,
          admin_claude_home,
          container_user_base_path: CONTAINER_USER_BASE_PATH
        })
        expect.fail('Should have thrown an error for missing admin credentials')
      } catch (error) {
        expect(error.message).to.include('credentials not found')
      }
    })
  })

  describe('NEVER_MOUNT_DIRS', () => {
    it('should include critical security directories', () => {
      expect(NEVER_MOUNT_DIRS).to.include('config/')
      expect(NEVER_MOUNT_DIRS).to.include('identity/')
      expect(NEVER_MOUNT_DIRS).to.include('role/')
      expect(NEVER_MOUNT_DIRS).to.include('.git/')
    })

    it('should be a non-empty array of strings', () => {
      expect(NEVER_MOUNT_DIRS).to.be.an('array')
      expect(NEVER_MOUNT_DIRS.length).to.be.greaterThan(0)
      for (const dir of NEVER_MOUNT_DIRS) {
        expect(dir).to.be.a('string')
        expect(dir).to.match(/\/$/, 'Each directory should end with a slash')
      }
    })
  })
})
