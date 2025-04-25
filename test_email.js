const { sendWelcomeEmail } = require('./services/emailService');

// Replace with test email address or use your own
const testEmail = 'dhanushyangal@gmail.com'; // Use the email you want to test
const testName = 'Dharani Kumar';

// Test sending welcome email
async function testSendWelcomeEmail() {
  try {
    console.log('----- WELCOME EMAIL TEST -----');
    console.log(`Attempting to send welcome email to ${testEmail}...`);
    
    const result = await sendWelcomeEmail(testEmail, testName);
    console.log('Email sent successfully!');
    
    if (result.testMessageUrl) {
      console.log('This was a test email using Ethereal.');
      console.log('View the test email at:', result.testMessageUrl);
      console.log('\nINSTRUCTIONS TO FIX GMAIL ISSUES:');
      console.log('1. Make sure 2-Step Verification is enabled in your Google Account');
      console.log('2. Create an App Password at: https://myaccount.google.com/apppasswords');
      console.log('3. Update .env with:');
      console.log('   EMAIL_USER=youremail@gmail.com');
      console.log('   EMAIL_PASS=your16charapppassword');
    } else {
      console.log('Real email sent through Gmail!');
      console.log('Check your inbox at:', testEmail);
    }
    
    console.log('\nTo test the welcome email flag in the database:');
    console.log('1. Connect to your MySQL database');
    console.log('2. Set welcome_email_sent=0 for this user:');
    console.log(`   UPDATE user SET welcome_email_sent=0 WHERE email='${testEmail}';`);
    console.log('3. Try logging in with this user to trigger the welcome email again');
    
  } catch (error) {
    console.error('Error sending email:', error);
    console.error(error.stack);
  }
}

// Run the test
testSendWelcomeEmail(); 