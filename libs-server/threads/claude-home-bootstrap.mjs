import { join } from 'path'
import { mkdir, copyFile, writeFile, access } from 'fs/promises'
import { constants } from 'fs'
import debug from 'debug'

const log = debug('threads:claude-home-bootstrap')

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
 * Default Bash deny patterns for dangerous commands
 */
const DEFAULT_DENY_BASH_PATTERNS = [
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
  'Bash(socat *)',
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

  // 4. Base CLI deny commands (when base_cli is enabled)
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
 * Bootstrap a user's claude-home directory
 *
 * Creates directory structure, copies credentials, and generates settings.
 * Idempotent -- skips credential copy if already present (tokens may have been refreshed).
 *
 * @param {Object} params
 * @param {string} params.username - User's username
 * @param {Object} params.thread_config - User's thread configuration
 * @param {string} params.user_data_directory - Parent directory for user container data
 * @param {string} params.admin_claude_home - Path to admin's claude-home directory
 * @param {string} params.container_user_base_path - User-base path inside the container
 * @returns {Promise<string>} Path to the user's claude-home directory
 */
export const bootstrap_claude_home = async ({
  username,
  thread_config,
  user_data_directory,
  admin_claude_home,
  container_user_base_path
}) => {
  const claude_home = join(user_data_directory, username, 'claude-home')

  log(`Bootstrapping claude-home for ${username} at ${claude_home}`)

  // Create directory structure
  const dirs = ['projects', 'cache', 'todos', 'plans']
  for (const dir of dirs) {
    await mkdir(join(claude_home, dir), { recursive: true })
  }
  log(`Created directory structure for ${username}`)

  // Copy .credentials.json from admin source (idempotent -- skip if exists)
  const credentials_target = join(claude_home, '.credentials.json')
  const credentials_source = join(admin_claude_home, '.credentials.json')

  try {
    await access(credentials_target, constants.F_OK)
    log(`Credentials already exist for ${username}, skipping copy`)
  } catch {
    try {
      await access(credentials_source, constants.F_OK)
      await copyFile(credentials_source, credentials_target)
      log(`Copied credentials for ${username}`)
    } catch (error) {
      throw new Error(
        `Admin claude-home credentials not found at ${credentials_source}: ${error.message}`
      )
    }
  }

  // Generate and write settings.json
  const settings = generate_user_settings({
    thread_config,
    container_user_base_path
  })
  const settings_path = join(claude_home, 'settings.json')
  await writeFile(settings_path, JSON.stringify(settings, null, 2), 'utf-8')
  log(`Generated settings.json for ${username}`)

  return claude_home
}

/**
 * Refresh credentials from admin source
 *
 * @param {Object} params
 * @param {string} params.username - User's username
 * @param {string} params.user_data_directory - Parent directory for user container data
 * @param {string} params.admin_claude_home - Path to admin's claude-home directory
 */
export const refresh_credentials = async ({
  username,
  user_data_directory,
  admin_claude_home
}) => {
  const claude_home = join(user_data_directory, username, 'claude-home')
  const credentials_target = join(claude_home, '.credentials.json')
  const credentials_source = join(admin_claude_home, '.credentials.json')

  await access(credentials_source, constants.F_OK)
  await copyFile(credentials_source, credentials_target)
  log(`Refreshed credentials for ${username}`)
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
  generate_user_settings,
  generate_deny_rules,
  refresh_credentials,
  regenerate_settings,
  NEVER_MOUNT_DIRS
}
