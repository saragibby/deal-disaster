# Admin Analytics Setup Guide

The admin analytics page at `/admin/analytics` is now protected and only accessible to users with admin privileges.

## Step 1: Run the Database Migration

First, add the `is_admin` column to the users table:

### Local Development:
```bash
cd server
psql -d deal_disaster_db -f src/db/migrations/add_admin_role.sql
```

### Heroku Production:
```bash
heroku pg:psql --app your-app-name < server/src/db/migrations/add_admin_role.sql
```

Or run it directly in Heroku psql:
```bash
heroku pg:psql --app your-app-name
```

Then paste this SQL:
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;
```

## Step 2: Make Yourself an Admin

### Local Development:
```bash
cd server
npm run make-admin your-email@example.com
```

### Heroku Production:
Run this command from your local machine:
```bash
heroku run npm run make-admin:prod your-email@example.com --app your-app-name
```

Or manually in Heroku psql:
```bash
heroku pg:psql --app your-app-name
```

Then run:
```sql
UPDATE users SET is_admin = TRUE WHERE email = 'your-email@example.com';
```

## Step 3: Deploy Changes

```bash
git add .
git commit -m "Add admin-only access to analytics page"
git push heroku main
```

## Step 4: Access the Analytics

After deployment:
1. Log in to your account at `https://your-app.herokuapp.com`
2. Visit `https://your-app.herokuapp.com/admin/analytics`
3. You should now see the analytics dashboard!

## Managing Admin Users

### Make someone an admin:
```bash
# Local
npm run make-admin user@example.com

# Heroku
heroku run npm run make-admin:prod user@example.com --app your-app-name
```

### Remove admin access:
```sql
UPDATE users SET is_admin = FALSE WHERE email = 'user@example.com';
```

### List all admins:
```sql
SELECT id, email, name, created_at FROM users WHERE is_admin = TRUE;
```

## Security

- Only users with `is_admin = TRUE` can access `/api/chat/analytics`
- The endpoint checks authentication first, then admin status
- Non-admin users will receive a 403 Forbidden error
- The frontend shows a clear error message if access is denied
