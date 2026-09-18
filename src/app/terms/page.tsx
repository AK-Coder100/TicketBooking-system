import Link from 'next/link';

export default function TermsAndConditionsPage() {
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
          LEGAL & COMPLIANCE
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: 4, color: '#ffffff' }}>
          Terms & Conditions
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginTop: 4 }}>
          Last Updated: September 18, 2026
        </p>
      </div>

      <div className="glass-panel" style={{ padding: 32, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 24, fontSize: '0.9rem', lineHeight: 1.6 }}>
        
        {/* Compliance Banner */}
        <div style={{ background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', padding: 16, borderRadius: 10, color: '#ffffff' }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#818cf8', marginBottom: 4 }}>
            🇮🇳 Currency & Product Pricing Notice
          </div>
          <div>
            All ticket prices, convenience fees, and transaction amounts displayed on this platform are listed and processed exclusively in **Indian Rupees (INR - ₹)**.
          </div>
        </div>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            1. Introduction & Acceptance of Terms
          </h2>
          <p>
            Welcome to TicketBooking Platform ("we", "us", "our"). By accessing or using our website, purchasing event tickets, or generating digital QR entry passes, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            2. Services Offered & Product Listing
          </h2>
          <p>
            TicketBooking Platform operates a multi-tenant ticketing software solution that enables event organizers ("Tenants") to list live music festivals, technology summits, comedy shows, and corporate events, and enables buyers ("Customers") to purchase digital ticket passes.
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Products/Services offered: Event admission tickets, VIP passes, multi-day festival passes, and digital entry passes.</li>
            <li>All products and services listed on this platform are priced and payable in <b>INR (₹)</b>.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            3. Ticket Purchasing & Convenience Fees
          </h2>
          <p>
            When purchasing a ticket, customers agree to pay the total ticket base price along with applicable convenience fees (which include payment gateway processing charges and platform fees).
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Standard Convenience Fee structure: <b>3% variable surcharge + ₹1 gateway fee + ₹2 platform fee</b> per ticket, added transparently at checkout.</li>
            <li>Ticket reservations are held for a maximum of <b>10 minutes</b> during checkout. If payment is not completed within 10 minutes, reserved tickets are released back to public inventory.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            4. Digital QR Tickets & Gate Admission
          </h2>
          <p>
            Upon successful payment authorization, customers receive cryptographically signed QR tickets on-screen, downloadable as PDF/PNG, and dispatched via WhatsApp.
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8 }}>
            <li>Each QR code contains an encrypted token used by gate scanners at the event venue.</li>
            <li>Tickets are single-use by default unless an authorized event manager grants an explicit check-in override.</li>
            <li>Customers must carry a valid government-issued ID matching the attendee name specified during booking.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            5. Role of Platform vs. Event Organizer
          </h2>
          <p>
            The platform acts solely as an intermediary technology aggregator for ticket booking and payment split settlement. The respective <b>Event Organizer</b> is solely responsible for event execution, venue security, artist lineups, and performance schedules.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            6. Payment Security & Payment Gateways
          </h2>
          <p>
            All online transactions are securely encrypted and processed through RBI-authorized payment gateways including Cashfree Payments and Razorpay. We do not store raw credit card numbers or UPI PINs on our servers.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            7. Governing Law & Jurisdiction
          </h2>
          <p>
            These Terms & Conditions are governed by the laws of India. Any legal proceedings or disputes arising from the use of this platform shall be subject to the exclusive jurisdiction of courts located in Bengaluru, Karnataka, India.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            8. Contact Details
          </h2>
          <p>
            For questions regarding these Terms & Conditions, please contact us at:
            <br />
            📧 <b>Email:</b> support@platform.com | 📞 <b>Phone:</b> +91 98765 43210
          </p>
        </section>
      </div>
    </div>
  );
}
