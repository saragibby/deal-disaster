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
import { createAnalyzerBackendRouter, createAssetDashboardAnalyzerBackendRouter } from './analyzer/backend.js';
import { initializeScheduledTasks } from './scheduler.js';
import { pool } from './db/pool.js';
import { buildOwnerContextForPlatform } from './middleware/ownerContext.js';
import type { AuthRequest } from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

const investorLabDevAuth: express.RequestHandler = async (req: AuthRequest, _res, next) => {
  try {
    const email = String(req.header('X-Investor-Lab-Email') || 'member@investor-lab.example');
    const result = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, oauth_provider, oauth_id, email_verified)
       VALUES ($1, $2, 'investor-lab-dev', $1, TRUE)
       ON CONFLICT (email) DO UPDATE
       SET name = COALESCE(users.name, EXCLUDED.name),
           email_verified = TRUE,
           oauth_provider = COALESCE(users.oauth_provider, EXCLUDED.oauth_provider),
           oauth_id = COALESCE(users.oauth_id, EXCLUDED.oauth_id)
       RETURNING id`,
      [email, 'Investor Lab Member'],
    );
    req.userId = result.rows[0].id;
    next();
  } catch (error) {
    next(error);
  }
};

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CLIENT_URL || true
    : ['http://localhost:5200', 'http://localhost:5201', 'http://localhost:5202', 'http://localhost:5203'],
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
app.use('/api', createAssetDashboardAnalyzerBackendRouter());
app.use('/api/investor-lab', createAnalyzerBackendRouter({
  config: {
    platform: 'investor-lab',
    tenantId: 'investor-lab',
  },
  auth: {
    requireAuth: investorLabDevAuth,
    optionalAuth: investorLabDevAuth,
    buildOwnerContext: (req) => buildOwnerContextForPlatform(req, 'investor-lab', 'investor-lab'),
  },
  routes: {
    property: () => express.Router(),
    comparisons: () => express.Router(),
    ai: () => express.Router(),
  },
}));

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

  // Property Analyzer app — served at /property-analyzer/
  const analyzerAppPath = path.join(__dirname, '../../apps/property-analyzer/dist');
  app.use('/property-analyzer', express.static(analyzerAppPath));
  app.get('/property-analyzer/*', (req, res) => {
    res.sendFile(path.join(analyzerAppPath, 'index.html'));
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

  // Idempotent self-heal for analyzer columns that older local databases may
  // not have until the full setup script has been rerun.
  pool
    .query(`
      ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(100) DEFAULT 'asset-dashboard';
      ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS platform VARCHAR(50) DEFAULT 'asset-dashboard';
      ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS user_overrides JSONB;
      ALTER TABLE property_analyses ADD COLUMN IF NOT EXISTS public_share_id VARCHAR(64);
      UPDATE property_analyses
      SET
        tenant_id = COALESCE(tenant_id, 'asset-dashboard'),
        platform = COALESCE(platform, 'asset-dashboard'),
        owner_user_id = COALESCE(owner_user_id, user_id)
      WHERE tenant_id IS NULL
         OR platform IS NULL
         OR owner_user_id IS NULL;
    `)
    .catch((err: Error) => console.error('[startup] ensure analyzer columns:', err.message));

  // Initialize scheduled tasks
  initializeScheduledTasks();
});
