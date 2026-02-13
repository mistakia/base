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

// User base directory: from env var or default to ~/user-base.
// On the storage server, USER_BASE_DIRECTORY must be set in the shell profile
// to /mnt/md0/user-base since homedir() returns /home/user.
const user_base_directory =
  process.env.USER_BASE_DIRECTORY || path.join(home_dir, 'user-base')

// Container user-base path: the fixed mount point inside the Docker container.
// Both machines mount their local user-base to /Users/trashman/user-base inside
// the container (see docker-compose.macbook.yml and docker-compose.storage.yml).
// On macOS this matches the host path; on Linux it differs from the host path.
const CONTAINER_MOUNT_TARGET = '/Users/trashman/user-base'
const container_user_base_path =
  process.env.CONTAINER_USER_BASE_PATH || CONTAINER_MOUNT_TARGET

// Resolve node from .nvmrc to avoid PM2 daemon picking up a different system node
function get_nvmrc_interpreter() {
  const nvmrc_path = path.join(__dirname, '.nvmrc')
  const nvm_dir = process.env.NVM_DIR || path.join(home_dir, '.nvm')
  try {
    const version = fs.readFileSync(nvmrc_path, 'utf8').trim()
    const node_path = path.join(
      nvm_dir,
      'versions',
      'node',
      version,
      'bin',
      'node'
    )
    if (fs.existsSync(node_path)) return node_path
  } catch {}
  return 'node'
}

// Resolve machine identity from machine_registry in config.json
let machine_id = null
let machine_config = {}
try {
  const config_path = path.join(user_base_directory, 'config', 'config.json')
  const config_json = JSON.parse(fs.readFileSync(config_path, 'utf8'))
  const registry = config_json.machine_registry || {}
  const hostname = os.hostname()
  machine_id = Object.keys(registry).find(
    (id) => registry[id].hostname === hostname
  ) || null
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

const common_env = {
  CONFIG_ENCRYPTION_KEY: process.env.CONFIG_ENCRYPTION_KEY,
  USER_BASE_DIRECTORY: user_base_directory,
  CONTAINER_USER_BASE_PATH: container_user_base_path,
  GIT_SSH_COMMAND: `ssh -F ${path.join(home_dir, '.ssh', 'config')}`,
  DEBUG_COLORS: 'false',
  ...ssl_env
}

const defaults = {
  interpreter: get_nvmrc_interpreter(),
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

module.exports = {
  apps: [
    app('base-api', 'services/server.mjs', {
      watch: ['build/bundle-manifest.json'],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'logs', 'tmp'],
      max_memory_restart: '3584M',
      node_args: '--max-old-space-size=3584'
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
      args: machine_config.transcription_args || '--port 8089 --model base.en --compute-type int8',
      env: common_env
    })
  ]
}
