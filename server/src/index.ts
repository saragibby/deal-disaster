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
import investorLabAuthRoutes, { authenticateInvestorLab } from './routes/investorLabAuth.js';
import { createAnalyzerBackendRouter, createAssetDashboardAnalyzerBackendRouter } from './analyzer/backend.js';
import { initializeScheduledTasks } from './scheduler.js';
import { pool } from './db/pool.js';
import { buildOwnerContextForPlatform } from './middleware/ownerContext.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

function parseHostList(...values: Array<string | undefined>): string[] {
  return values
    .flatMap(value => (value || '').split(','))
    .map(value => {
      const trimmed = value.trim();
      if (!trimmed) return '';
      try {
        return new URL(trimmed).hostname.toLowerCase();
      } catch {
        return trimmed.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].toLowerCase();
      }
    })
    .filter(Boolean);
}

const investorLabHosts = parseHostList(
  process.env.INVESTOR_LAB_HOSTS,
  process.env.INVESTOR_LAB_DOMAIN,
  process.env.INVESTOR_LAB_URL,
);

function isInvestorLabHost(req: express.Request): boolean {
  if (investorLabHosts.length === 0) return false;
  return investorLabHosts.includes(req.hostname.toLowerCase());
}

function isApiOrHealthPath(req: express.Request): boolean {
  return req.path === '/health' || req.path.startsWith('/api/');
}

function productionCorsOrigin(): boolean | string[] {
  const origins = [
    process.env.CLIENT_URL,
    process.env.DASHBOARD_URL,
    process.env.INVESTOR_LAB_URL,
  ].filter(Boolean) as string[];

  return origins.length > 0 ? origins : true;
}

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? productionCorsOrigin()
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
app.use('/api/investor-lab/auth', investorLabAuthRoutes);
app.use('/api/investor-lab', createAnalyzerBackendRouter({
  config: {
    platform: 'investor-lab',
    tenantId: 'investor-lab',
  },
  auth: {
    requireAuth: authenticateInvestorLab,
    optionalAuth: authenticateInvestorLab,
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

  // Investor Lab app — served at /investor-lab/
  const investorLabAppPath = path.join(__dirname, '../../apps/reference-saas-wrapper/dist');
  const investorLabStatic = express.static(investorLabAppPath);

  // Investor Lab custom domains serve the same app at the domain root.
  app.use((req, res, next) => {
    if (!isInvestorLabHost(req) || isApiOrHealthPath(req)) {
      next();
      return;
    }
    investorLabStatic(req, res, next);
  });
  app.get('*', (req, res, next) => {
    if (!isInvestorLabHost(req) || isApiOrHealthPath(req)) {
      next();
      return;
    }
    res.sendFile(path.join(investorLabAppPath, 'index.html'));
  });

  app.use('/investor-lab', express.static(investorLabAppPath));
  app.get('/investor-lab/*', (req, res) => {
    res.sendFile(path.join(investorLabAppPath, 'index.html'));
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
