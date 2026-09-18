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
          CUSTOMER PROTECTION &amp; REFUND POLICY
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: 4, color: '#ffffff' }}>
          Refunds &amp; Cancellations Policy
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginTop: 4 }}>
          Last Updated: September 18, 2026
        </p>
      </div>

      <div className="glass-panel" style={{ padding: 32, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 24, fontSize: '0.9rem', lineHeight: 1.6 }}>

        {/* Cancellation Support Banner */}
        <div style={{ background: 'rgba(52, 211, 153, 0.12)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: 16, borderRadius: 10, color: '#ffffff' }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#34d399', marginBottom: 4 }}>
            ✅ Cancellations &amp; Refunds Are Supported
          </div>
          <div>
            We support cancellations and refunds on eligible orders. Approved refunds are automatically credited back to the customer's original payment source (UPI, Credit/Debit Card, Net Banking) within <b>5 to 7 business days</b>.
          </div>
        </div>

        {/* Organizer Dispute Liability Banner */}
        <div style={{ background: 'rgba(251, 146, 60, 0.12)', border: '1px solid rgba(251, 146, 60, 0.35)', padding: 16, borderRadius: 10, color: '#ffffff' }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fb923c', marginBottom: 4 }}>
            ⚠️ Event Disputes — Organizer Responsibility
          </div>
          <div>
            For any disputes, complaints, or issues arising from an event (including event cancellation, rescheduling, venue conditions, artist changes, or poor execution), the <b>Event Organizer is solely responsible</b>. TicketBooking Platform acts only as a technology intermediary and bears no liability for organizer actions or omissions.
          </div>
        </div>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            1. General Ticket Cancellation Policy
          </h2>
          <p>
            We support cancellations and refunds in eligible circumstances. Unless explicitly specified otherwise on the event page by the Event Organizer, confirmed ticket purchases follow the refund conditions outlined below.
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Voluntary cancellations by the customer are subject to the refund window defined by the Event Organizer on the event page.</li>
            <li>No refunds are provided for customer no-shows after the event has commenced.</li>
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
            <li>All responsibilities for event cancellation or rescheduling — including any financial compensation claims beyond the ticket price — lie solely with the <b>Event Organizer</b>. The platform is not liable for organizer-driven decisions.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            3. Event Disputes — Organizer is Responsible
          </h2>
          <p>
            TicketBooking Platform provides a technology platform for ticket discovery and purchase. Any dispute arising from the actual event experience is <b>entirely the responsibility of the Event Organizer</b>, including:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Event quality, artist lineup changes, or performance cancellations.</li>
            <li>Venue safety, security, and crowd management.</li>
            <li>Misleading or inaccurate event descriptions posted by the organizer.</li>
            <li>Delays, venue changes, or any operational failures on the event day.</li>
            <li>Any injuries, damages, or losses suffered at the venue.</li>
          </ul>
          <p style={{ marginTop: 12, background: 'rgba(251, 146, 60, 0.08)', border: '1px solid rgba(251, 146, 60, 0.25)', padding: 12, borderRadius: 8 }}>
            <b style={{ color: '#fb923c' }}>Note:</b> TicketBooking Platform is not a party to any event dispute between a customer and an Event Organizer. All such disputes must be resolved directly with the organizer. The platform facilitates refund processing only in cases where an organizer has officially cancelled an event or authorized a refund.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            4. Failed Transactions &amp; Double Deduction Refunds
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
            5. Refund Mode &amp; Currency
          </h2>
          <p>
            All refunds are processed in <b>Indian Rupees (INR - ₹)</b> and credited back exclusively through the payment method used during checkout (Card, UPI ID, Net Banking account). Cash refunds are strictly prohibited.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            6. How to Request a Cancellation or Refund
          </h2>
          <p>
            To raise a cancellation or refund request, follow these steps:
          </p>
          <ol style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Log in to your account and navigate to <b>My Bookings</b>.</li>
            <li>Select the booking you wish to cancel and click <b>&quot;Request Cancellation / Refund&quot;</b>.</li>
            <li>Provide a reason for your request and submit.</li>
            <li>Our support team will review and process eligible refunds within <b>5–7 business days</b>.</li>
          </ol>
          <p style={{ marginTop: 8 }}>
            Alternatively, contact our helpdesk directly (see Section 7 below) with your booking ID and payment reference.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            7. Contacting Helpdesk for Refund Queries
          </h2>
          <p>
            If you need assistance regarding a cancellation, payment, or refund status, please get in touch:
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
