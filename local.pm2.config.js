/**
 * Local PM2 Configuration
 *
 * PM2 configuration for running services on the local development machine.
 * This is separate from server.pm2.config.js which is for production deployment.
 *
 * Usage:
 *   pm2 start local.pm2.config.js
 *   pm2 start local.pm2.config.js --only metadata-queue-processor
 *
 * Setup for boot persistence:
 *   pm2 startup
 *   pm2 start local.pm2.config.js
 *   pm2 save
 */

const os = require('os')
const path = require('path')

const home_dir = os.homedir()
const logs_dir = path.join(home_dir, 'logs')

module.exports = {
  apps: [
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
        DEBUG: 'metadata:*',
        DEBUG_COLORS: 'false',
        CONFIG_ENCRYPTION_KEY: process.env.CONFIG_ENCRYPTION_KEY
      }
    }
  ]
}
