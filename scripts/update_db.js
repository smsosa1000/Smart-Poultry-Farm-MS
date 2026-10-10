const mysql = require('mysql2/promise');
(async () => {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: 'your_mysql_password', database: 'smartpoultryfarm' });
  try {
    await pool.query("ALTER TABLE Vaccination_Schedule MODIFY COLUMN status ENUM('Pending','Completed','Cancelled','Failed') DEFAULT 'Pending'");
    console.log('Status enum updated.');
    await pool.query("ALTER TABLE Vaccination_Schedule ADD COLUMN assigned_worker_id INT DEFAULT NULL");
    await pool.query("ALTER TABLE Vaccination_Schedule ADD FOREIGN KEY (assigned_worker_id) REFERENCES Worker(person_id)");
    console.log('assigned_worker_id added.');
  } catch(e) { console.error(e.message); }
  pool.end();
})();
