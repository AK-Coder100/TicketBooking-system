import { db } from './db';
import crypto from 'node:crypto';

export const HOLD_DURATION_MINUTES = 10;

export function cleanupExpiredReservations() {
  db.prepare(`DELETE FROM reservations WHERE expires_at <= datetime('now')`).run();
}

export function getTierCapacity(tierId: string) {
  const tier: any = db.prepare(`SELECT * FROM ticket_tiers WHERE id = ?`).get(tierId);
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

  cleanupExpiredReservations();

  const soldRow: any = db.prepare(`
    SELECT COUNT(t.id) as count 
    FROM tickets t
    JOIN orders o ON t.order_id = o.id
    WHERE t.tier_id = ? AND o.payment_status = 'PAID'
  `).get(tierId);
  const soldCount = soldRow ? soldRow.count : 0;

  const reservedRow: any = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as count 
    FROM reservations 
    WHERE tier_id = ? AND expires_at > datetime('now')
  `).get(tierId);
  const activeReservedCount = reservedRow ? reservedRow.count : 0;

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

export function createReservation({ tierId, sessionToken, quantity }: { tierId: string; sessionToken: string; quantity: number }) {
  if (!quantity || quantity < 1) throw new Error('Quantity must be at least 1');

  db.exec('BEGIN IMMEDIATE');
  try {
    const tier: any = db.prepare(`SELECT * FROM ticket_tiers WHERE id = ?`).get(tierId);
    if (!tier) {
      db.exec('ROLLBACK');
      return { success: false, error: 'Tier not found' };
    }

    if (!tier.is_unlimited) {
      const soldRow: any = db.prepare(`
        SELECT COUNT(t.id) as count 
        FROM tickets t
        JOIN orders o ON t.order_id = o.id
        WHERE t.tier_id = ? AND o.payment_status = 'PAID'
      `).get(tierId);
      const soldCount = soldRow ? soldRow.count : 0;

      const reservedRow: any = db.prepare(`
        SELECT COALESCE(SUM(quantity), 0) as count 
        FROM reservations 
        WHERE tier_id = ? AND expires_at > datetime('now') AND session_token != ?
      `).get(tierId, sessionToken);
      const otherReserved = reservedRow ? reservedRow.count : 0;

      const available = Math.max(0, tier.capacity - soldCount - otherReserved);

      if (available < quantity) {
        db.exec('ROLLBACK');
        return {
          success: false,
          error: `Insufficient inventory. Only ${available} seat(s) remaining.`,
          available
        };
      }
    }

    // Clean previous hold for this session
    db.prepare(`DELETE FROM reservations WHERE session_token = ? AND tier_id = ?`).run(sessionToken, tierId);

    const reservationId = `res_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_DURATION_MINUTES * 60 * 1000).toISOString();

    db.prepare(`
      INSERT INTO reservations (id, tier_id, session_token, quantity, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(reservationId, tierId, sessionToken, quantity, expiresAt, now.toISOString());

    db.exec('COMMIT');

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
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getActiveReservation(sessionToken: string, tierId: string) {
  cleanupExpiredReservations();
  const res: any = db.prepare(`
    SELECT * FROM reservations 
    WHERE session_token = ? AND tier_id = ? AND expires_at > datetime('now')
  `).get(sessionToken, tierId);

  if (!res) return null;

  const remainingMs = new Date(res.expires_at).getTime() - Date.now();
  return {
    ...res,
    secondsRemaining: Math.max(0, Math.floor(remainingMs / 1000))
  };
}

export function consumeReservation(sessionToken: string, tierId: string) {
  db.prepare(`DELETE FROM reservations WHERE session_token = ? AND tier_id = ?`).run(sessionToken, tierId);
}
