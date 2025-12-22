# Heroku Deployment Guide for Deal or Disaster

## Prerequisites

1. Install the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. Create a [Heroku account](https://signup.heroku.com/)
3. Have your OAuth credentials ready (Google & Microsoft)

## Step 1: Login to Heroku

```bash
heroku login
```

## Step 2: Create a New Heroku App

```bash
cd /Users/sara/Projects/deal-disaster
heroku create your-app-name
```

Replace `your-app-name` with your desired app name (or omit it to let Heroku generate one).

## Step 3: Add PostgreSQL Database

```bash
heroku addons:create heroku-postgresql:essential-0
```

This creates a PostgreSQL database and sets the `DATABASE_URL` environment variable automatically.

## Step 4: Set Environment Variables

Set all required environment variables on Heroku:

```bash
# Generate a strong JWT secret (or use your own)
heroku config:set JWT_SECRET=$(openssl rand -base64 64)

# Set Node environment to production
heroku config:set NODE_ENV=production

# Set your app URLs (replace your-app-name with your actual app name)
heroku config:set CLIENT_URL=https://your-app-name.herokuapp.com
heroku config:set SERVER_URL=https://your-app-name.herokuapp.com

# Set Google OAuth credentials
heroku config:set GOOGLE_CLIENT_ID=your-google-client-id
heroku config:set GOOGLE_CLIENT_SECRET=your-google-client-secret

# Set Microsoft OAuth credentials
heroku config:set MICROSOFT_CLIENT_ID=your-microsoft-client-id
heroku config:set MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
```

## Step 5: Update OAuth Redirect URLs

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Select your OAuth 2.0 Client ID
3. Add to **Authorized redirect URIs**:
   - `https://your-app-name.herokuapp.com/api/auth/google/callback`
4. Save changes

### Microsoft OAuth
1. Go to [Azure Portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps)
2. Select your app registration
3. Go to **Authentication** → **Platform configurations** → **Web**
4. Add to **Redirect URIs**:
   - `https://your-app-name.herokuapp.com/api/auth/microsoft/callback`
5. Save changes

## Step 6: Initialize Database Schema

After deployment, you need to set up the database tables. You can do this by:

1. First deploy the app (see Step 7)
2. Then run the database setup remotely:

```bash
heroku run bash
cd server
npm run db:setup
exit
```

Or manually connect to the database:

```bash
heroku pg:psql
```

Then paste and run the SQL schema from `server/src/db/setup.ts`.

## Step 7: Deploy to Heroku

```bash
git add .
git commit -m "Prepare for Heroku deployment"
git push heroku main
```

If you're on a different branch:
```bash
git push heroku your-branch:main
```

## Step 8: Open Your App

```bash
heroku open
```

## Monitoring & Debugging

### View logs
```bash
heroku logs --tail
```

### Check app status
```bash
heroku ps
```

### Restart the app
```bash
heroku restart
```

### Access PostgreSQL database
```bash
heroku pg:psql
```

### Check environment variables
```bash
heroku config
```

## Troubleshooting

### Build fails
- Check the build logs: `heroku logs --tail`
- Ensure all dependencies are in `dependencies` (not `devDependencies`)
- Verify `heroku-postbuild` script runs successfully locally

### App crashes on startup
- Check logs: `heroku logs --tail`
- Verify all environment variables are set: `heroku config`
- Ensure DATABASE_URL is configured

### OAuth doesn't work
- Verify redirect URIs are correct in Google/Microsoft consoles
- Check that CLIENT_URL and SERVER_URL match your Heroku app URL
- Ensure environment variables are set correctly: `heroku config`

### Database connection fails
- Verify PostgreSQL addon is installed: `heroku addons`
- Check DATABASE_URL: `heroku config:get DATABASE_URL`
- Ensure database tables are created (run db:setup)

## Updating the App

After making changes:

```bash
git add .
git commit -m "Your commit message"
git push heroku main
```

## Cost Information

- **Heroku Eco Dyno**: $5/month (required for apps)
- **Heroku Postgres Essential**: $5/month (for database)
- **Total**: ~$10/month

For development/testing, you can use the free tier, but the app will sleep after 30 minutes of inactivity.

## Alternative: Use Environment File

If you prefer to set all variables at once, you can use a plugin:

```bash
heroku plugins:install heroku-config
heroku config:push -f server/.env
```

Make sure to update the URLs in your `.env` file first!
