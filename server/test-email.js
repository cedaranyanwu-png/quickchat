const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { sendEmail, emailProvider } = require('./email');

const recipient = process.argv[2] || process.env.TEST_EMAIL_TO || process.env.SMTP_USER;

if (!recipient) {
  console.error('Usage: npm --prefix server run email:test -- you@example.com');
  process.exit(1);
}

console.log(`Email provider: ${emailProvider()}`);
console.log(`Sending test email to ${recipient}…`);

sendEmail({
  to: recipient,
  subject: 'QuickChat email test',
  text: 'Your QuickChat SMTP settings are working. Verification and password reset emails can now be delivered.',
  html: '<p>Your QuickChat SMTP settings are working.</p><p>Verification and password reset emails can now be delivered.</p>',
})
  .then((result) => {
    console.log('Result:', result);
    if (!result.delivered) {
      console.log('No provider is configured yet, so this message was printed as a preview instead of being delivered.');
    }
  })
  .catch((error) => {
    console.error('Email test failed:', error.message);
    process.exitCode = 1;
  });
