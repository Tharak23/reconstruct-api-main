const axios = require('axios');

const API_URL = 'http://127.0.0.1:3000';

// Test health endpoint
async function testHealth() {
  try {
    const response = await axios.get(`${API_URL}/health`);
    console.log('Health check:', response.data);
    return true;
  } catch (error) {
    console.error('Health check failed:', error.message);
    return false;
  }
}

// Test register endpoint
async function testRegister(username, email, password) {
  try {
    const response = await axios.post(`${API_URL}/auth/register`, {
      username,
      email,
      password
    });
    console.log('Register response:', response.data);
    return response.data.token;
  } catch (error) {
    console.error('Register failed:', error.response?.data || error.message);
    return null;
  }
}

// Test login endpoint
async function testLogin(email, password) {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, {
      email,
      password
    });
    console.log('Login response:', response.data);
    return response.data.token;
  } catch (error) {
    console.error('Login failed:', error.response?.data || error.message);
    return null;
  }
}

// Test profile endpoint
async function testProfile(token) {
  try {
    const response = await axios.get(`${API_URL}/auth/profile`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log('Profile response:', response.data);
    return true;
  } catch (error) {
    console.error('Profile failed:', error.response?.data || error.message);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('Starting API tests...');
  
  // Test health endpoint
  const healthOk = await testHealth();
  if (!healthOk) {
    console.error('Health check failed. Is the API running?');
    return;
  }
  
  // Generate a unique email for testing
  const testEmail = `test${Date.now()}@example.com`;
  const testName = 'Test User';
  const testPassword = 'Password123!';
  
  // Test register
  console.log(`\nTesting register with email: ${testEmail}`);
  const registerToken = await testRegister(testName, testEmail, testPassword);
  
  if (registerToken) {
    // Test profile after register
    console.log('\nTesting profile after register:');
    await testProfile(registerToken);
  }
  
  // Test login
  console.log(`\nTesting login with email: ${testEmail}`);
  const loginToken = await testLogin(testEmail, testPassword);
  
  if (loginToken) {
    // Test profile after login
    console.log('\nTesting profile after login:');
    await testProfile(loginToken);
  }
  
  console.log('\nAPI tests completed.');
}

// Install axios if not installed
try {
  require.resolve('axios');
  runTests();
} catch (e) {
  console.log('Axios not found, installing...');
  const { execSync } = require('child_process');
  execSync('npm install axios', { stdio: 'inherit' });
  console.log('Axios installed, running tests...');
  runTests();
} 