import secure_config from '@tsmx/secure-config'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { existsSync } from 'fs'

const current_file_path = fileURLToPath(import.meta.url)
const current_dir = dirname(current_file_path)
const config_dir = join(current_dir)

// Derive system_base_directory from code location (parent of config/)
const derived_system_base_directory = dirname(config_dir)

// Look for config in user-base first, fall back to local config directory
// Note: @tsmx/secure-config resolves filenames as {prefix}{-NODE_ENV}.json
// (prefix defaults to "config"), so the user-base file must be named config.json
// In test mode, always use local config-test.json to avoid picking up the real
// user-base config (which may use different encryption keys or settings)
const user_base_config_dir =
  process.env.NODE_ENV !== 'test' &&
  process.env.USER_BASE_DIRECTORY &&
  existsSync(join(process.env.USER_BASE_DIRECTORY, 'config', 'config.json'))
    ? join(process.env.USER_BASE_DIRECTORY, 'config')
    : null

const config = secure_config({
  directory: user_base_config_dir || config_dir
})

// system_base_directory: derived from code location (parent of config/)
config.system_base_directory =
  process.env.SYSTEM_BASE_DIRECTORY || derived_system_base_directory

// user_base_directory: required from environment (except in test).
// Set by PM2, docker-compose, or the shell profile.
if (process.env.NODE_ENV === 'test') {
  // Tests use a random temp path to avoid touching real user data
  config.user_base_directory = join(tmpdir(), `base_data_${randomUUID()}`)
} else {
  if (!process.env.USER_BASE_DIRECTORY) {
    throw new Error('USER_BASE_DIRECTORY environment variable is not set')
  }
  config.user_base_directory = process.env.USER_BASE_DIRECTORY
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

export default config
