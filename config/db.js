// ─── Database Connection Pool ────────────────────────────────────────────────
const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'your_mysql_password',
    database: process.env.DB_NAME || 'smartpoultryfarm',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'UTF8MB4_GENERAL_CI'
});

module.exports = pool;
