import { Router, Response } from 'express';
import { pool } from '../db/pool';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// Save game session
router.post('/sessions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { points, casesSolved, goodDeals, badDealsAvoided, mistakes, redFlagsFound } = req.body;

    const result = await pool.query(
      `INSERT INTO game_sessions 
       (user_id, points, cases_solved, good_deals, bad_deals_avoided, mistakes, red_flags_found)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.userId, points, casesSolved, goodDeals, badDealsAvoided, mistakes, redFlagsFound]
    );

    res.status(201).json({ session: result.rows[0] });
  } catch (error) {
    console.error('Save session error:', error);
    res.status(500).json({ error: 'Failed to save game session' });
  }
});

// Get user's game history
router.get('/sessions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM game_sessions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.userId]
    );

    res.json({ sessions: result.rows });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to get game sessions' });
  }
});

// Get user stats
router.get('/stats', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_games,
        MAX(points) as best_score,
        AVG(points) as average_score,
        SUM(good_deals) as total_good_deals,
        SUM(bad_deals_avoided) as total_bad_deals_avoided,
        SUM(mistakes) as total_mistakes,
        SUM(red_flags_found) as total_red_flags
       FROM game_sessions 
       WHERE user_id = $1`,
      [req.userId]
    );

    res.json({ stats: result.rows[0] });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Get leaderboard
router.get('/leaderboard', async (req, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM leaderboard LIMIT 100`
    );

    res.json({ leaderboard: result.rows });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

export default router;
