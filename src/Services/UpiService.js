// ============================================================================
// UPI SERVICE — Production-Ready Clean Function-Based UPI Service
// Zero external dependencies except 'qrcode' for QR rendering.
// ============================================================================

import crypto from 'node:crypto';
import QRCode from 'qrcode';

// ──────────────────────────────────────────────────────────────────────────
// CONFIG HELPERS
// ──────────────────────────────────────────────────────────────────────────

export function getMerchantUpiId(override) {
  return override || process.env.MERCHANT_UPI_ID || 'BHARATPE.8J0S0Z9W9S44900@FBPE';
}

export function getMerchantName(override) {
  return override || process.env.MERCHANT_NAME || 'TicketBooking Platform';
}

export function getWebhookSecret(override) {
  return override || process.env.WEBHOOK_SECRET || 'pf_default_secret_key_change_in_production';
}

// ──────────────────────────────────────────────────────────────────────────
// VALIDATORS
// ──────────────────────────────────────────────────────────────────────────

/**
 * Validates standard Indian Banking UPI UTR / RRN (12-digit numeric reference)
 * @param {string|number} utr
 * @returns {boolean}
 */
export function validateUtr(utr) {
  if (!utr) return false;
  return /^\d{12}$/.test(String(utr).trim());
}

/**
 * Validates if a string is a valid UPI VPA format (e.g. user@bank, name@upi)
 * @param {string} vpa
 * @returns {boolean}
 */
export function validateVpa(vpa) {
  if (!vpa || typeof vpa !== 'string') return false;
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(vpa.trim());
}

// ──────────────────────────────────────────────────────────────────────────
// IDENTIFIER GENERATION
// ──────────────────────────────────────────────────────────────────────────

export function generateOrderId(prefix = 'ord') {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function generatePaymentId(prefix = 'pay') {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

// ──────────────────────────────────────────────────────────────────────────
// LINK & QR CODE GENERATION
// ──────────────────────────────────────────────────────────────────────────

/**
 * Generates a standard NPCI compliant UPI Deep Link URI
 */
export function generateUpiLink(params = {}) {
  const amountVal = parseFloat(params.amount);
  if (isNaN(amountVal) || amountVal <= 0) {
    throw new Error(`Invalid amount: ${params.amount}. Must be a positive number.`);
  }

  const payeeVpa = params.payeeVpa || getMerchantUpiId();
  const payeeName = params.payeeName || getMerchantName();
  const orderId = params.orderId ? String(params.orderId).trim() : generateOrderId();
  
  // Clean alphanumeric note with order ID, max 50 chars for universal UPI app compatibility
  const note = (params.note || `Order ${orderId}`).trim().slice(0, 50);
  const currency = params.currency || 'INR';
  const mcc = params.mcc || process.env.MERCHANT_MCC || '5411';

  // Standard NPCI parameter ordering with %20 space encoding (never '+' which drops note in PhonePe/GPay)
  const queryParts = [
    `pa=${encodeURIComponent(payeeVpa)}`,
    `pn=${encodeURIComponent(payeeName)}`,
    `mc=${encodeURIComponent(mcc)}`,
    `tr=${encodeURIComponent(orderId)}`,
    `tn=${encodeURIComponent(note)}`,
    `am=${amountVal.toFixed(2)}`,
    `cu=${currency}`,
    `mode=02`
  ];

  if (params.callbackUrl) {
    queryParts.push(`url=${encodeURIComponent(params.callbackUrl)}`);
  }

  return `upi://pay?${queryParts.join('&')}`;
}

/**
 * Generates app-specific intent links for instant checkout on mobile devices.
 */
export function generateAppIntentLinks(params = {}) {
  const rawLink = generateUpiLink(params);
  const queryString = rawLink.replace('upi://pay?', '');

  return {
    generic: rawLink,
    gpay: `tez://upi/pay?${queryString}`,
    phonepe: `phonepe://pay?${queryString}`,
    paytm: `paytmmp://pay?${queryString}`,
    bhim: `bhim://pay?${queryString}`,
    cred: `cred://pay?${queryString}`
  };
}

/**
 * Generates a Base64 PNG Data URL for embedding in <img> tags
 */
export async function generateQrCode(upiLink, options = {}) {
  if (!upiLink || typeof upiLink !== 'string') {
    throw new Error('Valid UPI link is required to generate a QR code.');
  }

  return QRCode.toDataURL(upiLink, {
    width: options.width || 400,
    margin: options.margin !== undefined ? options.margin : 2,
    color: {
      dark: options.darkColor || '#1a1a2e',
      light: options.lightColor || '#ffffff'
    },
    errorCorrectionLevel: 'H'
  });
}

/**
 * Creates a complete payment session object
 */
export async function createPaymentSession(params = {}) {
  const orderId = params.orderId || generateOrderId();
  const amount = parseFloat(params.amount);
  const upiLink = generateUpiLink({ ...params, orderId });
  const qrCode = await generateQrCode(upiLink, params.qrOptions);
  const appLinks = generateAppIntentLinks({ ...params, orderId });

  const expiresInMinutes = params.expiresInMinutes || 15;
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

  return {
    orderId,
    amount,
    currency: params.currency || 'INR',
    merchantUpiId: params.payeeVpa || getMerchantUpiId(),
    merchantName: params.payeeName || getMerchantName(),
    upiLink,
    qrCode,
    appLinks,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    expiresAt
  };
}

// ──────────────────────────────────────────────────────────────────────────
// WEBHOOK SIGNATURES
// ──────────────────────────────────────────────────────────────────────────

export function generateWebhookSignature(payload, secret) {
  const signingSecret = secret || getWebhookSecret();
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return crypto.createHmac('sha256', signingSecret).update(raw).digest('hex');
}

export function verifyWebhookSignature(payload, signature, secret) {
  if (!signature || typeof signature !== 'string') return false;

  try {
    const expected = generateWebhookSignature(payload, secret);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(signature, 'hex');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}

// Backwards compatibility namespace object
export const UpiService = {
  validateUtr,
  validateVpa,
  generateUpiLink,
  generateAppIntentLinks,
  generateQrCode,
  createPaymentSession,
  generateWebhookSignature,
  verifyWebhookSignature,
  generateOrderId,
  generatePaymentId
};

export default UpiService;
