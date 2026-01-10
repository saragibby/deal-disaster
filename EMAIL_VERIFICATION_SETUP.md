# Email Verification and Password Reset Setup

This document explains the email verification and password reset features that have been added to the Deal or Disaster application.

## Features Implemented

1. **Email Verification**
   - Users must verify their email address after registration
   - Verification emails are sent with a 24-hour expiration link
   - Users can resend verification emails if needed
   - OAuth users (Google/Microsoft) are automatically verified

2. **Password Reset**
   - Users can request a password reset link
   - Reset tokens expire after 1 hour
   - Secure token-based password reset flow

## Database Changes

The following columns were added to the `users` table:
- `email_verified` (BOOLEAN) - Tracks if email is verified
- `verification_token` (VARCHAR) - Token for email verification
- `verification_token_expires` (TIMESTAMP) - Expiration for verification token
- `reset_token` (VARCHAR) - Token for password reset
- `reset_token_expires` (TIMESTAMP) - Expiration for reset token

To apply these changes to your database:

```bash
# Development
cd server
npm run db:setup

# Or manually run the migration
psql your_database < src/db/migrations/add_email_verification_and_password_reset.sql
```

## Email Configuration

### Required Environment Variables

Add these to your `.env` file in the `server` directory:

```env
# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com          # Your SMTP server
SMTP_PORT=587                      # SMTP port (587 for TLS, 465 for SSL)
SMTP_SECURE=false                  # true for 465, false for other ports
SMTP_USER=your-email@gmail.com     # Your email address
SMTP_PASS=your-app-password        # Your email password or app password
SMTP_FROM=noreply@yourdomain.com   # From email address

# Application URLs
CLIENT_URL=http://localhost:5173   # Frontend URL
SERVER_URL=http://localhost:3001   # Backend URL
```

### Email Service Providers

#### Option 1: Gmail (Development/Small Scale)

1. Enable 2-factor authentication on your Google account
2. Generate an App Password:
   - Go to Google Account Settings
   - Security → 2-Step Verification → App passwords
   - Create a new app password for "Mail"
3. Use the app password as `SMTP_PASS`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
```

#### Option 2: SendGrid (Recommended for Production)

1. Sign up at [SendGrid](https://sendgrid.com)
2. Create an API key
3. Configure:

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

#### Option 3: AWS SES (Production)

1. Set up AWS SES and verify your domain
2. Get SMTP credentials
3. Configure:

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-aws-smtp-username
SMTP_PASS=your-aws-smtp-password
```

#### Option 4: Other Providers

The app supports any SMTP-compatible email service:
- Mailgun
- Postmark
- Mailjet
- Your own SMTP server

### Development Mode (No Email Server)

If SMTP is not configured, the application will:
- Log email details to the console instead of sending
- Display verification URLs in the terminal
- Still function normally for testing

You can copy the verification/reset URLs from the console and paste them into your browser.

## API Endpoints

### Registration
```
POST /api/auth/register
Body: { email, password, name }
Response: { message, email }
```

### Login
```
POST /api/auth/login
Body: { email, password }
Response: { token, user } OR { error, needsVerification, email }
```

### Email Verification
```
GET /api/auth/verify-email?token=<verification-token>
Response: { message, email }
```

### Resend Verification
```
POST /api/auth/resend-verification
Body: { email }
Response: { message }
```

### Forgot Password
```
POST /api/auth/forgot-password
Body: { email }
Response: { message }
```

### Reset Password
```
POST /api/auth/reset-password
Body: { token, password }
Response: { message }
```

## Frontend Routes

The following routes were added:

- `/` - Main app (login/game)
- `/verify-email?token=...` - Email verification page
- `/reset-password?token=...` - Password reset page

## User Flow

### Registration Flow

1. User fills out registration form
2. Account is created with `email_verified = false`
3. Verification email is sent
4. User must click link in email
5. Email is verified, user can now log in

### Login Flow

1. User enters email and password
2. System checks if email is verified
3. If not verified, shows error with option to resend
4. If verified, user is logged in

### Password Reset Flow

1. User clicks "Forgot password?"
2. Enters email address
3. Reset email is sent (if account exists)
4. User clicks link in email
5. User enters new password
6. Password is updated, user can log in

## Security Features

- Passwords are hashed with bcrypt (10 rounds)
- Verification tokens are 32-byte random hex strings
- Reset tokens expire after 1 hour
- Verification tokens expire after 24 hours
- Tokens are cleared after use
- Email enumeration is prevented (same message for existing/non-existing emails)

## Testing

### Test the Email Verification Flow

```bash
# 1. Start the server
cd server && npm run dev

# 2. Register a new user via API or UI
# 3. Check server console for verification URL
# 4. Copy the URL and open in browser
# 5. Verify the email
# 6. Log in with the verified account
```

### Test the Password Reset Flow

```bash
# 1. Request password reset via UI or API
# 2. Check server console for reset URL
# 3. Copy the URL and open in browser
# 4. Enter new password
# 5. Log in with new password
```

## Production Deployment

### Heroku Configuration

```bash
# Set environment variables
heroku config:set SMTP_HOST=smtp.sendgrid.net
heroku config:set SMTP_PORT=587
heroku config:set SMTP_SECURE=false
heroku config:set SMTP_USER=apikey
heroku config:set SMTP_PASS=your-sendgrid-api-key
heroku config:set SMTP_FROM=noreply@yourdomain.com
heroku config:set CLIENT_URL=https://your-app.herokuapp.com
heroku config:set SERVER_URL=https://your-app.herokuapp.com
```

### Database Migration

Run the migration after deploying:

```bash
heroku run bash
npm run db:setup:prod
```

Or manually via Heroku Postgres:

```bash
heroku pg:psql < server/src/db/migrations/add_email_verification_and_password_reset.sql
```

## Troubleshooting

### Emails Not Sending

1. Check SMTP credentials are correct
2. Verify SMTP_HOST and SMTP_PORT
3. Check server logs for error messages
4. Test with development mode (no SMTP) first

### Verification Links Not Working

1. Ensure CLIENT_URL is set correctly
2. Check token hasn't expired (24 hours for verification, 1 hour for reset)
3. Verify routes are properly configured in main.tsx

### Users Can't Log In After Registration

1. Check if email is verified: `SELECT email_verified FROM users WHERE email = 'user@example.com'`
2. User should click verification link first
3. Offer "Resend verification email" option

## Future Enhancements

Potential improvements:
- Email templates with branding
- Rate limiting on verification/reset requests
- Email change verification
- Multi-language email support
- SMS verification as alternative
- Configurable token expiration times
