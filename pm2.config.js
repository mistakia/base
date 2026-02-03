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

const is_macos = os.platform() === 'darwin'
const home_dir = os.homedir()
const logs_dir = process.env.PM2_LOGS_DIR ||
  (is_macos ? path.join(home_dir, 'logs') : '/home/user/logs')

// Resolve node from .nvmrc to avoid PM2 daemon picking up a different system node
function get_nvmrc_interpreter() {
  const nvmrc_path = path.join(__dirname, '.nvmrc')
  const nvm_dir = process.env.NVM_DIR || path.join(home_dir, '.nvm')
  try {
    const version = fs.readFileSync(nvmrc_path, 'utf8').trim()
    const node_path = path.join(nvm_dir, 'versions', 'node', version, 'bin', 'node')
    if (fs.existsSync(node_path)) return node_path
  } catch {}
  return 'node'
}

const common_env = {
  CONFIG_ENCRYPTION_KEY: process.env.CONFIG_ENCRYPTION_KEY,
  DEBUG_COLORS: 'false'
}

const defaults = {
  interpreter: get_nvmrc_interpreter(),
  cwd: __dirname,
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  combine_logs: true,
  time: true
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
      watch: [
        'build/bundle-manifest.json',
        'source/build/bundle-manifest.json'
      ],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'logs', 'tmp'],
      max_memory_restart: '3584M',
      node_args: '--max-old-space-size=3584'
    }),
    app('metadata-queue-processor', 'server/services/metadata-queue-processor.mjs', {
      log_prefix: 'metadata-processor',
      max_memory_restart: '512M',
      env: {
        DEBUG: 'metadata:*',
        ...(is_macos ? { CHOKIDAR_USEPOLLING: '1' } : {})
      }
    }),
    app('cli-queue-worker', 'server/services/cli-queue-worker.mjs', {
      max_memory_restart: '512M',
      env: { DEBUG: 'cli-queue:*' }
    })
  ]
}
