const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const connectDatabase = require('./config/db');

async function start() {
  try {
    // Assignment 8 - Question 3 - Normal server startup secures legacy ownership without changing stored configuration
    if (process.env.LEGACY_REQUIRE_AUTH === undefined) process.env.LEGACY_REQUIRE_AUTH = 'true';
    const { port } = require('./config/env').validateEnv();
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('PORT must be an integer between 1 and 65535.');
    }
    await connectDatabase(process.env.MONGO_URI);
    console.log('MongoDB connected');
    // Course Section B - Question 2 - Private listener behind a reverse proxy
    const host = process.env.HOST || '127.0.0.1';
    const server = require('./app').listen(port, host, () => console.log(`API listening on http://localhost:${port}`));
    server.requestTimeout = 30000;
    server.headersTimeout = 15000;
    // Section 2 - Question 2 - Close optional Redis and Mongo on termination
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      const deadline = setTimeout(() => process.exit(1), 10000);
      deadline.unref();
      server.close(async () => { await require('./services/redis.service').close(); await mongoose.disconnect(); });
    });
    server.on('error', async error => {
      console.error('Server failed:', error.code === 'EADDRINUSE'
        ? `${error.code}: Port ${port} is already in use (${error.address}:${error.port}). Identify the listener with netstat -ano before stopping anything. Keep backend PORT, Angular apiUrl, and Postman baseUrl in sync.`
        : error);
      await mongoose.disconnect();
      process.exitCode = 1;
    });
  } catch (error) {
    console.error('Startup failed:', error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
  }
}
start();
