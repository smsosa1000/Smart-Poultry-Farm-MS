const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const pool = mysql.createPool({ host: 'localhost', user: 'root', password: 'your_mysql_password', database: 'smartpoultryfarm' });
  try {
    // 1. Shed: Change Empty → Not_Ready
    console.log('=== Updating Shed status enum ===');
    await pool.query("UPDATE Shed SET status = 'Active' WHERE status = 'Empty'"); // temp move
    await pool.query("ALTER TABLE Shed MODIFY COLUMN status ENUM('Active','Not_Ready','Cleaning','Maintenance') DEFAULT 'Active'");
    await pool.query("UPDATE Shed SET status = 'Not_Ready' WHERE shed_id = 15002"); // restore
    console.log('Shed enum updated: Empty → Not_Ready');

    // 2. Create accounts for workers without one
    console.log('\n=== Creating accounts for workers without one ===');
    const [workers] = await pool.query(`
      SELECT w.person_id, w.FName, w.LName, w.worker_type 
      FROM Worker w 
      LEFT JOIN User u ON w.person_id = u.person_id 
      WHERE u.user_id IS NULL`);

    for (const w of workers) {
      // Generate username: lowercase first + last + person_id
      const username = (w.FName.toLowerCase() + w.LName.toLowerCase().charAt(0) + w.person_id).replace(/\s/g, '');
      const password = username; // default password = username
      const hashedPw = await bcrypt.hash(password, 12);

      await pool.query(
        'INSERT INTO User (username, password_hash, user_role, is_admin, person_id) VALUES (?, ?, ?, 0, ?)',
        [username, hashedPw, w.worker_type, w.person_id]
      );
      console.log(`  Created: ${username} / ${password}  (${w.FName} ${w.LName} - ${w.worker_type})`);
    }

    console.log('\n✅ All done!');
  } catch(e) { console.error('Error:', e.message); }
  pool.end();
})();
