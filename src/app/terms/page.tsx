import Link from 'next/link';
import { MERCHANT_CONFIG, SITE_CONFIG, NAV_LINKS } from '@/lib/constants';

export const metadata = {
  title: `Terms & Conditions - ${MERCHANT_CONFIG.legalName}`,
  description: `Terms and Conditions for ticket purchases, admissions, and platform usage with ${MERCHANT_CONFIG.legalName}, ${MERCHANT_CONFIG.operatingVenue}.`
};

export default function TermsAndConditionsPage() {
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px', color: 'var(--text-muted)' }}>
      {/* Header Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href={NAV_LINKS.home} style={{ color: '#818cf8', textDecoration: 'none', fontSize: '0.85rem' }}>
          ← Back to Home
        </Link>
      </div>

      <div style={{ marginBottom: 32 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          LEGAL &amp; COMPLIANCE
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: 4, color: '#ffffff' }}>
          Terms &amp; Conditions
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginTop: 4 }}>
          Last Updated: September 18, 2026
        </p>
      </div>

      <div className="glass-panel" style={{ padding: 32, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 24, fontSize: '0.92rem', lineHeight: 1.6 }}>
        
        {/* Compliance Banner */}
        <div style={{ background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', padding: 18, borderRadius: 10, color: '#ffffff' }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#818cf8', marginBottom: 4 }}>
            🇮🇳 Legal Merchant Identity &amp; Currency Notice
          </div>
          <div>
            This platform is owned and operated by <b>{MERCHANT_CONFIG.legalName}</b> (Operating Venue: <b>{MERCHANT_CONFIG.operatingVenue}</b>, Helpline: <b>{MERCHANT_CONFIG.phoneDisplay}</b>). All ticket prices, convenience fees, and transaction amounts displayed on this platform are listed and processed exclusively in <b>{SITE_CONFIG.currency} ({SITE_CONFIG.currencySymbol})</b>.
          </div>
        </div>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            1. Introduction &amp; Acceptance of Terms
          </h2>
          <p>
            Welcome to {SITE_CONFIG.name} operated by <b>{MERCHANT_CONFIG.legalName}</b> ("we", "us", "our"). By accessing our website, reserving tickets, making payments, or utilizing digital QR passes for event admission, you unconditionally agree to these Terms and Conditions.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            2. Services Offered &amp; Product Listing
          </h2>
          <p>
            We operate a multi-tenant live event ticketing aggregator allowing organizers to host event listings and attendees to purchase admission passes for music concerts, cultural festivals, comedy specials, and corporate conclaves.
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Products/Services: Event entry passes, VIP passes, early-bird tickets, and multi-day festival admissions.</li>
            <li>All prices and surcharges are clearly listed in <b>{SITE_CONFIG.currency} ({SITE_CONFIG.currencySymbol})</b> prior to checkout.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            3. Pricing Transparency &amp; Convenience Fees
          </h2>
          <p>
            When purchasing a ticket, customers agree to pay the total ticket base price along with applicable convenience fees:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Standard Fee structure: <b>3% variable gateway surcharge + ₹1 gateway fee + ₹2 platform fee</b> per ticket, transparently itemized on the checkout page.</li>
            <li>Seat holds and tier reservations remain active for <b>10 minutes</b> during checkout. If payment is uncompleted within this window, inventory is released.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            4. Digital QR Tickets &amp; Gate Admission Policy
          </h2>
          <p>
            Upon successful payment authorization, customers receive cryptographically signed QR tickets on-screen, downloadable as PNG/PDF passes, and dispatched via WhatsApp.
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Each QR code contains a high-entropy HMAC-SHA256 encrypted security token scanned at event gates (e.g. at {MERCHANT_CONFIG.operatingVenue}).</li>
            <li>Each ticket is single-admission unless explicitly granted re-entry clearance by venue security.</li>
            <li>Attendees must carry a valid photo ID matching the attendee name declared during purchase.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            5. Strict No Refunds &amp; No Cancellations Policy
          </h2>
          <p>
            All ticket sales, admission passes, and bookings are <b>final, non-refundable, and non-cancellable</b> once confirmed:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li><b>No Cancellations:</b> We do not support voluntary order cancellations, change-of-mind refunds, or date exchanges.</li>
            <li><b>Organizer Cancellation:</b> If an event is officially cancelled in its entirety by the organizer without a rescheduled date, the ticket base price will be refunded to the original payment source.</li>
            <li><b>Payment Reconciliations:</b> Unclaimed deductions from technical gateway timeouts are automatically refunded within <b>5–7 business days</b>.</li>
            <li>For complete details, please visit our <Link href={NAV_LINKS.refunds} style={{ color: '#818cf8' }}>Refund &amp; Cancellation Policy</Link>.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            6. Payment Gateway Compliance
          </h2>
          <p>
            All online transactions are processed through authorized payment aggregators (Cashfree Payments and Razorpay) using 256-bit SSL encryption. We do not store raw credit card numbers or UPI PINs.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            7. Governing Law &amp; Jurisdiction
          </h2>
          <p>
            These Terms &amp; Conditions are governed by and construed in accordance with the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts located in {MERCHANT_CONFIG.city} / {MERCHANT_CONFIG.state}, India.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            8. Merchant Contact Details
          </h2>
          <div style={{ marginTop: 8, background: 'rgba(15, 23, 42, 0.6)', padding: 16, borderRadius: 8, border: '1px solid var(--border-glass)', lineHeight: 1.6 }}>
            <div><b>Merchant Legal Name:</b> {MERCHANT_CONFIG.legalName}</div>
            <div><b>Operating Venue / Address:</b> {MERCHANT_CONFIG.fullAddress}</div>
            <div><b>Helpline Numbers:</b> {MERCHANT_CONFIG.phoneDisplay}</div>
            <div><b>Email:</b> {MERCHANT_CONFIG.supportEmail}</div>
          </div>
        </section>
      </div>
    </div>
  );
}
