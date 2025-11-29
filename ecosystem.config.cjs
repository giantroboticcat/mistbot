/**
 * PM2 Ecosystem Configuration
 * Use this file to manage the bot process on EC2
 * Install PM2: npm install -g pm2
 * Start: pm2 start ecosystem.config.cjs
 * Stop: pm2 stop mistbot
 * Restart: pm2 restart mistbot
 * Logs: pm2 logs mistbot
 * Status: pm2 status
 */
module.exports = {
  apps: [{
    name: 'mistbot',
    script: 'index.js',
    interpreter: 'node',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
  }],
};

