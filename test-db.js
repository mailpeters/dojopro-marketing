const mysql = require('mysql2');
require('dotenv').config();

console.log('Testing database connection...');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '[HIDDEN]' : 'NOT SET');
console.log('DB_NAME:', process.env.DB_NAME);

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
        process.exit(1);
    } else {
        console.log('✅ Connected to MariaDB database successfully!');
        
        // Test a simple query
        db.query('SELECT COUNT(*) as club_count FROM clubs', (err, results) => {
            if (err) {
                console.error('Query failed:', err);
            } else {
                console.log('✅ Query successful. Club count:', results[0].club_count);
            }
            db.end();
            process.exit(0);
        });
    }
});
