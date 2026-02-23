import { Router, Request, Response } from 'express';
import { ChatService } from '../services/chatService.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { pool } from '../db/pool.js';
import { getTodayInTimezone } from '../utils/dateUtils.js';

const router = Router();
const chatService = new ChatService();

interface ChatRequest extends AuthRequest {
  body: {
    message: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    includeDailyChallenge?: boolean;
  };
}

// Chat endpoint
router.post('/', authenticateToken, async (req: ChatRequest, res: Response) => {
  try {
    const { message, conversationHistory = [], includeDailyChallenge = true } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Fetch today's daily challenge if requested
    let dailyChallengeContext = null;
    if (includeDailyChallenge) {
      try {
        const userTimezone = (req.headers['x-user-timezone'] as string) || 'UTC';
        const today = getTodayInTimezone(userTimezone);
        
        const challengeResult = await pool.query(
          'SELECT * FROM daily_challenges WHERE challenge_date = $1',
          [today]
        );

        if (challengeResult.rows.length > 0) {
          const challenge = challengeResult.rows[0];
          
          // Check if user has already completed this challenge
          const completionResult = await pool.query(
            'SELECT * FROM user_daily_challenges WHERE user_id = $1 AND challenge_id = $2',
            [req.userId, challenge.id]
          );

          dailyChallengeContext = {
            propertyData: challenge.property_data,
            hasCompleted: completionResult.rows.length > 0,
            userDecision: completionResult.rows.length > 0 ? completionResult.rows[0].decision : null,
            userPoints: completionResult.rows.length > 0 ? completionResult.rows[0].points_earned : null,
            difficulty: challenge.difficulty || 'medium'
          };
        }
      } catch (error) {
        console.error('Error fetching daily challenge context:', error);
        // Continue without daily challenge context if there's an error
      }
    }

    const response = await chatService.chat(message, conversationHistory, dailyChallengeContext);
    
    // Save the question for analytics
    try {
      const responsePreview = response.substring(0, 200); // Save first 200 chars of response
      await pool.query(
        'INSERT INTO chat_questions (user_id, question, response_preview) VALUES ($1, $2, $3)',
        [req.userId, message, responsePreview]
      );
    } catch (dbError) {
      // Log error but don't fail the request
      console.error('Error saving chat question:', dbError);
    }
    
    res.json({ response });
  } catch (error) {
    console.error('Error processing chat request:', error);
    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

// SSE test endpoint - direct Azure streaming (no ChatService)
// Streaming chat endpoint (SSE)
router.post('/stream', authenticateToken, async (req: ChatRequest, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering if proxied
  res.flushHeaders();

  let aborted = false;
  res.on('close', () => {
    aborted = true;
  });

  try {
    const { message, conversationHistory = [], includeDailyChallenge = true } = req.body;

    if (!message || typeof message !== 'string') {
      res.write(`data: ${JSON.stringify({ error: 'Message is required' })}\n\n`);
      res.end();
      return;
    }

    // Fetch today's daily challenge if requested (same logic as non-streaming)
    let dailyChallengeContext = null;
    if (includeDailyChallenge) {
      try {
        const userTimezone = (req.headers['x-user-timezone'] as string) || 'UTC';
        const today = getTodayInTimezone(userTimezone);
        
        const challengeResult = await pool.query(
          'SELECT * FROM daily_challenges WHERE challenge_date = $1',
          [today]
        );

        if (challengeResult.rows.length > 0) {
          const challenge = challengeResult.rows[0];
          
          const completionResult = await pool.query(
            'SELECT * FROM user_daily_challenges WHERE user_id = $1 AND challenge_id = $2',
            [req.userId, challenge.id]
          );

          dailyChallengeContext = {
            propertyData: challenge.property_data,
            hasCompleted: completionResult.rows.length > 0,
            userDecision: completionResult.rows.length > 0 ? completionResult.rows[0].decision : null,
            userPoints: completionResult.rows.length > 0 ? completionResult.rows[0].points_earned : null,
            difficulty: challenge.difficulty || 'medium'
          };
        }
      } catch (error) {
        console.error('Error fetching daily challenge context:', error);
      }
    }

    const fullResponse = await chatService.chatStream(
      message,
      (chunk: string) => {
        if (!aborted) {
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }
      },
      conversationHistory,
      dailyChallengeContext
    );

    if (!aborted) {
      res.write(`data: [DONE]\n\n`);
      res.end();
    }

    // Save the question for analytics (fire-and-forget)
    try {
      const responsePreview = fullResponse.substring(0, 200);
      await pool.query(
        'INSERT INTO chat_questions (user_id, question, response_preview) VALUES ($1, $2, $3)',
        [req.userId, message, responsePreview]
      );
    } catch (dbError) {
      console.error('Error saving chat question:', dbError);
    }
  } catch (error) {
    console.error('Error processing streaming chat request:', error);
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ error: 'Failed to process chat request' })}\n\n`);
      res.end();
    }
  }
});

// Get chat analytics (admin only endpoint)
router.get('/analytics', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    // Get top questions (by frequency of similar questions)
    const topQuestionsResult = await pool.query(`
      SELECT 
        question,
        COUNT(*) as count,
        MAX(asked_at) as last_asked
      FROM chat_questions
      GROUP BY question
      ORDER BY count DESC
      LIMIT 50
    `);

    // Get recent questions
    const recentQuestionsResult = await pool.query(`
      SELECT 
        cq.question,
        cq.response_preview,
        cq.asked_at,
        u.name as user_name
      FROM chat_questions cq
      LEFT JOIN users u ON cq.user_id = u.id
      ORDER BY cq.asked_at DESC
      LIMIT 100
    `);

    // Get question count by day
    const dailyStatsResult = await pool.query(`
      SELECT 
        DATE(asked_at) as date,
        COUNT(*) as question_count,
        COUNT(DISTINCT user_id) as unique_users
      FROM chat_questions
      WHERE asked_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(asked_at)
      ORDER BY date DESC
    `);

    // Get all users with their stats
    const usersResult = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.username,
        u.is_admin,
        u.created_at,
        COUNT(DISTINCT cq.id) as questions_asked,
        COUNT(DISTINCT gs.id) as games_played,
        MAX(gs.points) as best_score
      FROM users u
      LEFT JOIN chat_questions cq ON u.id = cq.user_id
      LEFT JOIN game_sessions gs ON u.id = gs.user_id
      GROUP BY u.id, u.name, u.email, u.username, u.is_admin, u.created_at
      ORDER BY u.created_at DESC
    `);

    // Get all feedback
    const feedbackResult = await pool.query(`
      SELECT 
        f.id,
        f.message,
        f.created_at,
        f.read,
        u.name as user_name,
        u.email as user_email
      FROM feedback f
      LEFT JOIN users u ON f.user_id = u.id
      ORDER BY f.read ASC, f.created_at DESC
      LIMIT 200
    `);

    res.json({
      topQuestions: topQuestionsResult.rows,
      recentQuestions: recentQuestionsResult.rows,
      dailyStats: dailyStatsResult.rows,
      users: usersResult.rows,
      feedback: feedbackResult.rows
    });
  } catch (error) {
    console.error('Error fetching chat analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Mark feedback as read (admin only)
router.put('/feedback/:id/read', authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE feedback SET read = TRUE WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking feedback as read:', error);
    res.status(500).json({ error: 'Failed to mark feedback as read' });
  }
});

export default router;
