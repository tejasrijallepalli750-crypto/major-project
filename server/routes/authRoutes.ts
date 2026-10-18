import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/database';
import { generateToken, requireAuth, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', (req, res: Response) => {
  try {
    const { name, email, password, phone, address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and password.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email address format.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const existingUser = db.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const newUser = db.createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: passwordHash,
      role: 'customer',
      phone: phone || '',
      address: address || {
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'India',
      },
    });

    const token = generateToken(newUser);
    const { password: _, ...userWithoutPassword } = newUser;

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('[Auth] Registration error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please enter both email and password.' });
    }

    const user = db.findUserByEmail(email);
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Invalid email or password credentials.' });
    }

    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password credentials.' });
    }

    const token = generateToken(user);
    const { password: _, ...userWithoutPassword } = user;

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during login.' });
  }
});

// GET /api/auth/profile
router.get('/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated.' });
  }
  const { password: _, ...userWithoutPassword } = req.user;
  return res.json({ success: true, user: userWithoutPassword });
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    const { name, phone, address, currentPassword, newPassword } = req.body;
    const updates: Partial<typeof req.user> = {};

    if (name) updates.name = name.trim();
    if (phone !== undefined) updates.phone = phone.trim();
    if (address) updates.address = address;

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to change password.' });
      }
      if (!req.user.password || !bcrypt.compareSync(currentPassword, req.user.password)) {
        return res.status(400).json({ success: false, message: 'Current password does not match.' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
      }
      updates.password = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10));
    }

    const updated = db.updateUser(req.user.id, updates);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const { password: _, ...userWithoutPassword } = updated;
    return res.json({ success: true, message: 'Profile updated successfully', user: userWithoutPassword });
  } catch (error) {
    console.error('[Auth] Profile update error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error updating profile.' });
  }
});

export default router;
