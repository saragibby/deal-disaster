import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import passport from '../config/passport.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { pool } from '../db/pool.js';

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
    passport.authenticate('azure_ad_oauth2', { session: false }, (err: any, user: any) => {
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
      'SELECT id, email, name, avatar, oauth_provider, onboarding_completed, created_at FROM users WHERE id = $1',
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

// Get user profile settings
router.get('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, username, avatar, phone_number, sms_opt_in, email_newsletter_opt_in, oauth_provider FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile settings
router.put('/profile', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { username, phone_number, sms_opt_in, email_newsletter_opt_in } = req.body;

    // Validate username is required
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Validate username format
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, hyphens, and underscores' });
    }

    // Check if username is already taken by another user
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 AND id != $2',
      [username, req.userId]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Validate phone number format if provided
    if (phone_number && phone_number.trim() !== '') {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/; // E.164 format
      if (!phoneRegex.test(phone_number.replace(/[\s\-\(\)]/g, ''))) {
        return res.status(400).json({ error: 'Invalid phone number format. Use format: +1234567890' });
      }
    }

    const result = await pool.query(
      `UPDATE users 
       SET username = COALESCE($1, username),
           phone_number = $2, 
           sms_opt_in = $3, 
           email_newsletter_opt_in = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 
       RETURNING id, email, name, username, avatar, phone_number, sms_opt_in, email_newsletter_opt_in, oauth_provider`,
      [username || null, phone_number || null, sms_opt_in || false, email_newsletter_opt_in || false, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0], message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Complete onboarding
router.post('/complete-onboarding', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { username, phone_number, sms_opt_in, email_newsletter_opt_in } = req.body;

    // Validate username is required
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Validate username format
    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: 'Username must be between 3 and 50 characters' });
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, hyphens, and underscores' });
    }

    // Check if username is already taken
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 AND id != $2',
      [username, req.userId]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Validate phone number format if provided
    if (phone_number && phone_number.trim() !== '') {
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(phone_number.replace(/[\s\-\(\)]/g, ''))) {
        return res.status(400).json({ error: 'Invalid phone number format. Use format: +1234567890' });
      }
    }

    // Update user with onboarding data
    const result = await pool.query(
      `UPDATE users 
       SET username = $1,
           phone_number = $2,
           sms_opt_in = $3,
           email_newsletter_opt_in = $4,
           onboarding_completed = TRUE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, email, name, username, avatar, phone_number, sms_opt_in, email_newsletter_opt_in, oauth_provider, onboarding_completed`,
      [username, phone_number || null, sms_opt_in || false, email_newsletter_opt_in || false, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0], message: 'Onboarding completed successfully' });
  } catch (error) {
    console.error('Complete onboarding error:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

export default router;
