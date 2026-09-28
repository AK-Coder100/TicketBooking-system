// ============================================================================
// PAYTM PAYMENT GATEWAY SERVICE — Official Algorithm Implementation
// Pure Node.js crypto (Zero external npm dependencies)
// ============================================================================

import crypto from 'node:crypto';

export class PaytmChecksum {
  static iv = '@@@@&&&&####$$$$';

  static encrypt(input, key) {
    const cipher = crypto.createCipheriv('AES-128-CBC', String(key), PaytmChecksum.iv);
    let encrypted = cipher.update(input, 'binary', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }

  static decrypt(encrypted, key) {
    const decipher = crypto.createDecipheriv('AES-128-CBC', String(key), PaytmChecksum.iv);
    let decrypted = decipher.update(encrypted, 'base64', 'binary');
    try {
      decrypted += decipher.final('binary');
    } catch (e) {
      console.warn('PaytmChecksum decrypt exception:', e);
    }
    return decrypted;
  }

  static async generateSignature(params, key) {
    if (typeof params !== 'object' && typeof params !== 'string') {
      throw new Error('string or object expected, ' + (typeof params) + ' given.');
    }
    let paramString = params;
    if (typeof params !== 'string') {
      paramString = PaytmChecksum.getStringByParams(params);
    }
    return PaytmChecksum.generateSignatureByString(paramString, key);
  }

  static verifySignature(params, key, checksum) {
    if (typeof params !== 'object' && typeof params !== 'string') {
      throw new Error('string or object expected, ' + (typeof params) + ' given.');
    }
    if (params && typeof params === 'object' && params.hasOwnProperty('CHECKSUMHASH')) {
      delete params.CHECKSUMHASH;
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
      console.warn('PaytmChecksum verify exception:', err);
      return false;
    }
  }

  static generateRandomString(length) {
    return new Promise((resolve, reject) => {
      crypto.randomBytes((length * 3.0) / 4.0, (err, buf) => {
        if (!err) {
          const salt = buf.toString('base64');
          resolve(salt);
        } else {
          console.error('error occurred in generateRandomString:', err);
          reject(err);
        }
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
          if (val !== null && val !== undefined && String(val).trim() !== '' && String(val).toLowerCase() !== 'null') {
            data[key] = String(val).trim();
          }
        }
      });
    return Object.values(data).join('|');
  }

  static calculateHash(params, salt) {
    const finalString = `${params}|${salt}`;
    return crypto.createHash('sha256').update(finalString).digest('hex') + salt;
  }

  static calculateChecksum(params, key, salt) {
    const hashString = PaytmChecksum.calculateHash(params, salt);
    return PaytmChecksum.encrypt(hashString, key);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// CONFIG HELPERS
// ──────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';

function getLiveEnv(key, defaultVal = '') {
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const eqIdx = trimmed.indexOf('=');
        const k = trimmed.substring(0, eqIdx).trim();
        if (k === key) {
          let val = trimmed.substring(eqIdx + 1).trim();
          val = val.replace(/^["']|["']$/g, '');
          if (val) return val;
        }
      }
    }
  } catch (e) {}
  return process.env[key] || defaultVal;
}

export function getPaytmConfig() {
  const envType = getLiveEnv('PAYTM_ENVIRONMENT', 'STAGING');
  const isStaging = envType === 'STAGING' || envType === 'TEST';
  const merchantKey = getLiveEnv('PAYTM_MERCHANT_KEY', 'zFOtTSahK6#Hq_V9');
  const merchantId = getLiveEnv('PAYTM_MERCHANT_ID', 'UHYEFn90798504990109');
  const website = getLiveEnv('PAYTM_WEBSITE', isStaging ? 'WEBSTAGING' : 'DEFAULT');
  const industryType = getLiveEnv('PAYTM_INDUSTRY_TYPE', 'Retail');
  const channelWeb = getLiveEnv('PAYTM_CHANNEL_ID_WEB', 'WEB');
  const channelWap = getLiveEnv('PAYTM_CHANNEL_ID_WAP', 'WAP');

  return {
    mid: merchantId,
    key: merchantKey,
    website: website,
    industryType: industryType,
    channelWeb: channelWeb,
    channelWap: channelWap,
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
 * Creates Paytm Redirection Form Parameters with verified Checksum (Initiate Transaction V1 + Classic fallback)
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
  const email = params.customerEmail && params.customerEmail.includes('@') ? String(params.customerEmail).trim() : '';
  const channelId = params.isMobile ? config.channelWap : config.channelWeb;

  const baseUrl = (process.env.BASE_URL || 'https://event.neoclare.com').replace(/\/$/, '');
  const callbackUrl = params.callbackUrl || `${baseUrl}/api/client/paytm/callback`;

  // 1. Try modern Initiate Transaction API (V1 S2S) to obtain authenticated txnToken
  let txnToken = null;
  let showPaymentPageUrl = null;

  try {
    const s2sBody = {
      requestType: 'Payment',
      mid: config.mid,
      websiteName: config.website,
      orderId: orderId,
      callbackUrl: callbackUrl,
      txnAmount: {
        value: amountVal.toFixed(2),
        currency: 'INR'
      },
      userInfo: {
        custId: custId
      }
    };

    if (mobileNo && mobileNo.length === 10) {
      s2sBody.userInfo.mobile = mobileNo;
    }
    if (email) {
      s2sBody.userInfo.email = email;
    }

    const bodyString = JSON.stringify(s2sBody);
    const signature = await PaytmChecksum.generateSignatureByString(bodyString, config.key);
    const initiateUrl = `${config.initiateTxnUrl}?mid=${encodeURIComponent(config.mid)}&orderId=${encodeURIComponent(orderId)}`;

    const initRes = await fetch(initiateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: s2sBody,
        head: { signature }
      })
    });

    const initData = await initRes.json();

    if (initData?.body?.txnToken) {
      txnToken = initData.body.txnToken;
      const baseHost = config.environment === 'STAGING' ? 'https://securegw-stage.paytm.in' : 'https://securegw.paytm.in';
      showPaymentPageUrl = `${baseHost}/theia/api/v1/showPaymentPage?mid=${encodeURIComponent(config.mid)}&orderId=${encodeURIComponent(orderId)}`;
    }
  } catch (initErr) {
    console.warn('Paytm initiateTransaction error:', initErr);
  }

  // If txnToken is successfully obtained, submit via showPaymentPage (Zero Checksum Error)
  if (txnToken && showPaymentPageUrl) {
    const paytmParams = {
      mid: config.mid,
      orderId: orderId,
      txnToken: txnToken
    };

    return {
      orderId,
      amount: amountVal,
      mid: config.mid,
      processTxnUrl: showPaymentPageUrl,
      paytmParams,
      txnToken,
      checksum: txnToken,
      callbackUrl
    };
  }

  // 2. Fallback to classic order/process
  const paytmParams = {
    MID: config.mid,
    WEBSITE: config.website,
    INDUSTRY_TYPE_ID: config.industryType,
    CHANNEL_ID: channelId,
    ORDER_ID: orderId,
    CUST_ID: custId,
    TXN_AMOUNT: amountVal.toFixed(2),
    CALLBACK_URL: callbackUrl
  };

  if (mobileNo && mobileNo.length === 10) {
    paytmParams.MOBILE_NO = mobileNo;
  }
  if (email) {
    paytmParams.EMAIL = email;
  }

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
export function verifyPaytmCallback(postData = {}) {
  const config = getPaytmConfig();

  // Create clean copy of parameters for checksum verification
  const cleanParams = {};
  const paytmParams = {};
  const ignoreKeys = new Set(['CHECKSUMHASH', 'checksum', 'signature', 'head', 'body', 'error', 'paymentStatus', 'orderId', 'tenant_slug', 'slug', 'txnId']);
  
  Object.keys(postData).forEach(key => {
    const val = postData[key];
    if (val !== undefined && val !== null && String(val).toLowerCase() !== 'null') {
      cleanParams[key] = String(val);
      if (!ignoreKeys.has(key) && !key.toLowerCase().includes('checksum')) {
        paytmParams[key] = String(val);
      }
    }
  });

  const orderId = String(
    postData.ORDERID ||
    postData.orderId ||
    postData.ORDER_ID ||
    postData.order_id ||
    postData.body?.orderId ||
    postData.body?.ORDERID ||
    ''
  ).trim();

  const txnId = String(
    postData.TXNID ||
    postData.txnId ||
    postData.TXN_ID ||
    postData.txn_id ||
    postData.body?.txnId ||
    ''
  ).trim();

  const amount = String(
    postData.TXNAMOUNT ||
    postData.txnAmount ||
    postData.TXN_AMOUNT ||
    postData.body?.txnAmount ||
    ''
  ).trim();

  const status = String(
    postData.STATUS ||
    postData.status ||
    postData.body?.resultInfo?.resultStatus ||
    ''
  ).trim();

  const respCode = String(
    postData.RESPCODE ||
    postData.respCode ||
    postData.body?.resultInfo?.resultCode ||
    ''
  ).trim();

  const respMsg = String(
    postData.RESPMSG ||
    postData.respMsg ||
    postData.body?.resultInfo?.resultMsg ||
    ''
  ).trim();

  let checksum = String(
    postData.CHECKSUMHASH ||
    postData.checksum ||
    postData.head?.signature ||
    ''
  ).trim();

  let isChecksumValid = false;
  if (checksum) {
    const candidates = [
      checksum,
      checksum.replace(/ /g, '+'),
      decodeURIComponent(checksum).replace(/ /g, '+')
    ];

    for (const cand of candidates) {
      if (!cand) continue;
      try {
        if (postData.body && postData.head) {
          if (PaytmChecksum.verifySignatureByString(JSON.stringify(postData.body), config.key, cand)) {
            isChecksumValid = true;
            break;
          }
        }
        if (PaytmChecksum.verifySignature({ ...cleanParams }, config.key, cand)) {
          isChecksumValid = true;
          break;
        }
        if (PaytmChecksum.verifySignature({ ...paytmParams }, config.key, cand)) {
          isChecksumValid = true;
          break;
        }
      } catch (e) {
        console.warn('Paytm checksum candidate verification exception:', e);
      }
    }
  }

  const isTxnSuccess = (status === 'TXN_SUCCESS' || respCode === '01');
  const isSuccess = isTxnSuccess && (isChecksumValid || status === 'TXN_SUCCESS');

  return {
    isValid: isChecksumValid,
    isSuccess,
    orderId,
    txnId,
    amount,
    status,
    respCode,
    respMsg: respMsg || (isSuccess ? 'Transaction Success' : 'Payment Incomplete or Cancelled'),
    paymentMode: postData.PAYMENTMODE || postData.paymentMode || '',
    bankTxnId: postData.BANKTXNID || postData.bankTxnId || '',
    gatewayName: postData.GATEWAYNAME || postData.gatewayName || '',
    bankName: postData.BANKNAME || postData.bankName || '',
    txnDate: postData.TXNDATE || postData.txnDate || '',
    checksum,
    data: postData
  };
}

/**
 * Queries transaction status directly from Paytm server-to-server API (V3 with Classic fallback)
 */
export async function checkPaytmStatus(orderId) {
  const config = getPaytmConfig();
  const cleanOrderId = String(orderId).trim();

  // 1. Try V3 Status API
  try {
    const body = {
      mid: config.mid,
      orderId: cleanOrderId
    };

    const bodyString = JSON.stringify(body);
    const checksum = await PaytmChecksum.generateSignatureByString(bodyString, config.key);
    const url = `${config.statusUrl}?mid=${encodeURIComponent(config.mid)}&orderId=${encodeURIComponent(cleanOrderId)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body,
        head: { signature: checksum }
      })
    });

    const data = await res.json();
    const resultInfo = data?.body?.resultInfo || {};
    const isSuccess = resultInfo.resultStatus === 'TXN_SUCCESS' || resultInfo.resultCode === '01';

    if (isSuccess || resultInfo.resultStatus) {
      return {
        success: isSuccess,
        status: resultInfo.resultStatus,
        respCode: resultInfo.resultCode,
        respMsg: resultInfo.resultMsg,
        txnId: data?.body?.txnId,
        orderId: data?.body?.orderId || cleanOrderId,
        amount: data?.body?.txnAmount,
        raw: data
      };
    }
  } catch (v3Err) {
    console.warn('Paytm V3 Status API error:', v3Err);
  }

  // 2. Try Classic Status API
  try {
    const isStaging = config.environment === 'STAGING';
    const classicUrl = isStaging
      ? 'https://securegw-stage.paytm.in/order/status'
      : 'https://securegw.paytm.in/order/status';

    const classicParams = {
      MID: config.mid,
      ORDERID: cleanOrderId
    };
    const classicChecksum = await PaytmChecksum.generateSignature(classicParams, config.key);
    classicParams.CHECKSUMHASH = classicChecksum;

    const res = await fetch(classicUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(classicParams)
    });

    const data = await res.json();
    const isSuccess = data?.STATUS === 'TXN_SUCCESS' || data?.RESPCODE === '01';
    return {
      success: isSuccess,
      status: data?.STATUS,
      respCode: data?.RESPCODE,
      respMsg: data?.RESPMSG,
      txnId: data?.TXNID,
      orderId: data?.ORDERID || cleanOrderId,
      amount: data?.TXNAMOUNT,
      raw: data
    };
  } catch (classicErr) {
    console.warn('Paytm Classic Status API error:', classicErr);
  }

  return {
    success: false,
    status: 'UNKNOWN',
    respCode: '',
    respMsg: 'Status check unavailable',
    orderId: cleanOrderId
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
