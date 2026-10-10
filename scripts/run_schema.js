const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'your_mysql_password',
      multipleStatements: true
    });
    
    console.log('Reading schema file...');
    let rawSql = fs.readFileSync('DB_Project_Code_Clean.sql', 'utf8').replace(/^\uFEFF/, '');
    
    // Process SQL to handle DELIMITER $$ and split into statements
    // mysql2 multipleStatements doesn't support the DELIMITER command
    let processedSql = rawSql;
    
    // 1. Remove standard DELIMITER lines
    processedSql = processedSql.replace(/DELIMITER\s+\$\$/g, '');
    processedSql = processedSql.replace(/DELIMITER\s+;/g, '');
    
    // 2. Replace $$ with ; (for the ends of triggers)
    processedSql = processedSql.replace(/\$\$/g, ';');
    
    const finalSql = 'SET FOREIGN_KEY_CHECKS=0;\n' + processedSql + '\nSET FOREIGN_KEY_CHECKS=1;';
    
    console.log('Executing schema...');
    // We can use query() with multipleStatements: true for the whole thing now
    await conn.query(finalSql);

    
    console.log('Schema loaded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error executing schema:');
    console.error('Message:', err.message);
    if (err.sqlMessage) console.error('SQL Message:', err.sqlMessage);
    if (err.sql) console.error('SQL query snippet:', err.sql.substring(0, 100));
    process.exit(1);
  }
})();
