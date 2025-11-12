const mysql = require('mysql2');
require('dotenv').config(); // Ensure environment variables are loaded

// Create a connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10, // Adjust as needed
  queueLimit: 0, // No limit on the queue
  charset: 'utf8mb4' // Recommended for proper character encoding
});

// Test the connection (optional, but good for initial setup)
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    // ... detailed error logging ...
    process.exit(1); // Exit the application if DB connection fails
  }
  if (connection) {
    console.log('Successfully connected to the database.');
    connection.release(); // Release the connection back to the pool
  }
});

module.exports = pool.promise();