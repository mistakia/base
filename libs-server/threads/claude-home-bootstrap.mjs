import { join, basename, resolve } from 'path'
import {
  mkdir,
  copyFile,
  writeFile,
  access,
  symlink,
  readlink,
  readdir,
  lstat,
  unlink
} from 'fs/promises'
import { constants } from 'fs'
import { homedir } from 'os'
import debug from 'debug'

import config from '#config'
import { get_current_machine_id } from '#libs-server/schedule/machine-identity.mjs'
import { resolve_account_host_path } from './user-container-manager.mjs'

const log = debug('threads:claude-home-bootstrap')

/**
 * Resolve a config_dir path (handles ~ prefix)
 */
const resolve_config_dir = (dir) => {
  if (!dir) return null
  return dir.startsWith('~/') ? join(homedir(), dir.slice(2)) : resolve(dir)
}

/**
 * Get configured Claude accounts (if multi-account rotation is enabled)
 * @returns {Array} Account list or empty array
 */
const get_configured_accounts = () => {
  const accounts_config = config.claude_accounts
  if (!accounts_config?.enabled) return []
  return accounts_config.accounts || []
}

/**
 * Resolve secondary account directories for a user.
 * Filters out the primary account (.claude) and returns resolved paths.
 *
 * @param {string} username - Username
 * @returns {Array<{account: Object, user_account_dir: string, admin_source: string|null}>}
 */
const get_secondary_account_dirs = (username) => {
  const accounts = get_configured_accounts()
  const machine_id = get_current_machine_id()
  const admin_data_dir =
    config.machine_registry?.[machine_id]?.claude_paths?.admin_data_dir
  const results = []

  for (const account of accounts) {
    const container_dir = account.container_config_dir
    if (!container_dir) continue
    if (basename(container_dir.replace(/\/$/, '')) === '.claude') continue

    const user_account_dir = resolve_account_host_path({
      username,
      container_config_dir: container_dir
    })
    const admin_source = resolve_config_dir(admin_data_dir?.[account.namespace])
    results.push({ account, user_account_dir, admin_source })
  }

  return results
}

/**
 * Hardcoded safety list -- these directories must never be mounted or accessible
 */
export const NEVER_MOUNT_DIRS = [
  'config/',
  'identity/',
  'role/',
  'import-history/',
  '.git/'
]

/**
 * Bash deny patterns for network tools -- applied when block_network_tools is true (default)
 */
const NETWORK_DENY_BASH_PATTERNS = [
  'Bash(curl *)',
  'Bash(wget *)',
  'Bash(nc *)',
  'Bash(ncat *)',
  'Bash(ssh *)',
  'Bash(scp *)',
  'Bash(sftp *)',
  'Bash(rsync *)',
  'Bash(telnet *)',
  'Bash(ftp *)',
  'Bash(socat *)'
]

/**
 * Default Bash deny patterns for dangerous commands (always applied)
 */
const DEFAULT_DENY_BASH_PATTERNS = [
  'Bash(sudo *)',
  'Bash(docker *)',
  'Bash(nsenter *)',
  'Bash(mount *)',
  'Bash(umount *)',
  'Bash(rm -rf *)',
  'Bash(chmod *)',
  'Bash(chown *)',
  'Bash(mkfs *)',
  'Bash(dd *)',
  'Bash(shred *)',
  'Bash(npm install *)',
  'Bash(bun install *)',
  'Bash(bun add *)',
  'Bash(pip install *)',
  'Bash(apt *)',
  'Bash(brew *)'
]

/**
 * Default base CLI deny commands (write operations)
 */
const DEFAULT_BASE_CLI_DENY_COMMANDS = [
  'base entity create *',
  'base entity update *',
  'base entity observe *',
  'base schedule *',
  'base queue *',
  'base relation add *',
  'base relation remove *',
  'base tag add *',
  'base tag remove *',
  'base entity visibility set *'
]

/**
 * Generate permissions.deny rules from thread_config
 *
 * @param {Object} params
 * @param {Object} params.thread_config - User's thread configuration
 * @param {string} params.container_user_base_path - User-base path inside the container
 * @returns {string[]} Array of deny rule strings
 */
export const generate_deny_rules = ({
  thread_config,
  container_user_base_path
}) => {
  const deny = []

  // 1. Never-mount safety list -- always denied
  for (const dir of NEVER_MOUNT_DIRS) {
    const clean_dir = dir.replace(/\/$/, '')
    const abs_path = `//${container_user_base_path}/${clean_dir}/**`
    deny.push(`Read(${abs_path})`)
    deny.push(`Edit(${abs_path})`)
  }

  // 2. User-specific deny_paths from thread_config
  if (thread_config.deny_paths && Array.isArray(thread_config.deny_paths)) {
    for (const pattern of thread_config.deny_paths) {
      const abs_pattern = `//${container_user_base_path}/${pattern}`
      deny.push(`Read(${abs_pattern})`)
      deny.push(`Edit(${abs_pattern})`)
    }
  }

  // 3. Default dangerous Bash patterns
  deny.push(...DEFAULT_DENY_BASH_PATTERNS)

  // 4. Network tool deny patterns (when block_network_tools is true, which is the default)
  if (thread_config.network_policy?.block_network_tools !== false) {
    deny.push(...NETWORK_DENY_BASH_PATTERNS)
  }

  // 5. Base CLI deny commands (when base_cli is enabled)
  if (thread_config.base_cli?.enabled) {
    const deny_commands =
      thread_config.base_cli.deny_commands || DEFAULT_BASE_CLI_DENY_COMMANDS
    for (const cmd of deny_commands) {
      deny.push(`Bash(${cmd})`)
    }
  }

  return deny
}

/**
 * Generate settings.json content for a user container
 *
 * @param {Object} params
 * @param {Object} params.thread_config - User's thread configuration
 * @param {string} params.container_user_base_path - User-base path inside container
 * @returns {Object} Settings object for serialization
 */
export const generate_user_settings = ({
  thread_config,
  container_user_base_path
}) => {
  const deny_rules = generate_deny_rules({
    thread_config,
    container_user_base_path
  })

  const settings = {
    skipDangerousModePermissionPrompt: true,
    cleanupPeriodDays: 36500,
    includeCoAuthoredBy: false,
    enableAllProjectMcpServers: false,
    permissions: {
      deny: deny_rules
    },
    hooks: {
      SessionStart: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: '/usr/local/bin/user-active-session-hook.sh',
              timeout: 5000
            }
          ]
        }
      ],
      UserPromptSubmit: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: '/usr/local/bin/user-sync-session-hook.sh',
              timeout: 30000
            },
            {
              type: 'command',
              command: '/usr/local/bin/user-active-session-hook.sh',
              timeout: 5000
            }
          ]
        }
      ],
      PostToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: '/usr/local/bin/user-active-session-hook.sh',
              timeout: 5000
            },
            {
              type: 'command',
              command: '/usr/local/bin/user-sync-session-hook.sh',
              timeout: 30000
            }
          ]
        }
      ],
      Stop: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: '/usr/local/bin/user-active-session-hook.sh',
              timeout: 5000
            }
          ]
        }
      ],
      SessionEnd: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: '/usr/local/bin/user-sync-session-hook.sh',
              timeout: 30000
            },
            {
              type: 'command',
              command: '/usr/local/bin/user-active-session-hook.sh',
              timeout: 5000
            }
          ]
        }
      ],
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: '/usr/local/bin/validate-user-command.sh'
            }
          ]
        },
        {
          matcher: 'Read|Edit|Write|Glob|Grep',
          hooks: [
            {
              type: 'command',
              command: '/usr/local/bin/validate-file-access.sh'
            }
          ]
        }
      ]
    },
    env: {
      BASH_DEFAULT_TIMEOUT_MS: '120000',
      BASH_MAX_TIMEOUT_MS: '300000'
    }
  }

  return settings
}

/**
 * Copy credentials from an admin source to a target directory (idempotent)
 */
const copy_credentials_idempotent = async ({
  source_dir,
  target_dir,
  label,
  required = true
}) => {
  const credentials_target = join(target_dir, '.credentials.json')
  const credentials_source = join(source_dir, '.credentials.json')

  try {
    await access(credentials_target, constants.F_OK)
    log(`Credentials already exist for ${label}, skipping copy`)
    return
  } catch {
    // Does not exist yet -- proceed to copy
  }

  try {
    await access(credentials_source, constants.F_OK)
    await copyFile(credentials_source, credentials_target)
    log(`Copied credentials for ${label}`)
  } catch (error) {
    if (required) {
      throw new Error(
        `Admin credentials not found at ${credentials_source}: ${error.message}`
      )
    }
    log(`Warning: credentials not found at ${credentials_source}, skipping`)
  }
}

/**
 * Create directory structure (projects, cache, todos, plans) in a claude config dir
 */
const create_claude_dir_structure = async (base_dir) => {
  const dirs = ['projects', 'cache', 'todos', 'plans']
  for (const dir of dirs) {
    await mkdir(join(base_dir, dir), { recursive: true })
  }
}

/**
 * Provision Claude Code skills into a user's claude-home directory.
 *
 * Copies SKILL.md files from the host's .claude/skills/ into the user's
 * bootstrapped claude-home skills/ directory so they are discoverable
 * by Claude Code sessions using --setting-sources user.
 *
 * @param {Object} params
 * @param {Object} params.thread_config - User's thread configuration
 * @param {string} params.user_base_directory - Host path to user-base
 * @param {string} params.claude_home - Path to the user's claude-home directory
 */
export const provision_skills = async ({
  thread_config,
  user_base_directory,
  claude_home
}) => {
  const skills_config = thread_config.skills
  if (
    !skills_config ||
    (Array.isArray(skills_config) && skills_config.length === 0)
  ) {
    log('No skills configured, skipping provisioning')
    return
  }

  const host_skills_dir = join(user_base_directory, '.claude', 'skills')
  try {
    await access(host_skills_dir, constants.F_OK)
  } catch {
    log(`Skills source directory not found at ${host_skills_dir}, skipping`)
    return
  }

  // Determine which skills to provision
  // Accept both string "*" and array ["*"] (YAML `- '*'` produces the latter)
  const is_wildcard =
    skills_config === '*' ||
    (Array.isArray(skills_config) &&
      skills_config.length === 1 &&
      skills_config[0] === '*')

  let skill_names
  if (is_wildcard) {
    const entries = await readdir(host_skills_dir)
    skill_names = []
    for (const entry of entries) {
      const entry_path = join(host_skills_dir, entry)
      const stat = await lstat(entry_path)
      // Skip symlinks that may point to non-existent targets
      if (stat.isSymbolicLink()) {
        try {
          await access(entry_path, constants.F_OK)
        } catch {
          log(`Skipping broken symlink: ${entry}`)
          continue
        }
      }
      if (stat.isDirectory() || stat.isSymbolicLink()) {
        skill_names.push(entry)
      }
    }
  } else if (Array.isArray(skills_config)) {
    skill_names = skills_config
  } else {
    log(`Invalid skills config value: ${skills_config}, skipping`)
    return
  }

  const target_skills_dir = join(claude_home, 'skills')

  for (const name of skill_names) {
    const source_skill_md = join(host_skills_dir, name, 'SKILL.md')
    try {
      await access(source_skill_md, constants.F_OK)
    } catch {
      log(`SKILL.md not found for skill '${name}', skipping`)
      continue
    }

    const target_skill_dir = join(target_skills_dir, name)
    await mkdir(target_skill_dir, { recursive: true })
    await copyFile(source_skill_md, join(target_skill_dir, 'SKILL.md'))
    log(`Provisioned skill: ${name}`)
  }
}

/**
 * Bootstrap a user's claude-home directory
 *
 * Creates directory structure, copies credentials, and generates settings.
 * When multi-account rotation is enabled, bootstraps credential directories
 * for all configured accounts. Settings.json is generated in the primary dir;
 * secondary dirs get a symlink to it.
 *
 * Idempotent -- skips credential copy if already present (tokens may have been refreshed).
 *
 * @param {Object} params
 * @param {string} params.username - User's username
 * @param {Object} params.thread_config - User's thread configuration
 * @param {string} params.user_data_directory - Parent directory for user container data
 * @param {string} params.admin_claude_home - Path to admin's claude-home directory (primary account)
 * @param {string} params.container_user_base_path - User-base path inside the container
 * @returns {Promise<string>} Path to the user's primary claude-home directory
 */
export const bootstrap_claude_home = async ({
  username,
  thread_config,
  user_data_directory,
  admin_claude_home,
  container_user_base_path
}) => {
  const user_dir = join(user_data_directory, username)
  const claude_home = join(user_dir, 'claude-home')

  log(`Bootstrapping claude-home for ${username} at ${claude_home}`)

  // Create primary directory structure
  await create_claude_dir_structure(claude_home)
  log(`Created directory structure for ${username}`)

  // Provision skills (non-blocking -- failure should not prevent session startup)
  try {
    await provision_skills({
      thread_config,
      user_base_directory: config.user_base_directory,
      claude_home
    })
  } catch (error) {
    log(`Warning: skill provisioning failed for ${username}: ${error.message}`)
  }

  // Copy primary credentials
  await copy_credentials_idempotent({
    source_dir: admin_claude_home,
    target_dir: claude_home,
    label: `${username} (primary)`,
    required: true
  })

  // Generate and write settings.json in primary dir
  const settings = generate_user_settings({
    thread_config,
    container_user_base_path
  })
  const settings_path = join(claude_home, 'settings.json')
  await writeFile(settings_path, JSON.stringify(settings, null, 2), 'utf-8')
  log(`Generated settings.json for ${username}`)

  // Bootstrap secondary account directories (if multi-account enabled)
  const secondary_dirs = get_secondary_account_dirs(username)
  await Promise.all(
    secondary_dirs.map(async ({ account, user_account_dir, admin_source }) => {
      log(
        `Bootstrapping secondary account dir for ${username}: ${user_account_dir}`
      )

      await create_claude_dir_structure(user_account_dir)

      if (admin_source) {
        await copy_credentials_idempotent({
          source_dir: admin_source,
          target_dir: user_account_dir,
          label: `${username} (${account.namespace})`,
          required: false
        })
      }

      // Symlink settings.json to primary dir's copy
      const secondary_settings = join(user_account_dir, 'settings.json')
      try {
        const existing_target = await readlink(secondary_settings)
        if (existing_target === settings_path) return
      } catch {
        // Not a symlink or doesn't exist -- create it
      }
      try {
        try {
          await unlink(secondary_settings)
        } catch {
          /* doesn't exist */
        }
        await symlink(settings_path, secondary_settings)
        log(`Symlinked settings.json for ${username} (${account.namespace})`)
      } catch (error) {
        log(
          `Warning: failed to symlink settings.json for ${account.namespace}: ${error.message}`
        )
      }
    })
  )

  return claude_home
}

/**
 * Refresh credentials from admin source for all configured accounts
 *
 * @param {Object} params
 * @param {string} params.username - User's username
 * @param {string} params.user_data_directory - Parent directory for user container data
 * @param {string} params.admin_claude_home - Path to admin's claude-home directory (primary)
 */
export const refresh_credentials = async ({
  username,
  user_data_directory,
  admin_claude_home
}) => {
  const user_dir = join(user_data_directory, username)

  // Refresh primary account
  const claude_home = join(user_dir, 'claude-home')
  const credentials_source = join(admin_claude_home, '.credentials.json')
  await access(credentials_source, constants.F_OK)
  await copyFile(credentials_source, join(claude_home, '.credentials.json'))
  log(`Refreshed primary credentials for ${username}`)

  // Refresh secondary accounts
  const secondary_dirs = get_secondary_account_dirs(username)
  await Promise.all(
    secondary_dirs.map(async ({ account, user_account_dir, admin_source }) => {
      if (!admin_source) return
      try {
        const source = join(admin_source, '.credentials.json')
        await access(source, constants.F_OK)
        await mkdir(user_account_dir, { recursive: true })
        await copyFile(source, join(user_account_dir, '.credentials.json'))
        log(`Refreshed credentials for ${username} (${account.namespace})`)
      } catch (error) {
        log(
          `Warning: failed to refresh credentials for ${account.namespace}: ${error.message}`
        )
      }
    })
  )
}

/**
 * Regenerate settings.json when thread_config changes
 * Always overwrites existing settings.
 *
 * @param {Object} params
 * @param {string} params.username - User's username
 * @param {Object} params.thread_config - Updated thread configuration
 * @param {string} params.user_data_directory - Parent directory for user container data
 * @param {string} params.container_user_base_path - User-base path inside the container
 */
export const regenerate_settings = async ({
  username,
  thread_config,
  user_data_directory,
  container_user_base_path
}) => {
  const claude_home = join(user_data_directory, username, 'claude-home')
  const settings = generate_user_settings({
    thread_config,
    container_user_base_path
  })
  const settings_path = join(claude_home, 'settings.json')
  await writeFile(settings_path, JSON.stringify(settings, null, 2), 'utf-8')
  log(`Regenerated settings.json for ${username}`)
}

export default {
  bootstrap_claude_home,
  provision_skills,
  generate_user_settings,
  generate_deny_rules,
  refresh_credentials,
  regenerate_settings,
  NEVER_MOUNT_DIRS
}
