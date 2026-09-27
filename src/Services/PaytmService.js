// ============================================================================
// PAYTM PAYMENT GATEWAY SERVICE — Production-Grade Native Implementation
// Pure Node.js crypto (Zero external npm dependencies)
// ============================================================================

import crypto from 'node:crypto';

export class PaytmChecksum {
  static iv = '@@@@&&&&####$$$$';

  static normalizeKey(key) {
    let k = String(key || '').trim();
    if (!k || k.length < 16) {
      k = '&U4jV#C3AmJgDHTd';
    }
    return Buffer.from(k, 'utf8');
  }

  static encrypt(input, key) {
    const keyBuf = PaytmChecksum.normalizeKey(key);
    const cipher = crypto.createCipheriv('AES-128-CBC', keyBuf, Buffer.from(PaytmChecksum.iv, 'utf8'));
    let encrypted = cipher.update(input, 'binary', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }

  static decrypt(encrypted, key) {
    const keyBuf = PaytmChecksum.normalizeKey(key);
    const decipher = crypto.createDecipheriv('AES-128-CBC', keyBuf, Buffer.from(PaytmChecksum.iv, 'utf8'));
    let decrypted = decipher.update(encrypted, 'base64', 'binary');
    try {
      decrypted += decipher.final('binary');
    } catch (e) {
      console.error('PaytmChecksum decrypt error:', e);
    }
    return decrypted;
  }

  static async generateSignature(params, key) {
    if (typeof params !== 'string' && typeof params !== 'object') {
      throw new Error('Invalid params provided for Paytm checksum generation');
    }
    let paramString = params;
    if (typeof params !== 'string') {
      paramString = PaytmChecksum.getStringByParams(params);
    }
    return PaytmChecksum.generateSignatureByString(paramString, key);
  }

  static verifySignature(params, key, checksum) {
    if (!checksum || (typeof params !== 'string' && typeof params !== 'object')) {
      return false;
    }
    let paramString = params;
    if (typeof params !== 'string') {
      paramString = PaytmChecksum.getStringByParams(params);
    }
    return PaytmChecksum.verifySignatureByString(paramString, key, checksum);
  }

  static async generateSignatureByString(params, key) {
    const salt = await PaytmChecksum.generateRandomString(4);
    return PaytmChecksum.calculateChecksum(params, key, salt);
  }

  static verifySignatureByString(params, key, checksum) {
    try {
      const paytmHash = PaytmChecksum.decrypt(checksum, key);
      const salt = paytmHash.substr(paytmHash.length - 4);
      return paytmHash === PaytmChecksum.calculateHash(params, salt);
    } catch (err) {
      console.error('PaytmChecksum verification error:', err);
      return false;
    }
  }

  static generateRandomString(length) {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(Math.ceil((length * 3.0) / 4.0), (err, buf) => {
        if (err) return reject(err);
        resolve(buf.toString('base64').substring(0, length));
      });
    });
  }

  static getStringByParams(params) {
    const data = {};
    Object.keys(params)
      .sort()
      .forEach(key => {
        if (key !== 'CHECKSUMHASH' && key !== 'checksum') {
          const val = params[key];
          data[key] = (val !== null && val !== undefined && String(val).toLowerCase() !== 'null') ? String(val) : '';
        }
      });
    return Object.values(data).join('|');
  }

  static calculateHash(params, salt) {
    const finalString = `${params}|${salt}`;
    return crypto.createHash('sha256').update(finalString, 'utf8').digest('hex') + salt;
  }

  static calculateChecksum(params, key, salt) {
    const hashString = PaytmChecksum.calculateHash(params, salt);
    return PaytmChecksum.encrypt(hashString, key);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// CONFIG HELPERS
// ──────────────────────────────────────────────────────────────────────────

export function getPaytmConfig() {
  const isStaging = process.env.PAYTM_ENVIRONMENT === 'STAGING' || process.env.PAYTM_ENVIRONMENT === 'TEST';
  let merchantKey = (process.env.PAYTM_MERCHANT_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!merchantKey || merchantKey.length < 16) {
    merchantKey = '&U4jV#C3AmJgDHTd';
  }

  const merchantId = (process.env.PAYTM_MERCHANT_ID || '').replace(/^["']|["']$/g, '').trim() || 'MUHgMY57617969874640';

  return {
    mid: merchantId,
    key: merchantKey,
    website: (process.env.PAYTM_WEBSITE || 'DEFAULT').replace(/^["']|["']$/g, '').trim(),
    industryType: (process.env.PAYTM_INDUSTRY_TYPE || 'Retail').replace(/^["']|["']$/g, '').trim(),
    channelWeb: (process.env.PAYTM_CHANNEL_ID_WEB || 'WEB').replace(/^["']|["']$/g, '').trim(),
    channelWap: (process.env.PAYTM_CHANNEL_ID_WAP || 'WAP').replace(/^["']|["']$/g, '').trim(),
    environment: isStaging ? 'STAGING' : 'PRODUCTION',
    processTxnUrl: isStaging
      ? 'https://securegw-stage.paytm.in/order/process'
      : 'https://securegw.paytm.in/order/process',
    statusUrl: isStaging
      ? 'https://securegw-stage.paytm.in/v3/order/status'
      : 'https://securegw.paytm.in/v3/order/status',
    initiateTxnUrl: isStaging
      ? 'https://securegw-stage.paytm.in/theia/api/v1/initiateTransaction'
      : 'https://securegw.paytm.in/theia/api/v1/initiateTransaction'
  };
}

// ──────────────────────────────────────────────────────────────────────────
// TRANSACTION CREATION & VERIFICATION
// ──────────────────────────────────────────────────────────────────────────

/**
 * Creates Paytm Redirection Form Parameters with verified Checksum
 */
export async function createPaytmPayment(params) {
  const config = getPaytmConfig();
  const amountVal = parseFloat(params.amount);
  if (isNaN(amountVal) || amountVal <= 0) {
    throw new Error(`Invalid amount: ${params.amount}. Must be a positive number.`);
  }

  const orderId = String(params.orderId || `BK-${Date.now()}`).trim();
  const custId = (params.customerPhone || params.customerId || `CUST_${orderId}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || `CUST_${orderId}`;
  const mobileNo = params.customerPhone ? String(params.customerPhone).replace(/[^0-9]/g, '').slice(-10) : '';
  const email = params.customerEmail || `${custId}@customer.com`;
  const channelId = params.isMobile ? config.channelWap : config.channelWeb;

  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  const callbackUrl = params.callbackUrl || `${baseUrl}/api/client/paytm/callback`;

  const paytmParams = {
    MID: config.mid,
    WEBSITE: config.website,
    INDUSTRY_TYPE_ID: config.industryType,
    CHANNEL_ID: channelId,
    ORDER_ID: orderId,
    CUST_ID: custId,
    MOBILE_NO: mobileNo,
    EMAIL: email,
    TXN_AMOUNT: amountVal.toFixed(2),
    CALLBACK_URL: callbackUrl
  };

  const checksum = await PaytmChecksum.generateSignature(paytmParams, config.key);
  paytmParams.CHECKSUMHASH = checksum;

  return {
    orderId,
    amount: amountVal,
    mid: config.mid,
    processTxnUrl: config.processTxnUrl,
    paytmParams,
    checksum,
    callbackUrl
  };
}

/**
 * Verifies the callback payload received from Paytm
 */
export function verifyPaytmCallback(postData) {
  const config = getPaytmConfig();
  const checksum = postData.CHECKSUMHASH || postData.checksum;
  if (!checksum) {
    return {
      isValid: false,
      isSuccess: false,
      error: 'Missing CHECKSUMHASH in Paytm response',
      data: postData
    };
  }

  const isChecksumValid = PaytmChecksum.verifySignature(postData, config.key, checksum);
  const isSuccess = isChecksumValid && (postData.STATUS === 'TXN_SUCCESS' || postData.RESPCODE === '01');

  return {
    isValid: isChecksumValid,
    isSuccess,
    orderId: postData.ORDERID || postData.ORDER_ID,
    txnId: postData.TXNID || postData.TXN_ID,
    amount: postData.TXNAMOUNT || postData.TXN_AMOUNT,
    status: postData.STATUS,
    respCode: postData.RESPCODE,
    respMsg: postData.RESPMSG,
    paymentMode: postData.PAYMENTMODE,
    bankTxnId: postData.BANKTXNID,
    gatewayName: postData.GATEWAYNAME,
    bankName: postData.BANKNAME,
    txnDate: postData.TXNDATE,
    data: postData
  };
}

/**
 * Queries transaction status directly from Paytm server-to-server API
 */
export async function checkPaytmStatus(orderId) {
  const config = getPaytmConfig();
  const body = {
    mid: config.mid,
    orderId: String(orderId)
  };

  const checksum = await PaytmChecksum.generateSignature(body, config.key);
  const url = `${config.statusUrl}?mid=${encodeURIComponent(config.mid)}&orderId=${encodeURIComponent(orderId)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      body,
      head: {
        signature: checksum
      }
    })
  });

  const data = await res.json();
  const resultInfo = data?.body?.resultInfo || {};
  const isSuccess = resultInfo.resultStatus === 'TXN_SUCCESS' || resultInfo.resultCode === '01';

  return {
    success: isSuccess,
    status: resultInfo.resultStatus,
    respCode: resultInfo.resultCode,
    respMsg: resultInfo.resultMsg,
    txnId: data?.body?.txnId,
    orderId: data?.body?.orderId,
    amount: data?.body?.txnAmount,
    raw: data
  };
}

export const PaytmService = {
  PaytmChecksum,
  getPaytmConfig,
  createPaytmPayment,
  verifyPaytmCallback,
  checkPaytmStatus
};

export default PaytmService;
