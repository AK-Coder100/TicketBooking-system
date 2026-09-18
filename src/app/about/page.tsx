import Link from 'next/link';
import { MERCHANT_CONFIG, SITE_CONFIG, NAV_LINKS } from '@/lib/constants';

export const metadata = {
  title: `About Us - ${MERCHANT_CONFIG.legalName} (${SITE_CONFIG.name})`,
  description: `Learn about ${MERCHANT_CONFIG.legalName} ticketing operations at ${MERCHANT_CONFIG.operatingVenue}. Multi-tenant live event entry pass and ticketing solutions.`
};

export default function AboutUsPage() {
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
          ABOUT OUR BUSINESS &amp; TICKETING PLATFORM
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: 4, color: '#ffffff' }}>
          About Us
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: '0.88rem', marginTop: 4 }}>
          Live Event Ticketing, Digital Entry Passes &amp; Organizer Solutions
        </p>
      </div>

      <div className="glass-panel" style={{ padding: 32, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 24, fontSize: '0.92rem', lineHeight: 1.6 }}>
        
        {/* Merchant Legal Identity Banner */}
        <div style={{ background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', padding: 20, borderRadius: 12, color: '#ffffff' }}>
          <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#818cf8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            🏛️ <span>Registered Merchant Identity &amp; Venue</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Legal Business / Merchant Name</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', marginTop: 2 }}>{MERCHANT_CONFIG.legalName}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Registered Operating Venue</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0', marginTop: 2 }}>{MERCHANT_CONFIG.fullAddress}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Direct Contact Helplines</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#34d399', marginTop: 2 }}>{MERCHANT_CONFIG.phoneDisplay}</div>
            </div>
          </div>
        </div>

        <section>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ffffff', marginBottom: 10 }}>
            Who We Are
          </h2>
          <p>
            Operated by <b>{MERCHANT_CONFIG.legalName}</b> with principal operations headquartered at <b>{MERCHANT_CONFIG.operatingVenue}</b>, our platform ({SITE_CONFIG.name}) is a modern, high-reliability live event ticketing and automated digital pass management service. We empower festival organizers, cultural promoters, music concert managers, and comedy club hosts to seamlessly publish events, manage tier capacities, collect customer payments in {SITE_CONFIG.currency} ({SITE_CONFIG.currencySymbol}), and issue tamper-evident HMAC-SHA256 encrypted QR entry passes directly to customers on-screen, via downloadable PNG/PDF, and over WhatsApp.
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ffffff', marginBottom: 10 }}>
            What We Do
          </h2>
          <p>
            We bridge the gap between event enthusiasts and organizers through modern e-commerce infrastructure:
          </p>
          <ul style={{ paddingLeft: 20, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li><b>Real-Time Event Discovery &amp; Booking:</b> Browse upcoming live festivals, comedy specials, tech conclaves, and club performances with real-time tier pricing.</li>
            <li><b>Transparent {SITE_CONFIG.currency} Pricing:</b> Clear itemization of base ticket prices, convenience fees, and applicable taxes with no hidden surcharges.</li>
            <li><b>Instant Automated Pass Dispatch:</b> Immediately after successful payment via authorized payment gateways (Cashfree &amp; Razorpay), attendees receive cryptographic QR tickets.</li>
            <li><b>Multi-Channel Access:</b> Access passes via our web wallet (<code>{NAV_LINKS.wallet}</code>), download high-resolution PNG passes for quick gate entry, or receive official receipt templates via WhatsApp.</li>
            <li><b>Gate Validation &amp; Scanner Tools:</b> Real-time scanning infrastructure for event security staff at venues like {MERCHANT_CONFIG.operatingVenue} to validate ticket authenticity and prevent duplicate admissions.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ffffff', marginBottom: 10 }}>
            Our Mission &amp; Commitment
          </h2>
          <p>
            Our mission is to provide 100% transparent, fair, and reliable ticketing services for both event attendees and organizers. We adhere to RBI and Indian payment compliance standards, ensuring end-to-end data privacy, PCI-DSS compliant payment processing, and responsive merchant support.
          </p>
        </section>

        <section style={{ background: 'rgba(15, 23, 42, 0.6)', padding: 20, borderRadius: 10, border: '1px solid var(--border-glass)' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', marginBottom: 8 }}>
            Have Inquiries or Partnership Proposals?
          </h3>
          <p style={{ marginBottom: 14 }}>
            Whether you want to book tickets for upcoming events at {MERCHANT_CONFIG.operatingVenue} or host your own live events on our platform, our team is available to assist you.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href={NAV_LINKS.contact} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
              📞 Contact Support
            </Link>
            <Link href={NAV_LINKS.home} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
              🎪 Browse Active Events
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
