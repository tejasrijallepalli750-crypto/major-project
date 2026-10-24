import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db, getDatabaseErrorStatus } from '../db/database';
import { User } from '../../src/types';

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret || secret.length < 32 || secret.includes('replace_with')) {
    throw new Error('JWT_SECRET must be configured as a private value of at least 32 characters.');
  }
  return secret;
};

export const assertJwtConfigured = (): void => {
  getJwtSecret();
};

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export const generateToken = (user: User): string => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    getJwtSecret(),
    { expiresIn: '30d' }
  );
};

export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  let token: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
    return;
  }

  let decoded: jwt.JwtPayload | string;
  try {
    decoded = jwt.verify(token, getJwtSecret());
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('JWT_SECRET')) {
      res.status(503).json({ success: false, message: 'Authentication is not configured on the server.' });
      return;
    }
    res.status(401).json({ success: false, message: 'Session expired or invalid token. Please log in again.' });
    return;
  }

  if (typeof decoded === 'string' || typeof decoded.id !== 'string' || !decoded.id) {
    res.status(401).json({ success: false, message: 'Session expired or invalid token. Please log in again.' });
    return;
  }

  try {
    const user = await db.findUserById(decoded.id);
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid authentication token. User not found.' });
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    const status = getDatabaseErrorStatus(error);
    res.status(status).json({
      success: false,
      message: status === 503
        ? 'The service is temporarily unavailable while the database reconnects.'
        : 'Unable to verify the authenticated user.',
    });
  }
};

export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Access denied. Administrator privileges required.' });
    return;
  }
  next();
};
