import mongoose from 'mongoose';
import { safeErrorSummary } from '../utils/safeError';

let listenersRegistered = false;

export const formatMongoError = safeErrorSummary;

export const shouldEnableAutoIndex = (nodeEnv = process.env.NODE_ENV): boolean =>
  nodeEnv?.trim().toLowerCase() !== 'production';

export const getMongoConnectionState = (): 'connected' | 'connecting' | 'disconnected' =>
  mongoose.connection.readyState === 1
    ? 'connected'
    : mongoose.connection.readyState === 2
      ? 'connecting'
      : 'disconnected';

export async function connectMongo(uri = process.env.MONGODB_URI?.trim() || ''): Promise<void> {
  if (!uri || !/^mongodb(\+srv)?:\/\//.test(uri) || uri.includes('<username>') || uri.includes('<password>')) {
    throw new Error('MONGODB_URI is missing or still contains example placeholders.');
  }

  if (!listenersRegistered) {
    mongoose.connection.on('connected', () => console.info('[MongoDB] Connected.'));
    mongoose.connection.on('disconnected', () => console.error('[MongoDB] Connection lost.'));
    mongoose.connection.on('error', (error: Error) => {
      console.error('[MongoDB] Connection error:', safeErrorSummary(error));
    });
    listenersRegistered = true;
  }

  try {
    console.info('[MongoDB] Connection attempt starting.');
    if (mongoose.connection.readyState !== 1) {
      if (mongoose.connection.readyState === 2) {
        await mongoose.connection.asPromise();
      } else {
        await mongoose.connect(uri, {
          serverSelectionTimeoutMS: 7000,
          connectTimeoutMS: 7000,
          autoIndex: shouldEnableAutoIndex(),
        });
      }
    }
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB connected without an active database handle.');
    await database.admin().ping();
    console.info('[MongoDB] Ping succeeded.');
  } catch (error) {
    const message = safeErrorSummary(error);
    console.error('[MongoDB] Connection attempt failed:', message);
    throw new Error(`MongoDB connection failed: ${message}`, { cause: error });
  }
}

export async function pingMongo(): Promise<boolean> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) return false;
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch (error) {
    console.error('[MongoDB] Ping failed:', safeErrorSummary(error));
    return false;
  }
}

export async function closeMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
