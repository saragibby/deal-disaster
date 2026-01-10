import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import passport from '../config/passport.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { pool } from '../db/pool.js';
import { generateToken, sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService.js';

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
      'SELECT id, email_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      // If user exists but hasn't verified email, allow resending
      if (!existingUser.rows[0].email_verified) {
        return res.status(409).json({ 
          error: 'Email already registered but not verified. Please check your email or request a new verification link.',
          needsVerification: true 
        });
      }
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Generate verification token
    const verificationToken = generateToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user (email not verified yet)
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, email_verified, verification_token, verification_token_expires) 
       VALUES ($1, $2, $3, false, $4, $5) 
       RETURNING id, email, name`,
      [email.toLowerCase(), passwordHash, name, verificationToken, verificationExpires]
    );

    const user = result.rows[0];

    // Send verification email
    try {
      await sendVerificationEmail(user.email, verificationToken, user.name);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // Delete the user if email fails to send
      await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
      return res.status(500).json({ 
        error: 'Failed to send verification email. Please try again.' 
      });
    }

    res.status(201).json({
      message: 'Registration successful! Please check your email to verify your account.',
      email: user.email,
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
      'SELECT id, email, password_hash, name, username, avatar, phone_number, sms_opt_in, email_newsletter_opt_in, onboarding_completed, email_verified FROM users WHERE email = $1',
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

    // Check if email is verified
    if (!user.email_verified) {
      return res.status(403).json({ 
        error: 'Please verify your email before logging in. Check your inbox for the verification link.',
        needsVerification: true,
        email: user.email
      });
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
        username: user.username,
        avatar: user.avatar,
        phone_number: user.phone_number,
        sms_opt_in: user.sms_opt_in,
        email_newsletter_opt_in: user.email_newsletter_opt_in,
        onboarding_completed: user.onboarding_completed,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

// Verify Email
router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Find user with this token
    const result = await pool.query(
      'SELECT id, email, name, verification_token_expires FROM users WHERE verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const user = result.rows[0];

    // Check if token is expired
    if (new Date() > new Date(user.verification_token_expires)) {
      return res.status(400).json({ error: 'Verification token has expired. Please request a new one.' });
    }

    // Update user as verified
    await pool.query(
      'UPDATE users SET email_verified = true, verification_token = NULL, verification_token_expires = NULL WHERE id = $1',
      [user.id]
    );

    res.json({ 
      message: 'Email verified successfully! You can now log in.',
      email: user.email 
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

// Resend Verification Email
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user
    const result = await pool.query(
      'SELECT id, email, name, email_verified FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists
      return res.json({ message: 'If an account exists with this email, a verification link has been sent.' });
    }

    const user = result.rows[0];

    // Check if already verified
    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified. You can log in now.' });
    }

    // Generate new verification token
    const verificationToken = generateToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user with new token
    await pool.query(
      'UPDATE users SET verification_token = $1, verification_token_expires = $2 WHERE id = $3',
      [verificationToken, verificationExpires, user.id]
    );

    // Send verification email
    await sendVerificationEmail(user.email, verificationToken, user.name);

    res.json({ message: 'Verification email sent! Please check your inbox.' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Failed to resend verification email' });
  }
});

// Forgot Password
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find user
    const result = await pool.query(
      'SELECT id, email, name, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    // Don't reveal if email exists
    if (result.rows.length === 0) {
      return res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
    }

    const user = result.rows[0];

    // Check if user uses OAuth
    if (!user.password_hash) {
      return res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
    }

    // Generate reset token
    const resetToken = generateToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Save reset token
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [resetToken, resetExpires, user.id]
    );

    // Send password reset email
    await sendPasswordResetEmail(user.email, resetToken, user.name);

    res.json({ message: 'If an account exists with this email, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset Password
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Find user with this reset token
    const result = await pool.query(
      'SELECT id, email, reset_token_expires FROM users WHERE reset_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = result.rows[0];

    // Check if token is expired
    if (new Date() > new Date(user.reset_token_expires)) {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Update password and clear reset token
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [passwordHash, user.id]
    );

    res.json({ message: 'Password reset successfully! You can now log in with your new password.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
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
      
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?token=${token}&user=${encodeURIComponent(JSON.stringify({ id: user.id, email: user.email, name: user.name, avatar: user.avatar, username: user.username, onboarding_completed: user.onboarding_completed }))}`);
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
      
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}?token=${token}&user=${encodeURIComponent(JSON.stringify({ id: user.id, email: user.email, name: user.name, avatar: user.avatar, username: user.username, onboarding_completed: user.onboarding_completed }))}`);
    })(req, res, next);
  }
);

// Get current user
router.get('/user', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, username, avatar, phone_number, sms_opt_in, email_newsletter_opt_in, oauth_provider, onboarding_completed, created_at FROM users WHERE id = $1',
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

// Get user stats
router.get('/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // 1. Get lifetime points (game sessions + daily challenges)
    const pointsResult = await pool.query(
      `SELECT 
        COALESCE(SUM(gs.points), 0) as game_points,
        COALESCE(SUM(udc.points_earned), 0) as daily_points
       FROM users u
       LEFT JOIN game_sessions gs ON u.id = gs.user_id
       LEFT JOIN user_daily_challenges udc ON u.id = udc.user_id
       WHERE u.id = $1`,
      [req.userId]
    );
    const lifetimePoints = parseInt(pointsResult.rows[0].game_points) + parseInt(pointsResult.rows[0].daily_points);

    // 2. Get all activity dates for streak calculation
    const activitiesResult = await pool.query(
      `SELECT DISTINCT DATE(created_at) as play_date 
       FROM (
         SELECT created_at FROM game_sessions WHERE user_id = $1
         UNION
         SELECT completed_at as created_at FROM user_daily_challenges WHERE user_id = $1
       ) activities
       ORDER BY play_date DESC`,
      [req.userId]
    );

    // Calculate current streak
    let currentStreak = 0;
    if (activitiesResult.rows.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let checkDate = new Date(today);
      const dates = activitiesResult.rows.map(row => new Date(row.play_date).getTime());
      
      // Check if played today or yesterday to start streak
      const todayTime = today.getTime();
      const yesterdayTime = todayTime - 86400000;
      
      if (dates.includes(todayTime) || dates.includes(yesterdayTime)) {
        // Start from yesterday if they haven't played today yet
        if (!dates.includes(todayTime)) {
          checkDate = new Date(yesterdayTime);
        }
        
        // Count consecutive days backwards
        while (dates.includes(checkDate.getTime())) {
          currentStreak++;
          checkDate = new Date(checkDate.getTime() - 86400000);
        }
      }
    }

    // 3. Get deals found (good deals from regular games + correct BUY decisions from daily)
    const dealsResult = await pool.query(
      `SELECT 
        COALESCE(SUM(gs.good_deals), 0) as game_deals,
        COUNT(udc.id) as daily_deals
       FROM users u
       LEFT JOIN game_sessions gs ON u.id = gs.user_id
       LEFT JOIN user_daily_challenges udc ON u.id = udc.user_id
       LEFT JOIN daily_challenges dc ON udc.challenge_id = dc.id
       WHERE u.id = $1 
         AND (udc.id IS NULL OR (udc.decision = 'BUY' AND (dc.property_data->>'isGoodDeal')::boolean = true))
       GROUP BY u.id`,
      [req.userId]
    );
    const dealsFound = parseInt(dealsResult.rows[0]?.game_deals || 0) + parseInt(dealsResult.rows[0]?.daily_deals || 0);

    // 4. Get disasters avoided (bad deals avoided from regular + correct WALK_AWAY from daily)
    const disastersResult = await pool.query(
      `SELECT 
        COALESCE(SUM(gs.bad_deals_avoided), 0) as game_disasters,
        COUNT(udc.id) as daily_disasters
       FROM users u
       LEFT JOIN game_sessions gs ON u.id = gs.user_id
       LEFT JOIN user_daily_challenges udc ON u.id = udc.user_id
       LEFT JOIN daily_challenges dc ON udc.challenge_id = dc.id
       WHERE u.id = $1 
         AND (udc.id IS NULL OR (udc.decision = 'WALK_AWAY' AND (dc.property_data->>'isGoodDeal')::boolean = false))
       GROUP BY u.id`,
      [req.userId]
    );
    const disastersAvoided = parseInt(disastersResult.rows[0]?.game_disasters || 0) + parseInt(disastersResult.rows[0]?.daily_disasters || 0);

    res.json({
      lifetimePoints,
      currentStreak,
      dealsFound,
      disastersAvoided
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get user stats' });
  }
});

export default router;
