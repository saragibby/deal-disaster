import express from 'express';
import { pool } from '../db/pool.js';
import { authenticateOptional, AuthRequest } from '../middleware/auth.js';

const router = express.Router();

// Submit feedback
router.post('/', authenticateOptional, async (req: AuthRequest, res) => {
  try {
    const { message } = req.body;
    const userId = req.user?.id || null;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Feedback message is required' });
    }

    if (message.length > 5000) {
      return res.status(400).json({ error: 'Feedback message is too long (max 5000 characters)' });
    }

    await pool.query(
      'INSERT INTO feedback (user_id, message) VALUES ($1, $2)',
      [userId, message.trim()]
    );

    res.json({ success: true, message: 'Thank you for your feedback!' });
  } catch (error) {
    console.error('Error saving feedback:', error);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// Get all feedback (for admin review)
router.get('/all', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        f.id,
        f.message,
        f.created_at,
        u.name as user_name,
        u.email as user_email
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      ORDER BY f.created_at DESC
      LIMIT 100
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching feedback:', error);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
});

export default router;
