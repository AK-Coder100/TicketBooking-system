import Link from 'next/link';
import { MERCHANT_CONFIG, SITE_CONFIG, NAV_LINKS } from '@/lib/constants';

export const metadata = {
  title: `About Us - ${MERCHANT_CONFIG.legalName} | ${SITE_CONFIG.name}`,
  description: `Learn about ${MERCHANT_CONFIG.legalName}, RB Garment Enterprises, and SR Production. Official organizers of परंपरागत डांडिया महोत्सव 2026 at ${MERCHANT_CONFIG.operatingVenue}.`
};

export default function AboutUsPage() {
  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '36px 20px', color: 'var(--text-muted)' }}>
      
      {/* Top Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link
          href={NAV_LINKS.home}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: '#818cf8',
            textDecoration: 'none',
            fontSize: '0.85rem',
            fontWeight: 700
          }}
        >
          <span>←</span> Back to Home
        </Link>
      </div>

      {/* Page Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'inline-block', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#818cf8', padding: '4px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          ABOUT OUR ORGANIZATION &amp; EVENTS
        </div>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          About Us
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', marginTop: 6, maxWidth: 750 }}>
          Connecting audiences with vibrant cultural celebrations, live festival experiences, and seamless digital ticketing powered by {MERCHANT_CONFIG.legalName}.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* 1. Official Merchant & Venue Identity Card */}
        <div className="glass-panel" style={{ padding: 28, borderRadius: 16, border: '1px solid rgba(99, 102, 241, 0.3)', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(15, 23, 42, 0.6) 100%)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: '1.4rem' }}>🏛️</span>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Registered Merchant &amp; Organizing Entity
              </h2>
              <span style={{ fontSize: '0.78rem', color: '#818cf8', fontWeight: 600 }}>Official Business Credentials &amp; Venue</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Merchant / Proprietor
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', marginTop: 4 }}>
                {MERCHANT_CONFIG.legalName}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 2 }}>
                RB Garment Enterprises &amp; SR Production
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Official Event Venue
              </div>
              <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#ffffff', marginTop: 4 }}>
                📍 {MERCHANT_CONFIG.operatingVenue}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 2 }}>
                Town Hall, Gorakhpur, UP - 273008
              </div>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                Helpline Numbers
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#34d399', marginTop: 4 }}>
                📞 +91 9918327131 / +91 7607137577
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
                📞 +91 7054488454 / +91 8858152101
              </div>
            </div>
          </div>
        </div>

        {/* 2. Flagship Event Spotlight: परंपरागत डांडिया महोत्सव 2026 */}
        <div className="glass-panel" style={{ padding: 28, borderRadius: 16, border: '1px solid rgba(245, 158, 11, 0.25)', background: 'rgba(15, 23, 42, 0.7)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.3rem' }}>🪘</span>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#f59e0b', margin: 0 }}>
                परंपरागत डांडिया महोत्सव 2026 — DANDIYA NIGHT
              </h2>
            </div>
            <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '3px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 800 }}>
              15 TO 19 OCT 2026
            </span>
          </div>

          <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: '#cbd5e1', marginBottom: 16 }}>
            <b>अन्नपूर्णा सेवा समिति Presents</b> — Organized with grandeur by <b>RB Garment Enterprises</b> and managed by <b>SR Production</b> under the stewardship of <b>{MERCHANT_CONFIG.legalName}</b>. This 5-day mega cultural festival is Gorakhpur's grandest celebration of music, Garba beats, traditional culture, and family entertainment.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12 }}>
            <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#818cf8' }}>🎧 LIVE DJ &amp; DHOL</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 2 }}>Non-stop energetic beats &amp; live performers</div>
            </div>
            <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#34d399' }}>🍱 DELICIOUS FOOD STALLS</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 2 }}>Diverse culinary snacks &amp; festive treats</div>
            </div>
            <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#f43f5e' }}>🛍️ SHOPPING &amp; APPAREL</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 2 }}>Traditional attire, handicrafts &amp; accessories</div>
            </div>
            <div style={{ background: 'rgba(30, 41, 59, 0.6)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fbbf24' }}>📸 SELFIE ZONES &amp; CELEBRITY ACTS</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: 2 }}>Decorated photo stages &amp; guest shows</div>
            </div>
          </div>
        </div>

        {/* 3. Who We Are & Our Mission */}
        <div className="glass-panel" style={{ padding: 28, borderRadius: 16 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: 12 }}>
            Who We Are &amp; What We Do
          </h2>
          <p style={{ fontSize: '0.92rem', lineHeight: 1.7, color: '#cbd5e1', marginBottom: 16 }}>
            Headquartered at <b>{MERCHANT_CONFIG.operatingVenue}</b>, we specialize in end-to-end event management, cultural festival curation, and next-generation digital ticketing technology. We bring together modern payment infrastructure, tamper-proof QR access systems, and responsive local event coordination to ensure a safe, celebratory, and seamless experience for all visitors.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 16 }}>
            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: 18, borderRadius: 12, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '1.2rem', marginBottom: 6 }}>🎟️</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginBottom: 6 }}>
                Transparent Pricing in INR (₹)
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                All ticket passes (Single: ₹400, Couple: ₹750, 4-Person: ₹1,400) are clearly listed with zero hidden charges. Customers enjoy instant checkout via UPI, Cards, and Net Banking through RBI-authorized payment gateways.
              </p>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: 18, borderRadius: 12, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '1.2rem', marginBottom: 6 }}>📲</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginBottom: 6 }}>
                Instant WhatsApp &amp; PDF Pass Delivery
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Upon successful booking, attendees receive cryptographic QR tickets immediately on-screen, in their digital web wallet, as a downloadable PNG/PDF, and sent directly to their registered WhatsApp number.
              </p>
            </div>

            <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: 18, borderRadius: 12, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '1.2rem', marginBottom: 6 }}>🛡️</div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginBottom: 6 }}>
                Gate Security &amp; Quick Check-in
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Our digital scanner tools enable fast, friction-free gate admission at KACHERI Club, preventing counterfeit passes and ensuring family-friendly venue security.
              </p>
            </div>
          </div>
        </div>

        {/* 4. Contact & Support Information */}
        <div className="glass-panel" style={{ padding: 24, borderRadius: 16, border: '1px solid var(--border-glass-glow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Get In Touch With Our Team
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginTop: 4, marginBottom: 0 }}>
                For stall bookings, ticket inquiries, or venue directions at KACHERI Club, Gorakhpur.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href={NAV_LINKS.contact} className="btn btn-primary btn-sm" style={{ textDecoration: 'none' }}>
                📞 Contact Us
              </Link>
              <Link href={`/dandiya-2026/checkout?eventId=evt_dandiya_2026`} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                🎟️ Book Dandiya Passes
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
