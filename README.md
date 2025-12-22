# Deal or Disaster - Foreclosure Investment Game

An interactive educational game that teaches students how to evaluate foreclosure properties and identify hidden red flags.

## Features

- **Real-time Decision Making**: 3-minute timer per case mimics auction pressure
- **Hidden Red Flags**: Learn to spot IRS liens, HOA superpriority issues, code violations, and more
- **Scoring System**: 
  - Buy good deal: +100 points
  - Buy bad deal: -150 points
  - Walk from bad deal: +50 points
  - Walk from great deal: -50 points
  - Find red flag: +25 bonus points
- **Authentication**: OAuth (Google, Microsoft) and email/password login
- **Leaderboards**: Compete with other players
- **User Stats**: Track lifetime points and streaks

## Quick Start with GitHub Codespaces

The easiest way to run this project is using GitHub Codespaces:

1. Click the **Code** button on GitHub
2. Select **Codespaces** tab
3. Click **Create codespace on main**
4. Wait for the environment to build (installs dependencies automatically)
5. The app will automatically start both servers
6. Access the app via the forwarded port 5173

## Local Development

### Prerequisites

- Node.js 24.x
- PostgreSQL 14+
- npm 10.x

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd deal-disaster
```

2. Install root dependencies:
```bash
npm install
```

3. Install server dependencies:
```bash
cd server
npm install
cd ..
```

4. Set up environment variables:
```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your configuration:
- `DATABASE_URL`: Your PostgreSQL connection string
- `JWT_SECRET`: A secure random string
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: From Google Cloud Console
- `MICROSOFT_CLIENT_ID` & `MICROSOFT_CLIENT_SECRET`: From Azure Portal

5. Set up the database:
```bash
cd server
npm run db:setup
cd ..
```

### Running the Application

#### Option 1: Run Both Servers Concurrently (Recommended)

```bash
npm start
```

This starts:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

#### Option 2: Run Servers Separately

**Terminal 1 - Frontend:**
```bash
npm run dev
```

**Terminal 2 - Backend:**
```bash
npm run server
```

### Build for Production

```bash
npm run build
```

## OAuth Setup

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `http://localhost:3001/api/auth/google/callback` (development)
   - `https://your-domain.com/api/auth/google/callback` (production)
4. Copy Client ID and Client Secret to `.env`

### Microsoft OAuth

1. Go to [Azure Portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps)
2. Register a new application
3. Add redirect URIs in Authentication settings:
   - `http://localhost:3001/api/auth/microsoft/callback` (development)
   - `https://your-domain.com/api/auth/microsoft/callback` (production)
4. Create a client secret in Certificates & secrets
5. Copy Application (client) ID and client secret to `.env`

## How to Play

1. **Sign up or log in** using Google, Microsoft, or email
2. **Review property details** including liens, documents, and foreclosure announcement
3. **Find hidden red flags** by clicking on documents (+25 points each)
4. **Make your decision** before time runs out:
   - ✅ **BUY** - Purchase the property
   - ⚠️ **INVESTIGATE MORE** - Need more time (costs points)
   - ❌ **WALK AWAY** - Pass on the deal
5. **Track your progress** with lifetime points and daily streaks

## Educational Value

Students learn:
- Fast property evaluation under pressure
- Pattern recognition for common foreclosure issues
- Understanding lien priority and survivability
- Identifying red flags in legal documents
- Risk assessment and decision-making

## Technology Stack

**Frontend:**
- React 18.3.1
- TypeScript 5.6.2
- Vite 5.4.10

**Backend:**
- Node.js/Express 4.18.2
- PostgreSQL
- TypeScript 5.3.3
- Passport.js (OAuth)
- JWT Authentication
- bcrypt (password hashing)

## Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions on deploying to Heroku.

## Project Structure

```
deal-disaster/
├── src/                    # Frontend React app
│   ├── components/         # React components
│   ├── data/              # Game case data
│   ├── services/          # API service layer
│   └── types.ts           # TypeScript types
├── server/                # Backend Express API
│   ├── src/
│   │   ├── config/        # Passport OAuth config
│   │   ├── db/            # Database setup & pool
│   │   ├── middleware/    # Auth middleware
│   │   └── routes/        # API routes
│   └── package.json
├── .devcontainer/         # Codespaces configuration
└── package.json           # Root dependencies

```

## License

MIT
