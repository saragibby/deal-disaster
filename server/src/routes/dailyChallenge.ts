import { Router, Request, Response } from 'express';
import { foreclosureGenerator } from '../services/foreclosureGenerator';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Get today's daily challenge
router.get('/today', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await pool.query(
      'SELECT * FROM daily_challenges WHERE challenge_date = $1',
      [today]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No daily challenge available for today' });
    }

    const challenge = result.rows[0];
    
    // Check if user has already completed this challenge
    const completionResult = await pool.query(
      'SELECT * FROM user_daily_challenges WHERE user_id = $1 AND challenge_id = $2',
      [req.userId, challenge.id]
    );

    res.json({
      challenge: {
        id: challenge.id,
        challenge_date: challenge.challenge_date,
        difficulty: challenge.difficulty || 'medium',
        property_data: challenge.property_data
      },
      user_completion: completionResult.rows.length > 0 ? completionResult.rows[0] : null
    });
  } catch (error) {
    console.error('Error fetching today\'s challenge:', error);
    res.status(500).json({ error: 'Failed to fetch daily challenge' });
  }
});

// Get all past challenges
router.get('/history', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = 30; // 30 days per page
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT dc.*, udc.completed_at, udc.decision, udc.points_earned
       FROM daily_challenges dc
       LEFT JOIN user_daily_challenges udc ON dc.id = udc.challenge_id AND udc.user_id = $1
       ORDER BY dc.challenge_date DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

    const countResult = await pool.query('SELECT COUNT(*) FROM daily_challenges');
    const total = parseInt(countResult.rows[0].count);

    res.json({
      challenges: result.rows.map(row => ({
        id: row.id,
        date: row.challenge_date,
        completed: !!row.completed_at,
        completionData: row.completed_at ? {
          completedAt: row.completed_at,
          decision: row.decision,
          pointsEarned: row.points_earned
        } : null
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching challenge history:', error);
    res.status(500).json({ error: 'Failed to fetch challenge history' });
  }
});

// Get a specific past challenge by date
router.get('/date/:date', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { date } = req.params;

    const result = await pool.query(
      'SELECT * FROM daily_challenges WHERE challenge_date = $1',
      [date]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found for this date' });
    }

    const challenge = result.rows[0];
    
    // Check if user has completed this challenge
    const completionResult = await pool.query(
      'SELECT * FROM user_daily_challenges WHERE user_id = $1 AND challenge_id = $2',
      [req.userId, challenge.id]
    );

    res.json({
      challenge: {
        id: challenge.id,
        date: challenge.challenge_date,
        ...challenge.property_data
      },
      completed: completionResult.rows.length > 0,
      completion: completionResult.rows[0] || null
    });
  } catch (error) {
    console.error('Error fetching challenge by date:', error);
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

// Submit daily challenge completion
router.post('/:challengeId/complete', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { challengeId } = req.params;
    const { decision, points_earned, time_taken } = req.body;

    if (!decision || points_earned === undefined || time_taken === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if challenge exists
    const challengeResult = await pool.query(
      'SELECT * FROM daily_challenges WHERE id = $1',
      [challengeId]
    );

    if (challengeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    // Check if already completed
    const existingResult = await pool.query(
      'SELECT * FROM user_daily_challenges WHERE user_id = $1 AND challenge_id = $2',
      [req.userId, challengeId]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Challenge already completed' });
    }

    // Record completion
    const result = await pool.query(
      `INSERT INTO user_daily_challenges (user_id, challenge_id, decision, points_earned, time_taken)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.userId, challengeId, decision, points_earned, time_taken]
    );

    res.json({
      completion: result.rows[0],
      message: 'Challenge completed successfully'
    });
  } catch (error) {
    console.error('Error recording challenge completion:', error);
    res.status(500).json({ error: 'Failed to record completion' });
  }
});

// Generate today's challenge (admin/cron endpoint)
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { admin_key, date, difficulty } = req.body;

    // Simple admin key check (in production, use proper authentication)
    if (admin_key !== process.env.ADMIN_API_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const targetDate = date || new Date().toISOString().split('T')[0];

    // Check if challenge already exists for this date
    const existingResult = await pool.query(
      'SELECT * FROM daily_challenges WHERE challenge_date = $1',
      [targetDate]
    );

    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Challenge already exists for this date' });
    }

    // Generate new scenario
    const usedDifficulty = difficulty || 'medium';
    const scenario = await foreclosureGenerator.generateScenario(usedDifficulty);

    // Store in database
    const result = await pool.query(
      `INSERT INTO daily_challenges (challenge_date, difficulty, property_data)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [targetDate, usedDifficulty, JSON.stringify(scenario)]
    );

    res.json({
      challenge: result.rows[0],
      message: 'Daily challenge generated successfully'
    });
  } catch (error) {
    console.error('Error generating daily challenge:', error);
    res.status(500).json({ error: 'Failed to generate daily challenge' });
  }
});

// Get today's daily challenge leaderboard
router.get('/leaderboard', async (req, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's challenge
    const challengeResult = await pool.query(
      'SELECT id FROM daily_challenges WHERE challenge_date = $1',
      [today]
    );

    if (challengeResult.rows.length === 0) {
      return res.json({ leaderboard: [] });
    }

    const challengeId = challengeResult.rows[0].id;

    // Get all completions for today, sorted by points (desc) then time (asc)
    const result = await pool.query(
      `SELECT 
        u.username,
        u.name,
        u.email,
        udc.points_earned,
        udc.time_taken,
        udc.completed_at
       FROM user_daily_challenges udc
       JOIN users u ON udc.user_id = u.id
       WHERE udc.challenge_id = $1
       ORDER BY udc.points_earned DESC, udc.time_taken ASC
       LIMIT 100`,
      [challengeId]
    );

    const leaderboard = result.rows.map((row, index) => ({
      rank: index + 1,
      username: row.username || row.name?.split(' ')[0] || row.email.split('@')[0],
      points: row.points_earned,
      time: row.time_taken,
      completedAt: row.completed_at
    }));

    res.json({ leaderboard });
  } catch (error) {
    console.error('Error fetching daily leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

export default router;
