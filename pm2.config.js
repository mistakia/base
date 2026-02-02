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

const os = require('os')
const path = require('path')

const is_macos = os.platform() === 'darwin'
const home_dir = os.homedir()
const logs_dir = is_macos ? path.join(home_dir, 'logs') : '/home/user/logs'

const common_env = {
  CONFIG_ENCRYPTION_KEY: process.env.CONFIG_ENCRYPTION_KEY,
  DEBUG_COLORS: 'false'
}

module.exports = {
  apps: [
    {
      name: 'base-api',
      script: 'services/server.mjs',
      cwd: __dirname,
      watch: [
        'build/bundle-manifest.json',
        'source/build/bundle-manifest.json'
      ],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'logs', 'tmp'],
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: is_macos ? '1024M' : '3584M',
      node_args: is_macos
        ? '--max-old-space-size=1024'
        : '--max-old-space-size=3584',
      combine_logs: true,
      time: true,
      error_file: path.join(logs_dir, 'base-api-error.log'),
      out_file: path.join(logs_dir, 'base-api-out.log'),
      log_file: path.join(logs_dir, 'base-api-combined.log'),
      env: {
        ...common_env
      }
    },
    {
      name: 'metadata-queue-processor',
      script: 'server/services/metadata-queue-processor.mjs',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      combine_logs: true,
      time: true,
      error_file: path.join(logs_dir, 'metadata-processor-error.log'),
      out_file: path.join(logs_dir, 'metadata-processor-out.log'),
      log_file: path.join(logs_dir, 'metadata-processor-combined.log'),
      env: {
        ...common_env,
        DEBUG: 'metadata:*',
        // macOS: /tmp is a symlink to /private/tmp, chokidar FSEvents misses it
        ...(is_macos ? { CHOKIDAR_USEPOLLING: '1' } : {})
      }
    },
    {
      name: 'cli-queue-worker',
      script: 'server/services/cli-queue-worker.mjs',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      combine_logs: true,
      time: true,
      error_file: path.join(logs_dir, 'cli-queue-worker-error.log'),
      out_file: path.join(logs_dir, 'cli-queue-worker-out.log'),
      log_file: path.join(logs_dir, 'cli-queue-worker-combined.log'),
      env: {
        ...common_env,
        DEBUG: 'cli-queue:*'
      }
    }
  ],

  deploy: {
    production: {
      user: 'user',
      host: 'storage',
      ref: 'origin/main',
      repo: 'https://github.com/mistakia/base.git',
      path: '/home/user/base',
      'pre-deploy': 'git pull',
      'pre-deploy-local': '',
      'post-deploy': [
        'source ~/.nvm/nvm.sh',
        'nvm use',
        'yarn install',
        'pm2 reload pm2.config.js'
      ].join(' && '),
      'pre-setup': ''
    }
  }
}
