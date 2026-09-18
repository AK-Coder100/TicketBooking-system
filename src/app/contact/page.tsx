'use client';

import { useState } from 'react';
import Link from 'next/link';

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
        <Link href="/" style={{ color: '#818cf8', textDecoration: 'none', fontSize: '0.85rem' }}>
          ← Back to Home
        </Link>
      </div>

      <div style={{ marginBottom: 32 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          PAYMENT GATEWAY COMPLIANCE & HELPDESK
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: 4 }}>
          Contact Us
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: 6, maxWidth: 650 }}>
          Have questions regarding ticket bookings, payments, or event organizer partnerships? Get in touch with our support team.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 30 }}>
        
        {/* Contact Info Card */}
        <div className="glass-panel" style={{ padding: 28, borderRadius: 14 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 20 }}>
            Official Support Details
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: 10, borderRadius: 10, fontSize: '1.2rem', color: '#818cf8' }}>
                📧
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Customer Support Email</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginTop: 2 }}>support@platform.com</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Response time: within 24 hours</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ background: 'rgba(52, 211, 153, 0.15)', padding: 10, borderRadius: 10, fontSize: '1.2rem', color: '#34d399' }}>
                📞
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Support Phone Number</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff', marginTop: 2 }}>+91 98765 43210</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Mon–Sat, 9:00 AM – 6:00 PM IST</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ background: 'rgba(251, 191, 36, 0.15)', padding: 10, borderRadius: 10, fontSize: '1.2rem', color: '#fbbf24' }}>
                📍
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Registered Office Address</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0', marginTop: 2, lineHeight: 1.5 }}>
                  TicketBooking Platform India Pvt Ltd<br />
                  Building 102, 3rd Floor, Tech Park,<br />
                  Outer Ring Road, Bellandur,<br />
                  Bengaluru, Karnataka - 560103, India
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ background: 'rgba(168, 85, 247, 0.15)', padding: 10, borderRadius: 10, fontSize: '1.2rem', color: '#c084fc' }}>
                🇮🇳
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>Pricing & Operating Currency</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#34d399', marginTop: 2 }}>
                  All ticket prices and fees are charged in Indian Rupees (INR - ₹).
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
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 20 }}>
            Fill out the form below and our helpdesk will respond promptly.
          </p>

          {submitted ? (
            <div style={{ background: 'rgba(52, 211, 153, 0.15)', border: '1px solid rgba(52, 211, 153, 0.3)', padding: 20, borderRadius: 10, textAlign: 'center', color: '#34d399' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>Message Received!</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 6 }}>
                Thank you for contacting us. A support representative will get back to you shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>Full Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Rahul Sharma"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>Email Address *</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="rahul@example.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>Phone Number *</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>Subject *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Booking inquiry, Payment status, etc."
                  value={formData.subject}
                  onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>Message / Inquiry *</label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder="Provide details about your query..."
                  value={formData.message}
                  onChange={e => setFormData({ ...formData, message: e.target.value })}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', fontWeight: 700, marginTop: 4 }}>
                Submit Inquiry
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
