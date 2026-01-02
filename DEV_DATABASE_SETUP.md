# Development Database Setup

## Overview

The project now has **two separate PostgreSQL databases on Heroku**:

- **Production Database** (`DATABASE_URL`) - Used by the live Heroku app
- **Development Database** (`DEV_DATABASE_URL`) - Used for local development and Codespaces

## Database URLs

### Production
```
DATABASE_URL=postgres://u2997q2ae1m9ri:p483c13215a25cdc6d11aebd20e594b46b0081b8abf5ee77d45c16ebbcba642f6@c85cgnr0vdhse3.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/dfgb1egctnmpgh
```

### Development
```
DEV_DATABASE_URL=postgres://u76sosk5qqohfn:p36ce1ccf9d4e7032ae151767871df0b05b6f2245401d58ea9ff3367552ba3dc5@co8c1665c0p5k.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/de8dilmh2fge60
```

## Local Development Setup

1. **Create `.env` file in the `server` directory:**

```bash
cd server
echo "DATABASE_URL=postgres://u76sosk5qqohfn:p36ce1ccf9d4e7032ae151767871df0b05b6f2245401d58ea9ff3367552ba3dc5@co8c1665c0p5k.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/de8dilmh2fge60" > .env
```

2. **Add other necessary environment variables:**

```env
# Database (Dev)
DATABASE_URL=postgres://u76sosk5qqohfn:p36ce1ccf9d4e7032ae151767871df0b05b6f2245401d58ea9ff3367552ba3dc5@co8c1665c0p5k.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/de8dilmh2fge60

# Azure OpenAI (get from Heroku)
AZURE_OPENAI_API_KEY=your-key-here
AZURE_OPENAI_ENDPOINT=your-endpoint-here
AZURE_OPENAI_DEPLOYMENT=your-deployment-name

# OpenAI (for DALL-E)
OPENAI_API_KEY=your-openai-key-here

# Azure Blob Storage (get from Heroku)
AZURE_STORAGE_CONNECTION_STRING=your-connection-string-here
AZURE_STORAGE_CONTAINER_NAME=dealdisaster
AZURE_ENV=dev

# JWT Secret
JWT_SECRET=your-local-jwt-secret
```

3. **Get environment variables from Heroku:**

```bash
heroku config --app deal-or-disaster
```

## GitHub Codespaces Setup

### Option 1: Repository Secrets (Recommended)

1. Go to your GitHub repository → Settings → Secrets and variables → Codespaces
2. Add these secrets:
   - `DEV_DATABASE_URL`
   - `AZURE_OPENAI_API_KEY`
   - `AZURE_OPENAI_ENDPOINT`
   - `AZURE_OPENAI_DEPLOYMENT`
   - `OPENAI_API_KEY`
   - `AZURE_STORAGE_CONNECTION_STRING`

### Option 2: Manual `.env` File

Create `server/.env` file in your Codespace with the dev database URL and other credentials.

## Important Notes

### SSL Connection
The code has been updated to automatically detect Heroku/AWS databases and enable SSL:

```typescript
ssl: process.env.DATABASE_URL?.includes('amazonaws.com') 
  ? { rejectUnauthorized: false } 
  : false
```

### Database Schema
The dev database has been initialized with the same schema as production. If you need to reset it:

```bash
cd server
npm run db:setup
```

### Heroku App Behavior
- **Production**: The Heroku app automatically uses `DATABASE_URL` (production database)
- **Local/Codespaces**: Your local environment uses `DEV_DATABASE_URL` via `.env` file

### Syncing Dev Database from Production

If you want to refresh dev database with production data:

```bash
# Option 1: Fork production database (creates new dev database)
heroku addons:destroy DEV_DATABASE --app deal-or-disaster --confirm deal-or-disaster
heroku addons:create heroku-postgresql:essential-0 --fork DATABASE_URL --app deal-or-disaster --as DEV_DATABASE

# Option 2: Copy data manually
heroku pg:copy DATABASE_URL DEV_DATABASE_URL --app deal-or-disaster
```

### Cost
- Production database: $5/month (Essential-0 plan)
- Dev database: $5/month (Essential-0 plan)
- **Total: $10/month for both databases**

## Troubleshooting

### Connection Issues
If you get SSL errors, make sure your DATABASE_URL is using the dev database URL.

### Schema Out of Sync
If migrations were run on production but not dev:

```bash
cd server
npm run db:setup
```

Or manually run migration SQL files.

### Environment Variables Not Loading
Make sure you're in the `server` directory when running commands, as the `.env` file is located there.
