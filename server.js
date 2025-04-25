const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const { pool, getConnection, query, testConnection } = require('./config/database');
const { sendWelcomeEmail } = require('./services/emailService');

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

// Improved CORS configuration
app.use(cors({
  origin: '*', // Allow all origins temporarily for testing
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true
}));

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'reconstrect_app_secret_key';

// Basic health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await testConnection();
    res.status(200).json({ 
      status: 'OK', 
      message: 'API is running',
      database: 'Connected'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      message: 'API is running but database connection failed',
      error: error.message
    });
  }
});

// Database test endpoint
app.get('/db-test', async (req, res) => {
  try {
    const results = await query('SELECT 1 + 1 AS solution');
    res.status(200).json({ 
      connected: true, 
      result: results[0].solution,
      message: 'Database connection successful'
    });
  } catch (error) {
    res.status(500).json({ 
      connected: false, 
      error: error.message,
      details: {
        code: error.code,
        errno: error.errno,
        sqlMessage: error.sqlMessage,
        sqlState: error.sqlState
      }
    });
  }
});

// Register endpoint
app.post('/auth/register', async (req, res) => {
  let connection;
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['username', 'email', 'password']
      });
    }
    
    connection = await getConnection();
    
    // Check if email already exists
    const existingUsers = await query('SELECT * FROM user WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert new user with welcome_email_sent set to 0
    const result = await query(
      'INSERT INTO user (name, email, password_hash, welcome_email_sent) VALUES (?, ?, ?, 0)',
      [username, email, hashedPassword]
    );
    
    const userId = result.insertId;
    console.log(`New user registered: ${email} (ID: ${userId})`);
    
    // Generate JWT token
    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });
    
    // Get user data without password
    const userData = await query(
      'SELECT id, name, email, created_at FROM user WHERE id = ?', 
      [userId]
    );
    
    // Send welcome email
    console.log(`Preparing to send welcome email to ${email}`);
    try {
      const emailResult = await sendWelcomeEmail(email, username);
      console.log('Welcome email sent successfully, updating database flag');
      
      // Update the welcome_email_sent flag to 1
      await query(
        'UPDATE user SET welcome_email_sent = 1 WHERE id = ?',
        [userId]
      );
      
      console.log(`Welcome email flag updated for user ${userId}`);
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError);
      console.error(emailError.stack);
      // Continue with registration even if email fails
    }
    
    res.status(201).json({
      message: 'Registration successful',
      user: userData[0],
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    console.error(error.stack);
    res.status(500).json({ 
      message: 'Server error',
      details: error.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Login endpoint
app.post('/auth/login', async (req, res) => {
  let connection;
  try {
    const { email, password } = req.body;
    
    connection = await getConnection();
    
    // Find user by email
    const results = await query('SELECT * FROM user WHERE email = ?', [email]);
    if (results.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    const user = results[0];
    
    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Generate JWT token
    const token = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '7d' });
    
    // Create a user object without the password
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at
    };
    
    console.log(`User logged in: ${user.email} (ID: ${user.id})`);
    console.log(`Welcome email status: ${user.welcome_email_sent === 0 ? 'Not sent yet' : 'Already sent'}`);
    
    // Check if welcome email has been sent
    if (user.welcome_email_sent === 0) {
      console.log(`Preparing to send welcome email to ${user.email}`);
      try {
        // Send welcome email
        const emailResult = await sendWelcomeEmail(user.email, user.name);
        console.log('Welcome email sent successfully, updating database flag');
        
        // Update the welcome_email_sent flag to 1
        await query(
          'UPDATE user SET welcome_email_sent = 1 WHERE id = ?',
          [user.id]
        );
        
        console.log(`Welcome email flag updated for user ${user.id}`);
      } catch (emailError) {
        console.error('Error sending welcome email:', emailError);
        // Continue with login even if email fails
      }
    } else {
      console.log(`Welcome email already sent to ${user.email}, skipping`);
    }
    
    res.status(200).json({
      message: 'Login successful',
      user: userData,
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Google Sign In endpoint
app.post('/auth/google', async (req, res) => {
  let connection;
  try {
    const { email, displayName, firebaseUid, password, isGoogleSignIn, storePassword } = req.body;
    
    connection = await getConnection();
    
    // Log the request parameters for debugging (remove in production)
    console.log('Google sign-in request received for:', email);
    console.log('Password provided:', password ? 'Yes' : 'No');
    console.log('storePassword flag:', storePassword);
    
    // Hash the password if provided
    let hashedPassword = null;
    if (password && (storePassword === 'true' || storePassword === true)) {
      hashedPassword = await bcrypt.hash(password, 10);
      console.log('Password hashed successfully');
    }
    
    let userId;
    let isNewUser = false;
    
    // Check if user already exists
    const results = await query('SELECT * FROM user WHERE email = ?', [email]);
    if (results.length > 0) {
      // User exists, update their information
      userId = results[0].id;
      console.log(`Existing user found: ${email} (ID: ${userId})`);
      
      // Update query including password_hash if we have a hashed password
      if (hashedPassword) {
        await query(
          'UPDATE user SET name = ?, firebase_uid = ?, password_hash = ? WHERE id = ?',
          [displayName, firebaseUid, hashedPassword, userId]
        );
        console.log('User updated with password hash');
      } else {
        // Update without changing password
        await query(
          'UPDATE user SET name = ?, firebase_uid = ? WHERE id = ?',
          [displayName, firebaseUid, userId]
        );
        console.log('User updated without password hash');
      }
    } else {
      // Create new user with password if provided
      const insertQuery = hashedPassword
        ? 'INSERT INTO user (name, email, firebase_uid, password_hash, welcome_email_sent) VALUES (?, ?, ?, ?, 0)'
        : 'INSERT INTO user (name, email, firebase_uid, welcome_email_sent) VALUES (?, ?, ?, 0)';
      
      const insertParams = hashedPassword
        ? [displayName, email, firebaseUid, hashedPassword]
        : [displayName, email, firebaseUid];
      
      const result = await query(insertQuery, insertParams);
      
      userId = result.insertId;
      isNewUser = true;
      console.log(`New user created: ${email} (ID: ${userId})`);
    }
    
    // Generate JWT token
    const token = jwt.sign({ id: userId, email }, JWT_SECRET, { expiresIn: '7d' });
    
    // Get user data
    const userData = await query(
      'SELECT id, name, email, created_at, welcome_email_sent FROM user WHERE id = ?', 
      [userId]
    );
    
    const user = userData[0];
    console.log(`Welcome email status for ${email}: ${user.welcome_email_sent === 0 ? 'Not sent yet' : 'Already sent'}`);
    
    // Check if welcome email has been sent
    if (isNewUser || user.welcome_email_sent === 0) {
      console.log(`Preparing to send welcome email to ${email}`);
      try {
        // Send welcome email
        const emailResult = await sendWelcomeEmail(email, displayName);
        console.log('Welcome email sent successfully, updating database flag');
        
        // Update the welcome_email_sent flag to 1
        await query(
          'UPDATE user SET welcome_email_sent = 1 WHERE id = ?',
          [userId]
        );
        
        console.log(`Welcome email flag updated for user ${userId}`);
      } catch (emailError) {
        console.error('Error sending welcome email:', emailError);
        console.error(emailError.stack);
        // Continue with login even if email fails
      }
    } else {
      console.log(`Welcome email already sent to ${email}, skipping`);
    }
    
    res.status(200).json({
      message: 'Google authentication successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at
      },
      token,
      passwordStored: hashedPassword !== null
    });
  } catch (error) {
    console.error('Google auth error:', error);
    console.error(error.stack);
    res.status(500).json({ message: 'Server error' });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Profile endpoint (protected)
app.get('/auth/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      });
    });

    // Get user data
    const userData = await query(
      'SELECT id, name, email, created_at FROM user WHERE id = ?', 
      [decoded.id]
    );
    
    if (userData.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.status(200).json({
      user: userData[0]
    });
  } catch (error) {
    console.error('Profile error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Table structure test endpoint
app.get('/table-info', (req, res) => {
  query('DESCRIBE user', (err, results) => {
    if (err) {
      console.error('Table info failed:', err);
      return res.status(500).json({ 
        error: err.message,
        message: 'Could not get table information' 
      });
    }
    
    res.status(200).json({ 
      tableExists: true,
      columns: results 
    });
  });
});

// Add new test endpoints
app.get('/test/users', async (req, res) => {
  try {
    const users = await query('SELECT id, name, email, created_at FROM user');
    res.status(200).json({
      message: 'Users retrieved successfully',
      count: users.length,
      users: users
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      message: 'Error fetching users',
      error: error.message
    });
  }
});

app.get('/test/tables', async (req, res) => {
  try {
    const tables = await query('SHOW TABLES');
    const tableData = {};
    
    for (const table of tables) {
      const tableName = Object.values(table)[0];
      const structure = await query('DESCRIBE ' + tableName);
      const count = await query('SELECT COUNT(*) as count FROM ' + tableName);
      
      tableData[tableName] = {
        structure: structure,
        recordCount: count[0].count
      };
    }
    
    res.status(200).json({
      message: 'Database structure retrieved successfully',
      tables: tableData
    });
  } catch (error) {
    console.error('Error fetching database structure:', error);
    res.status(500).json({ 
      message: 'Error fetching database structure',
      error: error.message
    });
  }
});

// Task API Endpoints
// =================
// Helper middleware for Bearer authentication with username:email format
const authenticateUserByToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }
    
    // Extract user info from the token
    // Format: "Bearer username:email"
    const token = authHeader.split('Bearer ')[1];
    const [user_name, email] = token.split(':');
    
    if (!user_name || !email) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication format. Expected: Bearer username:email' 
      });
    }
    
    // Add user info to the request
    req.user = { user_name, email };
    
    // Proceed to the next middleware
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication failed', 
      error: error.message 
    });
  }
};

// Load tasks endpoint
app.get('/api/tasks/load', authenticateUserByToken, async (req, res) => {
  try {
    // Get query parameters
    const { theme } = req.query;
    const { user_name, email } = req.user;
    
    if (!theme) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameter: theme' 
      });
    }
    
    console.log(`Loading tasks for user ${user_name} with theme ${theme}`);
    
    // Query the database to get tasks for this user and theme
    const results = await query(
      'SELECT * FROM vision_board_tasks WHERE user_name = ? AND email = ? AND theme = ?',
      [user_name, email, theme]
    );
    
    return res.status(200).json(results);
  } catch (error) {
    console.error('Error loading tasks:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error loading tasks', 
      error: error.message 
    });
  }
});

// Save task endpoint
app.post('/api/tasks/save', authenticateUserByToken, async (req, res) => {
  try {
    // Get request body
    const { user_name, email, card_id, tasks, theme, table } = req.body;
    const requestUser = req.user;
    
    // Validate required fields
    if (!user_name || !email || !card_id || !tasks || !theme || !table) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: user_name, email, card_id, tasks, theme, or table' 
      });
    }
    
    // Verify the authenticated user matches the requested user_name/email
    if (user_name !== requestUser.user_name || email !== requestUser.email) {
      return res.status(403).json({ 
        success: false, 
        message: 'Authorization mismatch: Cannot save tasks for another user' 
      });
    }
    
    // Verify table name to prevent SQL injection
    if (table !== 'vision_board_tasks' && table !== 'weekly_planner_tasks') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid table name. Only "vision_board_tasks" or "weekly_planner_tasks" allowed.' 
      });
    }
    
    console.log(`Saving task for user ${user_name} in table ${table}`);
    
    // Check if record exists
    const existingRecords = await query(
      `SELECT id FROM ${table} WHERE user_name = ? AND email = ? AND card_id = ? AND theme = ?`,
      [user_name, email, card_id, theme]
    );
    
    let result;
    if (existingRecords.length > 0) {
      // Update existing record
      console.log(`Updating existing task with ID: ${existingRecords[0].id}`);
      
      result = await query(
        `UPDATE ${table} SET tasks = ?, updated_at = NOW() WHERE id = ?`,
        [tasks, existingRecords[0].id]
      );
      
      return res.status(200).json({ 
        success: true, 
        message: 'Task updated successfully', 
        id: existingRecords[0].id 
      });
    } else {
      // Insert new record
      console.log('Creating new task record');
      
      result = await query(
        `INSERT INTO ${table} (user_name, email, card_id, tasks, theme) VALUES (?, ?, ?, ?, ?)`,
        [user_name, email, card_id, tasks, theme]
      );
      
      return res.status(201).json({ 
        success: true, 
        message: 'Task saved successfully', 
        id: result.insertId 
      });
    }
  } catch (error) {
    console.error('Error saving task:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error saving task', 
      error: error.message 
    });
  }
});

// Calendar API Endpoints
// ===================
// Load calendar tasks endpoint
app.get('/api/calendar/load', authenticateUserByToken, async (req, res) => {
  try {
    // Get query parameters
    const { theme } = req.query;
    const { user_name, email } = req.user;
    
    if (!theme) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameter: theme' 
      });
    }
    
    console.log(`Loading calendar tasks for user ${user_name} with theme ${theme}`);
    
    // Query the database to get calendar tasks for this user and theme
    const results = await query(
      'SELECT * FROM calendar_2025_tasks WHERE user_name = ? AND email = ? AND theme = ?',
      [user_name, email, theme]
    );
    
    // Normalize results to ensure consistent format
    const normalizedResults = results.map(task => {
      // Ensure color_code follows the 'selected-color-X' format
      if (!task.color_code || !task.color_code.startsWith('selected-color-')) {
        task.color_code = `selected-color-${task.task_type}`;
        console.log(`Normalizing color code for task ${task.id} to ${task.color_code}`);
      }
      
      // Ensure task_type is consistent with color_code
      if (task.color_code.startsWith('selected-color-')) {
        const colorTypeMatch = task.color_code.match(/selected-color-(\d+)/);
        if (colorTypeMatch && colorTypeMatch[1]) {
          const colorType = parseInt(colorTypeMatch[1], 10);
          if (task.task_type !== colorType) {
            console.log(`Correcting task_type for task ${task.id} from ${task.task_type} to ${colorType} based on color_code`);
            task.task_type = colorType;
          }
        }
      }
      
      return task;
    });
    
    console.log(`Returning ${normalizedResults.length} calendar tasks`);
    
    // Always return with a consistent format
    return res.status(200).json({
      success: true, 
      tasks: normalizedResults
    });
  } catch (error) {
    console.error('Error loading calendar tasks:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error loading calendar tasks', 
      error: error.message,
      tasks: []
    });
  }
});

// Save calendar task endpoint
app.post('/api/calendar/save', authenticateUserByToken, async (req, res) => {
  try {
    // Get request body
    const { user_name, email, task_date, task_type, task_description, color_code, theme, id, delete: shouldDelete } = req.body;
    const requestUser = req.user;
    
    // Verify the authenticated user matches the requested user_name/email
    if (user_name !== requestUser.user_name || email !== requestUser.email) {
      return res.status(403).json({ 
        success: false, 
        message: 'Authorization mismatch: Cannot save calendar tasks for another user' 
      });
    }

    // Handle deletion if the delete flag is set
    if (shouldDelete && id) {
      console.log(`Deleting calendar task with ID: ${id}`);
      
      const deleteResult = await query(
        'DELETE FROM calendar_2025_tasks WHERE id = ? AND user_name = ? AND email = ?',
        [id, user_name, email]
      );
      
      if (deleteResult.affectedRows > 0) {
        return res.status(200).json({ 
          success: true, 
          message: 'Calendar task deleted successfully',
          id: id
        });
      } else {
        return res.status(404).json({ 
          success: false, 
          message: 'Calendar task not found or not owned by this user' 
        });
      }
    }
    
    // For updates, we should have an ID
    if (id) {
      console.log(`Updating calendar task with ID: ${id}`);
      
      // Create set clause and parameters dynamically
      let setClauses = [];
      let params = [];
      
      if (task_type !== undefined) {
        setClauses.push('task_type = ?');
        params.push(task_type);
      }
      
      if (task_description !== undefined) {
        setClauses.push('task_description = ?');
        params.push(task_description);
      }
      
      if (color_code !== undefined) {
        setClauses.push('color_code = ?');
        params.push(color_code);
      }
      
      if (task_date !== undefined) {
        setClauses.push('task_date = ?');
        params.push(task_date);
      }
      
      if (theme !== undefined) {
        setClauses.push('theme = ?');
        params.push(theme);
      }
      
      // Add updated_at
      setClauses.push('updated_at = NOW()');
      
      // Add the remaining parameters for the WHERE clause
      params.push(id);
      params.push(user_name);
      params.push(email);
      
      if (setClauses.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No fields to update' 
        });
      }
      
      const updateQuery = `UPDATE calendar_2025_tasks SET ${setClauses.join(', ')} WHERE id = ? AND user_name = ? AND email = ?`;
      const updateResult = await query(updateQuery, params);
      
      if (updateResult.affectedRows > 0) {
        return res.status(200).json({ 
          success: true, 
          message: 'Calendar task updated successfully',
          id: id
        });
      } else {
        return res.status(404).json({ 
          success: false, 
          message: 'Calendar task not found or not owned by this user' 
        });
      }
    }
    
    // Validate required fields for new tasks
    if (!task_date || !task_type || !task_description || !color_code || !theme) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: task_date, task_type, task_description, color_code, or theme' 
      });
    }
    
    console.log(`Saving calendar task for user ${user_name} on date ${task_date}`);
    
    // Check if record exists - using composite primary key of user_name, task_date, and theme
    const existingRecords = await query(
      'SELECT id FROM calendar_2025_tasks WHERE user_name = ? AND email = ? AND task_date = ? AND theme = ?',
      [user_name, email, task_date, theme]
    );
    
    let result;
    if (existingRecords.length > 0) {
      // Update existing record
      console.log(`Updating existing calendar task with ID: ${existingRecords[0].id}`);
      
      result = await query(
        'UPDATE calendar_2025_tasks SET task_type = ?, task_description = ?, color_code = ?, updated_at = NOW() WHERE id = ?',
        [task_type, task_description, color_code, existingRecords[0].id]
      );
      
      return res.status(200).json({ 
        success: true, 
        message: 'Calendar task updated successfully', 
        id: existingRecords[0].id 
      });
    } else {
      // Insert new record
      console.log('Creating new calendar task record');
      
      result = await query(
        'INSERT INTO calendar_2025_tasks (user_name, email, task_date, task_type, task_description, color_code, theme) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user_name, email, task_date, task_type, task_description, color_code, theme]
      );
      
      return res.status(201).json({ 
        success: true, 
        message: 'Calendar task saved successfully', 
        id: result.insertId 
      });
    }
  } catch (error) {
    console.error('Error saving calendar task:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error saving calendar task', 
      error: error.message 
    });
  }
});

// Add endpoint to match new CalendarDatabaseService implementation
app.get('/calendar2025/tasks', authenticateUserByToken, async (req, res) => {
  try {
    // Redirect to the /api/calendar/load endpoint for backwards compatibility
    req.query = { 
      ...req.query,
      theme: req.query.theme || 'animal'
    };
    
    // Forward to the calendar load endpoint
    console.log(`Redirecting old calendar endpoint request to /api/calendar/load with theme: ${req.query.theme}`);
    
    // Query the database to get calendar tasks for this user and theme
    const results = await query(
      'SELECT * FROM calendar_2025_tasks WHERE user_name = ? AND email = ? AND theme = ?',
      [req.user.user_name, req.user.email, req.query.theme]
    );
    
    // Normalize results to ensure consistent format
    const normalizedResults = results.map(task => {
      // Ensure color_code follows the 'selected-color-X' format
      if (!task.color_code || !task.color_code.startsWith('selected-color-')) {
        task.color_code = `selected-color-${task.task_type}`;
        console.log(`Normalizing color code for task ${task.id} to ${task.color_code}`);
      }
      
      // Ensure task_type is consistent with color_code
      if (task.color_code.startsWith('selected-color-')) {
        const colorTypeMatch = task.color_code.match(/selected-color-(\d+)/);
        if (colorTypeMatch && colorTypeMatch[1]) {
          const colorType = parseInt(colorTypeMatch[1], 10);
          if (task.task_type !== colorType) {
            console.log(`Correcting task_type for task ${task.id} from ${task.task_type} to ${colorType} based on color_code`);
            task.task_type = colorType;
          }
        }
      }
      
      return task;
    });
    
    console.log(`Returning ${normalizedResults.length} calendar tasks`);
    
    // Always return with consistent format
    return res.status(200).json({
      success: true, 
      tasks: normalizedResults
    });
  } catch (error) {
    console.error('Error loading calendar tasks:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error loading calendar tasks', 
      error: error.message,
      tasks: []
    });
  }
});

// Add backward compatibility endpoint for calendar
app.get('/calendar2025/tasks', async (req, res) => {
  try {
    const { user_name, email, theme } = req.query;
    
    if (!user_name || !email || !theme) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters: user_name, email, or theme',
        tasks: []
      });
    }
    
    console.log(`Loading calendar tasks via compatibility endpoint for user ${user_name} with theme ${theme}`);
    
    // Query the database to get calendar tasks for this user and theme
    const results = await query(
      'SELECT * FROM calendar_2025_tasks WHERE user_name = ? AND email = ? AND theme = ?',
      [user_name, email, theme]
    );
    
    // Normalize results to ensure consistent format
    const normalizedResults = results.map(task => {
      // Ensure color_code follows the 'selected-color-X' format
      if (!task.color_code || !task.color_code.startsWith('selected-color-')) {
        task.color_code = `selected-color-${task.task_type}`;
        console.log(`Normalizing color code for task ${task.id} to ${task.color_code}`);
      }
      
      // Ensure task_type is consistent with color_code
      if (task.color_code.startsWith('selected-color-')) {
        const colorTypeMatch = task.color_code.match(/selected-color-(\d+)/);
        if (colorTypeMatch && colorTypeMatch[1]) {
          const colorType = parseInt(colorTypeMatch[1], 10);
          if (task.task_type !== colorType) {
            console.log(`Correcting task_type for task ${task.id} from ${task.task_type} to ${colorType} based on color_code`);
            task.task_type = colorType;
          }
        }
      }
      
      return task;
    });
    
    console.log(`Returning ${normalizedResults.length} calendar tasks`);
    
    // Always ensure consistent response format
    return res.status(200).json({
      success: true, 
      tasks: normalizedResults
    });
  } catch (error) {
    console.error('Error loading calendar tasks:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error loading calendar tasks', 
      error: error.message,
      tasks: []
    });
  }
});

// Add backward compatibility endpoints for calendar save, update, delete
app.post('/calendar2025/tasks', async (req, res) => {
  try {
    const { user_name, email, task_date, task_type, task_description, color_code, theme } = req.body;
    
    // Validate required fields
    if (!user_name || !email || !task_date || !task_type || !task_description || !color_code || !theme) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }
    
    console.log(`Saving calendar task via compatibility endpoint for user ${user_name} on date ${task_date}`);
    console.log(`Task details - Type: ${task_type}, Color: ${color_code}, Theme: ${theme}`);
    
    // Normalize color_code to 'selected-color-X' format if it's not already
    let normalizedColorCode = color_code;
    if (!color_code.startsWith('selected-color-')) {
      normalizedColorCode = `selected-color-${task_type}`;
      console.log(`Normalizing color code from ${color_code} to ${normalizedColorCode}`);
    }
    
    // Check if record exists
    const existingRecords = await query(
      'SELECT id FROM calendar_2025_tasks WHERE user_name = ? AND email = ? AND task_date = ? AND theme = ?',
      [user_name, email, task_date, theme]
    );
    
    let result;
    if (existingRecords.length > 0) {
      // Update existing record
      console.log(`Updating existing calendar task with ID: ${existingRecords[0].id}`);
      
      result = await query(
        'UPDATE calendar_2025_tasks SET task_type = ?, task_description = ?, color_code = ?, updated_at = NOW() WHERE id = ?',
        [task_type, task_description, normalizedColorCode, existingRecords[0].id]
      );
      
      return res.status(200).json({ 
        success: true, 
        message: 'Calendar task updated successfully', 
        task: { id: existingRecords[0].id }
      });
    } else {
      // Insert new record
      console.log('Creating new calendar task record');
      
      result = await query(
        'INSERT INTO calendar_2025_tasks (user_name, email, task_date, task_type, task_description, color_code, theme) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user_name, email, task_date, task_type, task_description, normalizedColorCode, theme]
      );
      
      return res.status(201).json({ 
        success: true, 
        message: 'Calendar task saved successfully', 
        task: { id: result.insertId }
      });
    }
  } catch (error) {
    console.error('Error saving calendar task:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error saving calendar task', 
      error: error.message 
    });
  }
});

// Update calendar task endpoint (compatibility)
app.put('/calendar2025/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const { user_name, email, task_type, task_description, color_code, task_date } = req.body;
    
    if (!user_name || !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: user_name or email' 
      });
    }
    
    console.log(`Updating calendar task with ID: ${taskId}`);
    
    // Create set clause and parameters dynamically
    let setClauses = [];
    let params = [];
    
    if (task_type !== undefined) {
      setClauses.push('task_type = ?');
      params.push(task_type);
    }
    
    if (task_description !== undefined) {
      setClauses.push('task_description = ?');
      params.push(task_description);
    }
    
    if (color_code !== undefined) {
      setClauses.push('color_code = ?');
      params.push(color_code);
    }
    
    if (task_date !== undefined) {
      setClauses.push('task_date = ?');
      params.push(task_date);
    }
    
    // Add updated_at
    setClauses.push('updated_at = NOW()');
    
    // Add the remaining parameters for the WHERE clause
    params.push(taskId);
    params.push(user_name);
    params.push(email);
    
    if (setClauses.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No fields to update' 
      });
    }
    
    const updateQuery = `UPDATE calendar_2025_tasks SET ${setClauses.join(', ')} WHERE id = ? AND user_name = ? AND email = ?`;
    const updateResult = await query(updateQuery, params);
    
    if (updateResult.affectedRows > 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'Calendar task updated successfully',
        task: { id: taskId }
      });
    } else {
      return res.status(404).json({ 
        success: false, 
        message: 'Calendar task not found or not owned by this user' 
      });
    }
  } catch (error) {
    console.error('Error updating calendar task:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error updating calendar task', 
      error: error.message 
    });
  }
});

// Delete calendar task endpoint (compatibility)
app.delete('/calendar2025/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    
    console.log(`Deleting calendar task with ID: ${taskId}`);
    
    const deleteResult = await query(
      'DELETE FROM calendar_2025_tasks WHERE id = ?',
      [taskId]
    );
    
    if (deleteResult.affectedRows > 0) {
      return res.status(200).json({ 
        success: true, 
        message: 'Calendar task deleted successfully'
      });
    } else {
      return res.status(404).json({ 
        success: false, 
        message: 'Calendar task not found' 
      });
    }
  } catch (error) {
    console.error('Error deleting calendar task:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error deleting calendar task', 
      error: error.message 
    });
  }
});

// Annual Calendar API Endpoints
// ===========================

// Get annual calendar tasks
app.get('/annual-calendar/tasks', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Verify token
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = await new Promise((resolve, reject) => {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        });
      });
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    // Get user data from token
    const userData = await query(
      'SELECT id, name, email FROM user WHERE id = ?', 
      [decoded.id]
    );

    if (userData.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = userData[0];

    // Query tasks from annual_calendar_tasks table
    const tasks = await query(
      'SELECT * FROM annual_calendar_tasks WHERE user_name = ? AND email = ?',
      [user.name, user.email]
    );

    return res.status(200).json({
      success: true,
      tasks: tasks
    });

  } catch (error) {
    console.error('Error fetching annual calendar tasks:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching tasks', 
      error: error.message 
    });
  }
});

// Save annual calendar task
app.post('/annual-calendar/tasks', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Verify token
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = await new Promise((resolve, reject) => {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        });
      });
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    // Get user data from token
    const userData = await query(
      'SELECT id, name, email FROM user WHERE id = ?', 
      [decoded.id]
    );

    if (userData.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = userData[0];
    const { card_id, tasks, theme } = req.body;

    // Validate required fields
    if (!card_id || !tasks || !theme) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: card_id, tasks, or theme' 
      });
    }

    // Check if task already exists
    const existingTask = await query(
      'SELECT id FROM annual_calendar_tasks WHERE user_name = ? AND email = ? AND card_id = ? AND theme = ?',
      [user.name, user.email, card_id, theme]
    );

    let result;
    if (existingTask.length > 0) {
      // Update existing task
      result = await query(
        'UPDATE annual_calendar_tasks SET tasks = ?, updated_at = NOW() WHERE id = ?',
        [tasks, existingTask[0].id]
      );

      return res.status(200).json({
        success: true,
        message: 'Task updated successfully',
        id: existingTask[0].id
      });
    } else {
      // Create new task
      result = await query(
        'INSERT INTO annual_calendar_tasks (user_name, email, card_id, tasks, theme) VALUES (?, ?, ?, ?, ?)',
        [user.name, user.email, card_id, tasks, theme]
      );

      return res.status(201).json({
        success: true,
        message: 'Task created successfully',
        id: result.insertId
      });
    }

  } catch (error) {
    console.error('Error saving annual calendar task:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error saving task', 
      error: error.message 
    });
  }
});

// Weekly Planner API Endpoints
// ==========================

// Get weekly planner tasks
app.get('/weekly-planner/tasks', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Verify token
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = await new Promise((resolve, reject) => {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        });
      });
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    // Get user data from token
    const userData = await query(
      'SELECT id, name, email FROM user WHERE id = ?', 
      [decoded.id]
    );

    if (userData.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = userData[0];

    // Query tasks from weekly_planner_tasks table
    const tasks = await query(
      'SELECT * FROM weekly_planner_tasks WHERE user_name = ? AND email = ?',
      [user.name, user.email]
    );

    return res.status(200).json({
      success: true,
      tasks: tasks
    });

  } catch (error) {
    console.error('Error fetching weekly planner tasks:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching tasks', 
      error: error.message 
    });
  }
});

// Save weekly planner task
app.post('/weekly-planner/tasks', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Verify token
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = await new Promise((resolve, reject) => {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        });
      });
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    // Get user data from token
    const userData = await query(
      'SELECT id, name, email FROM user WHERE id = ?', 
      [decoded.id]
    );

    if (userData.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = userData[0];
    const { card_id, tasks, theme } = req.body;

    // Validate required fields
    if (!card_id || !tasks || !theme) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: card_id, tasks, or theme' 
      });
    }

    // Check if task already exists
    const existingTask = await query(
      'SELECT id FROM weekly_planner_tasks WHERE user_name = ? AND email = ? AND card_id = ? AND theme = ?',
      [user.name, user.email, card_id, theme]
    );

    let result;
    if (existingTask.length > 0) {
      // Update existing task
      result = await query(
        'UPDATE weekly_planner_tasks SET tasks = ?, updated_at = NOW() WHERE id = ?',
        [tasks, existingTask[0].id]
      );

      return res.status(200).json({
        success: true,
        message: 'Task updated successfully',
        id: existingTask[0].id
      });
    } else {
      // Create new task
      result = await query(
        'INSERT INTO weekly_planner_tasks (user_name, email, card_id, tasks, theme) VALUES (?, ?, ?, ?, ?)',
        [user.name, user.email, card_id, tasks, theme]
      );

      return res.status(201).json({
        success: true,
        message: 'Task created successfully',
        id: result.insertId
      });
    }

  } catch (error) {
    console.error('Error saving weekly planner task:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error saving task', 
      error: error.message 
    });
  }
});

// Mind Tools Activity Tracking API
// ==============================

// Get mind tools activity data
app.get('/api/mind-tools/activity', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Verify token
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = await new Promise((resolve, reject) => {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        });
      });
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    // Get user data from token
    const userData = await query(
      'SELECT id, name, email FROM user WHERE id = ?', 
      [decoded.id]
    );

    if (userData.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = userData[0];
    
    // Get tracker types from query params or use all
    const trackerTypes = req.query.tracker_types ? 
      req.query.tracker_types.split(',') : 
      ['thought_shredder', 'make_me_smile', 'bubble_wrap_popper', 'break_things'];
      
    // Query to get all activity data for this user's trackers
    const activityData = await query(
      'SELECT tracker_type, activity_date, count FROM mind_tools_activity WHERE email = ? AND tracker_type IN (?)',
      [user.email, trackerTypes]
    );

    // Format the data for easy consumption by the client
    const formattedData = {};
    trackerTypes.forEach(type => {
      formattedData[type] = {};
    });
    
    // Populate the data
    activityData.forEach(record => {
      const dateStr = new Date(record.activity_date).toISOString().split('T')[0];
      if (!formattedData[record.tracker_type]) {
        formattedData[record.tracker_type] = {};
      }
      formattedData[record.tracker_type][dateStr] = record.count;
    });

    return res.status(200).json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error('Error fetching mind tools activity:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching activity data', 
      error: error.message 
    });
  }
});

// Record mind tools activity
app.post('/api/mind-tools/activity', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Verify token
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = await new Promise((resolve, reject) => {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        });
      });
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    // Get user data from token
    const userData = await query(
      'SELECT id, name, email FROM user WHERE id = ?', 
      [decoded.id]
    );

    if (userData.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = userData[0];
    const { tracker_type, activity_date } = req.body;

    // Validate required fields
    if (!tracker_type) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required field: tracker_type' 
      });
    }
    
    // Use current date if not provided
    const date = activity_date ? new Date(activity_date) : new Date();
    const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    // Validate tracker type
    const validTrackers = ['thought_shredder', 'make_me_smile', 'bubble_wrap_popper', 'break_things'];
    if (!validTrackers.includes(tracker_type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid tracker_type. Must be one of: ' + validTrackers.join(', ')
      });
    }

    // Check if record already exists for this date
    const existingRecord = await query(
      'SELECT id, count FROM mind_tools_activity WHERE email = ? AND tracker_type = ? AND activity_date = ?',
      [user.email, tracker_type, formattedDate]
    );

    let result;
    if (existingRecord.length > 0) {
      // Update existing record (increment count)
      const newCount = existingRecord[0].count + 1;
      result = await query(
        'UPDATE mind_tools_activity SET count = ? WHERE id = ?',
        [newCount, existingRecord[0].id]
      );

      return res.status(200).json({
        success: true,
        message: 'Activity count updated',
        data: {
          tracker_type,
          activity_date: formattedDate,
          count: newCount
        }
      });
    } else {
      // Create new record
      result = await query(
        'INSERT INTO mind_tools_activity (user_name, email, tracker_type, activity_date, count) VALUES (?, ?, ?, ?, 1)',
        [user.name, user.email, tracker_type, formattedDate]
      );

      return res.status(201).json({
        success: true,
        message: 'Activity recorded',
        data: {
          id: result.insertId,
          tracker_type,
          activity_date: formattedDate,
          count: 1
        }
      });
    }

  } catch (error) {
    console.error('Error recording mind tools activity:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error recording activity', 
      error: error.message 
    });
  }
});

// Batch sync mind tools activity 
app.post('/api/mind-tools/sync', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    // Verify token
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = await new Promise((resolve, reject) => {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded);
        });
      });
    } catch (error) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }

    // Get user data from token
    const userData = await query(
      'SELECT id, name, email FROM user WHERE id = ?', 
      [decoded.id]
    );

    if (userData.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = userData[0];
    const { activities } = req.body;

    // Validate request format
    if (!activities || !Array.isArray(activities) || activities.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid request format. Expected "activities" array.' 
      });
    }

    // Process each activity
    const results = [];
    for (const activity of activities) {
      const { tracker_type, activity_date, count } = activity;
      
      // Validate activity data
      if (!tracker_type || !activity_date) {
        results.push({
          success: false,
          message: 'Missing required fields',
          data: activity
        });
        continue;
      }
      
      // Format date
      const formattedDate = new Date(activity_date).toISOString().split('T')[0];
      
      try {
        // Check if record exists
        const existingRecord = await query(
          'SELECT id, count FROM mind_tools_activity WHERE email = ? AND tracker_type = ? AND activity_date = ?',
          [user.email, tracker_type, formattedDate]
        );
        
        if (existingRecord.length > 0) {
          // Update if server count is less than client count
          if (existingRecord[0].count < (count || 1)) {
            await query(
              'UPDATE mind_tools_activity SET count = ? WHERE id = ?',
              [count || 1, existingRecord[0].id]
            );
            
            results.push({
              success: true,
              message: 'Activity updated',
              data: {
                tracker_type,
                activity_date: formattedDate,
                count: count || 1
              }
            });
          } else {
            results.push({
              success: true,
              message: 'No update needed (server has higher count)',
              data: {
                tracker_type,
                activity_date: formattedDate,
                count: existingRecord[0].count
              }
            });
          }
        } else {
          // Insert new record
          const result = await query(
            'INSERT INTO mind_tools_activity (user_name, email, tracker_type, activity_date, count) VALUES (?, ?, ?, ?, ?)',
            [user.name, user.email, tracker_type, formattedDate, count || 1]
          );
          
          results.push({
            success: true,
            message: 'Activity recorded',
            data: {
              id: result.insertId,
              tracker_type,
              activity_date: formattedDate,
              count: count || 1
            }
          });
        }
      } catch (error) {
        results.push({
          success: false,
          message: error.message,
          data: activity
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Processed ${results.length} activities`,
      results
    });

  } catch (error) {
    console.error('Error syncing mind tools activity:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Error syncing activities', 
      error: error.message 
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} and accessible from any IP`);
  
  // Test database connection on startup
  testConnection()
    .then(() => console.log('Database connection test successful'))
    .catch(err => console.error('Database connection test failed:', err));
});

// Add dedicated welcome email API endpoint
app.post('/api/send-welcome-email', async (req, res) => {
  try {
    // Log all incoming requests
    console.log('Email API Request received:');
    console.log('- Headers:', JSON.stringify(req.headers));
    console.log('- Body:', JSON.stringify(req.body));
    
    const { email, name, userId } = req.body;
    
    if (!email || !name) {
      console.log('Missing required fields in email request');
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields - email and name are required',
        required: ['email', 'name', 'userId']
      });
    }
    
    console.log(`API: Sending welcome email to ${email}`);
    
    // Send welcome email
    const emailResult = await sendWelcomeEmail(email, name);
    console.log('Email sending result:', JSON.stringify(emailResult));
    
    // If userId is provided, update the database flag
    if (userId) {
      try {
        await query(
          'UPDATE user SET welcome_email_sent = 1 WHERE id = ?',
          [userId]
        );
        console.log(`Welcome email flag updated for user ${userId}`);
      } catch (dbError) {
        console.error('Error updating email sent flag:', dbError);
        // Continue with success response even if DB update fails
      }
    }
    
    return res.status(200).json({
      success: true,
      message: 'Welcome email sent successfully',
      testUrl: emailResult.testMessageUrl || null
    });
    
  } catch (error) {
    console.error('Error in /api/send-welcome-email endpoint:', error);
    console.error(error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to send welcome email',
      error: error.message
    });
  }
}); 
