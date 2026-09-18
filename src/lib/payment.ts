export interface FeeSplitResult {
  basePricePaise: number;
  ticketCount: number;
  platformFeePaise: number;
  fixedGatewayFeePaise: number;
  variablePercentFeePaise: number;
  convenienceFeePaise: number;
  totalChargedPaise: number;
  organizerGrossPaise: number;
  organizerNetPayoutPaise: number;
  gatewayTransactionDeductionPaise: number;
  isFeePassedToCustomer: boolean;
  effectiveSurchargeRatePercent: string;
  currency: string;
}

export function computeSplitRules({
  basePricePaise,
  ticketCount,
  tenantConfig,
  platformSettings
}: {
  basePricePaise: number;
  ticketCount: number;
  tenantConfig: any;
  platformSettings: any;
}): FeeSplitResult {
  // 3% variable surcharge percentage
  const surchargePercent = parseFloat(platformSettings.gateway_surcharge_percent || '3.0');

  // ₹1 (100 paise) fixed gateway fee per ticket
  const fixedGatewayFeePerTicketPaise = parseInt(platformSettings.fixed_gateway_fee_paise || '100', 10);

  // ₹2 (200 paise) platform fee per ticket
  const platformFeePerTicketPaise = tenantConfig.default_platform_fee != null
    ? tenantConfig.default_platform_fee
    : (parseInt(platformSettings.default_commission_paise || '200', 10) || 200);

  const platformFeePaise = platformFeePerTicketPaise * ticketCount;       // ₹2 * ticketCount
  const fixedGatewayFeePaise = fixedGatewayFeePerTicketPaise * ticketCount; // ₹1 * ticketCount

  // 3% variable percentage on total base ticket price
  const variablePercentFeePaise = Math.round(basePricePaise * (surchargePercent / 100));

  // Total Convenience Fee = (3% variable) + (₹1 gateway fee) + (₹2 platform fee)
  const convenienceFeePaise = variablePercentFeePaise + fixedGatewayFeePaise + platformFeePaise;

  const totalChargedPaise = basePricePaise + convenienceFeePaise;
  const organizerGrossPaise = basePricePaise;
  const organizerNetPayoutPaise = basePricePaise;
  const gatewayTransactionDeductionPaise = variablePercentFeePaise + fixedGatewayFeePaise;

  return {
    basePricePaise,
    ticketCount,
    platformFeePaise,
    fixedGatewayFeePaise,
    variablePercentFeePaise,
    convenienceFeePaise,
    totalChargedPaise,
    organizerGrossPaise,
    organizerNetPayoutPaise,
    gatewayTransactionDeductionPaise,
    isFeePassedToCustomer: true,
    effectiveSurchargeRatePercent: surchargePercent.toFixed(1),
    currency: 'INR'
  };
}

function isRealKey(key?: string): boolean {
  if (!key) return false;
  const k = key.trim().toLowerCase();
  return k.length > 5 && !k.includes('your_') && !k.includes('placeholder') && !k.includes('change_me');
}

function allowSimulationMode(): boolean {
  return process.env.ENABLE_PAYMENT_SIMULATION === 'true';
}

function getSystemBaseUrl(): string {
  if (process.env.BASE_URL && !process.env.BASE_URL.includes('localhost:5000') && !process.env.BASE_URL.includes('127.0.0.1')) {
    return process.env.BASE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.BASE_URL || 'http://localhost:5000';
}

export class CashfreeAdapter {
  appId: string;
  secretKey: string;
  env: string;
  apiVersion: string;
  baseUrl: string;

  constructor() {
    this.appId = process.env.CASHFREE_APP_ID || '';
    this.secretKey = process.env.CASHFREE_SECRET_KEY || '';
    this.env = (process.env.CASHFREE_ENV || 'TEST').toUpperCase();
    this.apiVersion = process.env.CASHFREE_API_VERSION || '2023-08-01';
    this.baseUrl = (this.env === 'PROD' || this.env === 'PRODUCTION')
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  calculateFeeBreakdown(params: any): FeeSplitResult {
    return computeSplitRules(params);
  }

  async createOrder({ amountPaise, currency, customer, splitDetails, orderId }: any) {
    const gatewayOrderId = `order_cf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const organizerShareRupees = Number((splitDetails.organizerNetPayoutPaise / 100).toFixed(2));
    
    const vendorSplits = [
      {
        vendor_id: splitDetails.tenantGatewayAccountId || 'cf_vendor_default',
        amount: organizerShareRupees
      }
    ];

    const payload: any = {
      order_id: gatewayOrderId,
      order_amount: Number((amountPaise / 100).toFixed(2)),
      order_currency: currency || 'INR',
      customer_details: {
        customer_id: `cust_${customer.phone?.replace(/[^0-9]/g, '') || Date.now()}`,
        customer_name: customer.name || 'Guest Attendee',
        customer_phone: (customer.phone || '9876543210').slice(-10),
        customer_email: customer.email || 'tickets@platform.com'
      },
      order_meta: {
        return_url: `${getSystemBaseUrl()}/order-summary?order_id={order_id}`,
        notify_url: `${getSystemBaseUrl()}/api/webhooks/cashfree`
      }
    };

    if (isRealKey(this.appId) && isRealKey(this.secretKey)) {
      try {
        const res = await fetch(`${this.baseUrl}/orders`, {
          method: 'POST',
          headers: {
            'x-client-id': this.appId,
            'x-client-secret': this.secretKey,
            'x-api-version': this.apiVersion,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (res.ok && data.payment_session_id) {
          return {
            success: true,
            gateway: 'CASHFREE',
            env: this.env === 'PROD' ? 'production' : 'sandbox',
            gatewayOrderId: data.order_id,
            paymentSessionId: data.payment_session_id,
            amountPaise,
            currency: currency || 'INR',
            vendorSplits,
            superAdminCutPaise: splitDetails.platformFeePaise,
            organizerNetSharePaise: splitDetails.organizerNetPayoutPaise,
            checkoutConfig: payload
          };
        } else {
          throw new Error(data.message || 'Cashfree API credentials rejected.');
        }
      } catch (err: any) {
        throw new Error(`Payment Gateway Error: ${err.message}`);
      }
    }

    if (!allowSimulationMode()) {
      throw new Error('Payment Gateway Configuration Error: CASHFREE_APP_ID and CASHFREE_SECRET_KEY environment variables are missing or unconfigured. Please configure payment credentials in .env or set ENABLE_PAYMENT_SIMULATION=true for testing.');
    }

    return {
      success: true,
      gateway: 'CASHFREE',
      env: 'simulation',
      gatewayOrderId,
      paymentSessionId: null,
      amountPaise,
      currency: currency || 'INR',
      superAdminCutPaise: splitDetails.platformFeePaise,
      organizerNetSharePaise: splitDetails.organizerNetPayoutPaise,
      checkoutConfig: payload
    };
  }

  async verifyPayment({ orderId, paymentId }: any) {
    if (isRealKey(this.appId) && isRealKey(this.secretKey)) {
      try {
        const res = await fetch(`${this.baseUrl}/orders/${orderId}`, {
          headers: {
            'x-client-id': this.appId,
            'x-client-secret': this.secretKey,
            'x-api-version': this.apiVersion
          }
        });
        const data = await res.json();
        if (res.ok && (data.order_status === 'PAID' || data.order_status === 'SUCCESS')) {
          return {
            success: true,
            gateway: 'CASHFREE',
            paymentId: data.cf_order_id || paymentId || `pay_cf_${Date.now()}`,
            verifiedAt: new Date().toISOString()
          };
        }

        // Secondary check: query /orders/{order_id}/payments array
        try {
          const paymentsRes = await fetch(`${this.baseUrl}/orders/${orderId}/payments`, {
            headers: {
              'x-client-id': this.appId,
              'x-client-secret': this.secretKey,
              'x-api-version': this.apiVersion
            }
          });
          const paymentsData = await paymentsRes.json();
          if (paymentsRes.ok && Array.isArray(paymentsData)) {
            const successfulPayment = paymentsData.find(p => p.payment_status === 'SUCCESS');
            if (successfulPayment) {
              return {
                success: true,
                gateway: 'CASHFREE',
                paymentId: successfulPayment.cf_payment_id || paymentId || `pay_cf_${Date.now()}`,
                verifiedAt: new Date().toISOString()
              };
            }
          }
        } catch (subErr) {
          console.warn('Cashfree payments list lookup warning:', subErr);
        }

        return {
          success: false,
          error: data.message || `Cashfree payment status is ${data?.order_status || 'UNPAID'}.`
        };
      } catch (err: any) {
        return { success: false, error: `Cashfree payment verification error: ${err.message}` };
      }
    }

    if (!allowSimulationMode()) {
      return {
        success: false,
        error: 'Payment Verification Error: CASHFREE_APP_ID and CASHFREE_SECRET_KEY environment variables are not configured in environment.'
      };
    }

    return {
      success: true,
      gateway: 'CASHFREE',
      paymentId: paymentId || `pay_cf_sim_${Date.now()}`,
      verifiedAt: new Date().toISOString()
    };
  }
}

export class RazorpayAdapter {
  keyId: string;
  keySecret: string;

  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID || '';
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  }

  calculateFeeBreakdown(params: any): FeeSplitResult {
    return computeSplitRules(params);
  }

  async createOrder({ amountPaise, currency, customer, splitDetails, orderId }: any) {
    const gatewayOrderId = `order_rzp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    if (!isRealKey(this.keyId) && !allowSimulationMode()) {
      throw new Error('Payment Gateway Configuration Error: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables are missing or unconfigured. Please configure payment credentials in .env or set ENABLE_PAYMENT_SIMULATION=true for testing.');
    }

    return {
      success: true,
      gateway: 'RAZORPAY',
      gatewayOrderId,
      amountPaise,
      currency: currency || 'INR',
      superAdminCutPaise: splitDetails.platformFeePaise,
      organizerNetSharePaise: splitDetails.organizerNetPayoutPaise
    };
  }

  async verifyPayment({ orderId, paymentId }: any) {
    if (!isRealKey(this.keyId) && !allowSimulationMode()) {
      return {
        success: false,
        error: 'Payment Verification Error: RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables are not configured in environment.'
      };
    }

    return {
      success: true,
      gateway: 'RAZORPAY',
      paymentId: paymentId || `pay_rzp_${Date.now()}`,
      verifiedAt: new Date().toISOString()
    };
  }
}

export class PaymentServiceEngine {
  cashfree: CashfreeAdapter;
  razorpay: RazorpayAdapter;

  constructor() {
    this.cashfree = new CashfreeAdapter();
    this.razorpay = new RazorpayAdapter();
  }

  getAdapter(gatewayType = 'CASHFREE') {
    return gatewayType.toUpperCase() === 'RAZORPAY' ? this.razorpay : this.cashfree;
  }
}

export const PaymentService = new PaymentServiceEngine();
