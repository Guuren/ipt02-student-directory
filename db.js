const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,      // Raised to 10
  queueLimit: 0,
  idleTimeout: 10000,       // Drops idle connections after 10 seconds to free slots on Aiven
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

module.exports = pool;