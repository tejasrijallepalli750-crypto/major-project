import { Order, ShippingAddress } from '../types';

const CHECKOUT_INTENT_STORAGE_KEY = 'aura_checkout_intent_v2';

export interface CheckoutOrderRequest {
  orderItems: { productId: string; quantity: number }[];
  shippingAddress: ShippingAddress;
  paymentMethod: Order['paymentMethod'];
}

interface CheckoutIntentRecord {
  fingerprint: string;
  key: string;
}

interface CheckoutIntentStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const fingerprintRequest = async (request: CheckoutOrderRequest): Promise<string> => {
  const content = new TextEncoder().encode(JSON.stringify(request));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', content);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const parseRecord = (value: string | null): CheckoutIntentRecord | undefined => {
  if (!value) return undefined;
  try {
    const record = JSON.parse(value) as Partial<CheckoutIntentRecord>;
    if (typeof record.fingerprint === 'string'
      && /^[\da-f]{64}$/i.test(record.fingerprint)
      && typeof record.key === 'string'
      && /^[\da-f-]{16,100}$/i.test(record.key)) {
      return { fingerprint: record.fingerprint, key: record.key };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

export const createCheckoutIdempotencyManager = (
  storage: CheckoutIntentStorage | undefined,
  createKey: () => string = () => globalThis.crypto.randomUUID(),
) => {
  let memoryRecord: CheckoutIntentRecord | undefined;
  const completedKeys = new Set<string>();

  const readRecord = (): CheckoutIntentRecord | undefined => {
    if (memoryRecord) return memoryRecord;
    try {
      const stored = parseRecord(storage?.getItem(CHECKOUT_INTENT_STORAGE_KEY) ?? null);
      if (stored) memoryRecord = stored;
    } catch (error) {
      console.warn('[Checkout] Could not read the checkout retry key for this browser tab.', error);
    }
    return memoryRecord;
  };

  return {
    async getKey(request: CheckoutOrderRequest): Promise<string> {
      const fingerprint = await fingerprintRequest(request);
      const existing = readRecord();
      if (existing?.fingerprint === fingerprint
        && !completedKeys.has(`${existing.fingerprint}:${existing.key}`)) {
        return existing.key;
      }

      const record = { fingerprint, key: createKey() };
      memoryRecord = record;
      try {
        storage?.setItem(CHECKOUT_INTENT_STORAGE_KEY, JSON.stringify(record));
      } catch (error) {
        console.warn('[Checkout] Could not persist the checkout retry key for this browser tab.', error);
      }
      return record.key;
    },

    async clearKey(request: CheckoutOrderRequest, key: string): Promise<void> {
      const fingerprint = await fingerprintRequest(request);
      const current = readRecord();
      if (current?.fingerprint !== fingerprint || current.key !== key) return;

      completedKeys.add(`${fingerprint}:${key}`);
      memoryRecord = undefined;
      try {
        storage?.removeItem(CHECKOUT_INTENT_STORAGE_KEY);
      } catch (error) {
        console.warn('[Checkout] Could not clear the completed checkout retry key.', error);
      }
    },
  };
};

const getSessionStorage = (): CheckoutIntentStorage | undefined => {
  try {
    return globalThis.sessionStorage;
  } catch (error) {
    console.warn('[Checkout] Session storage is unavailable; retry keys will remain in memory.', error);
    return undefined;
  }
};

export const checkoutIdempotency = createCheckoutIdempotencyManager(getSessionStorage());
