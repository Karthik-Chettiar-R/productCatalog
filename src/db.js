const path = require('node:path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

const loadedEnv = dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
const fileEnv = loadedEnv.parsed || {};

const pool = new Pool({
  host: process.env.PGHOST || fileEnv.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || fileEnv.PGPORT || 5432),
  database: process.env.PGDATABASE || fileEnv.PGDATABASE || fileEnv.database_name,
  user: process.env.PGUSER || fileEnv.PGUSER || fileEnv.username,
  password: process.env.PGPASSWORD || fileEnv.PGPASSWORD || fileEnv.password,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

module.exports = pool;
