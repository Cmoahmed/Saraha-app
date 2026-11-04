// Course Section B - Question 5 - Start from the actual backend directory
module.exports = { apps: [{ name: 'saraha', script: 'server.js', cwd: require('node:path').resolve(__dirname, '..'), instances: 1, autorestart: true, max_memory_restart: '512M', env: { NODE_ENV: 'production', HOST: '127.0.0.1', PORT: 3001, TRUST_PROXY: 'loopback', LEGACY_ASSIGNMENT_MODE: 'false' } }] };
