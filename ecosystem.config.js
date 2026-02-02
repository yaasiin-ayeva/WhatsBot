module.exports = {
  apps: [
    {
      name: 'whatsbot',
      script: 'build/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 50,
      min_uptime: '10s',
      max_memory_restart: '500M',

      env: {
        NODE_ENV: 'production',
        PORT: 3003
      },

      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,

      kill_timeout: 10000,
      listen_timeout: 5000,
      shutdown_with_message: false,
      exp_backoff_restart_delay: 100,
      restart_delay: 4000,

      source_map_support: true,
      instance_var: 'INSTANCE_ID',

      automation: false,
      autorestart: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'public/downloads', '.bot'],

      wait_ready: false,
      listen_timeout: 10000,
      kill_timeout: 10000,

      max_restarts: 10,
      min_uptime: '10s',

      node_args: '--max-old-space-size=512',

      error: (error) => {
        console.error('PM2 Error:', error);
      }
    }
  ],

  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'ubuntu',
      host: 'your-server-ip',
      ref: 'origin/main',
      repo: 'git@github.com:yaasiin-ayeva/WhatsBot.git',
      path: '/home/ubuntu/WhatsBot',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt-get install git -y'
    }
  }
};
