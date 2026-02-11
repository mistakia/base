import secure_config from '@tsmx/secure-config'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const current_file_path = fileURLToPath(import.meta.url)
const current_dir = dirname(current_file_path)
const config_dir = join(current_dir)

// Derive system_base_directory from code location (parent of config/)
const derived_system_base_directory = dirname(config_dir)

const config = secure_config({ directory: config_dir })

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
