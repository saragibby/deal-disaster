import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import passport from '../config/passport';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../db/pool';

const router = Router();
const SALT_ROUNDS = 10;

// Email/Password Registration
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, created_at',
      [email.toLowerCase(), passwordHash, name]
    );

    const user = result.rows[0];

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback-secret-change-me',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Email/Password Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const result = await pool.query(
      'SELECT id, email, password_hash, name FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Check if user registered with OAuth
    if (!user.password_hash) {
      return res.status(401).json({ error: 'This email is registered with OAuth. Please use Google or Microsoft to sign in.' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback-secret-change-me',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Google OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  (req: Request, res: Response, next) => {
    passport.authenticate('google', { session: false }, (err, user) => {
      if (err) {
        // Extract error message for user
        const errorMessage = err.message || 'Authentication failed';
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?error=${encodeURIComponent(errorMessage)}`);
      }
      
      if (!user) {
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?error=authentication_failed`);
      }

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET || 'fallback-secret-change-me',
        { expiresIn: '7d' }
      );
      
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?token=${token}&user=${encodeURIComponent(JSON.stringify({ id: user.id, email: user.email, name: user.name, avatar: user.avatar }))}`);
    })(req, res, next);
  }
);

// Microsoft OAuth routes
router.get('/microsoft', passport.authenticate('azure_ad_oauth2', { 
  scope: ['openid', 'profile', 'email'] 
}));

router.get(
  '/microsoft/callback',
  (req: Request, res: Response, next) => {
    passport.authenticate('azure_ad_oauth2', { session: false }, (err, user) => {
      if (err) {
        // Extract error message for user
        const errorMessage = err.message || 'Authentication failed';
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?error=${encodeURIComponent(errorMessage)}`);
      }
      
      if (!user) {
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?error=authentication_failed`);
      }

      const token = jwt.sign(
        { userId: user.id },
        process.env.JWT_SECRET || 'fallback-secret-change-me',
        { expiresIn: '7d' }
      );
      
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?token=${token}&user=${encodeURIComponent(JSON.stringify({ id: user.id, email: user.email, name: user.name, avatar: user.avatar }))}`);
    })(req, res, next);
  }
);

// Get current user
router.get('/user', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, avatar, oauth_provider, created_at FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
