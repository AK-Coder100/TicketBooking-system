'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { MERCHANT_CONFIG, NAV_LINKS } from '@/lib/constants';

export default function HomePage() {
  const [events, setEvents] = useState<any[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/client/events')
      .then(res => res.json())
      .then(data => {
        if (data.success) setEvents(data.events || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'ALL' ? events : events.filter(e => e.tenant_slug === filter);

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 20px' }}>
      
      {/* Top Merchant Identity & Compliance Strip */}
      <div style={{
        background: 'rgba(99, 102, 241, 0.1)',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        borderRadius: 12,
        padding: '12px 18px',
        marginBottom: 28,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12,
        fontSize: '0.85rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ background: '#4f46e5', color: '#ffffff', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800 }}>
            OFFICIAL MERCHANT
          </span>
          <span style={{ color: '#ffffff', fontWeight: 700 }}>
            {MERCHANT_CONFIG.legalName}
          </span>
          <span style={{ color: 'var(--text-dim)' }}>•</span>
          <span style={{ color: 'var(--text-muted)' }}>
            📍 {MERCHANT_CONFIG.operatingVenue}
          </span>
          <span style={{ color: 'var(--text-dim)' }}>•</span>
          <span style={{ color: '#34d399', fontWeight: 600 }}>
            📞 {MERCHANT_CONFIG.phoneDisplay}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Link href={NAV_LINKS.about} style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 600, fontSize: '0.82rem' }}>
            About Us
          </Link>
          <Link href={NAV_LINKS.contact} style={{ color: '#818cf8', textDecoration: 'none', fontWeight: 600, fontSize: '0.82rem' }}>
            Contact
          </Link>
          <Link href={NAV_LINKS.wallet} style={{ color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '0.82rem', background: 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: 6 }}>
            📱 My Tickets
          </Link>
        </div>
      </div>

      {/* Hero Header */}
      <div style={{ marginBottom: 36 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          LIVE EVENT PASSES &amp; DIGITAL TICKETING
        </span>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>
          Discover Live Festivals &amp; Events
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: 650, marginTop: 6 }}>
          Book verified entry passes, select your preferred dates and ticket tiers, and receive instant cryptographic QR tickets with transparent INR (₹) pricing.
        </p>

        {/* Dynamic Tenant Filter Chips (only when multiple organizers exist) */}
        {(() => {
          const uniqueTenants = Array.from(
            new Map(events.map(e => [e.tenant_slug, { slug: e.tenant_slug, name: e.tenant_name }])).values()
          );

          if (uniqueTenants.length <= 1) return null;

          return (
            <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
              <button className={`btn btn-sm ${filter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('ALL')}>
                All Events
              </button>
              {uniqueTenants.map(t => (
                <button
                  key={t.slug}
                  className={`btn btn-sm ${filter === t.slug ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setFilter(t.slug)}
                >
                  {t.name}
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Loading experiences...</div>}

      {/* Events Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
        {filtered.map(e => {
          const minPrice = e.tiers?.length > 0 ? Math.min(...e.tiers.map((t: any) => t.price_in_paise)) : 0;
          return (
            <Link key={e.id} href={`/${e.tenant_slug}/checkout?eventId=${e.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="glass-panel" style={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <img src={e.banner_url || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800'} alt={e.title} style={{ height: 180, width: '100%', objectFit: 'cover' }} />
                <div style={{ padding: 22, display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase' }}>{e.tenant_name}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>{new Date(e.start_date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>{e.title}</h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>📍 {e.location}</div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: 16, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {e.description}
                  </p>
                  <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Passes from</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#34d399' }}>₹{(minPrice / 100).toFixed(2)}</div>
                    </div>
                    <span className="btn btn-primary btn-sm">Book Tickets</span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
