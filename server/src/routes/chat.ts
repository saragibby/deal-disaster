import { Router, Request, Response } from 'express';
import { ChatService } from '../services/chatService.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import { pool } from '../db/pool.js';

const router = Router();
const chatService = new ChatService();

interface ChatRequest extends AuthRequest {
  body: {
    message: string;
    conversationHistory?: Array<{ role: string; content: string }>;
  };
}

// Chat endpoint
router.post('/', authenticateToken, async (req: ChatRequest, res: Response) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await chatService.chat(message, conversationHistory);
    
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

    res.json({
      topQuestions: topQuestionsResult.rows,
      recentQuestions: recentQuestionsResult.rows,
      dailyStats: dailyStatsResult.rows
    });
  } catch (error) {
    console.error('Error fetching chat analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

export default router;
