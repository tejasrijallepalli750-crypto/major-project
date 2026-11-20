import '../server/config/loadEnv';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { UserModel } from '../server/models/User';

class AdminBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminBootstrapError';
  }
}

const getDatabaseName = (uri: string): string => {
  let parsedUri: URL;
  try {
    parsedUri = new URL(uri);
  } catch {
    throw new AdminBootstrapError('MONGODB_URI is not a valid MongoDB connection string.');
  }
  const uriDatabaseName = decodeURIComponent(parsedUri.pathname.replace(/^\/+/, '').split('/')[0] || '');
  return parsedUri.searchParams.get('dbName') || uriDatabaseName;
};

const getConfirmedDatabaseName = (args: string[]): string => {
  const confirmationIndex = args.indexOf('--confirm-database');
  const confirmation = confirmationIndex >= 0 ? args[confirmationIndex + 1] : '';
  if (!confirmation || args.length !== 2 || confirmationIndex !== 0) {
    throw new AdminBootstrapError('Confirm the non-production target with --confirm-database <database-name>.');
  }
  return confirmation;
};

const bootstrapAdmin = async (): Promise<'created' | 'already-admin'> => {
  if (process.env.NODE_ENV === 'production') {
    throw new AdminBootstrapError('Admin bootstrap is disabled when NODE_ENV=production.');
  }

  const uri = process.env.MONGODB_URI?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!uri || !email || !password) {
    throw new AdminBootstrapError('MONGODB_URI, ADMIN_EMAIL, and ADMIN_PASSWORD must be set in the local environment.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminBootstrapError('ADMIN_EMAIL must be a valid email address.');
  }
  if (email !== 'admin@aura.store') {
    throw new AdminBootstrapError('This bootstrap command is restricted to the configured AURA admin email.');
  }
  if (password.length < 12) {
    throw new AdminBootstrapError('ADMIN_PASSWORD must contain at least 12 characters.');
  }

  const databaseName = getDatabaseName(uri);
  const confirmedDatabaseName = getConfirmedDatabaseName(process.argv.slice(2));
  if (databaseName !== confirmedDatabaseName) {
    throw new AdminBootstrapError('The confirmed database name does not match MONGODB_URI.');
  }
  if (!/(?:^|[-_])(?:test|testing|dev|development|staging|local)(?:$|[-_])/i.test(databaseName)) {
    throw new AdminBootstrapError('Admin bootstrap is restricted to a database named for test, development, staging, or local use.');
  }

  try {
    await mongoose.connect(uri, {
      autoCreate: false,
      autoIndex: false,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });

    const collection = mongoose.connection.db?.collection(UserModel.collection.name);
    if (!collection) throw new AdminBootstrapError('MongoDB connected without a users collection handle.');

    const existing = await collection.findOne({ email }, { projection: { role: 1 } });
    if (existing) {
      if (existing.role !== 'admin') {
        throw new AdminBootstrapError('That email already belongs to a non-admin account. No account or role was changed.');
      }
      return 'already-admin';
    }

    const now = new Date();
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      await collection.insertOne({
        id: `usr-${randomUUID()}`,
        name: 'Store Administrator',
        email,
        password: passwordHash,
        role: 'admin',
        phone: '',
        address: {
          street: '',
          city: '',
          district: '',
          state: '',
          postalCode: '',
          country: 'India',
        },
        cartItems: [],
        wishlistIds: [],
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 11000) throw error;
      const concurrentAccount = await collection.findOne({ email }, { projection: { role: 1 } });
      if (concurrentAccount?.role === 'admin') return 'already-admin';
      throw new AdminBootstrapError('The account changed during bootstrap. No role was changed; inspect it before retrying.');
    }
    return 'created';
  } finally {
    await mongoose.disconnect();
  }
};

bootstrapAdmin()
  .then((result) => {
    console.info(result === 'created'
      ? '[AdminBootstrap] Admin account created in the confirmed non-production database.'
      : '[AdminBootstrap] Admin account already exists; no changes were made.');
  })
  .catch((error: unknown) => {
    const message = error instanceof AdminBootstrapError
      ? error.message
      : `Admin bootstrap failed (${error instanceof Error ? error.name : 'UnknownError'}).`;
    console.error(`[AdminBootstrap] ${message}`);
    process.exitCode = 1;
  });
