import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Multi-Tenant Ticket Booking Platform',
  description: 'Production-ready multi-tenant ticket booking platform with Cashfree & Razorpay Route split settlement and signed QR verification.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Multi-Tenant Top Hub Switcher */}
        <div className="platform-hub-bar">
          <div className="hub-title">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></span>
            <span>Multi-Tenant Platform Hub</span>
            <span style={{ color: '#64748b' }}>|</span>
            <span style={{ fontSize: '0.75rem', color: '#a5b4fc', background: 'rgba(99,102,241,0.2)', padding: '2px 8px', borderRadius: 4 }}>
              Next.js Full-Stack + Strict Auth RBAC
            </span>
          </div>
          <div className="hub-links">
            <Link href="/" className="hub-btn">🎟️ Client Booking (Public)</Link>
            <Link href="/wallet" className="hub-btn">📱 My Tickets (Cross-Tenant)</Link>
            <Link href="/organizer" className="hub-btn">🎪 Tenant Admin & Scanner</Link>
            <Link href="/admin" className="hub-btn">🛡️ Super Admin Portal</Link>
          </div>
        </div>

        {children}
      </body>
    </html>
  );
}
