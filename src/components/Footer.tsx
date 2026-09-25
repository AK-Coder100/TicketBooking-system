import Link from 'next/link';
import { MERCHANT_CONFIG, SITE_CONFIG, NAV_LINKS } from '@/lib/constants';

export default function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border-glass)',
      background: 'rgba(15, 23, 42, 0.95)',
      backdropFilter: 'blur(12px)',
      marginTop: 60,
      padding: '40px 20px 24px',
      color: 'var(--text-muted)',
      fontSize: '0.85rem'
    }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 30, marginBottom: 30 }}>

          {/* Column 1: Brand & Merchant Legal Identity */}
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              🎟️ <span>{SITE_CONFIG.name}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#c7d2fe', fontWeight: 700, marginBottom: 8 }}>
              Operated by: {MERCHANT_CONFIG.legalName}
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 12 }}>
              {SITE_CONFIG.description}
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', color: '#818cf8', fontWeight: 700 }}>
              🇮🇳 All Prices in {SITE_CONFIG.currency} ({SITE_CONFIG.currencySymbol})
            </div>
          </div>

          {/* Column 2: Mandatory Policy Pages */}
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Mandatory Policies
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>
                <Link href={NAV_LINKS.about} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  ℹ️ About Us
                </Link>
              </li>
              <li>
                <Link href={NAV_LINKS.contact} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  📞 Contact Us
                </Link>
              </li>
              <li>
                <Link href={NAV_LINKS.privacy} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  🛡️ Privacy Policy
                </Link>
              </li>
              <li>
                <Link href={NAV_LINKS.terms} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  📜 Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link href={NAV_LINKS.refunds} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  🔄 Refund &amp; Cancellation Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Quick Portals */}
          {/* <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Quick Links
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>
                <Link href={NAV_LINKS.home} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  🏠 Discover Events
                </Link>
              </li>
              <li>
                <Link href={NAV_LINKS.wallet} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  📱 My Ticket Passes
                </Link>
              </li>
              <li>
                <Link href={NAV_LINKS.organizerLogin} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  🎪 Organizer Portal
                </Link>
              </li>
              <li>
                <Link href={NAV_LINKS.adminLogin} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  🛡️ Super Admin Portal
                </Link>
              </li>
            </ul>
          </div> */}

          {/* Column 4: Merchant Contact & Venue */}
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Merchant Contact
            </div>
            <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>👤 <b>Merchant:</b> {MERCHANT_CONFIG.legalName}</div>
              <div>📍 <b>Venue / Address:</b> {MERCHANT_CONFIG.fullAddress}</div>
              <div>
                📞 <b>Helplines:</b>{' '}
                {MERCHANT_CONFIG.phones.map((p, idx) => (
                  <span key={p.raw}>
                    {idx > 0 && ', '}
                    <a href={`tel:${p.raw}`} style={{ color: '#34d399', textDecoration: 'none' }}>
                      {p.display}
                    </a>
                  </span>
                ))}
              </div>
              <div>📧 <b>Email:</b> {MERCHANT_CONFIG.supportEmail}</div>
              <div>🕒 <b>Hours:</b> {MERCHANT_CONFIG.supportHours}</div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div style={{
          borderTop: '1px solid var(--border-glass)',
          paddingTop: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          fontSize: '0.75rem',
          color: 'var(--text-dim)'
        }}>
          <div>
            © {new Date().getFullYear()} <b>{MERCHANT_CONFIG.legalName}</b> ({SITE_CONFIG.name}). All rights reserved. Registered at {MERCHANT_CONFIG.operatingVenue}, India.
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Link href={NAV_LINKS.about} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>About Us</Link>
            <Link href={NAV_LINKS.contact} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Contact</Link>
            <Link href={NAV_LINKS.privacy} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Privacy Policy</Link>
            <Link href={NAV_LINKS.terms} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Terms &amp; Conditions</Link>
            <Link href={NAV_LINKS.refunds} style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Refunds</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
