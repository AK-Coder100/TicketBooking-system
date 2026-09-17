'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function OrganizerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invalid credentials');
      }

      if (data.user.role !== 'TENANT_ADMIN' && data.user.role !== 'SUPER_ADMIN') {
        throw new Error('Access denied: Requires Organizer credentials');
      }

      router.push('/organizer');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 45px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: 440, padding: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}>🎪</div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Organizer Portal Login</h1>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Box Office & Gate Scanner Access</p>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fb7185', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 18 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} suppressHydrationWarning>
          <div className="form-group">
            <label className="form-label">Organizer Email</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="organizer@yourdomain.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? 'Signing In...' : 'Access Organizer Terminal'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: '0.85rem' }}>
          <Link href="/admin/login" style={{ color: '#818cf8', textDecoration: 'none' }}>
            Are you a Super Admin? Login here ↗
          </Link>
        </div>
      </div>
    </div>
  );
}
