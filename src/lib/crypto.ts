import crypto from 'node:crypto';

const SECRET_KEY = process.env.SIGNING_SECRET || 'multi_tenant_platform_secret_jwt_sign_key_2026';

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
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
  hmac.update(encodedPayload);
  const signature = hmac.digest('hex');
  return `${encodedPayload}.${signature}`;
}

export function verifyTicketToken(token: string): { valid: boolean; payload?: any; error?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Empty or invalid token format' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed token structure' };
  }

  const [encodedPayload, receivedSignature] = parts;
  const hmac = crypto.createHmac('sha256', SECRET_KEY);
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
