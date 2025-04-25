const fs = require('fs');
const path = require('path');
const { query, testConnection } = require('./config/database');

async function setupDatabase() {
  try {
    console.log('Testing database connection...');
    await testConnection();
    console.log('Database connection successful');

    console.log('Reading schema file...');
    const schemaPath = path.join(__dirname, 'config', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Creating tables...');
    const statements = schema
      .split(';')
      .filter(stmt => stmt.trim().length > 0);

    for (const statement of statements) {
      await query(statement);
      console.log('Executed:', statement.substring(0, 50) + '...');
    }

    console.log('Database setup complete!');
  } catch (error) {
    console.error('Error setting up database:', error);
    process.exit(1);
  }
}

setupDatabase().then(() => process.exit(0)); 