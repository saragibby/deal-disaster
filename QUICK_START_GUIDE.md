# Quick Start Guide - Email Verification & Password Reset

## 🚀 Getting Started

### 1. Apply Database Migration

```bash
cd server
npm run db:setup
```

This will add the required columns to your users table.

### 2. Configure Email (Optional for Testing)

For **development/testing**, you can skip this step. Emails will be logged to the console.

For **production** or to test actual emails, add to `server/.env`:

```env
# Gmail Example (easiest for testing)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=noreply@yourdomain.com
```

**How to get Gmail App Password:**
1. Enable 2FA on your Google Account
2. Go to Google Account → Security → App Passwords
3. Generate password for "Mail"
4. Use that password as `SMTP_PASS`

### 3. Install Dependencies

Already installed! But if you need to reinstall:

```bash
# Frontend
npm install

# Backend
cd server
npm install
```

### 4. Start the Application

```bash
# From project root
npm start

# Or separately:
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend
npm run dev
```

## 🧪 Testing the Features

### Test Email Verification

1. **Register a new user:**
   - Go to http://localhost:5173
   - Click "Continue with Email"
   - Click "Sign Up"
   - Enter email and password
   - Submit

2. **Check the verification email:**
   - **With SMTP configured:** Check your email inbox
   - **Without SMTP:** Check server console for verification URL

3. **Verify the email:**
   - Click the link in email OR copy from console
   - You'll be redirected to verification page
   - Success! Now you can log in

4. **Try to log in before verifying:**
   - Enter credentials
   - You'll see error: "Please verify your email..."
   - Click "Resend verification email" if needed

### Test Password Reset

1. **Request password reset:**
   - On login form, click "Forgot password?"
   - Enter your email
   - Submit

2. **Check the reset email:**
   - **With SMTP:** Check your email inbox
   - **Without SMTP:** Check server console for reset URL

3. **Reset your password:**
   - Click the link in email OR copy from console
   - Enter new password
   - Confirm password
   - Submit
   - Success! Log in with new password

## 📋 API Endpoints Reference

### Registration
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
```

### Verify Email
```bash
curl http://localhost:3001/api/auth/verify-email?token=YOUR_TOKEN
```

### Resend Verification
```bash
curl -X POST http://localhost:3001/api/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Forgot Password
```bash
curl -X POST http://localhost:3001/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### Reset Password
```bash
curl -X POST http://localhost:3001/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_RESET_TOKEN","password":"newpassword123"}'
```

## 🔍 Troubleshooting

### "Emails not being sent"
- Check if SMTP credentials are correct in `.env`
- Without SMTP config, emails are logged to console (this is normal in dev)
- Check server logs for error messages

### "Verification link doesn't work"
- Token might be expired (24 hours for verification)
- Check if CLIENT_URL is set correctly in `.env`
- Make sure React Router is working (check browser console)

### "Can't log in after registration"
- Email needs to be verified first
- Click the verification link in email or console
- Or click "Resend verification email"

### "Reset password link doesn't work"  
- Token might be expired (1 hour for password reset)
- Request a new reset link
- Check if CLIENT_URL is set correctly

## 📁 Important Files

### Backend
- `server/src/services/emailService.ts` - Email sending logic
- `server/src/routes/auth.ts` - All auth endpoints
- `server/src/db/setup.ts` - Database schema
- `server/.env` - Configuration (create from .env.example)

### Frontend
- `src/components/AuthForm.tsx` - Login/registration form
- `src/components/VerifyEmail.tsx` - Email verification page
- `src/components/ResetPassword.tsx` - Password reset page
- `src/main.tsx` - Routing configuration

## 🎯 User Experience Flow

```
REGISTRATION FLOW
┌─────────────────┐
│  User Signs Up  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Account Created        │
│  (email_verified=false) │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────┐
│  Email Sent         │
│  (24hr expiration)  │
└────────┬────────────┘
         │
         ▼
┌──────────────────────┐
│  User Clicks Link    │
│  in Email            │
└────────┬─────────────┘
         │
         ▼
┌─────────────────────┐
│  Email Verified!    │
│  Can Now Log In     │
└─────────────────────┘

PASSWORD RESET FLOW
┌──────────────────────┐
│  User Clicks         │
│  "Forgot Password?"  │
└────────┬─────────────┘
         │
         ▼
┌─────────────────────┐
│  Enters Email       │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Reset Email Sent   │
│  (1hr expiration)   │
└────────┬────────────┘
         │
         ▼
┌──────────────────────┐
│  User Clicks Link    │
│  in Email            │
└────────┬─────────────┘
         │
         ▼
┌─────────────────────┐
│  Enters New         │
│  Password           │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Password Reset!    │
│  Can Log In         │
└─────────────────────┘
```

## 🚢 Production Deployment

### Heroku Setup

```bash
# Set environment variables
heroku config:set SMTP_HOST=smtp.sendgrid.net
heroku config:set SMTP_PORT=587
heroku config:set SMTP_USER=apikey
heroku config:set SMTP_PASS=your-sendgrid-api-key
heroku config:set SMTP_FROM=noreply@yourdomain.com
heroku config:set CLIENT_URL=https://your-app.herokuapp.com
heroku config:set SERVER_URL=https://your-app.herokuapp.com

# Deploy
git push heroku main

# Run database migration
heroku run bash
npm run db:setup:prod
exit
```

### Recommended Production Email Services
- **SendGrid** - 100 free emails/day, easy setup
- **AWS SES** - Very cheap, reliable
- **Mailgun** - Good free tier
- **Postmark** - Excellent deliverability

## ✅ Feature Checklist

- [x] Email verification on signup
- [x] Password reset functionality
- [x] Email verification reminders
- [x] Secure token generation
- [x] Token expiration (24h verify, 1h reset)
- [x] Professional HTML email templates
- [x] OAuth users auto-verified
- [x] Development mode (console logging)
- [x] Production-ready SMTP support
- [x] User-friendly error messages
- [x] Responsive UI components

## 📚 Additional Documentation

- `EMAIL_VERIFICATION_SETUP.md` - Detailed setup guide
- `IMPLEMENTATION_SUMMARY.md` - Technical implementation details
- `server/.env.example` - Environment variables reference

## 💡 Tips

- In development, you don't need to configure email - just check the console
- Verification tokens last 24 hours, reset tokens last 1 hour
- OAuth users (Google/Microsoft) skip email verification
- Email enumeration is prevented for security
- All passwords are securely hashed with bcrypt

## 🆘 Need Help?

Check the server logs for detailed error messages:
```bash
cd server && npm run dev
```

The logs will show:
- Email verification URLs (in dev mode)
- SMTP connection errors
- Token validation issues
- Database errors
