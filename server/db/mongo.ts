import mongoose from 'mongoose';

let listenersRegistered = false;

const sanitizeMongoError = (error: unknown, uri = ''): string => {
  if (!(error instanceof Error)) return 'Unknown MongoDB error.';
  let message = error.message;
  if (uri) message = message.replaceAll(uri, '[MongoDB URI redacted]');
  message = message
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi, '[MongoDB URI redacted]')
    .replace(/([a-zA-Z0-9._~-]+):([^@\s/]+)@/g, '[MongoDB credentials redacted]@');
  const code = 'code' in error && (typeof error.code === 'string' || typeof error.code === 'number')
    ? `, code ${error.code}`
    : '';
  return `${error.name}${code}: ${message}`;
};

export const formatMongoError = (error: unknown): string => sanitizeMongoError(error);

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
      console.error('[MongoDB] Connection error:', sanitizeMongoError(error, uri));
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
          autoIndex: true,
        });
      }
    }
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB connected without an active database handle.');
    await database.admin().ping();
    console.info('[MongoDB] Ping succeeded.');
  } catch (error) {
    const message = sanitizeMongoError(error, uri);
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
    console.error('[MongoDB] Ping failed:', sanitizeMongoError(error));
    return false;
  }
}

export async function closeMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
