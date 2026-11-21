import { getRazorpayConfig } from '../payments/razorpay';

export const DEMO_RESERVATION_TTL_MS = 20 * 60 * 1000;

export const isDemoModeEnabled = (environment: NodeJS.ProcessEnv = process.env): boolean => {
  if (environment.NODE_ENV?.trim().toLowerCase() === 'production') {
    return environment.PRODUCTION_TEST_DEMO_CHECKOUT_ENABLED?.trim().toLowerCase() === 'true'
      && getRazorpayConfig(environment).isConfigured;
  }
  return environment.DEMO_MODE_ENABLED?.trim().toLowerCase() === 'true';
};

export const isNonProductionMongoTarget = (
  databaseName: string | undefined,
  mongoUri: string | undefined,
  nodeEnv = process.env.NODE_ENV,
): boolean => {
  if (!databaseName || !mongoUri || nodeEnv?.trim().toLowerCase() === 'production') return false;

  const normalizedDatabase = databaseName.trim().toLowerCase();
  if (/(^|[-_])(prod|production)([-_]|$)/.test(normalizedDatabase)) return false;
  if (!/(^|[-_])(dev|development|test|testing|staging|sandbox)([-_]|$)/.test(normalizedDatabase)) return false;

  const authority = mongoUri.trim().match(/^mongodb(?:\+srv)?:\/\/([^/]+)/i)?.[1];
  if (!authority) return false;
  const hostList = authority.split('@').pop() || '';
  const hosts = hostList.split(',').map((host) => host.split(':')[0].toLowerCase()).filter(Boolean);
  return hosts.length > 0 && hosts.every((host) => !/(^|[.-])prod(uction)?([.-]|$)/.test(host));
};
