import {
  createPaytmPayment,
  verifyPaytmCallback,
  checkPaytmStatus,
  getPaytmConfig
} from '@/Services/PaytmService';

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
  const surchargePercent = parseFloat(platformSettings.gateway_surcharge_percent || '0.0');
  const fixedGatewayFeePerTicketPaise = parseInt(platformSettings.fixed_gateway_fee_paise || '0', 10);

  const platformFeePerTicketPaise = tenantConfig.default_platform_fee != null
    ? tenantConfig.default_platform_fee
    : (parseInt(platformSettings.default_commission_paise || '200', 10) || 200);

  const platformFeePaise = platformFeePerTicketPaise * ticketCount;
  const fixedGatewayFeePaise = fixedGatewayFeePerTicketPaise * ticketCount;
  const variablePercentFeePaise = Math.round(basePricePaise * (surchargePercent / 100));
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

export class PaytmAdapter {
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
    tenantName,
    isMobile,
    callbackUrl
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
    tenantName?: string;
    isMobile?: boolean;
    callbackUrl?: string;
  }) {
    const amountRupees = Number((amountPaise / 100).toFixed(2));

    const paytmData = await createPaytmPayment({
      orderId,
      amount: amountRupees,
      customerPhone: customer?.phone,
      customerEmail: customer?.email,
      customerId: customer?.phone || `CUST_${orderId}`,
      isMobile: !!isMobile,
      callbackUrl
    });

    return {
      success: true,
      gateway: 'PAYTM',
      env: paytmData.paytmParams.WEBSITE,
      gatewayOrderId: orderId,
      paymentSessionId: orderId,
      processTxnUrl: paytmData.processTxnUrl,
      paytmParams: paytmData.paytmParams,
      checksum: paytmData.checksum,
      amountPaise,
      currency: currency || 'INR',
      superAdminCutPaise: splitDetails.platformFeePaise,
      organizerNetSharePaise: splitDetails.organizerNetPayoutPaise
    };
  }

  async verifyPayment(postData: any) {
    return verifyPaytmCallback(postData);
  }

  async checkStatus(orderId: string) {
    return checkPaytmStatus(orderId);
  }
}

export class PaymentServiceEngine {
  paytm: PaytmAdapter;

  constructor() {
    this.paytm = new PaytmAdapter();
  }

  getAdapter(gatewayType = 'PAYTM'): PaytmAdapter {
    return this.paytm;
  }
}

export const PaymentService = new PaymentServiceEngine();
