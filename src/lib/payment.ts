import {
  createPaymentSession,
  validateUtr,
  validateVpa
} from '@/Services/UpiService';

export interface UpiSession {
  orderId: string;
  amount: number;
  currency: string;
  merchantUpiId: string;
  merchantName: string;
  upiLink: string;
  qrCode: string;
  appLinks: {
    generic: string;
    gpay: string;
    phonepe: string;
    paytm: string;
    bhim: string;
    cred: string;
  };
  status: string;
  createdAt: string;
  expiresAt: string;
}

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
  // UPI surcharge or platform settings variable percentage
  const surchargePercent = parseFloat(platformSettings.gateway_surcharge_percent || '0.0');

  // Fixed fee per ticket (default 0 or configured)
  const fixedGatewayFeePerTicketPaise = parseInt(platformSettings.fixed_gateway_fee_paise || '0', 10);

  // Platform fee per ticket
  const platformFeePerTicketPaise = tenantConfig.default_platform_fee != null
    ? tenantConfig.default_platform_fee
    : (parseInt(platformSettings.default_commission_paise || '200', 10) || 200);

  const platformFeePaise = platformFeePerTicketPaise * ticketCount;
  const fixedGatewayFeePaise = fixedGatewayFeePerTicketPaise * ticketCount;

  // Variable percentage on total base ticket price
  const variablePercentFeePaise = Math.round(basePricePaise * (surchargePercent / 100));

  // Total Convenience Fee = variable + fixed gateway + platform fee
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

export class UpiAdapter {
  calculateFeeBreakdown(params: any): FeeSplitResult {
    return computeSplitRules(params);
  }

  async createOrder({
    amountPaise,
    currency,
    customer,
    splitDetails,
    orderId,
    eventTitle,
    tenantUpiId,
    tenantName
  }: {
    amountPaise: number;
    currency?: string;
    customer?: { name?: string; phone?: string; email?: string };
    splitDetails: {
      tenantGatewayAccountId?: string;
      platformFeePaise: number;
      organizerNetPayoutPaise: number;
    };
    orderId: string;
    eventTitle?: string;
    tenantUpiId?: string;
    tenantName?: string;
  }) {
    const amountRupees = Number((amountPaise / 100).toFixed(2));

    // Determine payee VPA: tenant specific if valid, otherwise system merchant UPI ID
    const payeeVpa = (tenantUpiId && validateVpa(tenantUpiId))
      ? tenantUpiId
      : (splitDetails.tenantGatewayAccountId && validateVpa(splitDetails.tenantGatewayAccountId))
        ? splitDetails.tenantGatewayAccountId
        : undefined;

    const payeeName = tenantName || undefined;
    const note = `Booking ${orderId}${eventTitle ? ` - ${eventTitle}` : ''}`.slice(0, 50);

    const session: UpiSession = await createPaymentSession({
      amount: amountRupees,
      orderId,
      note,
      payeeVpa,
      payeeName,
      expiresInMinutes: 15
    });

    return {
      success: true,
      gateway: 'UPI',
      env: 'direct_upi',
      gatewayOrderId: session.orderId,
      paymentSessionId: session.orderId,
      upiSession: session,
      qrCode: session.qrCode,
      upiLink: session.upiLink,
      appLinks: session.appLinks,
      merchantUpiId: session.merchantUpiId,
      merchantName: session.merchantName,
      amountPaise,
      currency: currency || 'INR',
      superAdminCutPaise: splitDetails.platformFeePaise,
      organizerNetSharePaise: splitDetails.organizerNetPayoutPaise
    };
  }

  async verifyPayment({
    orderId,
    paymentId,
    utr
  }: {
    orderId: string;
    paymentId?: string;
    utr?: string;
  }) {
    // If a 12-digit UTR is provided, strictly validate its Indian banking format
    if (utr) {
      const cleanUtr = String(utr).trim();
      if (!validateUtr(cleanUtr)) {
        return {
          success: false,
          error: 'Invalid 12-digit UPI UTR / RRN number. Please verify from your UPI app (Google Pay, PhonePe, Paytm).'
        };
      }
      return {
        success: true,
        gateway: 'UPI',
        paymentId: `utr_${cleanUtr}`,
        utr: cleanUtr,
        verifiedAt: new Date().toISOString()
      };
    }

    // Default successful verification for user confirmation / simulated UPI callback
    const fallbackPaymentId = paymentId || `upi_pay_${Date.now()}`;
    return {
      success: true,
      gateway: 'UPI',
      paymentId: fallbackPaymentId,
      verifiedAt: new Date().toISOString()
    };
  }
}

export class PaymentServiceEngine {
  upi: UpiAdapter;

  constructor() {
    this.upi = new UpiAdapter();
  }

  getAdapter(gatewayType = 'UPI'): UpiAdapter {
    // Return UPI adapter for all requests
    return this.upi;
  }
}

export const PaymentService = new PaymentServiceEngine();
