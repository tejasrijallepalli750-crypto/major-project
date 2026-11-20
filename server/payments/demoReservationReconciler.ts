import { db } from '../db/database';
import { isDemoModeEnabled } from '../config/demoMode';
import { getRazorpayConfig } from './razorpay';

interface RazorpayOrderPayments {
  items?: Array<{ status?: string }>;
}

interface RazorpayOrderStatus {
  status?: string;
  expire_by?: number;
}

export type DemoReservationReconciliationStage =
  | 'querying expired reservations'
  | 'checking Razorpay status'
  | 'releasing eligible reservation';

export class DemoReservationReconciliationError extends Error {
  public readonly stage: DemoReservationReconciliationStage;
  public readonly sourceErrorName: string;

  constructor(stage: DemoReservationReconciliationStage, error: unknown) {
    super(`Demo reservation reconciliation failed while ${stage}.`);
    this.name = 'DemoReservationReconciliationError';
    this.stage = stage;
    this.sourceErrorName = sanitizedErrorName(error);
  }
}

let reconciliationInFlight = false;

const sanitizedErrorName = (error: unknown): string => {
  const name = error instanceof Error ? error.name : '';
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ? name : 'UnknownError';
};

export const canReleaseDemoReservation = (
  gatewayOrder: RazorpayOrderStatus,
  paymentStatuses: string[],
  now = Date.now(),
  expectedExpireBy?: number,
): boolean =>
  (gatewayOrder.status === 'created' || gatewayOrder.status === 'attempted')
  && typeof gatewayOrder.expire_by === 'number'
  && Number.isSafeInteger(gatewayOrder.expire_by)
  && gatewayOrder.expire_by * 1000 <= now
  && (expectedExpireBy === undefined || gatewayOrder.expire_by === expectedExpireBy)
  && paymentStatuses.every((status) => status === 'failed');

export const reconcileExpiredDemoReservations = async (
  now = new Date(),
): Promise<{ scanned: number; released: number; retained: number; skipped: boolean }> => {
  const config = getRazorpayConfig();
  if (!isDemoModeEnabled() || !config.isConfigured) {
    return { scanned: 0, released: 0, retained: 0, skipped: true };
  }
  if (reconciliationInFlight) {
    return { scanned: 0, released: 0, retained: 0, skipped: true };
  }

  reconciliationInFlight = true;
  try {
    let expiredOrders;
    try {
      expiredOrders = await db.findExpiredDemoReservations(now);
    } catch (error) {
      throw new DemoReservationReconciliationError('querying expired reservations', error);
    }

    let released = 0;
    let retained = 0;

    for (const order of expiredOrders) {
      if (!order.razorpayOrderId) {
        console.warn('[DemoInventory] Expired reservation has no stored Razorpay order ID; retaining for manual/provider reconciliation.');
        retained += 1;
        continue;
      }

      const expectedExpireBy = order.demoGatewayOrderExpiresAt
        ? Math.floor(new Date(order.demoGatewayOrderExpiresAt).getTime() / 1000)
        : undefined;
      const reservationExpiresAt = order.demoReservationExpiresAt
        ? new Date(order.demoReservationExpiresAt).getTime()
        : undefined;
      if (!Number.isSafeInteger(expectedExpireBy)
        || reservationExpiresAt === undefined
        || expectedExpireBy! * 1000 > reservationExpiresAt) {
        retained += 1;
        continue;
      }

      let gatewayStage: 'checking Razorpay order status' | 'checking Razorpay payment status' = 'checking Razorpay order status';
      try {
        const gatewayOrderResponse = await fetch(
          `https://api.razorpay.com/v1/orders/${encodeURIComponent(order.razorpayOrderId)}`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`,
            },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!gatewayOrderResponse.ok) {
          console.error(`[DemoInventory] ${gatewayStage} returned HTTP ${gatewayOrderResponse.status}; reservation retained.`);
          retained += 1;
          continue;
        }
        const gatewayOrder = await gatewayOrderResponse.json() as RazorpayOrderStatus;
        if (!canReleaseDemoReservation(gatewayOrder, [], now.getTime(), expectedExpireBy)) {
          retained += 1;
          continue;
        }

        gatewayStage = 'checking Razorpay payment status';
        const response = await fetch(
          `https://api.razorpay.com/v1/orders/${encodeURIComponent(order.razorpayOrderId)}/payments`,
          {
            headers: {
              Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`,
            },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!response.ok) {
          console.error(`[DemoInventory] ${gatewayStage} returned HTTP ${response.status}; reservation retained.`);
          retained += 1;
          continue;
        }
        const paymentData = await response.json() as RazorpayOrderPayments;
        if (!Array.isArray(paymentData.items)) {
          console.error(`[DemoInventory] ${gatewayStage} response was invalid; reservation retained.`);
          retained += 1;
          continue;
        }
        const statuses = paymentData.items.map((payment) => payment.status || 'unknown');
        if (!canReleaseDemoReservation(gatewayOrder, statuses, now.getTime(), expectedExpireBy)) {
          retained += 1;
          continue;
        }
      } catch (error) {
        const errorName = sanitizedErrorName(error);
        console.error(`[DemoInventory] ${gatewayStage} failed (${errorName}); reservation retained.`);
        retained += 1;
        continue;
      }

      let releasedOrder;
      try {
        releasedOrder = await db.releaseExpiredDemoReservation(order.id, now);
      } catch (error) {
        throw new DemoReservationReconciliationError('releasing eligible reservation', error);
      }
      if (releasedOrder) released += 1;
      else retained += 1;
    }

    return { scanned: expiredOrders.length, released, retained, skipped: false };
  } finally {
    reconciliationInFlight = false;
  }
};
