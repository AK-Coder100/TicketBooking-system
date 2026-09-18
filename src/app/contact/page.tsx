'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MERCHANT_CONFIG, SITE_CONFIG, NAV_LINKS } from '@/lib/constants';

export default function ContactUsPage() {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', subject: '', message: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px' }}>
      {/* Header Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link href={NAV_LINKS.home} style={{ color: '#818cf8', textDecoration: 'none', fontSize: '0.85rem' }}>
          ← Back to Home
        </Link>
      </div>

      <div style={{ marginBottom: 32 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          LEGAL BUSINESS &amp; CUSTOMER HELPDESK
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: 4 }}>
          Contact Us
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: 6, maxWidth: 650 }}>
          Have questions regarding ticket bookings, payment status, event passes, or organizer partnerships? Reach out directly to our team.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 30 }}>
        
        {/* Contact Info Card */}
        <div className="glass-panel" style={{ padding: 28, borderRadius: 14 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 20 }}>
            Official Merchant Details
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: 10, borderRadius: 10, fontSize: '1.2rem', color: '#818cf8' }}>
                🏛️
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Merchant / Business Legal Name</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', marginTop: 2 }}>{MERCHANT_CONFIG.legalName}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Registered Ticketing &amp; Event Operations ({SITE_CONFIG.name})</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ background: 'rgba(52, 211, 153, 0.15)', padding: 10, borderRadius: 10, fontSize: '1.2rem', color: '#34d399' }}>
                📞
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Direct Contact Phone Numbers</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginTop: 2 }}>
                  {MERCHANT_CONFIG.phones.map((p, idx) => (
                    <span key={p.raw}>
                      {idx > 0 && <span style={{ color: 'var(--text-dim)', margin: '0 8px' }}>/</span>}
                      <a href={`tel:${p.raw}`} style={{ color: '#34d399', textDecoration: 'none' }}>
                        {p.display}
                      </a>
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{MERCHANT_CONFIG.supportHours}</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ background: 'rgba(251, 191, 36, 0.15)', padding: 10, borderRadius: 10, fontSize: '1.2rem', color: '#fbbf24' }}>
                📍
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Venue &amp; Operating Address</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0', marginTop: 2, lineHeight: 1.5 }}>
                  {MERCHANT_CONFIG.operatingVenue},<br />
                  {MERCHANT_CONFIG.state}, {MERCHANT_CONFIG.country}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: 10, borderRadius: 10, fontSize: '1.2rem', color: '#818cf8' }}>
                📧
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Customer Support Email</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginTop: 2 }}>{MERCHANT_CONFIG.supportEmail}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Response time: within 24 hours</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ background: 'rgba(168, 85, 247, 0.15)', padding: 10, borderRadius: 10, fontSize: '1.2rem', color: '#c084fc' }}>
                🇮🇳
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Pricing Currency</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#34d399', marginTop: 2 }}>
                  All ticket prices and convenience fees are charged in {SITE_CONFIG.currency} ({SITE_CONFIG.currencySymbol}).
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Inquiry Form */}
        <div className="glass-panel" style={{ padding: 28, borderRadius: 14 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 6 }}>
            Send us a Message
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
            Fill out the form below and our support desk at {MERCHANT_CONFIG.operatingVenue} will reply promptly.
          </p>

          {submitted ? (
            <div style={{ background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: 20, borderRadius: 10, color: '#34d399', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Inquiry Submitted Successfully</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Thank you! Our support team will get back to you at <b>{formData.email || 'your email'}</b> within 24 hours.
              </p>
              <button onClick={() => setSubmitted(false)} className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>
                Send Another Message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: 8, color: '#ffffff', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: 8, color: '#ffffff', fontSize: '0.9rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="9918327131"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: 8, color: '#ffffff', fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Payment query / Ticket pass issue"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: 8, color: '#ffffff', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-dim)', marginBottom: 4 }}>
                  Message *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Describe your question, transaction ID, or feedback..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: 8, color: '#ffffff', fontSize: '0.9rem', resize: 'vertical' }}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: 4 }}>
                ✉️ Send Message
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
}
