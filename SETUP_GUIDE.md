# Deal or Disaster - Authentication Setup

## 🎉 Setup Complete!

Your authentication system is now ready. Here's what was built:

### Backend (Node.js + Express + PostgreSQL)
- ✅ User registration with bcrypt password hashing
- ✅ Login with JWT tokens
- ✅ Protected routes with JWT middleware
- ✅ Game session tracking
- ✅ User statistics and leaderboard

### Frontend (React + TypeScript)
- ✅ Login/Register form component
- ✅ API service layer
- ✅ Authentication state management
- ✅ Auto-save game scores

---

## 📦 Installation Steps

### 1. Install PostgreSQL
```bash
# macOS (using Homebrew)
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb deal_disaster
```

### 2. Install Backend Dependencies
```bash
cd server
npm install
```

### 3. Configure Environment Variables
```bash
# Copy example env file
cp .env.example .env

# Edit server/.env with your database credentials
# Change JWT_SECRET to a random secure string
```

### 4. Setup Database Tables
```bash
cd server
npm run db:setup
```

### 5. Start Backend Server
```bash
cd server
npm run dev
# Server runs on http://localhost:3001
```

### 6. Start Frontend (in a new terminal)
```bash
# From project root
npm run dev
# Frontend runs on http://localhost:5173
```

---

## 🧪 Testing

1. Open http://localhost:5173
2. Click "Sign Up" to create an account
3. Login with your credentials
4. Start playing - scores auto-save!

---

## 📊 Database Schema

### users table
- id (serial primary key)
- email (unique)
- password_hash
- name
- created_at, updated_at

### game_sessions table
- id (serial primary key)
- user_id (foreign key)
- points
- cases_solved
- good_deals
- bad_deals_avoided
- mistakes
- red_flags_found
- created_at

---

## 🔐 Security Features

- Passwords hashed with bcrypt (10 salt rounds)
- JWT tokens with 7-day expiration
- Protected API routes require valid JWT
- Email validation
- Minimum 8-character passwords

---

## 🚀 API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/user` - Get current user (protected)

### Game Data
- `POST /api/game/sessions` - Save game session (protected)
- `GET /api/game/sessions` - Get user's game history (protected)
- `GET /api/game/stats` - Get user statistics (protected)
- `GET /api/game/leaderboard` - Get global leaderboard (public)

---

## 🎯 Next Steps

### Email Communication Setup
To send emails to users, you can integrate:
- **Nodemailer** with Gmail SMTP
- **SendGrid** (99/day free tier)
- **Resend** (3,000/month free tier)
- **Mailgun** (5,000/month free tier)

### Free Hosting Options
- **Backend**: Railway, Render, Fly.io
- **Database**: Railway (built-in PostgreSQL), Neon, Supabase
- **Frontend**: Vercel, Netlify

Would you like help setting up email functionality or deploying to production?
