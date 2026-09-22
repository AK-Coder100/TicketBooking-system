import { db } from './db';
import crypto from 'node:crypto';

export const HOLD_DURATION_MINUTES = 10;
export const MAX_CART_LIMIT = 10;

export async function cleanupExpiredReservations() {
  const nowIso = new Date().toISOString();
  await db.prepare(`DELETE FROM reservations WHERE expires_at <= ?`).run(nowIso);
}

export async function getTierCapacity(tierId: string) {
  const tier: any = await db.prepare(`SELECT * FROM ticket_tiers WHERE id = ?`).get(tierId);
  if (!tier) throw new Error('Ticket tier not found');

  if (tier.is_unlimited) {
    return {
      tier,
      isUnlimited: true,
      totalCapacity: null,
      soldCount: 0,
      activeReservedCount: 0,
      availableCount: 999999
    };
  }

  await cleanupExpiredReservations();

  const soldRow: any = await db.prepare(`
    SELECT COUNT(t.id) as count 
    FROM tickets t
    JOIN orders o ON t.order_id = o.id
    WHERE t.tier_id = ? AND o.payment_status = 'PAID'
  `).get(tierId);
  const soldCount = parseInt(soldRow?.count || '0', 10);

  const nowIso = new Date().toISOString();
  const reservedRow: any = await db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as count 
    FROM reservations 
    WHERE tier_id = ? AND expires_at > ?
  `).get(tierId, nowIso);
  const activeReservedCount = parseInt(reservedRow?.count || '0', 10);

  const totalCapacity = tier.capacity || 0;
  const availableCount = Math.max(0, totalCapacity - soldCount - activeReservedCount);

  return {
    tier,
    isUnlimited: false,
    totalCapacity,
    soldCount,
    activeReservedCount,
    availableCount
  };
}

export async function createReservation({ tierId, sessionToken, quantity }: { tierId: string; sessionToken: string; quantity: number }) {
  if (!quantity || quantity < 1) throw new Error('Quantity must be at least 1');
  if (quantity > MAX_CART_LIMIT) throw new Error(`Maximum ${MAX_CART_LIMIT} tickets allowed per reservation`);

  try {
    const tier: any = await db.prepare(`SELECT * FROM ticket_tiers WHERE id = ?`).get(tierId);
    if (!tier) {
      return { success: false, error: 'Tier not found' };
    }

    if (!tier.is_unlimited) {
      const soldRow: any = await db.prepare(`
        SELECT COUNT(t.id) as count 
        FROM tickets t
        JOIN orders o ON t.order_id = o.id
        WHERE t.tier_id = ? AND o.payment_status = 'PAID'
      `).get(tierId);
      const soldCount = parseInt(soldRow?.count || '0', 10);

      const nowIso = new Date().toISOString();
      const reservedRow: any = await db.prepare(`
        SELECT COALESCE(SUM(quantity), 0) as count 
        FROM reservations 
        WHERE tier_id = ? AND expires_at > ? AND session_token != ?
      `).get(tierId, nowIso, sessionToken);
      const otherReserved = parseInt(reservedRow?.count || '0', 10);

      const available = Math.max(0, tier.capacity - soldCount - otherReserved);

      if (available < quantity) {
        return {
          success: false,
          error: `Insufficient inventory. Only ${available} seat(s) remaining.`,
          available
        };
      }
    }

    // Clean previous hold for this session
    await db.prepare(`DELETE FROM reservations WHERE session_token = ? AND tier_id = ?`).run(sessionToken, tierId);

    const reservationId = `res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_DURATION_MINUTES * 60 * 1000).toISOString();

    await db.prepare(`
      INSERT INTO reservations (id, tier_id, session_token, quantity, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(reservationId, tierId, sessionToken, quantity, expiresAt, now.toISOString());

    return {
      success: true,
      reservationId,
      tierId,
      quantity,
      expiresAt,
      holdMinutes: HOLD_DURATION_MINUTES,
      secondsRemaining: HOLD_DURATION_MINUTES * 60
    };
  } catch (err) {
    throw err;
  }
}

export async function getActiveReservation(sessionToken: string, tierId: string) {
  await cleanupExpiredReservations();
  const nowIso = new Date().toISOString();
  const res: any = await db.prepare(`
    SELECT * FROM reservations 
    WHERE session_token = ? AND tier_id = ? AND expires_at > ?
  `).get(sessionToken, tierId, nowIso);

  if (!res) return null;

  const remainingMs = new Date(res.expires_at).getTime() - Date.now();
  return {
    ...res,
    secondsRemaining: Math.max(0, Math.floor(remainingMs / 1000))
  };
}

export async function consumeReservation(sessionToken: string, tierId: string) {
  await db.prepare(`DELETE FROM reservations WHERE session_token = ? AND tier_id = ?`).run(sessionToken, tierId);
}
