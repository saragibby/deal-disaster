import 'dotenv/config';
import { sendVerificationEmail } from '../services/emailService.js';

async function testSMTP() {
  console.log('🧪 Testing SMTP connection with support@moneymanmyers.com...\n');
  
  try {
    // Test sending a verification email
    await sendVerificationEmail(
      'saragibby@gmail.com', // Replace with your actual email to receive the test
      'test-token-abc123xyz',
      'SMTP Test User'
    );
    
    console.log('\n✅ SMTP TEST PASSED!');
    console.log('📧 Email sent successfully from support@moneymanmyers.com');
    console.log('Check the inbox for saragibby@gmail.com (or check console if SMTP not configured)');
    console.log('\nNext steps:');
    console.log('1. Check your email inbox');
    console.log('2. If using development mode, copy the URL from console above');
    console.log('3. Try registering a real user to test the full flow');
    process.exit(0);
  } catch (error: any) {
    console.log('\n❌ SMTP TEST FAILED!');
    console.error('\nError Details:', error.message);
    console.log('\n🔍 Troubleshooting Steps:');
    console.log('1. Check server/.env has correct SMTP settings');
    console.log('2. Verify SMTP_PASS is the 16-character App Password (no spaces)');
    console.log('3. Ensure SMTP_USER is support@moneymanmyers.com');
    console.log('4. Verify 2FA is enabled on the Google account');
    console.log('5. Make sure you generated the App Password at: https://myaccount.google.com/apppasswords');
    console.log('\nCurrent SMTP Configuration:');
    console.log(`  Host: ${process.env.SMTP_HOST || 'NOT SET'}`);
    console.log(`  Port: ${process.env.SMTP_PORT || 'NOT SET'}`);
    console.log(`  User: ${process.env.SMTP_USER || 'NOT SET'}`);
    console.log(`  Pass: ${process.env.SMTP_PASS ? '***' + process.env.SMTP_PASS.slice(-4) : 'NOT SET'}`);
    console.log(`  From: ${process.env.SMTP_FROM || 'NOT SET'}`);
    process.exit(1);
  }
}

testSMTP();
