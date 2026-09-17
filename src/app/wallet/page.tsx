'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function GeneralUserWalletPage() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'request' | 'verify' | 'tickets'>('request');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setStep('verify');
        setSuccessMsg(`Verification code dispatched to your phone via WhatsApp.`);
      } else {
        setErrorMsg(data.error || 'Failed to send OTP. Check phone number.');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Network error sending OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/auth/otp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), otp: otp.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setTickets(data.tickets || []);
        setStep('tickets');
        setSuccessMsg(null);
      } else {
        setErrorMsg(data.error || 'Invalid verification code');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Verification error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '36px 20px' }}>
      <div style={{ marginBottom: 28 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase' }}>
          Customer Account
        </span>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, marginTop: 4 }}>
          My Tickets (Cross-Tenant Wallet)
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginTop: 4 }}>
          Access all your passes across any event organizer using your registered mobile or WhatsApp number.
        </p>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: '#fca5a5' }}>
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '1.1rem' }}>&times;</button>
        </div>
      )}

      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: '#6ee7b7' }}>
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', color: '#6ee7b7', cursor: 'pointer', fontSize: '1.1rem' }}>&times;</button>
        </div>
      )}

      {step === 'request' && (
        <div className="glass-panel" style={{ padding: 32 }}>
          <form onSubmit={handleRequestOtp}>
            <div className="form-group">
              <label className="form-label">Enter Mobile / WhatsApp Number</label>
              <input
                type="tel"
                className="form-control"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
              {loading ? 'Sending Code...' : 'Request WhatsApp OTP'}
            </button>
          </form>
        </div>
      )}

      {step === 'verify' && (
        <div className="glass-panel" style={{ padding: 32 }}>
          <form onSubmit={handleVerifyOtp}>
            <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              Code sent to <b>{phone}</b>
            </div>
            <div className="form-group">
              <label className="form-label">Enter 6-Digit OTP</label>
              <input
                type="text"
                className="form-control"
                placeholder="123456"
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
