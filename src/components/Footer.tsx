import Link from 'next/link';

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 30, marginBottom: 30 }}>
          
          {/* Column 1: Brand & Compliance Notice */}
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              🎟️ <span>TicketBooking Platform</span>
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 12 }}>
              Multi-tenant live event ticketing & digital QR pass distribution platform. All products, services, and ticket prices are listed in **INR (Indian Rupees - ₹)**.
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', padding: '4px 10px', borderRadius: 20, fontSize: '0.75rem', color: '#818cf8', fontWeight: 700 }}>
              🇮🇳 All Prices in INR (₹)
            </div>
          </div>

          {/* Column 2: Mandatory Policy Pages */}
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Policy Pages
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>
                <Link href="/contact" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  📞 Contact Us
                </Link>
              </li>
              <li>
                <Link href="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  📜 Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/refunds" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  🔄 Refunds & Cancellations
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Quick Portals */}
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Quick Links
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>
                <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  🏠 Discover Events
                </Link>
              </li>
              <li>
                <Link href="/wallet" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  📱 My Ticket Passes
                </Link>
              </li>
              <li>
                <Link href="/organizer/login" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  🎪 Organizer Portal
                </Link>
              </li>
              <li>
                <Link href="/admin/login" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  🛡️ Super Admin Portal
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Contact & Helpdesk */}
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Customer Support
            </div>
            <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>📧 <b>Email:</b> support@platform.com</div>
              <div>📞 <b>Phone:</b> +91 98765 43210</div>
              <div>🕒 <b>Hours:</b> Mon–Sat, 9:00 AM – 6:00 PM IST</div>
              <div>📍 <b>Address:</b> 102 Tech Park, Outer Ring Road, Bengaluru, KA - 560103</div>
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
            © {new Date().getFullYear()} TicketBooking Platform. All rights reserved. Registered in India.
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Link href="/contact" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Contact Us</Link>
            <Link href="/terms" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Terms & Conditions</Link>
            <Link href="/refunds" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Refunds & Cancellations</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
