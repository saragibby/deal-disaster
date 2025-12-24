import { Router, Request, Response } from 'express';
import { ChatService } from '../services/chatService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const chatService = new ChatService();

interface ChatRequest extends Request {
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
    
    res.json({ response });
  } catch (error) {
    console.error('Error processing chat request:', error);
    res.status(500).json({ error: 'Failed to process chat request' });
  }
});

export default router;
