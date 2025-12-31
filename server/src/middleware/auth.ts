import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface User {
      id: number;
    }
  }
}

export interface AuthRequest extends Request {
  userId?: number;
}

export function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'fallback-secret-change-me';
    const decoded = jwt.verify(token, secret) as { userId: number };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Optional authentication - doesn't fail if no token provided
export function authenticateOptional(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const secret = process.env.JWT_SECRET || 'fallback-secret-change-me';
      const decoded = jwt.verify(token, secret) as { userId: number };
      req.user = { id: decoded.userId };
    } catch (error) {
      // Invalid token, but we don't fail - just proceed without user
    }
  }
  
  next();
}
