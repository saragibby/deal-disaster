# OAuth Setup Guide

## 🔐 Converting to OAuth Authentication

Your app now uses OAuth instead of passwords! Users can sign in with Google, Microsoft, or Apple.

---

## ✅ What Changed

**Removed:**
- ❌ Password storage and hashing (bcrypt)
- ❌ Email/password registration and login forms
- ❌ Password validation and reset flows

**Added:**
- ✅ Google OAuth integration
- ✅ Microsoft OAuth integration
- ✅ Apple OAuth integration (optional)
- ✅ One-click authentication
- ✅ User avatars from OAuth providers

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
# Install backend OAuth packages
cd server
npm install
```

### 2. Setup Database

The database schema has been updated to support OAuth. You'll need to:

```bash
# Drop the old users table and recreate it
cd server
npm run db:setup
```

**Note:** This will delete existing users. If you have test data you want to keep, you'll need to migrate it manually.

### 3. Get Google OAuth Credentials

This is **required** to test the app:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project or select existing one
3. Click "Create Credentials" → "OAuth client ID"
4. Choose "Web application"
5. Add authorized redirect URIs:
   - `http://localhost:3001/api/auth/google/callback`
   - For production: `https://your-domain.com/api/auth/google/callback`
6. Add authorized JavaScript origins:
   - `http://localhost:5173`
   - For production: `https://your-domain.com`
7. Copy the Client ID and Client Secret
8. Add to `server/.env`:
   ```
   GOOGLE_CLIENT_ID=your-id-here.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-secret-here
   ```

### 4. Start the App

```bash
# From project root
npm start
```

Now click "Continue with Google" to sign in!

---

## 🔧 Optional: Add Microsoft OAuth

1. Go to [Azure Portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click "New registration"
3. Set redirect URI: `http://localhost:3001/api/auth/microsoft/callback`
4. Under "Certificates & secrets", create a new client secret
5. Add to `server/.env`:
   ```
   MICROSOFT_CLIENT_ID=your-app-id
   MICROSOFT_CLIENT_SECRET=your-secret
   ```

---

## 🍎 Optional: Add Apple OAuth

Apple OAuth is more complex and requires:
- Paid Apple Developer Account ($99/year)
- Domain verification
- Private key setup

**For most apps, Google + Microsoft is sufficient.**

If you need Apple OAuth:
1. [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list/serviceId)
2. Create a Service ID
3. Configure sign in with Apple
4. Download and configure the private key

---

## 🔒 Security Benefits

**Why OAuth is Better:**
- ✅ No password storage = No password breaches
- ✅ Users don't create another password to remember
- ✅ Automatic 2FA if user has it enabled with provider
- ✅ OAuth providers handle security updates
- ✅ Users trust Google/Microsoft more than new sites
- ✅ Faster signup (one click vs. form)

---

## 📊 Database Schema Changes

**Old `users` table:**
```sql
- email (unique)
- password_hash  ❌ REMOVED
- name
```

**New `users` table:**
```sql
- email (unique)
- name
- avatar (new - profile picture from OAuth)
- oauth_provider (google, microsoft, apple)
- oauth_id (user's ID from OAuth provider)
- UNIQUE(oauth_provider, oauth_id)
```

---

## 🧪 Testing

1. Start the app: `npm start`
2. Open http://localhost:5173
3. Click "Continue with Google"
4. Sign in with your Google account
5. You'll be redirected back and logged in!

---

## 🚀 Production Deployment

When deploying:

1. **Update redirect URLs** in OAuth provider consoles
2. **Set production environment variables:**
   ```
   CLIENT_URL=https://your-app.com
   SERVER_URL=https://api.your-app.com
   ```
3. **Use HTTPS** (required for OAuth)
4. **Secure your JWT_SECRET** (use a long random string)

---

## 🆘 Troubleshooting

**"OAuth error" after clicking sign in:**
- Check that CLIENT_ID and CLIENT_SECRET are set in server/.env
- Verify redirect URIs match exactly in Google Console
- Make sure server is running on port 3001

**Users not being created:**
- Check database connection
- Run `npm run db:setup` to recreate tables
- Check server logs for errors

**Redirect loop:**
- Clear localStorage: `localStorage.clear()`
- Check CLIENT_URL matches your frontend URL

---

## 📧 Email Collection

You still get user emails! OAuth providers share:
- Email address ✅
- Name ✅
- Profile picture ✅
- Verified email status ✅

You can use these for:
- Sending game updates
- Weekly leaderboards
- Achievement notifications
- Marketing (with consent)

---

Need help? Check the server logs when testing OAuth flows!
