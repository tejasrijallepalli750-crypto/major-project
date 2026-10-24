import dotenv from 'dotenv';
import { setServers } from 'node:dns';
import fs from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(configDirectory, '../..');
export const envFilePath = path.join(projectRoot, '.env');

if (fs.existsSync(envFilePath)) {
  const result = dotenv.config({ path: envFilePath });
  if (result.error) {
    throw new Error(`Unable to load the project environment file: ${result.error.message}`);
  }
  console.info('[Config] Loaded the project .env file.');
} else {
  console.warn('[Config] Project .env file not found; relying on environment variables.');
}

const mongoUri = process.env.MONGODB_URI?.trim() ?? '';
console.info(`[Config] MONGODB_URI ${mongoUri ? 'is set' : 'is not set'}.`);

const configuredDnsServers = process.env.MONGODB_DNS_SERVERS
  ?.split(',')
  .map((server) => server.trim())
  .filter(Boolean) ?? [];

if (configuredDnsServers.length) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MONGODB_DNS_SERVERS is supported only outside production.');
  }
  if (configuredDnsServers.some((server) => isIP(server) === 0)) {
    throw new Error('MONGODB_DNS_SERVERS must contain comma-separated IPv4 or IPv6 addresses.');
  }
  setServers(configuredDnsServers);
  console.info(`[Config] Development DNS override enabled (${configuredDnsServers.length} resolver(s)).`);
}
