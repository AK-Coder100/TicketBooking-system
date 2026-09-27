import Link from 'next/link';
import { MERCHANT_CONFIG, SITE_CONFIG, NAV_LINKS } from '@/lib/constants';

export const metadata = {
  title: `Refund & Cancellation Policy - No Refunds - ${MERCHANT_CONFIG.legalName}`,
  description: `Official No Refunds and No Cancellations Policy for event ticket purchases with ${MERCHANT_CONFIG.legalName}, ${MERCHANT_CONFIG.operatingVenue}.`
};

export default function RefundsAndCancellationsPage() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px', color: 'var(--text-muted)' }}>
      {/* Header Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href={NAV_LINKS.home} style={{ color: '#818cf8', textDecoration: 'none', fontSize: '0.85rem' }}>
          ← Back to Home
        </Link>
      </div>

      <div style={{ marginBottom: 32 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          CUSTOMER POLICY &amp; PURCHASE TERMS
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: 4, color: '#ffffff' }}>
          Refund &amp; Cancellation Policy
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginTop: 4 }}>
          Last Updated: September 18, 2026
        </p>
      </div>

      <div className="glass-panel" style={{ padding: 32, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 24, fontSize: '0.92rem', lineHeight: 1.6 }}>

        {/* Strict No Refunds Banner */}
        <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', padding: 20, borderRadius: 12, color: '#ffffff' }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#f87171', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            ⛔ <span>Strict No Refunds &amp; No Cancellations Policy</span>
          </div>
          <div style={{ fontSize: '0.9rem', color: '#fecaca', lineHeight: 1.5 }}>
            All event ticket sales, VIP passes, and digital admission passes purchased through {SITE_CONFIG.name} are <b>strictly non-refundable and non-cancellable</b>. Once an order is confirmed and payment is completed, no cancellations, refunds, or chargebacks will be entertained under any normal circumstances.
          </div>
        </div>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            1. All Ticket Sales Are Final
          </h2>
          <p>
            Tickets once booked and confirmed cannot be cancelled, returned, exchanged, or refunded. By proceeding with the payment at checkout, the customer explicitly acknowledges and agrees that:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li><b>No Voluntary Cancellations:</b> We do not support voluntary order cancellations or refund requests initiated by customers.</li>
            <li><b>No Change of Mind / Schedule Conflicts:</b> Inability to attend the event due to personal reasons, scheduling conflicts, illness, weather conditions, or travel delays does not entitle the ticket holder to any refund or credit.</li>
            <li><b>No-Show Policy:</b> Failure to attend the event on the scheduled date and time will result in forfeiture of the entire booking amount.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            2. Ticket Transfers &amp; Guest Assignment
          </h2>
          <p>
            While tickets are non-refundable, tickets may be utilized by another attendee provided they carry the valid digital QR entry pass (PNG / PDF) and arrive at the designated gate scanner before admission capacity is fulfilled.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            3. Official Event Cancellation by Organizer
          </h2>
          <p>
            In the unforeseen circumstance that an event is <b>officially cancelled in its entirety</b> by the Event Organizer without any rescheduled date:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>The ticket base price in <b>{SITE_CONFIG.currency} ({SITE_CONFIG.currencySymbol})</b> will be refunded back to the original source payment instrument (UPI / Card / Net Banking) used at checkout.</li>
            <li>Refund processing takes approximately <b>5 to 7 business days</b> to reflect in the customer&apos;s bank account.</li>
            <li>Convenience fees and payment gateway processing charges already incurred are non-refundable.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            4. Technical Payment Deductions / Failed Orders
          </h2>
          <p>
            If money was debited from your bank account or UPI application but an order failed to generate a ticket due to a network timeout:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Payment gateways (Paytm Payment Gateway) perform automated daily reconciliation.</li>
            <li>Unclaimed deducted funds are automatically reversed to the original payment source within <b>5 to 7 working days</b>.</li>
            <li>For payment verification support, contact our helpline with your bank transaction reference / UTR number.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            5. Merchant Identity &amp; Contact Information
          </h2>
          <div style={{ marginTop: 8, background: 'rgba(15, 23, 42, 0.6)', padding: 18, borderRadius: 10, border: '1px solid var(--border-glass)', lineHeight: 1.6 }}>
            <div><b>Merchant Legal Name:</b> {MERCHANT_CONFIG.legalName}</div>
            <div><b>Operating Venue / Address:</b> {MERCHANT_CONFIG.fullAddress}</div>
            <div><b>Helpline Numbers:</b> {MERCHANT_CONFIG.phoneDisplay}</div>
            <div><b>Support Email:</b> {MERCHANT_CONFIG.supportEmail}</div>
            <div><b>Support Hours:</b> {MERCHANT_CONFIG.supportHours}</div>
          </div>
        </section>

      </div>
    </div>
  );
}
