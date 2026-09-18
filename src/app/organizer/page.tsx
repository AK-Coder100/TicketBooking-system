'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TierDraft {
  id: string;
  name: string;
  price_in_rupees: string;
  capacity: string;
  is_unlimited: boolean;
}

interface SessionDraft {
  id: string;
  name: string;
  session_date: string;
  start_time: string;
  end_time: string;
  venue_note: string;
  tiers: TierDraft[];
}

function makeTier(overrides?: Partial<TierDraft>): TierDraft {
  return {
    id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    price_in_rupees: '999',
    capacity: '200',
    is_unlimited: false,
    ...overrides,
  };
}

function makeSession(overrides?: Partial<SessionDraft>): SessionDraft {
  return {
    id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    session_date: '',
    start_time: '',
    end_time: '',
    venue_note: '',
    tiers: [
      makeTier({ name: 'General Admission', price_in_rupees: '999', capacity: '200' }),
    ],
    ...overrides,
  };
}

const DEFAULT_EVENT = {
  title: '',
  location: '',
  start_date: '',
  end_date: '',
  banner_url: '',
  description: '',
  sessions: [makeSession({ name: 'Show 1' })],
  uniform_pricing: false, // "same tickets for all sessions" toggle
  template_tiers: [
    makeTier({ name: 'General Admission', price_in_rupees: '999', capacity: '200' }),
    makeTier({ name: 'VIP Pass', price_in_rupees: '2499', capacity: '50' }),
  ],
};

// ─── Main Component ────────────────────────────────────────────────────────────
export default function OrganizerDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'scanner' | 'events' | 'analytics' | 'team'>('scanner');
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [attendees, setAttendees] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});

  // Team & Profile Permission state
  const [userProfile, setUserProfile] = useState<any>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [orgPolicy, setOrgPolicy] = useState<string>('ADMIN_ONLY');
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newTeamMember, setNewTeamMember] = useState({
    name: '',
    email: '',
    password: '',
    tenant_role: 'EVENT_MANAGER',
    can_create_events: true
  });

  // Scanner state
  const [manualToken, setManualToken] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Create Event Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventStep, setEventStep] = useState<1 | 2 | 3>(1);
  const [newEvent, setNewEvent] = useState({ ...DEFAULT_EVENT, sessions: [makeSession({ name: 'Show 1' })], template_tiers: [...DEFAULT_EVENT.template_tiers] });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadEvents();
    loadAnalytics();
    loadUserProfile();
    loadTeamData();
  }, []);

  const loadUserProfile = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const json = await res.json();
      if (json.success && json.user) {
        setUserProfile(json.user);
      }
    } catch (e) { console.error(e); }
  };

  const loadTeamData = async () => {
    try {
      const res = await fetch('/api/tenant/team');
      const json = await res.json();
      if (json.success) {
        setTeamMembers(json.teamMembers || []);
        if (json.tenant?.event_creation_policy) {
          setOrgPolicy(json.tenant.event_creation_policy);
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleUpdatePolicy = async (policy: string) => {
    setOrgPolicy(policy);
    try {
      await fetch('/api/tenant/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_creation_policy: policy })
      });
    } catch (e) { console.error(e); }
  };

  const handleTogglePermission = async (memberId: string, currentVal: boolean) => {
    setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, can_create_events: !currentVal } : m));
    try {
      await fetch('/api/tenant/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: memberId, can_create_events: !currentVal })
      });
    } catch (e) { console.error(e); }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, tenant_role: newRole } : m));
    try {
      await fetch('/api/tenant/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: memberId, tenant_role: newRole })
      });
    } catch (e) { console.error(e); }
  };

  const handleAddTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!newTeamMember.name.trim() || !newTeamMember.email.trim() || !newTeamMember.password.trim()) {
        alert('Name, email, and password are required.');
        return;
      }
      const res = await fetch('/api/tenant/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTeamMember)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to add team member');
      setShowTeamModal(false);
      setNewTeamMember({ name: '', email: '', password: '', tenant_role: 'EVENT_MANAGER', can_create_events: true });
      await loadTeamData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const loadEvents = async () => {
    try {
      const res = await fetch('/api/tenant/events');
      if (res.status === 401) { router.push('/organizer/login'); return; }
      const json = await res.json();
      if (json.success) {
        setEvents(json.events || []);
        if (json.events?.length > 0 && !selectedEventId) setSelectedEventId(json.events[0].id);
      }
    } catch (e) { console.error(e); }
  };

  const loadAnalytics = async () => {
    try {
      const res = await fetch('/api/tenant/analytics');
      const json = await res.json();
      if (json.success) {
        setStats(json.stats || {});
        setAttendees(json.attendees || []);
        setAuditLogs(json.auditLogs || []);
      }
    } catch (e) { console.error(e); }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/organizer/login');
    router.refresh();
  };

  // ── Audio ──────────────────────────────────────────────────────────────────
  const playSound = (type: 'valid' | 'duplicate' | 'error') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'valid') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start(); osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'duplicate') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(349.23, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(); osc.stop(ctx.currentTime + 0.4);
      }
    } catch (_) {}
  };

  // ── Scanner ────────────────────────────────────────────────────────────────
  const toggleCamera = async () => {
    if (cameraActive) {
      streamRef.current?.getTracks().forEach(t => t.stop());
      setCameraActive(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        setCameraActive(true);
      } catch { alert('Camera not available. Use manual token entry.'); }
    }
  };

  const executeScan = async (token: string) => {
    if (!token.trim()) return;
    try {
      const res = await fetch('/api/tenant/scanner/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrToken: token.trim(), eventId: selectedEventId, deviceInfo: 'Organizer PWA Scanner' })
      });
      const data = await res.json();
      setScanResult(data);
      if (data.status === 'VALID' || data.color === 'green') playSound('valid');
      else if (data.status === 'ALREADY_SCANNED' || data.color === 'yellow') playSound('duplicate');
      else playSound('error');
      loadAnalytics();
    } catch (err: any) {
      setScanResult({ status: 'INVALID', color: 'red', reason: err.message });
      playSound('error');
    }
  };

  const handleOverride = async (ticketId: string) => {
    try {
      const res = await fetch('/api/tenant/scanner/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, reason: 'Organizer Discretion / Gate Clearance' })
      });
      const data = await res.json();
      if (data.success) {
        playSound('valid');
        setScanResult({ status: 'RE_ENTRY_ALLOWED', color: 'green', message: data.message });
        loadAnalytics();
      }
    } catch (e: any) { alert(e.message); }
  };

  // ── Session / Tier Helpers ─────────────────────────────────────────────────
  const addSession = () => {
    const n = newEvent.sessions.length + 1;
    const tmpl = newEvent.uniform_pricing ? newEvent.template_tiers.map(t => ({ ...t, id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })) : [makeTier({ name: 'General Admission', price_in_rupees: '999', capacity: '200' })];
    setNewEvent(prev => ({
      ...prev,
      sessions: [...prev.sessions, makeSession({ name: `Show ${n}`, tiers: tmpl })]
    }));
  };

  const removeSession = (id: string) => {
    if (newEvent.sessions.length <= 1) { alert('Event must have at least one session'); return; }
    setNewEvent(prev => ({ ...prev, sessions: prev.sessions.filter(s => s.id !== id) }));
  };

  const updateSession = (id: string, field: keyof SessionDraft, val: string) => {
    setNewEvent(prev => ({
      ...prev,
      sessions: prev.sessions.map(s => s.id === id ? { ...s, [field]: val } : s)
    }));
  };

  // Tier helpers for per-session mode
  const addTierToSession = (sessionId: string) => {
    setNewEvent(prev => ({
      ...prev,
      sessions: prev.sessions.map(s => s.id === sessionId ? { ...s, tiers: [...s.tiers, makeTier()] } : s)
    }));
  };

  const removeTierFromSession = (sessionId: string, tierId: string) => {
    setNewEvent(prev => ({
      ...prev,
      sessions: prev.sessions.map(s => {
        if (s.id !== sessionId) return s;
        if (s.tiers.length <= 1) { alert('Each session needs at least one ticket type'); return s; }
        return { ...s, tiers: s.tiers.filter(t => t.id !== tierId) };
      })
    }));
  };

  const updateTierInSession = (sessionId: string, tierId: string, field: keyof TierDraft, val: any) => {
    setNewEvent(prev => ({
      ...prev,
      sessions: prev.sessions.map(s =>
        s.id === sessionId
          ? { ...s, tiers: s.tiers.map(t => t.id === tierId ? { ...t, [field]: val } : t) }
          : s
      )
    }));
  };

  // Template tier helpers (uniform pricing mode)
  const addTemplateTier = () => {
    setNewEvent(prev => ({ ...prev, template_tiers: [...prev.template_tiers, makeTier()] }));
  };

  const removeTemplateTier = (id: string) => {
    if (newEvent.template_tiers.length <= 1) { alert('Need at least one ticket type'); return; }
    setNewEvent(prev => ({ ...prev, template_tiers: prev.template_tiers.filter(t => t.id !== id) }));
  };

  const updateTemplateTier = (id: string, field: keyof TierDraft, val: any) => {
    setNewEvent(prev => ({ ...prev, template_tiers: prev.template_tiers.map(t => t.id === id ? { ...t, [field]: val } : t) }));
  };

  // When toggling uniform pricing, sync template tiers into all sessions
  const toggleUniformPricing = (on: boolean) => {
    if (on) {
      // Apply current template to all sessions
      setNewEvent(prev => ({
        ...prev,
        uniform_pricing: true,
        sessions: prev.sessions.map(s => ({
          ...s,
          tiers: prev.template_tiers.map(t => ({ ...t, id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` }))
        }))
      }));
    } else {
      setNewEvent(prev => ({ ...prev, uniform_pricing: false }));
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!newEvent.title.trim()) throw new Error('Event title is required');
      if (!newEvent.location.trim()) throw new Error('Venue / location is required');
      if (!newEvent.start_date || !newEvent.end_date) throw new Error('Start and end dates are required');
      if (new Date(newEvent.end_date) < new Date(newEvent.start_date)) throw new Error('End date must be after start date');

      // Build sessions payload
      let sessions = newEvent.sessions;
      if (newEvent.uniform_pricing) {
        // inject template tiers into each session (replace individual tiers)
        sessions = newEvent.sessions.map(s => ({
          ...s,
          tiers: newEvent.template_tiers
        }));
      }

      const payload = {
        title: newEvent.title.trim(),
        location: newEvent.location.trim(),
        start_date: newEvent.start_date,
        end_date: newEvent.end_date,
        banner_url: newEvent.banner_url || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=1200&q=80',
        description: newEvent.description?.trim() || '',
        sessions,
      };

      const res = await fetch('/api/tenant/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create event');

      closeModal();
      await loadEvents();
      if (data.eventId) setSelectedEventId(data.eventId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openModal = () => {
    setNewEvent({ ...DEFAULT_EVENT, sessions: [makeSession({ name: 'Show 1' })], template_tiers: [makeTier({ name: 'General Admission', price_in_rupees: '999', capacity: '200' }), makeTier({ name: 'VIP Pass', price_in_rupees: '2499', capacity: '50' })] });
    setEventStep(1);
    setShowEventModal(true);
  };

  const closeModal = () => {
    setShowEventModal(false);
    setEventStep(1);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────
  const renderTierRow = (
    tier: TierDraft,
    onUpdate: (field: keyof TierDraft, val: any) => void,
    onRemove: () => void,
    canRemove: boolean
  ) => (
    <div key={tier.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px auto', gap: 8, alignItems: 'start' }}>
      <div>
        <input
          type="text"
          className="form-control"
          style={{ padding: '9px 12px', fontSize: '0.88rem' }}
          placeholder="e.g. General Admission, VIP Pass, Early Bird"
          value={tier.name}
          onChange={e => onUpdate('name', e.target.value)}
          required
        />
      </div>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.85rem', pointerEvents: 'none' }}>₹</span>
        <input
          type="number"
          className="form-control"
          style={{ padding: '9px 12px 9px 26px', fontSize: '0.88rem' }}
          placeholder="999"
          value={tier.price_in_rupees}
          onChange={e => onUpdate('price_in_rupees', e.target.value)}
          min="0"
          required
        />
      </div>
      <div>
        {tier.is_unlimited ? (
          <div
            className="form-control"
            style={{ padding: '9px 12px', fontSize: '0.82rem', color: '#64748b', cursor: 'pointer', textAlign: 'center' }}
            onClick={() => onUpdate('is_unlimited', false)}
          >∞ Unlimited</div>
        ) : (
          <input
            type="number"
            className="form-control"
            style={{ padding: '9px 12px', fontSize: '0.88rem' }}
            placeholder="Capacity"
            value={tier.capacity}
            onChange={e => onUpdate('capacity', e.target.value)}
            min="1"
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, paddingTop: 2 }}>
        <button
          type="button"
          title={tier.is_unlimited ? 'Switch to capped capacity' : 'Switch to unlimited'}
          onClick={() => onUpdate('is_unlimited', !tier.is_unlimited)}
          style={{ background: tier.is_unlimited ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)', color: tier.is_unlimited ? '#34d399' : '#64748b', border: '1px solid', borderColor: tier.is_unlimited ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: '0.9rem', flexShrink: 0 }}
        >∞</button>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={{ background: 'rgba(244,63,94,0.1)', color: '#f87171', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0 }}
          >✕</button>
        )}
      </div>
    </div>
  );

  // ───────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: 'calc(100vh - 45px)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <div style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid var(--border-glass)', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}>🎪</div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Organizer Operations & Gate Scanner</h1>
            <span style={{ fontSize: '0.78rem', color: '#10b981' }}>● Authenticated Organizer Terminal</span>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Log Out</button>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border-glass)', marginBottom: 28, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${activeTab === 'scanner' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('scanner')}>📷 Gate QR Scanner</button>
          <button className={`btn btn-sm ${activeTab === 'events' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('events')}>📅 Events</button>
          <button className={`btn btn-sm ${activeTab === 'analytics' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('analytics')}>📈 Attendees & Logs</button>
          <button className={`btn btn-sm ${activeTab === 'team' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveTab('team')}>👥 Team & Permissions</button>
        </div>

        {/* ── TAB: GATE SCANNER ── */}
        {activeTab === 'scanner' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: '1.6rem' }}>Check-In Verification Terminal</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Real-time status: Green (Valid), Yellow (Duplicate + Override), Red (Invalid).</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Assigned Event:</span>
                <select className="form-control" style={{ width: 'auto' }} value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)}>
                  {events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
              <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: '100%', height: 260, background: '#020617', borderRadius: 16, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <video ref={videoRef} playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraActive ? 'block' : 'none' }} />
                  {!cameraActive && (
                    <div style={{ textAlign: 'center', padding: 20 }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: 6 }}>📷</div>
                      <div style={{ fontWeight: 'bold' }}>Camera Inactive</div>
                      <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={toggleCamera}>Start Device Camera</button>
                    </div>
                  )}
                  {cameraActive && (
                    <button className="btn btn-danger btn-sm" style={{ position: 'absolute', bottom: 12, right: 12 }} onClick={toggleCamera}>Stop Camera</button>
                  )}
                </div>
                <div style={{ width: '100%', marginTop: 20 }}>
                  <label className="form-label">Manual Token / QR String Verification</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" className="form-control" placeholder="Paste signed QR token..." value={manualToken} onChange={e => setManualToken(e.target.value)} />
                    <button className="btn btn-primary btn-sm" onClick={() => executeScan(manualToken)}>Verify</button>
                  </div>
                </div>
                <div style={{ width: '100%', marginTop: 20, padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid var(--border-glass)' }}>
                  <div style={{ fontSize: '0.75rem', color: '#a5b4fc', fontWeight: 'bold', marginBottom: 8 }}>⚡ INSTANT STATUS SIMULATION:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    <button className="btn btn-success btn-sm" onClick={() => { const first = attendees[0]?.qr_secret_token; if (first) executeScan(first); else alert('No tickets yet. Book from storefront first!'); }}>🟢 Valid</button>
                    <button className="btn btn-warning btn-sm" onClick={() => { const first = attendees[0]?.qr_secret_token; if (first) executeScan(first); }}>🟡 Scanned</button>
                    <button className="btn btn-danger btn-sm" onClick={() => executeScan('invalid_tampered_string.fake_sig')}>🔴 Invalid</button>
                  </div>
                </div>
              </div>

              <div className="glass-panel" style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {!scanResult && (
                  <div style={{ textAlign: 'center', color: 'var(--text-dim)', padding: 40 }}>
                    <div style={{ fontSize: '3rem', marginBottom: 10 }}>⏳</div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Gate Terminal Ready</div>
                    <p style={{ fontSize: '0.85rem' }}>Scan attendee QR code or use simulation buttons.</p>
                  </div>
                )}
                {scanResult && (scanResult.status === 'VALID' || scanResult.status === 'RE_ENTRY_ALLOWED') && (
                  <div style={{ background: 'rgba(16,185,129,0.12)', border: '2px solid #10b981', borderRadius: 16, padding: 24 }}>
                    <div style={{ color: '#10b981', fontWeight: 800, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: 8 }}><span>✓</span><span>ACCESS GRANTED</span></div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 8 }}>{scanResult.ticket?.attendeeName || 'Attendee'}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <span className="badge badge-purple">{scanResult.ticket?.tierName}</span>
                      <span className="badge badge-green">PASS #1</span>
                    </div>
                    <div style={{ marginTop: 14, fontSize: '0.85rem', color: '#a7f3d0' }}>Timestamp: {new Date().toLocaleTimeString('en-IN')}</div>
                  </div>
                )}
                {scanResult && scanResult.status === 'ALREADY_SCANNED' && (
                  <div style={{ background: 'rgba(245,158,11,0.12)', border: '2px solid #f59e0b', borderRadius: 16, padding: 24 }}>
                    <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: 8 }}><span>⚠️</span><span>ALREADY SCANNED!</span></div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 8 }}>{scanResult.ticket?.attendeeName}</div>
                    <p style={{ fontSize: '0.88rem', color: '#fef3c7', marginTop: 4 }}>
                      Previously verified on {new Date(scanResult.ticket?.firstCheckedInAt).toLocaleString('en-IN')}.
                    </p>
                    <button className="btn btn-warning" style={{ width: '100%', marginTop: 16 }} onClick={() => handleOverride(scanResult.ticket?.id)}>🔓 Allow Re-entry (Override)</button>
                  </div>
                )}
                {scanResult && (scanResult.status === 'INVALID' || scanResult.status === 'WRONG_EVENT') && (
                  <div style={{ background: 'rgba(244,63,94,0.12)', border: '2px solid #f43f5e', borderRadius: 16, padding: 24 }}>
                    <div style={{ color: '#f43f5e', fontWeight: 800, fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: 8 }}><span>✕</span><span>ACCESS DENIED</span></div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: 8 }}>{scanResult.reason}</div>
                    <p style={{ fontSize: '0.85rem', color: '#fecdd3', marginTop: 4 }}>Direct attendee to the gate supervisor.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: EVENTS ── */}
        {activeTab === 'events' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: '1.6rem' }}>My Organization Events</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Manage public listings, sessions, and ticket pricing.</p>
              </div>
              {userProfile?.canCreateEvents !== false ? (
                <button className="btn btn-primary" onClick={openModal}>➕ Create Event</button>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', padding: '8px 14px', borderRadius: 10, fontSize: '0.82rem', color: '#fbbf24' }}>
                  🔒 Event Creation Restricted for your Profile ({userProfile?.tenantRole || 'Staff'})
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 20 }}>
              {events.map(e => (
                <div key={e.id} className="glass-panel" style={{ overflow: 'hidden' }}>
                  <img src={e.banner_url || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800'} alt={e.title} style={{ height: 160, width: '100%', objectFit: 'cover' }} />
                  <div style={{ padding: 20 }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{e.title}</h3>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>📍 {e.location}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      {e.session_count > 0 && <span className="badge badge-purple">🎭 {e.session_count} {e.session_count === 1 ? 'Session' : 'Sessions'}</span>}
                    </div>
                    {/* Session list */}
                    {e.sessions && e.sessions.length > 0 && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {e.sessions.slice(0, 3).map((s: any) => (
                          <div key={s.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem' }}>
                            <div style={{ fontWeight: 600, color: '#e2e8f0' }}>{s.name}</div>
                            <div style={{ color: 'var(--text-dim)', marginTop: 2 }}>
                              📅 {s.session_date} {s.start_time && `· ${s.start_time}–${s.end_time || '?'}`}
                              {s.tiers?.length > 0 && <span style={{ color: '#34d399', marginLeft: 8 }}>🎫 {s.tiers.length} ticket {s.tiers.length === 1 ? 'type' : 'types'}</span>}
                            </div>
                          </div>
                        ))}
                        {e.sessions.length > 3 && <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', paddingLeft: 4 }}>+{e.sessions.length - 3} more sessions</div>}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-glass)', fontSize: '0.85rem' }}>
                      <span>Sold: <b style={{ color: '#34d399' }}>{e.tickets_sold || 0}</b></span>
                      <span>Checked In: <b style={{ color: '#a5b4fc' }}>{e.checked_in_count || 0}</b></span>
                    </div>
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>📅</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: 8 }}>No events yet</div>
                  <p style={{ fontSize: '0.9rem' }}>Click "Create Event" to publish your first event with sessions and tickets.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: ANALYTICS ── */}
        {activeTab === 'analytics' && (
          <div>
            <h2 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Real-Time Attendee Directory & Security Logs</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div className="glass-panel" style={{ padding: 20 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>CHECK-IN RATE</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#34d399', marginTop: 4 }}>{stats.checkinPercentage || 0}%</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{stats.checkedInCount || 0} of {stats.totalTickets || 0} checked in</div>
              </div>
              <div className="glass-panel" style={{ padding: 20 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>GROSS SALES</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', marginTop: 4 }}>₹{parseFloat(stats.grossRevenueRupees || 0).toLocaleString('en-IN')}</div>
              </div>
            </div>
            <div className="glass-panel" style={{ padding: 24, marginBottom: 24 }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: 14 }}>Attendee Directory</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-dim)' }}>
                    <th style={{ padding: 10 }}>Ticket ID</th>
                    <th style={{ padding: 10 }}>Attendee</th>
                    <th style={{ padding: 10 }}>Tier</th>
                    <th style={{ padding: 10 }}>Phone</th>
                    <th style={{ padding: 10 }}>Check-in Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendees.map(a => (
                    <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: 12 }}><code>{a.id}</code></td>
                      <td style={{ padding: 12 }}><b>{a.attendee_name}</b></td>
                      <td style={{ padding: 12 }}>{a.tier_name}</td>
                      <td style={{ padding: 12 }}>{a.customer_phone}</td>
                      <td style={{ padding: 12 }}>
                        <span className={`badge ${a.checkin_count > 0 ? 'badge-green' : 'badge-yellow'}`}>
                          {a.checkin_count > 0 ? `CHECKED IN (${a.checkin_count}x)` : 'NOT ARRIVED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: TEAM & PERMISSIONS ── */}
        {activeTab === 'team' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: '1.6rem' }}>Organization Team & Permissions</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Manage team profiles, roles, and event creation authorization policies.</p>
              </div>
              {userProfile?.tenantRole !== 'STAFF' ? (
                <button className="btn btn-primary" onClick={() => setShowTeamModal(true)}>➕ Add Team Member</button>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', padding: '8px 14px', borderRadius: 10, fontSize: '0.82rem', color: '#fbbf24' }}>
                  🔒 Gate Staff Profile (Team Management Restricted)
                </div>
              )}
            </div>

            {/* Org Policy Card */}
            <div className="glass-panel" style={{ padding: 24, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#e2e8f0' }}>Organization Event Creation Policy</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Controls default profile policy for who inside your organization is permitted to create new events.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, background: 'rgba(15, 23, 42, 0.6)', padding: 6, borderRadius: 10, border: '1px solid var(--border-glass)' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${orgPolicy === 'ADMIN_ONLY' ? 'btn-primary' : 'btn-secondary'}`}
                  disabled={userProfile?.tenantRole === 'STAFF'}
                  onClick={() => handleUpdatePolicy('ADMIN_ONLY')}
                >
                  🔒 Admins & Managers Only
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${orgPolicy === 'ALL_MEMBERS' ? 'btn-primary' : 'btn-secondary'}`}
                  disabled={userProfile?.tenantRole === 'STAFF'}
                  onClick={() => handleUpdatePolicy('ALL_MEMBERS')}
                >
                  🌐 All Team Members Allowed
                </button>
              </div>
            </div>

            {/* Team Members Table */}
            <div className="glass-panel" style={{ padding: 24 }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: 16 }}>Team Profiles ({teamMembers.length} Members)</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-dim)' }}>
                      <th style={{ padding: 12 }}>Member</th>
                      <th style={{ padding: 12 }}>Profile Role</th>
                      <th style={{ padding: 12 }}>Event Creation Permission</th>
                      <th style={{ padding: 12 }}>Access Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: 14 }}>
                          <div style={{ fontWeight: 700, color: '#f8fafc' }}>{m.name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{m.email}</div>
                        </td>
                        <td style={{ padding: 14 }}>
                          <select
                            className="form-control"
                            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.82rem' }}
                            value={m.tenant_role}
                            disabled={userProfile?.tenantRole === 'STAFF'}
                            onChange={(e) => handleUpdateRole(m.id, e.target.value)}
                          >
                            <option value="OWNER">Owner / Admin</option>
                            <option value="EVENT_MANAGER">Event Manager</option>
                            <option value="STAFF">Gate Staff</option>
                          </select>
                        </td>
                        <td style={{ padding: 14 }}>
                          <button
                            type="button"
                            className={`btn btn-sm ${m.can_create_events ? 'btn-success' : 'btn-warning'}`}
                            style={{ padding: '5px 14px', fontSize: '0.78rem' }}
                            disabled={userProfile?.tenantRole === 'STAFF'}
                            onClick={() => handleTogglePermission(m.id, m.can_create_events)}
                          >
                            {m.can_create_events ? '✅ Allowed to Create Events' : '🚫 Event Creation Restricted'}
                          </button>
                        </td>
                        <td style={{ padding: 14 }}>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                            {m.tenant_role === 'OWNER' ? 'Full Access' : m.can_create_events ? 'Events + Scanner' : 'Scanner Only'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ADD TEAM MEMBER MODAL */}
      {showTeamModal && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowTeamModal(false); }}>
          <div className="modal-dialog" style={{ maxWidth: 480, borderRadius: 16 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Add Organization Team Member</h3>
              <button onClick={() => setShowTeamModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer' }}>&times;</button>
            </div>
            <form onSubmit={handleAddTeamMember}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Ananya Rao"
                    value={newTeamMember.name}
                    onChange={e => setNewTeamMember(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="ananya@organization.com"
                    value={newTeamMember.email}
                    onChange={e => setNewTeamMember(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Password *</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Set login password"
                    value={newTeamMember.password}
                    onChange={e => setNewTeamMember(prev => ({ ...prev, password: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Profile Role *</label>
                  <select
                    className="form-control"
                    value={newTeamMember.tenant_role}
                    onChange={e => setNewTeamMember(prev => ({
                      ...prev,
                      tenant_role: e.target.value,
                      can_create_events: e.target.value !== 'STAFF'
                    }))}
                  >
                    <option value="EVENT_MANAGER">Event Manager (Create & manage events)</option>
                    <option value="OWNER">Organization Admin (Full Access)</option>
                    <option value="STAFF">Gate Staff / Ticket Verifier (Scan only)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 10, marginTop: 4 }}>
                  <input
                    type="checkbox"
                    id="canCreateEventsCheck"
                    checked={newTeamMember.can_create_events}
                    onChange={e => setNewTeamMember(prev => ({ ...prev, can_create_events: e.target.checked }))}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  <label htmlFor="canCreateEventsCheck" style={{ fontSize: '0.85rem', cursor: 'pointer', color: '#e2e8f0' }}>
                    Allow this profile to create & publish events
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowTeamModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Add Team Member</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          CREATE EVENT MODAL — Wide slide-over panel with 3 steps
          ═══════════════════════════════════════════════════════════════════════ */}
      {showEventModal && (
        <div
          className="modal-backdrop"
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ alignItems: 'stretch', padding: 0 }}
        >
          <div style={{
            background: '#0a0f1e',
            border: '1px solid rgba(99,102,241,0.25)',
            width: '100%',
            maxWidth: 860,
            margin: '0 auto',
            height: '100vh',
            maxHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 0 60px rgba(99,102,241,0.2)',
            overflow: 'hidden',
          }}>
            {/* Modal Header */}
            <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'rgba(15,23,42,0.9)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #6366f1, #ec4899)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🎪</div>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Create New Event</h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>Configure sessions, ticket types & pricing</p>
                  </div>
                </div>
              </div>

              {/* Step indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                {[1, 2, 3].map((s, i) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                      onClick={() => { if (s < eventStep || (s === 2 && newEvent.title && newEvent.location)) setEventStep(s as 1 | 2 | 3); }}
                      style={{
                        width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.8rem', fontWeight: 700,
                        background: eventStep === s ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : eventStep > s ? '#10b981' : 'rgba(255,255,255,0.08)',
                        color: '#fff',
                        border: eventStep === s ? '2px solid #818cf8' : eventStep > s ? '2px solid #10b981' : '2px solid rgba(255,255,255,0.12)',
                        cursor: s <= eventStep ? 'pointer' : 'default',
                        transition: 'all 0.2s',
                        boxShadow: eventStep === s ? '0 0 12px rgba(99,102,241,0.5)' : 'none',
                      }}
                    >
                      {eventStep > s ? '✓' : s}
                    </div>
                    {i < 2 && (
                      <div style={{ width: 32, height: 2, background: eventStep > s ? 'linear-gradient(90deg,#10b981,#10b981)' : 'rgba(255,255,255,0.1)', margin: '0 2px', transition: 'all 0.3s' }} />
                    )}
                  </div>
                ))}
              </div>

              <button onClick={closeModal} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', width: 34, height: 34, borderRadius: 8, cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>

            {/* Step Labels */}
            <div style={{ display: 'flex', padding: '10px 28px', gap: 0, background: 'rgba(15,23,42,0.6)', borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
              {[
                { n: 1, label: 'Event Details', icon: '📋' },
                { n: 2, label: 'Sessions', icon: '🎭' },
                { n: 3, label: 'Ticket Pricing', icon: '🎫' },
              ].map(({ n, label, icon }) => (
                <div key={n} style={{ flex: 1, textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, color: eventStep === n ? '#a5b4fc' : eventStep > n ? '#34d399' : '#475569' }}>
                  {icon} {label}
                </div>
              ))}
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateEvent} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 8px' }}>

                {/* ── STEP 1: Event Details ── */}
                {eventStep === 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}>
                        <label className="form-label">Event Title *</label>
                        <input type="text" className="form-control" placeholder="e.g. Dandiya Mahotsav 2026 / Live Concert" value={newEvent.title} onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))} required />
                      </div>
                      <div className="form-group" style={{ margin: 0, gridColumn: '1/-1' }}>
                        <label className="form-label">Location / Venue *</label>
                        <input type="text" className="form-control" placeholder="e.g. KACHERI Club, Town Hall, Gorakhpur" value={newEvent.location} onChange={e => setNewEvent(p => ({ ...p, location: e.target.value }))} required />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Event Start *</label>
                        <input type="datetime-local" className="form-control" value={newEvent.start_date} onChange={e => setNewEvent(p => ({ ...p, start_date: e.target.value }))} required />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Event End *</label>
                        <input type="datetime-local" className="form-control" value={newEvent.end_date} onChange={e => setNewEvent(p => ({ ...p, end_date: e.target.value }))} required />
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Cover Banner URL <span style={{ color: '#475569' }}>(optional)</span></label>
                        <input type="url" className="form-control" placeholder="https://..." value={newEvent.banner_url} onChange={e => setNewEvent(p => ({ ...p, banner_url: e.target.value }))} />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Short Description <span style={{ color: '#475569' }}>(optional)</span></label>
                        <input type="text" className="form-control" placeholder="A short summary of the event experience..." value={newEvent.description} onChange={e => setNewEvent(p => ({ ...p, description: e.target.value }))} />
                      </div>
                    </div>

                    {/* Banner preview */}
                    {newEvent.banner_url && (
                      <div style={{ borderRadius: 12, overflow: 'hidden', height: 140, border: '1px solid rgba(255,255,255,0.08)' }}>
                        <img src={newEvent.banner_url} alt="Banner preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                  </div>
                )}

                {/* ── STEP 2: Sessions ── */}
                {eventStep === 2 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
                          Add one or more sessions. Each session can have its own schedule and — unless you use uniform pricing — its own ticket types and prices.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={addSession}
                        style={{ flexShrink: 0, marginLeft: 16 }}
                      >
                        ➕ Add Session
                      </button>
                    </div>

                    {newEvent.sessions.map((sess, idx) => (
                      <div key={sess.id} style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(99,102,241,0.18)', borderRadius: 14, overflow: 'hidden' }}>
                        {/* Session header */}
                        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(99,102,241,0.07)', borderBottom: '1px solid rgba(99,102,241,0.12)' }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, color: '#fff', flexShrink: 0 }}>{idx + 1}</div>
                          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#c7d2fe' }}>Session {idx + 1}</span>
                          {newEvent.sessions.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeSession(sess.id)}
                              style={{ marginLeft: 'auto', background: 'rgba(244,63,94,0.12)', color: '#f87171', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 6, padding: '3px 10px', fontSize: '0.75rem', cursor: 'pointer' }}
                            >✕ Remove</button>
                          )}
                        </div>

                        {/* Session fields */}
                        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.78rem' }}>Session Name *</label>
                              <input type="text" className="form-control" style={{ padding: '9px 12px', fontSize: '0.88rem' }} placeholder={`e.g. Day ${idx + 1} — Headliner Night`} value={sess.name} onChange={e => updateSession(sess.id, 'name', e.target.value)} required />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.78rem' }}>Date *</label>
                              <input type="date" className="form-control" style={{ padding: '9px 12px', fontSize: '0.88rem' }} value={sess.session_date} onChange={e => updateSession(sess.id, 'session_date', e.target.value)} required />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.78rem' }}>Venue / Stage</label>
                              <input type="text" className="form-control" style={{ padding: '9px 12px', fontSize: '0.88rem' }} placeholder="e.g. Main Stage" value={sess.venue_note} onChange={e => updateSession(sess.id, 'venue_note', e.target.value)} />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.78rem' }}>Start Time</label>
                              <input type="time" className="form-control" style={{ padding: '9px 12px', fontSize: '0.88rem' }} value={sess.start_time} onChange={e => updateSession(sess.id, 'start_time', e.target.value)} />
                            </div>
                            <div className="form-group" style={{ margin: 0 }}>
                              <label className="form-label" style={{ fontSize: '0.78rem' }}>End Time</label>
                              <input type="time" className="form-control" style={{ padding: '9px 12px', fontSize: '0.88rem' }} value={sess.end_time} onChange={e => updateSession(sess.id, 'end_time', e.target.value)} />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── STEP 3: Ticket Pricing ── */}
                {eventStep === 3 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Uniform pricing toggle */}
                    <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                      <div>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#c7d2fe' }}>🔗 Same tickets & pricing for all sessions</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>
                          {newEvent.uniform_pricing
                            ? 'One set of ticket types applies to all sessions. Disable to set different prices per session.'
                            : 'Enable to define ticket types once and apply them uniformly across all sessions.'}
                        </div>
                      </div>
                      {/* Toggle switch */}
                      <div
                        onClick={() => toggleUniformPricing(!newEvent.uniform_pricing)}
                        style={{
                          width: 52, height: 28, borderRadius: 14, cursor: 'pointer', transition: 'all 0.25s', flexShrink: 0,
                          background: newEvent.uniform_pricing ? 'linear-gradient(135deg,#6366f1,#4f46e5)' : 'rgba(255,255,255,0.1)',
                          border: newEvent.uniform_pricing ? '2px solid #818cf8' : '2px solid rgba(255,255,255,0.15)',
                          position: 'relative',
                          boxShadow: newEvent.uniform_pricing ? '0 0 12px rgba(99,102,241,0.4)' : 'none',
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: 2, left: newEvent.uniform_pricing ? 24 : 2, width: 20, height: 20,
                          borderRadius: '50%', background: '#fff', transition: 'left 0.25s',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                        }} />
                      </div>
                    </div>

                    {/* UNIFORM mode: one set of template tiers */}
                    {newEvent.uniform_pricing && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8' }}>
                            Ticket types (applied to all {newEvent.sessions.length} sessions)
                          </div>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={addTemplateTier} style={{ fontSize: '0.8rem' }}>➕ Add Ticket Type</button>
                        </div>

                        {/* Column headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px auto', gap: 8, padding: '0 0 4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {['Ticket Name', 'Price', 'Capacity', ''].map(h => (
                            <div key={h} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                          ))}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {newEvent.template_tiers.map(tier =>
                            renderTierRow(
                              tier,
                              (f, v) => updateTemplateTier(tier.id, f, v),
                              () => removeTemplateTier(tier.id),
                              newEvent.template_tiers.length > 1
                            )
                          )}
                        </div>

                        {/* Preview which sessions get these */}
                        <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 10, padding: '12px 16px', fontSize: '0.8rem', color: '#6ee7b7' }}>
                          ✅ These {newEvent.template_tiers.length} ticket type(s) will be applied to all {newEvent.sessions.length} session(s):&nbsp;
                          {newEvent.sessions.map((s, i) => <span key={s.id}>{s.name || `Session ${i + 1}`}{i < newEvent.sessions.length - 1 ? ', ' : ''}</span>)}
                        </div>
                      </div>
                    )}

                    {/* PER-SESSION mode: tiers per session */}
                    {!newEvent.uniform_pricing && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {newEvent.sessions.map((sess, idx) => (
                          <div key={sess.id} style={{ background: 'rgba(30,41,59,0.5)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
                            {/* Session label */}
                            <div style={{ padding: '12px 18px', background: 'rgba(15,23,42,0.6)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, color: '#fff' }}>{idx + 1}</div>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#e2e8f0' }}>{sess.name || `Session ${idx + 1}`}</div>
                                  {sess.session_date && <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>📅 {sess.session_date}{sess.start_time ? ` · ${sess.start_time}–${sess.end_time || '?'}` : ''}{sess.venue_note ? ` · ${sess.venue_note}` : ''}</div>}
                                </div>
                              </div>
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => addTierToSession(sess.id)} style={{ fontSize: '0.78rem', padding: '5px 12px' }}>➕ Add Ticket</button>
                            </div>

                            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {/* Column headers */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px auto', gap: 8, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                {['Ticket Name', 'Price', 'Capacity', ''].map(h => (
                                  <div key={h} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</div>
                                ))}
                              </div>

                              {sess.tiers.map(tier =>
                                renderTierRow(
                                  tier,
                                  (f, v) => updateTierInSession(sess.id, tier.id, f, v),
                                  () => removeTierFromSession(sess.id, tier.id),
                                  sess.tiers.length > 1
                                )
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '16px 28px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'rgba(15,23,42,0.8)' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                  {eventStep === 1 && '📋 Fill in basic event info'}
                  {eventStep === 2 && `🎭 ${newEvent.sessions.length} session${newEvent.sessions.length !== 1 ? 's' : ''} configured`}
                  {eventStep === 3 && (newEvent.uniform_pricing ? `🔗 Uniform pricing · ${newEvent.template_tiers.length} ticket type(s)` : `🎫 Custom pricing per session`)}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {eventStep > 1 && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEventStep((eventStep - 1) as 1 | 2 | 3)}>
                      ← Back
                    </button>
                  )}
                  {eventStep < 3 && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ padding: '10px 24px' }}
                      onClick={() => {
                        if (eventStep === 1) {
                          if (!newEvent.title.trim()) { alert('Please enter an event title'); return; }
                          if (!newEvent.location.trim()) { alert('Please enter a venue / location'); return; }
                          if (!newEvent.start_date || !newEvent.end_date) { alert('Please set start and end dates'); return; }
                        }
                        setEventStep((eventStep + 1) as 2 | 3);
                      }}
                    >
                      Next → {eventStep === 1 ? 'Sessions' : 'Ticket Pricing'}
                    </button>
                  )}
                  {eventStep === 3 && (
                    <button type="submit" className="btn btn-primary" style={{ padding: '10px 28px', fontWeight: 800 }} disabled={submitting}>
                      {submitting ? '⏳ Creating...' : '🚀 Publish Event'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
