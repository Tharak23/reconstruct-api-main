const mysql = require('mysql');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'sg2plzcpnl508506.prod.sin2.secureserver.net',
  user: process.env.DB_USER || 'reconstructblog',
  password: process.env.DB_PASSWORD || 'reconstructblog123!',
  database: process.env.DB_NAME || 'reconstruct',
  port: process.env.DB_PORT || 3306,
  ssl: false,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
  debug: false,
  insecureAuth: true,
  multipleStatements: true
};

// Log configuration without sensitive data
console.log('Database Config:', {
  ...dbConfig,
  password: '******'
});

// Create connection pool with retry logic
const pool = mysql.createPool({
  ...dbConfig,
  connectionLimit: 5,
  queueLimit: 0,
  waitForConnections: true
});

// Test the connection with retry logic
const testConnection = (retries = 3) => {
  return new Promise((resolve, reject) => {
    const tryConnect = (attemptsLeft) => {
      pool.getConnection((err, connection) => {
        if (err) {
          console.error(`Connection attempt failed (${attemptsLeft} attempts left):`, {
            code: err.code,
            errno: err.errno,
            sqlMessage: err.sqlMessage,
            sqlState: err.sqlState,
            host: dbConfig.host,
            user: dbConfig.user,
            database: dbConfig.database,
            port: dbConfig.port
          });

          if (attemptsLeft > 0) {
            console.log(`Retrying connection in 5 seconds...`);
            setTimeout(() => tryConnect(attemptsLeft - 1), 5000);
          } else {
            console.error('All connection attempts failed. Please check:');
            console.error('1. Database credentials are correct');
            console.error('2. Database server is accessible');
            console.error('3. User has proper permissions');
            console.error('4. Host is allowed in MySQL user permissions');
            reject(err);
          }
          return;
        }

        console.log('Successfully connected to the database');
        connection.release();
        resolve();
      });
    };

    tryConnect(retries);
  });
};

// Helper function to get a connection from the pool
const getConnection = () => {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        console.error('Error getting connection from pool:', err);
        reject(err);
        return;
      }
      resolve(connection);
    });
  });
};

// Helper function to execute queries
const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (error, results) => {
      if (error) {
        console.error('Error executing query:', {
          sql,
          error: error.message,
          code: error.code
        });
        reject(error);
        return;
      }
      resolve(results);
    });
  });
};

// Test connection on module load
testConnection()
  .then(() => console.log('Initial database connection test successful'))
  .catch(err => console.error('Initial database connection test failed:', err));

module.exports = {
  pool,
  getConnection,
  query,
  testConnection
}; 