import Link from 'next/link';
import { MERCHANT_CONFIG, SITE_CONFIG, NAV_LINKS } from '@/lib/constants';

export const metadata = {
  title: `Privacy Policy - ${MERCHANT_CONFIG.legalName}`,
  description: `Privacy Policy for ${MERCHANT_CONFIG.legalName} ticketing operations at ${MERCHANT_CONFIG.operatingVenue}.`
};

export default function PrivacyPolicyPage() {
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
          DATA PROTECTION &amp; PRIVACY COMPLIANCE
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: 4, color: '#ffffff' }}>
          Privacy Policy
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginTop: 4 }}>
          Last Updated: September 18, 2026
        </p>
      </div>

      <div className="glass-panel" style={{ padding: 32, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 24, fontSize: '0.92rem', lineHeight: 1.6 }}>
        
        {/* Merchant Notice Banner */}
        <div style={{ background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', padding: 18, borderRadius: 10, color: '#ffffff' }}>
          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#818cf8', marginBottom: 4 }}>
            🛡️ Privacy &amp; Data Controller Notice
          </div>
          <div style={{ fontSize: '0.88rem', color: '#e2e8f0' }}>
            This platform is operated by <b>{MERCHANT_CONFIG.legalName}</b> (Operating Venue: <b>{MERCHANT_CONFIG.operatingVenue}</b>, Helpline: <b>{MERCHANT_CONFIG.phoneDisplay}</b>). We are deeply committed to protecting your personal information and handling your data with absolute integrity and confidentiality.
          </div>
        </div>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            1. Information We Collect
          </h2>
          <p>
            When you browse our platform, reserve seats, purchase event tickets, or contact our support team, we collect the following categories of information:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li><b>Contact Details:</b> Full name, mobile phone number, and email address provided during ticket checkout.</li>
            <li><b>Attendee Verification Info:</b> Attendee names, age brackets, and designated guest identifiers for gate check-in admission.</li>
            <li><b>Transaction Data:</b> Order ID, ticket tier selected, timestamp of booking, payment gateway transaction reference, and settlement amount in {SITE_CONFIG.currency} ({SITE_CONFIG.currencySymbol}).</li>
            <li><b>Delivery Identifiers:</b> WhatsApp mobile number used exclusively to deliver digital entry passes and receipt templates.</li>
            <li><b>Technical Data:</b> Browser user agent, IP address, and cookie tokens used to maintain secure 10-minute cart reservation holds.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            2. How We Use Your Information
          </h2>
          <p>
            Your information is utilized strictly for legitimate business and ticketing operations:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>To generate and issue cryptographically signed QR entry tickets upon payment completion.</li>
            <li>To dispatch digital ticket passes and booking receipts directly via SMS, Email, and WhatsApp.</li>
            <li>To verify attendee identity and validate QR passes at event entry scanner gates (e.g. at {MERCHANT_CONFIG.operatingVenue}).</li>
            <li>To process legitimate reconciliations in accordance with our Refund &amp; Cancellation Policy.</li>
            <li>To maintain audit trails required for financial reconciliation and taxation compliance in India.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            3. Payment Information &amp; Security (PCI-DSS)
          </h2>
          <p>
            We prioritize financial security. <b>We do NOT store, process, or capture your credit/debit card numbers, CVVs, net banking passwords, or UPI PINs on our servers.</b>
          </p>
          <p style={{ marginTop: 8 }}>
            All payment transactions are processed through RBI-authorized, PCI-DSS Level 1 compliant payment gateways (Paytm Payment Gateway). All data transmission during checkout is secured using 256-bit TLS/SSL encryption.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            4. Information Sharing &amp; Third Parties
          </h2>
          <p>
            We strictly do not sell, rent, or trade your personal data to advertisers or third-party brokers. We share your data solely with:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li><b>Event Organizers:</b> Attendee names and ticket tier details necessary for venue entry and security screening.</li>
            <li><b>Payment Processors:</b> Regulated payment aggregators (Paytm Payment Gateway) for transaction settlement.</li>
            <li><b>Communication Providers:</b> Meta WhatsApp Business API for automated ticket delivery.</li>
            <li><b>Legal Authorities:</b> When mandated by applicable Indian laws, court orders, or law enforcement requests.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            5. Data Retention &amp; Your Rights
          </h2>
          <p>
            We retain booking logs and ticket audit records as necessary to fulfill event gate check-ins and legal/accounting obligations. You have the right to request access to your booking records, request correction of inaccurate phone numbers before event gates open, or inquire about your data by contacting us.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            6. Contact Data Protection Officer
          </h2>
          <p>
            For any questions, concerns, or grievances regarding this Privacy Policy or your data handling, please contact:
          </p>
          <div style={{ marginTop: 10, background: 'rgba(15, 23, 42, 0.6)', padding: 16, borderRadius: 8, border: '1px solid var(--border-glass)', lineHeight: 1.6 }}>
            <div><b>Merchant:</b> {MERCHANT_CONFIG.legalName}</div>
            <div><b>Address:</b> {MERCHANT_CONFIG.fullAddress}</div>
            <div><b>Helpline Numbers:</b> {MERCHANT_CONFIG.phoneDisplay}</div>
            <div><b>Email:</b> {MERCHANT_CONFIG.supportEmail}</div>
          </div>
        </section>

      </div>
    </div>
  );
}
