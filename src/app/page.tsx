'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '36px 20px' }}>
      {/* Hero Header */}
      <div style={{ marginBottom: 36 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          MULTI-TENANT TICKETING PLATFORM
        </span>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginTop: 4, letterSpacing: '-0.02em' }}>
          Discover Live Festivals, Summits & Shows
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: 650, marginTop: 6 }}>
          Explore premier electronic music arenas, technology conclaves, and live comedy specials with instant cryptographic QR passes.
        </p>

        {/* Tenant Filter Chips */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${filter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('ALL')}>
            All Events
          </button>
          <button className={`btn btn-sm ${filter === 'sunburn' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('sunburn')}>
            Sunburn Arena
          </button>
          <button className={`btn btn-sm ${filter === 'techconf' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('techconf')}>
            Global AI Summit
          </button>
          <button className={`btn btn-sm ${filter === 'laughclub' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFilter('laughclub')}>
            The Laugh Club
          </button>
        </div>
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
