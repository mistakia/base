module.exports = {
  apps: [
    {
      name: 'base-api',
      script: 'services/server.mjs',
      args: '--config /home/user/base/config/config.json',
      watch: [
        // Watch for new client deploys (bundle manifest updated after build)
        'build/bundle-manifest.json',
        // Also watch alternate sync location used by deploy:dist
        'source/build/bundle-manifest.json'
      ],
      watch_delay: 1000,
      ignore_watch: ['node_modules', 'logs', 'tmp'],
      max_memory_restart: '2G',
      node_args: '--max-old-space-size=2048',
      instances: 1,
      exec_mode: 'fork',
      error_file: '/home/user/logs/base-api-error.log',
      out_file: '/home/user/logs/base-api-out.log',
      log_file: '/home/user/logs/base-api-combined.log',
      time: true
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
        'pm2 reload server.pm2.config.js'
      ].join(' && '),
      'pre-setup': ''
    }
  }
}
