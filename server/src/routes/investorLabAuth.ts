import { randomUUID } from 'crypto';
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();
const SALT_ROUNDS = 10;
const TOKEN_AUDIENCE = 'investor-lab';

interface InvestorAuthRequest extends AuthRequest {
  investorLabUserId?: number;
}

interface InvestorJwtPayload {
  investorLabUserId: number;
  platformUserId: number;
  aud?: string;
}

interface InvestorAccountRow {
  id: number;
  email: string;
  name: string | null;
  company_name: string | null;
  investor_focus: string | null;
  platform_user_id: number;
}

function tokenSecret() {
  return process.env.INVESTOR_LAB_JWT_SECRET || process.env.JWT_SECRET || 'fallback-secret-change-me';
}

function serializeInvestor(row: InvestorAccountRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    companyName: row.company_name,
    investorFocus: row.investor_focus,
  };
}

async function createPlatformUserForInvestor(email: string, name?: string) {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO users (email, name, oauth_provider, oauth_id, email_verified)
     VALUES ($1, $2, 'investor-lab', $3, TRUE)
     RETURNING id`,
    [`investor-lab:${randomUUID()}:${email}`, name || null, randomUUID()],
  );
  return result.rows[0].id;
}

function signInvestorToken(row: InvestorAccountRow) {
  return jwt.sign(
    {
      investorLabUserId: row.id,
      platformUserId: row.platform_user_id,
      aud: TOKEN_AUDIENCE,
    },
    tokenSecret(),
    { expiresIn: '7d' },
  );
}

async function loadInvestorById(id: number) {
  const result = await pool.query<InvestorAccountRow>(
    `SELECT id, email, name, company_name, investor_focus, platform_user_id
     FROM investor_lab_users
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export const authenticateInvestorLab: RequestHandler = async (
  req: InvestorAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;

  if (!token) {
    return res.status(401).json({ error: 'Investor Lab account required' });
  }

  try {
    const decoded = jwt.verify(token, tokenSecret()) as InvestorJwtPayload;
    if (decoded.aud !== TOKEN_AUDIENCE || !decoded.investorLabUserId || !decoded.platformUserId) {
      return res.status(403).json({ error: 'Invalid Investor Lab token' });
    }
    req.investorLabUserId = decoded.investorLabUserId;
    req.userId = decoded.platformUserId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired Investor Lab token' });
  }
};

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name, companyName, investorFocus } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await pool.query('SELECT id FROM investor_lab_users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Investor Lab account already exists' });
    }

    const passwordHash = await bcrypt.hash(String(password), SALT_ROUNDS);
    const platformUserId = await createPlatformUserForInvestor(normalizedEmail, name);
    const result = await pool.query<InvestorAccountRow>(
      `INSERT INTO investor_lab_users (
        email,
        password_hash,
        name,
        company_name,
        investor_focus,
        platform_user_id
      )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, company_name, investor_focus, platform_user_id`,
      [
        normalizedEmail,
        passwordHash,
        name || null,
        companyName || null,
        investorFocus || null,
        platformUserId,
      ],
    );

    const investor = result.rows[0];
    res.status(201).json({
      token: signInvestorToken(investor),
      user: serializeInvestor(investor),
    });
  } catch (error) {
    console.error('Investor Lab registration error:', error);
    res.status(500).json({ error: 'Failed to register Investor Lab account' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await pool.query<InvestorAccountRow & { password_hash: string }>(
      `SELECT id, email, password_hash, name, company_name, investor_focus, platform_user_id
       FROM investor_lab_users
       WHERE email = $1`,
      [normalizedEmail],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const investor = result.rows[0];
    const isValidPassword = await bcrypt.compare(String(password), investor.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({
      token: signInvestorToken(investor),
      user: serializeInvestor(investor),
    });
  } catch (error) {
    console.error('Investor Lab login error:', error);
    res.status(500).json({ error: 'Failed to log in to Investor Lab' });
  }
});

router.get('/me', authenticateInvestorLab, async (req: InvestorAuthRequest, res: Response) => {
  try {
    const investor = await loadInvestorById(req.investorLabUserId!);
    if (!investor) {
      return res.status(404).json({ error: 'Investor Lab account not found' });
    }

    res.json({ user: serializeInvestor(investor) });
  } catch (error) {
    console.error('Investor Lab profile load error:', error);
    res.status(500).json({ error: 'Failed to load Investor Lab profile' });
  }
});

router.patch('/me', authenticateInvestorLab, async (req: InvestorAuthRequest, res: Response) => {
  try {
    const { name, companyName, investorFocus } = req.body;
    const result = await pool.query<InvestorAccountRow>(
      `UPDATE investor_lab_users
       SET
         name = $1,
         company_name = $2,
         investor_focus = $3,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, email, name, company_name, investor_focus, platform_user_id`,
      [name || null, companyName || null, investorFocus || null, req.investorLabUserId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Investor Lab account not found' });
    }

    res.json({ user: serializeInvestor(result.rows[0]) });
  } catch (error) {
    console.error('Investor Lab profile update error:', error);
    res.status(500).json({ error: 'Failed to update Investor Lab profile' });
  }
});

export default router;
