# Codespaces Setup Guide

## Recommended: Use GitHub Codespaces Secrets (No .env needed!)

1. **Add secrets to your GitHub profile**
   - Go to: https://github.com/settings/codespaces
   - Click "New secret"
   - Add each of these secrets:
     - `DATABASE_URL` = `postgresql://postgres:postgres@localhost:5432/deal_disaster`
     - `JWT_SECRET` = (get from team lead)
     - `CLIENT_URL` = `http://localhost:5173`
     - `SERVER_URL` = `http://localhost:3001`
     - `GOOGLE_CLIENT_ID` = (get from team lead)
     - `GOOGLE_CLIENT_SECRET` = (get from team lead)
     - `MICROSOFT_CLIENT_ID` = (get from team lead)
     - `MICROSOFT_CLIENT_SECRET` = (get from team lead)
     - `AZURE_OPENAI_API_KEY` = (get from team lead)
     - `AZURE_OPENAI_ENDPOINT` = (get from team lead)
     - `AZURE_OPENAI_DEPLOYMENT` = `gpt-5-nano`
     - `ADMIN_API_KEY` = (get from team lead)

2. **That's it!** When you open a Codespace, all secrets are automatically available.

## Alternative: Use .env file

If you prefer not to use GitHub secrets:

1. **Copy environment file**
   ```bash
   cd server
   cp .env.example .env
   ```

2. **Get credentials from team lead** and update `server/.env` with all values

## Running the App

PostgreSQL is automatically installed and configured in Codespaces!

Terminal 1 (Backend):
```bash
cd server
npm run dev
```

Terminal 2 (Frontend):
```bash
npm run dev
```

## Environment Variables Needed

All of these can be added as GitHub Codespaces secrets (recommended) or in `server/.env`:

### Required for Basic Development
- `DATABASE_URL` = `postgresql://postgres:postgres@localhost:5432/deal_disaster`
- `JWT_SECRET` - Any random string for development
- `CLIENT_URL` = `http://localhost:5173`
- `SERVER_URL` = `http://localhost:3001`

### Required for OAuth Login
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID` & `MICROSOFT_CLIENT_SECRET`

### Required for Daily Challenges
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT` = `gpt-5-nano`
- `ADMIN_API_KEY`

## Troubleshooting

### "OAuth redirect mismatch" error
Make sure your OAuth redirect URIs include:
- http://localhost:3001/api/auth/google/callback
- http://localhost:3001/api/auth/microsoft/callback

### Database connection errors
Check that PostgreSQL is running and the DATABASE_URL is correct.

### Missing environment variables
Check that all required variables in `.env.example` are set in your `.env`
