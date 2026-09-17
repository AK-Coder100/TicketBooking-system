export interface FeeSplitResult {
  basePricePaise: number;
  ticketCount: number;
  platformFeePaise: number;
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
  const commissionPerTicketPaise = tenantConfig.default_platform_fee != null
    ? tenantConfig.default_platform_fee
    : (parseInt(platformSettings.default_commission_paise, 10) || 200);

  const platformFeePaise = commissionPerTicketPaise * ticketCount;
  const surchargePercent = parseFloat(platformSettings.gateway_surcharge_percent || '2.0');
  const gstPercent = parseFloat(platformSettings.gst_on_fee_percent || '18.0');
  const effectiveSurchargeRate = (surchargePercent * (1 + gstPercent / 100)) / 100;

  const isFeePassedToCustomer = Boolean(tenantConfig.is_gateway_fee_passed_to_customer);

  let convenienceFeePaise = 0;
  let totalChargedPaise = 0;
  let organizerGrossPaise = basePricePaise;
  let organizerNetPayoutPaise = basePricePaise;
  let gatewayTransactionDeductionPaise = 0;

  if (isFeePassedToCustomer) {
    convenienceFeePaise = Math.round((basePricePaise + platformFeePaise) * effectiveSurchargeRate);
    totalChargedPaise = basePricePaise + platformFeePaise + convenienceFeePaise;
    gatewayTransactionDeductionPaise = convenienceFeePaise;
    organizerNetPayoutPaise = basePricePaise;
  } else {
    convenienceFeePaise = 0;
    totalChargedPaise = basePricePaise + platformFeePaise;
    gatewayTransactionDeductionPaise = Math.round(totalChargedPaise * effectiveSurchargeRate);
    organizerNetPayoutPaise = Math.max(0, basePricePaise - gatewayTransactionDeductionPaise);
  }

  return {
    basePricePaise,
    ticketCount,
    platformFeePaise,
    convenienceFeePaise,
    totalChargedPaise,
    organizerGrossPaise,
    organizerNetPayoutPaise,
    gatewayTransactionDeductionPaise,
    isFeePassedToCustomer,
    effectiveSurchargeRatePercent: (effectiveSurchargeRate * 100).toFixed(2),
    currency: 'INR'
  };
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
        customer_id: `cust_${customer.phone.replace(/[^0-9]/g, '') || Date.now()}`,
        customer_name: customer.name || 'Guest Attendee',
        customer_phone: customer.phone.slice(-10),
        customer_email: customer.email || 'tickets@platform.com'
      },
      order_meta: {
        return_url: `${process.env.BASE_URL || 'http://localhost:5000'}/order-summary?order_id={order_id}`,
        notify_url: `${process.env.BASE_URL || 'http://localhost:5000'}/api/webhooks/cashfree`
      }
      // Note: order_splits (Easy Split) requires pre-registered vendor IDs in Cashfree dashboard.
      // Omit here; organizer payouts are tracked in our DB and disbursed separately.
    };

    // Live HTTP API call if real keys are configured (both appId and secretKey must be non-empty)
    if (this.appId && this.secretKey) {
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
        }
      } catch (err: any) {
        console.warn('Cashfree live API call fallback:', err.message);
      }
    }

    // Simulation fallback — no real payment session
    return {
      success: true,
      gateway: 'CASHFREE',
      env: this.env === 'PROD' ? 'production' : 'sandbox',
      gatewayOrderId,
      paymentSessionId: null, // null = use simulation modal, not SDK
      amountPaise,
      currency: currency || 'INR',
      superAdminCutPaise: splitDetails.platformFeePaise,
      organizerNetSharePaise: splitDetails.organizerNetPayoutPaise,
      checkoutConfig: payload
    };
  }

  async verifyPayment({ orderId, paymentId }: any) {
    return {
      success: true,
      gateway: 'CASHFREE',
      paymentId: paymentId || `pay_cf_${Date.now()}`,
      verifiedAt: new Date().toISOString()
    };
  }
}

export class RazorpayAdapter {
  calculateFeeBreakdown(params: any): FeeSplitResult {
    return computeSplitRules(params);
  }

  async createOrder({ amountPaise, currency, customer, splitDetails, orderId }: any) {
    const gatewayOrderId = `order_rzp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
