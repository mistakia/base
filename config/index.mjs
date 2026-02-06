import secure_config from '@tsmx/secure-config'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { tmpdir, platform, homedir } from 'os'
import { randomUUID } from 'crypto'

const current_file_path = fileURLToPath(import.meta.url)
const current_dir = dirname(current_file_path)
const config_dir = join(current_dir)

// Derive system_base_directory from code location (parent of config/)
const derived_system_base_directory = dirname(config_dir)

// Derive user_base_directory based on platform
// - macOS: ~/user-base (development machine)
// - Linux: /mnt/md0/user-base (storage server)
const derived_user_base_directory =
  platform() === 'darwin'
    ? join(homedir(), 'user-base')
    : '/mnt/md0/user-base'

const config = secure_config({ directory: config_dir })

// Apply machine-agnostic path resolution
// Priority: environment variable > derived/computed > config.json fallback

// system_base_directory: where the base system code lives
config.system_base_directory =
  process.env.SYSTEM_BASE_DIRECTORY || derived_system_base_directory

// user_base_directory: where user data lives
config.user_base_directory =
  process.env.USER_BASE_DIRECTORY || derived_user_base_directory

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

// Generate random temp path for test environments
if (process.env.NODE_ENV === 'test') {
  const random_path = join(tmpdir(), `base_data_${randomUUID()}`)
  config.user_base_directory = random_path
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
