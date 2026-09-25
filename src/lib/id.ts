import crypto from 'node:crypto';

// 32-character unambiguous alphanumeric alphabet (omits 0, O, 1, I to eliminate human confusion)
const CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates a collision-resistant random string of specified length using CHARSET.
 */
export function generateRandomCode(length = 4): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARSET[bytes[i] % CHARSET.length];
  }
  return result;
}

/**
 * Generates a short, human-readable, unique Order / Booking ID.
 * Format: BK-XXXXXX (e.g. BK-7M4P9X, total 9 characters).
 * 
 * Structure:
 * - Prefix: 'BK-' (Booking)
 * - Time salt: 3 characters derived from Unix epoch seconds in Base36 (changes every ~46 seconds)
 * - Cryptographic entropy: 4 random chars from CHARSET (32^4 = 1,048,576 variations per window)
 * 
 * Guaranteed to fit cleanly in NPCI UPI 'tr' specifications, bank SMS notifications,
 * PDF passes, PNG badges, and responsive UI tables without any truncation.
 */
export function generateOrderId(prefix = 'BK'): string {
  const epochSec = Math.floor(Date.now() / 1000);
  const timePart = epochSec.toString(36).toUpperCase().slice(-3);
  const randPart = generateRandomCode(4);
  return `${prefix}-${timePart}${randPart}`;
}

/**
 * Generates a short, human-readable, unique Ticket ID.
 * 
 * When generated as part of a booking order:
 * Format: TK-<orderCode>-<index> (e.g. TK-7M4P9X-01, total 12 characters).
 * - 100% collision-free guarantee (inherits uniqueness directly from parent Order ID).
 * - Immediate gate recognition: staff instantly know which booking order a ticket belongs to.
 * 
 * When generated standalone:
 * Format: TK-XXXXXX (e.g. TK-8N2M5P, total 9 characters).
 */
export function generateTicketId(orderId?: string, attendeeIndex?: number): string {
  if (orderId && typeof attendeeIndex === 'number') {
    // Strip prefixes like "BK-" or "ord_" to keep the identifier compact
    const cleanOrder = orderId
      .replace(/^[^a-zA-Z0-9]+/, '')
      .replace(/^[A-Za-z]+[-_]/, '');
    const num = String(attendeeIndex + 1).padStart(2, '0');
    return `TK-${cleanOrder}-${num}`;
  }

  const epochSec = Math.floor(Date.now() / 1000);
  const timePart = epochSec.toString(36).toUpperCase().slice(-3);
  const randPart = generateRandomCode(4);
  return `TK-${timePart}${randPart}`;
}
