const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create a transporter with SMTP settings
let transporter = null;

// Initialize transporter (will be created lazily if needed)
const initializeTransporter = async () => {
  // If we already have a transporter, return it
  if (transporter) {
    return transporter;
  }

  console.log('Email Configuration:');
  console.log('- NODE_ENV:', process.env.NODE_ENV);
  console.log('- EMAIL_USER configured:', !!process.env.EMAIL_USER);
  
  // For Gmail, we'll use Gmail if credentials are available
  // Otherwise, fallback to a test account
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      console.log('Attempting to create Gmail transporter');
      // Normal Gmail setup with app password
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        },
        // Adding additional configuration to improve deliverability
        pool: true, // Use pooled connections
        maxConnections: 5, // Limit connections to avoid rate limiting
        maxMessages: 100, // Limit messages per connection
        rateLimit: 5, // Limit to 5 messages per second
      });
      
      // Verify the transporter
      await transporter.verify();
      console.log('Gmail transporter created and verified successfully');
      return transporter;
    } catch (error) {
      console.error('Error creating Gmail transporter:', error);
      console.log('Falling back to Ethereal test account');
    }
  }
  
  // Create a test account at ethereal.email if Gmail setup failed or no credentials
  console.log('Creating Ethereal test account');
  try {
    const testAccount = await nodemailer.createTestAccount();
    console.log('Ethereal test account created:', testAccount.user);
    
    // Create a transporter with Ethereal.email
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
    
    console.log('Ethereal transporter created successfully');
    return transporter;
  } catch (error) {
    console.error('Error creating Ethereal transporter:', error);
    throw error;
  }
};

/**
 * Send a welcome email to a new user
 * 
 * @param {string} userEmail - The recipient's email
 * @param {string} userName - The user's name
 * @returns {Promise} - Resolves when email is sent
 */
const sendWelcomeEmail = async (userEmail, userName) => {
  try {
    console.log(`Preparing welcome email for ${userEmail}`);
    
    // Get or create the transporter
    const emailTransporter = await initializeTransporter();
    console.log('Transporter obtained');
    
    // Prepare display name for better deliverability
    const senderName = 'Ashika from Reconstruct';
    const senderEmail = 'ashika@reconstructyourmind.com';
    const formattedSender = `${senderName} <${senderEmail}>`;
    
    const mailOptions = {
      from: formattedSender,
      to: userEmail,
      replyTo: process.env.SUPPORT_EMAIL || senderEmail,
      subject: "You're in - welcome to Reconstruct!",
      headers: {
        'X-Entity-Ref-ID': `welcome-${Date.now()}-${userEmail.substring(0, 5)}`, // Unique ID to prevent threading
        'List-Unsubscribe': `<mailto:unsubscribe@reconstruct.com?subject=Unsubscribe&body=${userEmail}>`,
        'Precedence': 'Bulk'
      },
      text: `
Welcome to Reconstruct, ${userName}!

Thank you for joining our community. We're excited to have you on board!

With Reconstruct, you can:
- Plan and organize your tasks efficiently
- Collaborate with your team members
- Track your progress and meet deadlines

If you have any questions or need assistance, feel free to contact our support team.

Best regards,
The Reconstruct Team

To unsubscribe from these emails, reply with "Unsubscribe" in the subject line.
      `,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Reconstruct</title>
        </head>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.5; color: #333;">
          <div style="border-bottom: 2px solid #f0f0f0; padding-bottom: 20px; margin-bottom: 20px;">
            <p>Hi,</p>
            <h2 style="color: #2a5885;">Welcome to Reconstruct, ${userName}!</h2>
          </div>
          
          <p>Thank you for joining our community! We're so excited to have you here.</p>
          
          <p>Reconstruct is your personal space to build mental strength, stay on top of things, and feel your best every day.</p>
          
          <p><strong>Here's how to get started:</strong></p>
          <ul style="padding-left: 20px;">
            <li style="margin-bottom: 12px;">✅ <strong>Explore your personal dashboard</strong> – Track your progress, set goals, and use tools like the vision board, thought shredder, and mood tracker to stay focused. <a href="https://reconstructyourmind.com/login.php" style="color: #2a5885;">Check it out</a></li>
            <li style="margin-bottom: 12px;">📱 <strong>Stay connected on the go</strong> – Download our app for easy access anytime, anywhere. Use interactive widgets for quick journaling, reminders, and motivation—right from your home screen! <a href="https://play.google.com/store/apps/details?id=com.reconstrect.visionboard" style="color: #2a5885;">Get the App</a></li>
            <li style="margin-bottom: 12px;">📸 <strong>Join the conversation</strong> – Follow us on Instagram for daily inspiration, mental strength tips, and community updates. <a href="https://www.instagram.com/reconstruct_now/" style="color: #2a5885;">Follow Us</a></li>
          </ul>
          
          <p>Your journey to a stronger, calmer mind starts now. Let's make every day better, together!</p>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #f0f0f0; color: #666; font-size: 14px;">
            <p>Happy Reconstructing!<br>💙 Team Reconstruct</p>
            <p style="font-size: 12px; color: #999; margin-top: 20px;">
              To unsubscribe from these emails, <a href="mailto:unsubscribe@reconstruct.com?subject=Unsubscribe&body=${userEmail}" style="color: #999;">click here</a>.
            </p>
          </div>
        </body>
        </html>
      `
    };
    
    console.log('Sending email with options:', {
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject
    });

    const info = await emailTransporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    
    // If using Ethereal, show preview URL
    if (info.messageId && nodemailer.getTestMessageUrl(info)) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log('Preview URL for test email:', previewUrl);
      info.testMessageUrl = previewUrl;
    }
    
    return info;
  } catch (error) {
    console.error('Error in sendWelcomeEmail function:', error);
    throw error;
  }
};

module.exports = {
  sendWelcomeEmail
};
