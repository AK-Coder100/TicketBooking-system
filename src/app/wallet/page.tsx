'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function GeneralUserWalletPage() {
  const [phone, setPhone] = useState('+919876500112');
  const [otp, setOtp] = useState('123456');
  const [step, setStep] = useState<'request' | 'verify' | 'tickets'>('request');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (data.success) {
        setStep('verify');
        alert(`Verification code dispatched to WhatsApp! (Demo code: ${data.simulatedOtp})`);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp })
      });
      const data = await res.json();
      if (data.success) {
        setTickets(data.tickets || []);
        setStep('tickets');
      } else {
        alert(data.error);
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '36px 20px' }}>
      <div style={{ marginBottom: 28 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase' }}>
          General User Account
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: 4 }}>
          My Tickets (Cross-Tenant Wallet)
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: 4 }}>
          Access all your passes across any event organizer using your registered mobile or WhatsApp number.
        </p>
      </div>

      {step === 'request' && (
        <div className="glass-panel" style={{ padding: 32 }}>
          <form onSubmit={handleRequestOtp}>
            <div className="form-group">
              <label className="form-label">Enter Mobile / WhatsApp Number</label>
              <input
                type="tel"
                className="form-control"
                placeholder="+91 98765 00112"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
              {loading ? 'Sending Code...' : 'Request WhatsApp OTP'}
            </button>
          </form>
          <div style={{ marginTop: 20, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            💡 Demo mode: Enter any phone number you booked tickets with (Default: <code style={{ color: '#fff' }}>+919876500112</code>).
          </div>
        </div>
      )}

      {step === 'verify' && (
        <div className="glass-panel" style={{ padding: 32 }}>
          <form onSubmit={handleVerifyOtp}>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              Code sent to <b>{phone}</b>
            </div>
            <div className="form-group">
              <label className="form-label">Enter 6-Digit OTP (Demo Code: 123456)</label>
              <input
                type="text"
                className="form-control"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                maxLength={6}
                required
              />
            </div>
            <button type="submit" className="btn btn-success" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify & Open My Wallet'}
            </button>
          </form>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 14 }} onClick={() => setStep('request')}>
            Change Phone Number
          </button>
        </div>
      )}

      {step === 'tickets' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Verified Phone: <b>{phone}</b></span>
            <button className="btn btn-secondary btn-sm" onClick={() => setStep('request')}>Switch Phone</button>
          </div>

          {tickets.length === 0 ? (
            <div className="glass-panel" style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
              No tickets found for this phone number. Book your first pass on the storefront!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {tickets.map(t => (
                <div key={t.id} className="glass-panel" style={{ padding: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 800, textTransform: 'uppercase' }}>
                        {t.tenant_name}
                      </span>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{t.event_title}</h3>
                    </div>
                    <span className={`badge ${t.checkin_count > 0 ? 'badge-green' : 'badge-purple'}`}>
                      {t.checkin_count > 0 ? 'Checked In' : 'Valid Entry'}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                    Pass Tier: <b>{t.tier_name}</b> | Attendee: <b>{t.attendee_name}</b>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--border-glass)' }}>
                    <code style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{t.id}</code>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <a href={`/api/client/tickets/${t.id}/pdf`} className="btn btn-secondary btn-sm">
                        📄 Download PDF
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
