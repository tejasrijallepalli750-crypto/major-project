import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db, getDatabaseErrorStatus } from '../db/database';
import { assertJwtConfigured, generateToken, requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { User } from '../../src/types';

const router = Router();
const addressFields = ['street', 'city', 'district', 'state', 'postalCode', 'country'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// POST /api/auth/register
router.post('/register', async (req, res: Response) => {
  try {
    const body: unknown = req.body;
    if (!isRecord(body)) {
      return res.status(400).json({ success: false, message: 'Please provide valid registration details.' });
    }
    const { name, email, password, phone, address } = body;

    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string'
      || !name.trim() || !email.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and password.' });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (normalizedName.length > 100) {
      return res.status(400).json({ success: false, message: 'Name must be no longer than 100 characters.' });
    }
    if (normalizedEmail.length > 254 || !emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Invalid email address format.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    if (phone !== undefined && typeof phone !== 'string') {
      return res.status(400).json({ success: false, message: 'Phone number must be a string.' });
    }
    const cleanPhone = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
    if (cleanPhone && cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits.' });
    }

    const defaultAddress: NonNullable<User['address']> = {
      street: '',
      city: '',
      district: '',
      state: '',
      postalCode: '',
      country: 'India',
    };
    let normalizedAddress = defaultAddress;
    if (address !== undefined) {
      if (!isRecord(address)) {
        return res.status(400).json({ success: false, message: 'Address must be a valid object.' });
      }
      normalizedAddress = { ...defaultAddress };
      for (const field of addressFields) {
        if (address[field] !== undefined && typeof address[field] !== 'string') {
          return res.status(400).json({ success: false, message: 'Address fields must be strings.' });
        }
        if (typeof address[field] === 'string') normalizedAddress[field] = address[field];
      }
    }

    assertJwtConfigured();
    const existingUser = await db.findUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newUser = await db.createUser({
      name: normalizedName,
      email: normalizedEmail,
      password: passwordHash,
      role: 'customer',
      phone: cleanPhone,
      address: normalizedAddress,
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
    if (error instanceof Error && error.message.startsWith('JWT_SECRET')) {
      console.error('[Auth] Registration blocked because JWT_SECRET is not configured.');
      return res.status(503).json({ success: false, message: 'Authentication is not configured on the server.' });
    }
    console.error('[Auth] Registration error:', error);
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }
    const status = getDatabaseErrorStatus(error);
    return res.status(status).json({ success: false, message: status === 503 ? 'Database is unavailable.' : 'Internal server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res: Response) => {
  try {
    const body: unknown = req.body;
    if (!isRecord(body)) {
      return res.status(400).json({ success: false, message: 'Please enter both email and password.' });
    }
    const { email, password } = body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Please enter both email and password.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Invalid email address format.' });
    }

    assertJwtConfigured();
    const user = await db.findUserByEmail(normalizedEmail);
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Invalid email or password credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
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
    if (error instanceof Error && error.message.startsWith('JWT_SECRET')) {
      console.error('[Auth] Login blocked because JWT_SECRET is not configured.');
      return res.status(503).json({ success: false, message: 'Authentication is not configured on the server.' });
    }
    console.error('[Auth] Login error:', error);
    const status = getDatabaseErrorStatus(error);
    return res.status(status).json({ success: false, message: status === 503 ? 'Database or authentication service is unavailable.' : 'Internal server error during login.' });
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
router.put('/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    const body: unknown = req.body;
    if (!isRecord(body)) {
      return res.status(400).json({ success: false, message: 'Profile details must be a valid object.' });
    }
    const { name, phone, address, currentPassword, newPassword } = body;
    const updates: Partial<typeof req.user> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
        return res.status(400).json({ success: false, message: 'Name must be between 1 and 100 characters.' });
      }
      updates.name = name.trim();
    }
    if (phone !== undefined) {
      if (typeof phone !== 'string') {
        return res.status(400).json({ success: false, message: 'Phone number must be a string.' });
      }
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone && cleanPhone.length !== 10) {
        return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits.' });
      }
      updates.phone = cleanPhone;
    }
    if (address !== undefined) {
      if (!isRecord(address)) {
        return res.status(400).json({ success: false, message: 'Address must be a valid object.' });
      }
      const normalizedAddress: NonNullable<User['address']> = {
        street: '',
        city: '',
        district: '',
        state: '',
        postalCode: '',
        country: 'India',
      };
      for (const field of addressFields) {
        if (address[field] !== undefined && typeof address[field] !== 'string') {
          return res.status(400).json({ success: false, message: 'Address fields must be strings.' });
        }
        if (typeof address[field] === 'string') normalizedAddress[field] = address[field];
      }
      updates.address = normalizedAddress;
    }

    if (newPassword !== undefined && typeof newPassword !== 'string') {
      return res.status(400).json({ success: false, message: 'New password must be a string.' });
    }
    if (newPassword) {
      if (typeof currentPassword !== 'string' || !currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required to change password.' });
      }
      if (!req.user.password || !(await bcrypt.compare(currentPassword, req.user.password))) {
        return res.status(400).json({ success: false, message: 'Current password does not match.' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
      }
      updates.password = await bcrypt.hash(newPassword, 12);
    }

    const updated = await db.updateUser(req.user.id, updates);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const { password: _, ...userWithoutPassword } = updated;
    return res.json({ success: true, message: 'Profile updated successfully', user: userWithoutPassword });
  } catch (error) {
    console.error('[Auth] Profile update error:', error);
    const status = getDatabaseErrorStatus(error);
    return res.status(status).json({ success: false, message: status === 503 ? 'Database is unavailable.' : 'Internal server error updating profile.' });
  }
});

router.get('/cart', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json({ success: true, data: await db.getUserCart(req.user!.id) });
  } catch (error) {
    console.error('[Auth] Cart retrieval error:', error);
    const status = getDatabaseErrorStatus(error);
    return res.status(status).json({ success: false, message: status === 503 ? 'Database is unavailable.' : 'Unable to retrieve your cart.' });
  }
});

router.put('/cart', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.saveUserCart(req.user!.id, req.body.items);
    return res.json({ success: true, data: await db.getUserCart(req.user!.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save your cart.';
    console.error('[Auth] Cart save error:', error);
    return res.status(message.includes('invalid') || message.includes('unavailable') ? 400 : getDatabaseErrorStatus(error))
      .json({ success: false, message });
  }
});

router.get('/wishlist', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    return res.json({ success: true, data: await db.getUserWishlist(req.user!.id) });
  } catch (error) {
    console.error('[Auth] Wishlist retrieval error:', error);
    const status = getDatabaseErrorStatus(error);
    return res.status(status).json({ success: false, message: status === 503 ? 'Database is unavailable.' : 'Unable to retrieve your saved items.' });
  }
});

router.put('/wishlist', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.saveUserWishlist(req.user!.id, req.body.productIds);
    return res.json({ success: true, data: await db.getUserWishlist(req.user!.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save your items.';
    console.error('[Auth] Wishlist save error:', error);
    return res.status(message.includes('Wishlist') ? 400 : getDatabaseErrorStatus(error)).json({ success: false, message });
  }
});

export default router;
