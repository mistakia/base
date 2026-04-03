/**
 * Unified PM2 Configuration
 *
 * Manages all Base services on both MacBook and storage server.
 * Auto-detects the machine and applies appropriate settings.
 *
 * Usage:
 *   pm2 start pm2.config.js
 *   pm2 start pm2.config.js --only base-api
 *
 * Setup for boot persistence:
 *   pm2 startup
 *   pm2 start pm2.config.js
 *   pm2 save
 */

const fs = require('fs')
const os = require('os')
const path = require('path')

const home_dir = os.homedir()
const logs_dir = process.env.PM2_LOGS_DIR || path.join(home_dir, 'logs')

// Read a value from ~/.pm2/pm2.env when the env var is not set in the current
// process. This covers manual PM2 restarts via non-login SSH sessions where
// shell profile env vars (e.g. USER_BASE_DIRECTORY) are not inherited.
function read_pm2_env(key) {
  try {
    const env_path = path.join(home_dir, '.pm2', 'pm2.env')
    const lines = fs.readFileSync(env_path, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq > 0 && trimmed.slice(0, eq) === key) return trimmed.slice(eq + 1)
    }
  } catch {}
  return null
}

// User base directory: from env var, pm2.env fallback, or default to ~/user-base.
const user_base_directory =
  process.env.USER_BASE_DIRECTORY ||
  read_pm2_env('USER_BASE_DIRECTORY') ||
  path.join(home_dir, 'user-base')

// Container user-base path: the fixed mount point inside the Docker container.
// Both machines mount their local user-base to this path inside the container
// (see docker-compose.macbook.yml and docker-compose.storage.yml).
const container_user_base_path =
  process.env.CONTAINER_USER_BASE_PATH || path.join(home_dir, 'user-base')

// Resolve Bun interpreter path for PM2.
// Falls back to 'bun' on PATH if ~/.bun/bin/bun does not exist.
function get_bun_interpreter() {
  const bun_path = path.join(home_dir, '.bun', 'bin', 'bun')
  if (fs.existsSync(bun_path)) return bun_path
  return 'bun'
}

// Resolve machine identity from machine_registry in config.json
let machine_id = null
let machine_config = {}
try {
  const config_path = path.join(user_base_directory, 'config', 'config.json')
  const config_json = JSON.parse(fs.readFileSync(config_path, 'utf8'))
  const registry = config_json.machine_registry || {}
  const hostname = os.hostname()
  machine_id =
    Object.keys(registry).find((id) => registry[id].hostname === hostname) ||
    null
  if (machine_id) machine_config = registry[machine_id]
} catch (e) {
  // Graceful fallback -- no SSL, default transcription args
}

// SSL configuration from machine_registry
const ssl_env = machine_config.ssl_key_path
  ? {
      SSL_ENABLED: 'true',
      SSL_KEY_PATH: machine_config.ssl_key_path,
      SSL_CERT_PATH: machine_config.ssl_cert_path,
      SERVER_PORT: String(machine_config.server_port || 8081)
    }
  : {}

// Server host from machine_registry (defaults to 0.0.0.0 via config)
const host_env = machine_config.server_host
  ? { SERVER_HOST: machine_config.server_host }
  : {}

const common_env = {
  CONFIG_ENCRYPTION_KEY: process.env.CONFIG_ENCRYPTION_KEY,
  USER_BASE_DIRECTORY: user_base_directory,
  CONTAINER_USER_BASE_PATH: container_user_base_path,
  GIT_SSH_COMMAND: `ssh -F ${path.join(home_dir, '.ssh', 'config')}`,
  DEBUG_COLORS: 'false',
  ...ssl_env,
  ...host_env
}

const defaults = {
  interpreter: get_bun_interpreter(),
  cwd: __dirname,
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  combine_logs: true,
  time: true,
  max_size: '50M' // requires: pm2 install pm2-logrotate
}

function app(name, script, { log_prefix, env: extra_env, ...rest } = {}) {
  const prefix = log_prefix || name
  return {
    ...defaults,
    name,
    script,
    error_file: path.join(logs_dir, `${prefix}-error.log`),
    out_file: path.join(logs_dir, `${prefix}-out.log`),
    log_file: path.join(logs_dir, `${prefix}-combined.log`),
    env: { ...common_env, ...extra_env },
    ...rest
  }
}

// Services to run on this machine. Defaults to all services if not configured.
const machine_services = machine_config.services || [
  'base-api',
  'index-sync-service',
  'metadata-queue-processor',
  'cli-queue-worker',
  'schedule-processor',
  'transcription-service'
]

const all_defined_apps = [
  app('base-api', 'services/server-pm2.cjs', {
    watch: ['build/bundle-manifest.json'],
    watch_delay: 1000,
    ignore_watch: ['node_modules', 'logs', 'tmp'],
    max_memory_restart: '3584M'
  }),
  app('index-sync-service', 'server/services/index-sync-service.mjs', {
    max_memory_restart: '768M',
    exp_backoff_restart_delay: 1000,
    env: { DEBUG: 'index-sync*,embedded-index*' }
  }),
  app(
    'metadata-queue-processor',
    'server/services/metadata-queue-processor.mjs',
    {
      log_prefix: 'metadata-processor',
      max_memory_restart: '512M',
      env: {
        DEBUG: 'metadata:*',
        ...(os.platform() === 'darwin' ? { CHOKIDAR_USEPOLLING: '1' } : {})
      }
    }
  ),
  app('cli-queue-worker', 'server/services/cli-queue-worker.mjs', {
    max_memory_restart: '512M',
    env: { DEBUG: 'cli-queue:*' }
  }),
  app('schedule-processor', 'server/services/schedule-processor.mjs', {
    max_memory_restart: '256M',
    env: { DEBUG: 'schedule:*' }
  }),
  app('transcription-service', 'server/services/transcription-service.py', {
    interpreter: 'python3',
    max_memory_restart: '2G',
    args:
      machine_config.transcription_args ||
      '--port 8089 --model base.en --compute-type int8',
    env: common_env
  })
]

const all_apps = all_defined_apps.filter((a) =>
  machine_services.includes(a.name)
)

module.exports = {
  apps: all_apps.filter(Boolean)
}
