import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { tmpdir, hostname } from 'os'
import { randomUUID, createDecipheriv } from 'crypto'
import debug from 'debug'

const log = debug('config:loader')

// In compiled Bun binaries, import.meta.url resolves to /$bunfs/root/...
// (Bun's virtual filesystem), producing invalid paths on Windows. Detect
// compiled mode and derive paths from the binary location instead.
const current_file_path = fileURLToPath(import.meta.url)
// Bun VFS: /$bunfs/ on Unix, B:\~BUN\ on Windows
const __bunfs_compiled = current_file_path.includes('/$bunfs/') || current_file_path.includes('\\~BUN\\')
const current_dir = __bunfs_compiled
  ? dirname(process.argv[0])
  : dirname(current_file_path)
const config_dir = __bunfs_compiled
  ? join(dirname(dirname(process.argv[0])), 'config')
  : join(current_dir)

// Derive system_base_directory from code location (parent of config/)
const derived_system_base_directory = __bunfs_compiled
  ? dirname(dirname(process.argv[0]))
  : dirname(config_dir)

// Check only the first positional argument for subcommands to avoid
// false-positives from option values like `--status init`.
const is_init_command = process.argv[2] === 'init'

/**
 * Deep merge two objects. Source values override target values.
 * Arrays are replaced, not concatenated.
 */
function deep_merge(target, source) {
  const result = { ...target }

  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deep_merge(result[key] || {}, source[key])
    } else {
      result[key] = source[key]
    }
  }

  return result
}

/**
 * Decrypt a single ENCRYPTED|iv|ciphertext value using AES-256-CBC.
 */
function decrypt_value(encrypted_text, key_buffer) {
  const parts = encrypted_text.split('|')
  // Format: ENCRYPTED|iv_hex|ciphertext_hex  (first part is the prefix)
  const iv = Buffer.from(parts[1], 'hex')
  const ciphertext = Buffer.from(parts[2], 'hex')
  const decipher = createDecipheriv('aes-256-cbc', key_buffer, iv)
  let decrypted = decipher.update(ciphertext)
  decrypted = Buffer.concat([decrypted, decipher.final()])
  return decrypted.toString()
}

/**
 * Recursively traverse an object and decrypt ENCRYPTED| values in-place.
 */
function decrypt_config_values(obj, key_buffer) {
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (typeof value === 'string' && value.startsWith('ENCRYPTED|')) {
      obj[key] = decrypt_value(value, key_buffer)
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      decrypt_config_values(value, key_buffer)
    }
  }
}

/**
 * Resolve the encryption key from CONFIG_ENCRYPTION_KEY env var.
 * Accepts 32-byte raw strings or 64-char hex strings.
 */
function get_encryption_key() {
  const raw_key = process.env.CONFIG_ENCRYPTION_KEY
  if (!raw_key) return null
  const hex_regex = /^[0-9A-Fa-f]{64}$/
  if (raw_key.length === 32) return Buffer.from(raw_key)
  if (hex_regex.test(raw_key)) return Buffer.from(raw_key, 'hex')
  log('WARNING: CONFIG_ENCRYPTION_KEY has invalid length (expected 32 bytes or 64 hex chars)')
  return null
}

/**
 * Load a JSON config file with inline decryption of ENCRYPTED| values.
 * Replaces @tsmx/secure-config to avoid its NODE_ENV-based filename
 * convention (config-{NODE_ENV}.json) which breaks in compiled binaries
 * where NODE_ENV is baked to "production".
 */
function load_config_file(directory, filename = 'config.json') {
  const config_path = join(directory, filename)
  const raw = readFileSync(config_path, 'utf8')
  const parsed = JSON.parse(raw)

  const has_encrypted_values = raw.includes('ENCRYPTED|')
  if (has_encrypted_values) {
    const key_buffer = get_encryption_key()
    if (key_buffer) {
      decrypt_config_values(parsed, key_buffer)
    } else {
      console.warn(
        `WARNING: Config in ${directory} contains ENCRYPTED| values but CONFIG_ENCRYPTION_KEY is not set. Encrypted values will remain as plaintext strings.`
      )
    }
  }

  return parsed
}

// 1. Load defaults from base repo (plain JSON, no encryption).
// In compiled binary mode, config/config.json may not exist on disk
// (import.meta.url resolves to Bun's virtual filesystem). Fall back to
// minimal defaults sufficient for CLI-only operation.
const config_json_path = join(config_dir, 'config.json')
const defaults = existsSync(config_json_path)
  ? JSON.parse(readFileSync(config_json_path, 'utf8'))
  : {
      server_port: 8080,
      server_host: '0.0.0.0',
      production_url: '',
      production_wss: '',
      public_url: '',
      github_access_token: '',
      github: { webhook_secret: '', projects: {} },
      cors_origins: [],
      system_main_branch: 'main',
      user_main_branch: 'main',
      user_id: '',
      user_public_key: '',
      jwt: { secret: '', algorithms: ['HS256'] },
      threads: {
        cli: {
          command: 'claude',
          default_execution_mode: 'container',
          session_timeout_minutes: 60
        }
      },
      extensions: { discovery_paths: [] },
      machine_registry: {}
    }
log('Loaded base defaults from %s', config_dir)

// 2. Determine user-base config directory
const user_base_config_dir =
  process.env.NODE_ENV !== 'test' &&
  process.env.USER_BASE_DIRECTORY &&
  existsSync(join(process.env.USER_BASE_DIRECTORY, 'config', 'config.json'))
    ? join(process.env.USER_BASE_DIRECTORY, 'config')
    : null

// 3. Build config: defaults merged with user-base overlay
let config
if (process.env.NODE_ENV === 'test') {
  // Test mode: use config-test.json from the base config directory
  config = load_config_file(config_dir, 'config-test.json')
  log('Loaded test config from %s', config_dir)
} else if (user_base_config_dir) {
  // Production/development: load user-base config and deep merge over defaults
  const user_config = load_config_file(user_base_config_dir)
  config = deep_merge(defaults, user_config)
  log('Loaded user config from %s (merged with defaults)', user_base_config_dir)
} else {
  // Fallback: defaults only (missing user-base config)
  config = { ...defaults }
  log('WARNING: No user-base config found, using defaults only')
}

// system_base_directory: derived from code location (parent of config/)
config.system_base_directory =
  process.env.SYSTEM_BASE_DIRECTORY || derived_system_base_directory

// user_base_directory: required from environment (except in test and init).
// Set by PM2, docker-compose, or the shell profile.
if (process.env.NODE_ENV === 'test') {
  // Tests use a random temp path to avoid touching real user data
  config.user_base_directory = join(tmpdir(), `base_data_${randomUUID()}`)
} else if (process.env.USER_BASE_DIRECTORY) {
  config.user_base_directory = process.env.USER_BASE_DIRECTORY
} else if (is_init_command) {
  // init creates the user-base directory, so it can run without one
  config.user_base_directory = ''
  log('Running without USER_BASE_DIRECTORY (init command)')
} else {
  // Degraded mode: allow any command to start (--help, --version, update,
  // install, uninstall, etc.) without USER_BASE_DIRECTORY. Commands that
  // require user data will check config.degraded and show an actionable error.
  config.degraded = true
  config.user_base_directory = ''
  log('Running in degraded mode (USER_BASE_DIRECTORY not set)')
}

// Derive notification script path from user_base_directory
if (
  config.claude_session_import_service?.notifications &&
  config.user_base_directory
) {
  config.claude_session_import_service.notifications.discord_script = join(
    config.user_base_directory,
    'cli',
    'notify-discord.mjs'
  )
}

// Resolve machine-specific config from machine_registry.
// Matches os.hostname() against registry entries and applies overrides.
// Environment variables (SERVER_PORT, SERVER_HOST, etc.) still take precedence below.
if (config.machine_registry && process.env.NODE_ENV !== 'test') {
  const current_hostname = hostname()
  const machine_entry = Object.entries(config.machine_registry).find(
    ([, entry]) => entry.hostname === current_hostname
  )
  if (machine_entry) {
    const [machine_id, machine_config] = machine_entry
    log(
      'Matched machine registry entry: %s (hostname: %s)',
      machine_id,
      current_hostname
    )
    if (machine_config.server_port) {
      config.server_port = machine_config.server_port
    }
    if (machine_config.server_host) {
      config.server_host = machine_config.server_host
    }
    if (machine_config.ssl_key_path) {
      config.ssl = true
      config.key = machine_config.ssl_key_path
      config.cert = machine_config.ssl_cert_path
    }
  } else {
    log('No machine registry match for hostname: %s', current_hostname)
  }
}

if (process.env.BASE_PUBLIC_URL) {
  config.production_url = process.env.BASE_PUBLIC_URL
  config.public_url = process.env.BASE_PUBLIC_URL
}

if (process.env.BASE_PUBLIC_WSS) {
  config.production_wss = process.env.BASE_PUBLIC_WSS
}

// SSL configuration via environment variables (for production servers)
// Allows config.json to remain machine-agnostic
if (process.env.SSL_ENABLED === 'true') {
  config.ssl = true
}
if (process.env.SSL_KEY_PATH) {
  config.key = process.env.SSL_KEY_PATH
}
if (process.env.SSL_CERT_PATH) {
  config.cert = process.env.SSL_CERT_PATH
}
if (process.env.SERVER_PORT) {
  config.server_port = parseInt(process.env.SERVER_PORT, 10)
}
if (process.env.SERVER_HOST) {
  config.server_host = process.env.SERVER_HOST
}

export default config
