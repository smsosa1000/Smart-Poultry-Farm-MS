const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: 'your_mysql_password', database: 'smartpoultryfarm' });
  const [rows] = await pool.query("SHOW COLUMNS FROM Sales_Order LIKE 'payment_status'");
  console.log(rows[0].Type);
  pool.end();
})();
