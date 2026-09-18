import Link from 'next/link';

export default function RefundsAndCancellationsPage() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px', color: 'var(--text-muted)' }}>
      {/* Header Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/" style={{ color: '#818cf8', textDecoration: 'none', fontSize: '0.85rem' }}>
          ← Back to Home
        </Link>
      </div>

      <div style={{ marginBottom: 32 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          CUSTOMER PROTECTION & REFUND POLICY
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: 4, color: '#ffffff' }}>
          Refunds & Cancellations Policy
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginTop: 4 }}>
          Last Updated: September 18, 2026
        </p>
      </div>

      <div className="glass-panel" style={{ padding: 32, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 24, fontSize: '0.9rem', lineHeight: 1.6 }}>
        
        {/* Compliance Banner */}
        <div style={{ background: 'rgba(52, 211, 153, 0.12)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: 16, borderRadius: 10, color: '#ffffff' }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#34d399', marginBottom: 4 }}>
            ⏱️ Refund Processing Timeline Notice
          </div>
          <div>
            Approved refunds for eligible transactions are automatically credited back to the customer's original payment source (UPI, Credit/Debit Card, Net Banking) within <b>5 to 7 business days</b>.
          </div>
        </div>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            1. General Ticket Cancellation Policy
          </h2>
          <p>
            Unless explicitly specified otherwise on the event page by the respective Event Organizer, all confirmed ticket purchases are final, non-cancellable, and non-refundable.
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>No refunds are provided for customer no-shows or voluntary cancellations.</li>
            <li>Tickets may be transferred or assigned to another guest by updating attendee names prior to the event start date.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            2. Event Cancellation, Rescheduling or Postponement
          </h2>
          <p>
            If an event is officially cancelled in its entirety by the Event Organizer without a rescheduled date:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>A <b>100% full refund</b> of the ticket base price in <b>INR (₹)</b> will be initiated automatically to the buyer's original payment mode.</li>
            <li>If an event is rescheduled to a new date, existing tickets remain valid for the new date. Customers unable to attend the rescheduled date may request a refund within 48 hours of the announcement by contacting support.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            3. Failed Transactions & Double Deduction Refunds
          </h2>
          <p>
            In rare cases where money is debited from a customer's bank account or UPI app but ticket confirmation fails due to network timeouts:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Payment gateways (Cashfree / Razorpay) perform an automatic reconciliation.</li>
            <li>Debited funds for unconfirmed orders are automatically refunded to the original payment instrument within <b>5 to 7 working days</b>.</li>
            <li>If your bank account was debited and you did not receive a ticket pass or refund after 7 business days, please email <b>support@platform.com</b> with your UTR / Payment Reference Number.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            4. Refund Mode & Currency
          </h2>
          <p>
            All refunds are processed in <b>Indian Rupees (INR - ₹)</b> and credited back exclusively through the payment method used during checkout (Card, UPI ID, Net Banking account). Cash refunds are strictly prohibited.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            5. Contacting Helpdesk for Refund Queries
          </h2>
          <p>
            If you need assistance regarding a payment or refund status, please get in touch:
            <br />
            📧 <b>Email:</b> support@platform.com
            <br />
            📞 <b>Phone:</b> +91 98765 43210 (Mon–Sat, 9 AM – 6 PM IST)
          </p>
        </section>

      </div>
    </div>
  );
}
