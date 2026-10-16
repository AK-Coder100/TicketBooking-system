import crypto from 'node:crypto';

function getSigningSecret(): string {
  const secret = process.env.SIGNING_SECRET;
  if (!secret) {
    throw new Error('SIGNING_SECRET environment variable is missing in configuration.');
  }
  return secret;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function generateTicketToken(payload: any): string {
  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);
  const hmac = crypto.createHmac('sha256', getSigningSecret());
  hmac.update(encodedPayload);
  const signature = hmac.digest('hex');
  return `${encodedPayload}.${signature}`;
}

export function verifyTicketToken(token: string): { valid: boolean; payload?: any; error?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Empty or invalid token format' };
  }

  const clean = token.trim();

  // Support TKT: format (e.g., TKT:TCK-EVRL58F-1-E4D5:BK-EVRL58F:ed2f87be3613fc13)
  if (clean.startsWith('TKT:')) {
    const parts = clean.split(':');
    const ticketId = parts[1]?.trim();
    const orderId = parts[2]?.trim();
    const secret = parts[3]?.trim();

    if (!ticketId) {
      return { valid: false, error: 'Malformed TKT token structure: Missing ticket identifier' };
    }

    return {
      valid: true,
      payload: {
        ticketId,
        orderId,
        secret,
        rawToken: clean,
        format: 'TKT'
      }
    };
  }

  const parts = clean.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed token structure' };
  }

  const [encodedPayload, receivedSignature] = parts;
  const hmac = crypto.createHmac('sha256', getSigningSecret());
  hmac.update(encodedPayload);
  const expectedSignature = hmac.digest('hex');

  const signatureBuffer = Buffer.from(receivedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { valid: false, error: 'Tamper-evident verification failed: Cryptographic signature mismatch' };
  }

  try {
    const payloadJson = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(payloadJson);
    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: 'Failed to parse token payload' };
  }
}
