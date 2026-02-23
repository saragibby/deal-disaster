import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import passport from './config/passport.js';
import authRoutes from './routes/auth.js';
import gameRoutes from './routes/game.js';
import dailyChallengeRoutes from './routes/dailyChallenge.js';
import chatRoutes from './routes/chat.js';
import feedbackRoutes from './routes/feedback.js';
import portalRoutes from './routes/portal.js';
import { initializeScheduledTasks } from './scheduler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CLIENT_URL || true
    : ['http://localhost:5200', 'http://localhost:5201'],
  credentials: true,
}));
app.use(express.json());
app.use(passport.initialize());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/daily-challenge', dailyChallengeRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/portal', portalRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from the React apps in production
if (process.env.NODE_ENV === 'production') {
  // Deal or Disaster app — served at /deal-or-disaster/
  const dealAppPath = path.join(__dirname, '../../apps/deal-or-disaster/dist');
  app.use('/deal-or-disaster', express.static(dealAppPath));
  app.get('/deal-or-disaster/*', (req, res) => {
    res.sendFile(path.join(dealAppPath, 'index.html'));
  });

  // Dashboard app — served at / (catch-all, must be last)
  const dashboardPath = path.join(__dirname, '../../apps/dashboard/dist');
  app.use(express.static(dashboardPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(dashboardPath, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  
  // Initialize scheduled tasks
  initializeScheduledTasks();
});
