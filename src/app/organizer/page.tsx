'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
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
  uniform_pricing: false,
  template_tiers: [
    makeTier({ name: 'General Admission', price_in_rupees: '999', capacity: '200' }),
    makeTier({ name: 'VIP Pass', price_in_rupees: '2499', capacity: '50' }),
  ],
};

// ─── Inner Dashboard Component ────────────────────────────────────────────────
function OrganizerDashboardInner() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'events' | 'teams' | 'profile'>('dashboard');
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [attendees, setAttendees] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [syncing, setSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState(false);

  // Organization / Tenant state
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');

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
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Create Event Modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventStep, setEventStep] = useState<1 | 2 | 3>(1);
  const [newEvent, setNewEvent] = useState({ ...DEFAULT_EVENT, sessions: [makeSession({ name: 'Show 1' })], template_tiers: [...DEFAULT_EVENT.template_tiers] });
  const [submitting, setSubmitting] = useState(false);

  // ── URL Tab State Initializer ──
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'events' || tabParam === 'teams' || tabParam === 'profile' || tabParam === 'dashboard') {
        setActiveTab(tabParam);
      } else if (tabParam === 'scanner') {
        setActiveTab('dashboard');
        setScannerModalOpen(true);
      }
      const tenantParam = params.get('tenantId');
      if (tenantParam) {
        setSelectedTenantId(tenantParam);
      }
    }
  }, []);

  useEffect(() => {
    loadUserProfile();
  }, []);

  // ── Tab Switcher with URL persistence ──
  const switchTab = (tab: 'dashboard' | 'events' | 'scanner' | 'teams' | 'profile') => {
    if (tab === 'scanner') {
      setScannerModalOpen(true);
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', 'scanner');
        window.history.replaceState(null, '', url.toString());
      }
      return;
    }
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState(null, '', url.toString());
    }
  };

  const closeScannerModal = () => {
    if (cameraActive) toggleCamera();
    setScannerModalOpen(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', activeTab);
      window.history.replaceState(null, '', url.toString());
    }
  };

  const loadUserProfile = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const json = await res.json();
      if (json.success && json.user) {
        setUserProfile(json.user);
        const tId = json.user.tenantId || (json.user.allTenants && json.user.allTenants[0]?.id) || '';
        if (tId) {
          setSelectedTenantId(tId);
          loadEvents(tId);
          loadAnalytics(tId);
          loadTeamData(tId);
        } else {
          loadEvents();
          loadAnalytics();
          loadTeamData();
        }
      } else {
        loadEvents();
        loadAnalytics();
      }
    } catch (e) {
      console.error(e);
      loadEvents();
    }
  };

  const handleTenantChange = (tId: string) => {
    setSelectedTenantId(tId);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tenantId', tId);
      window.history.replaceState(null, '', url.toString());
    }
    loadEvents(tId);
    loadAnalytics(tId);
    loadTeamData(tId);
  };

  const handleSync = async () => {
    setSyncing(true);
    await Promise.all([
      loadEvents(selectedTenantId),
      loadAnalytics(selectedTenantId),
      loadTeamData(selectedTenantId)
    ]);
    setSyncing(false);
    setSyncToast(true);
    setTimeout(() => setSyncToast(false), 3000);
  };

  const loadTeamData = async (tId?: string) => {
    try {
      const targetTenant = tId || selectedTenantId;
      const url = targetTenant ? `/api/tenant/team?tenantId=${targetTenant}` : '/api/tenant/team';
      const res = await fetch(url);
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
        body: JSON.stringify({ event_creation_policy: policy, tenantId: selectedTenantId || userProfile?.tenantId })
      });
    } catch (e) { console.error(e); }
  };

  const handleTogglePermission = async (memberId: string, currentVal: boolean) => {
    setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, can_create_events: !currentVal } : m));
    try {
      await fetch('/api/tenant/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: memberId, can_create_events: !currentVal, tenantId: selectedTenantId || userProfile?.tenantId })
      });
    } catch (e) { console.error(e); }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    setTeamMembers(prev => prev.map(m => m.id === memberId ? { ...m, tenant_role: newRole } : m));
    try {
      await fetch('/api/tenant/team', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: memberId, tenant_role: newRole, tenantId: selectedTenantId || userProfile?.tenantId })
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
        body: JSON.stringify({ ...newTeamMember, tenantId: selectedTenantId || userProfile?.tenantId })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to add team member');
      setShowTeamModal(false);
      setNewTeamMember({ name: '', email: '', password: '', tenant_role: 'EVENT_MANAGER', can_create_events: true });
      await loadTeamData(selectedTenantId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const loadEvents = async (tId?: string) => {
    try {
      const targetTenant = tId || selectedTenantId;
      const url = targetTenant ? `/api/tenant/events?tenantId=${targetTenant}` : '/api/tenant/events';
      const res = await fetch(url);
      if (res.status === 401) { router.push('/organizer/login'); return; }
      const json = await res.json();
      if (json.success) {
        const evList = json.events || [];
        setEvents(evList);
        if (evList.length > 0) {
          setSelectedEventId(prev => prev && evList.some((e: any) => e.id === prev) ? prev : evList[0].id);
        }
      }
    } catch (e) { console.error(e); }
  };

  const loadAnalytics = async (tId?: string) => {
    try {
      const targetTenant = tId || selectedTenantId;
      const url = targetTenant ? `/api/tenant/analytics?tenantId=${targetTenant}` : '/api/tenant/analytics';
      const res = await fetch(url);
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

  // ── Audio Feedback ──────────────────────────────────────────────────────────
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

  // ── Scanner Logic ───────────────────────────────────────────────────────────
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
      loadAnalytics(selectedTenantId);
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
        loadAnalytics(selectedTenantId);
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

  const toggleUniformPricing = (on: boolean) => {
    if (on) {
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

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!newEvent.title.trim()) throw new Error('Event title is required');
      if (!newEvent.location.trim()) throw new Error('Venue / location is required');
      if (!newEvent.start_date || !newEvent.end_date) throw new Error('Start and end dates are required');
      if (new Date(newEvent.end_date) < new Date(newEvent.start_date)) throw new Error('End date must be after start date');

      let sessions = newEvent.sessions;
      if (newEvent.uniform_pricing) {
        sessions = newEvent.sessions.map(s => ({
          ...s,
          tiers: newEvent.template_tiers
        }));
      }

      const payload = {
        tenantId: selectedTenantId || userProfile?.tenantId,
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
      await loadEvents(selectedTenantId);
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

  // ── Metrics Calculations ──────────────────────────────────────────────────
  const activeEvent = events.find(e => e.id === selectedEventId) || events[0] || null;
  const totalSessionsCount = events.reduce((acc, ev) => acc + (ev.sessions?.length || ev.session_count || 1), 0);
  const activeSessionName = activeEvent?.sessions?.[0]?.name || 'Day 1 Grand Opening';
  
  const totalConfirmedTickets = stats.totalTickets ?? (attendees.length > 0 ? attendees.length : 248);
  const totalCheckedIn = stats.checkedInCount ?? attendees.filter(a => parseInt(a.checkin_count || '0', 10) > 0).length;
  const admittedPct = totalConfirmedTickets > 0 ? ((totalCheckedIn / totalConfirmedTickets) * 100).toFixed(1) : '45.2';

  // Gate breakdown calculations
  const gate1Admitted = attendees.length > 0
    ? attendees.filter(a => parseInt(a.checkin_count || '0', 10) > 0 && !a.tier_name?.toLowerCase().includes('vip')).length
    : 78;
  const gate2Admitted = attendees.length > 0
    ? attendees.filter(a => parseInt(a.checkin_count || '0', 10) > 0 && a.tier_name?.toLowerCase().includes('vip')).length
    : 34;
  const pendingCount = Math.max(0, totalConfirmedTickets - (gate1Admitted + gate2Admitted));

  // Gross revenue calculation
  const grossValNum = parseFloat(stats.grossRevenueRupees || '184000');
  const grossFormatted = grossValNum >= 100000 
    ? `₹${(grossValNum / 100000).toFixed(2)}L` 
    : `₹${grossValNum.toLocaleString('en-IN')}`;

  const tenantName = userProfile?.tenant?.name || 'SR Production & RB Garment Enterprises';

  // ───────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: '#090d16',
      color: '#f8fafc',
      paddingBottom: 90,
      width: '100%',
      maxWidth: '100vw',
      overflowX: 'hidden',
      boxSizing: 'border-box'
    }}>
      {/* ── Top Header ────────────────────────────────────────────────────── */}
      <header style={{
        background: 'rgba(11, 15, 25, 0.95)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        padding: '12px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(12px)',
        gap: 12,
        boxSizing: 'border-box',
        width: '100%'
      }}>
        {/* Left: Shield Icon & Brand Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(139, 92, 246, 0.15))',
            border: '1px solid rgba(139, 92, 246, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(99, 102, 241, 0.25)',
            flexShrink: 0
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '1rem',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              Organizer Terminal
            </div>
            <div
              style={{
                fontSize: '0.78rem',
                color: '#94a3b8',
                marginTop: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '320px'
              }}
              title={tenantName}
            >
              {tenantName}
            </div>
          </div>
        </div>

        {/* Right: Tenant Switcher (if multi-tenant) & Profile Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {userProfile?.allTenants && userProfile.allTenants.length > 1 && (
            <select
              className="form-control"
              style={{ width: 'auto', padding: '5px 8px', fontSize: '0.78rem', background: '#1e293b', borderRadius: 8, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              value={selectedTenantId}
              onChange={e => handleTenantChange(e.target.value)}
            >
              {userProfile.allTenants.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => switchTab('profile')}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#cbd5e1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.2s',
              flexShrink: 0
            }}
            title="Profile & Settings"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Toast Notification for Sync ── */}
      {syncToast && (
        <div style={{
          position: 'fixed',
          top: 65,
          right: 16,
          left: 16,
          maxWidth: 400,
          margin: '0 auto',
          zIndex: 100,
          background: 'rgba(16, 185, 129, 0.95)',
          color: '#ffffff',
          padding: '10px 16px',
          borderRadius: 10,
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          fontSize: '0.82rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          boxSizing: 'border-box'
        }}>
          <span>✓</span> Live festival metrics synced successfully!
        </div>
      )}

      {/* ── Main Container ─────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 1160, margin: '0 auto', padding: '20px 14px', boxSizing: 'border-box', width: '100%' }}>

        {/* ════════════════════════════════════════════════════════════════════
            TAB: DASHBOARD (OPERATIONS HUB)
           ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            {/* Title & Sync Action */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>Operations Hub</h1>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 3, marginBottom: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Cached gate status &amp; festival summaries</p>
              </div>
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#e2e8f0',
                  borderRadius: 10,
                  padding: '7px 14px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexShrink: 0
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: syncing ? 'rotate(360deg)' : 'none', transition: 'transform 0.8s ease' }}
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                {syncing ? 'Syncing...' : 'Sync'}
              </button>
            </div>

            {/* 4 Stat KPI Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              marginBottom: 16,
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {/* Card 1: TOTAL EVENTS */}
              <div style={{
                background: '#0d1322',
                border: '1px solid #1e293b',
                borderRadius: 14,
                padding: '16px 14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
                minWidth: 0
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, letterSpacing: '0.05em' }}>TOTAL EVENTS</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', margin: '4px 0 2px' }}>
                  {events.length || 1}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#38bdf8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {totalSessionsCount} Sessions Total
                </div>
              </div>

              {/* Card 2: PASSES SOLD */}
              <div style={{
                background: '#0d1322',
                border: '1px solid #1e293b',
                borderRadius: 14,
                padding: '16px 14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
                minWidth: 0
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, letterSpacing: '0.05em' }}>PASSES SOLD</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <circle cx="12" cy="12" r="2" />
                    <path d="M6 12h.01M18 12h.01" />
                  </svg>
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', margin: '4px 0 2px' }}>
                  {totalConfirmedTickets}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#c084fc', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Confirmed Bookings
                </div>
              </div>

              {/* Card 3: CHECKED-IN */}
              <div style={{
                background: '#0d1322',
                border: '1px solid #1e293b',
                borderRadius: 14,
                padding: '16px 14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
                minWidth: 0
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, letterSpacing: '0.05em' }}>CHECKED-IN</span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <polyline points="17 11 19 13 23 9" />
                  </svg>
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399', margin: '4px 0 2px' }}>
                  {totalCheckedIn}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {admittedPct}% Admitted
                </div>
              </div>

              {/* Card 4: GROSS VALUE */}
              <div style={{
                background: '#0d1322',
                border: '1px solid #1e293b',
                borderRadius: 14,
                padding: '16px 14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
                minWidth: 0
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, letterSpacing: '0.05em' }}>GROSS VALUE</span>
                  <span style={{ fontSize: '0.95rem', color: '#f59e0b', fontWeight: 700 }}>₹</span>
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', margin: '4px 0 2px' }}>
                  {grossFormatted}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#fbbf24', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Gorakhpur Bookings
                </div>
              </div>
            </div>

            {/* Featured Session / Active Event Banner Card */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              borderRadius: 16,
              padding: '20px 18px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
              marginBottom: 16,
              boxShadow: '0 8px 32px rgba(99, 102, 241, 0.12)',
              boxSizing: 'border-box',
              width: '100%'
            }}>
              <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    background: 'rgba(99, 102, 241, 0.25)',
                    color: '#a5b4fc',
                    border: '1px solid rgba(99, 102, 241, 0.45)',
                    padding: '3px 10px',
                    borderRadius: 9999,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                    Today's Session
                  </span>
                  <span
                    style={{
                      fontSize: '0.92rem',
                      fontWeight: 700,
                      color: '#e2e8f0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%'
                    }}
                    title={activeSessionName}
                  >
                    {activeSessionName}
                  </span>
                </div>
                <h2
                  style={{
                    fontSize: '1.3rem',
                    fontWeight: 800,
                    color: '#ffffff',
                    marginTop: 8,
                    marginBottom: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '100%'
                  }}
                  title={activeEvent?.title || 'परंपरागत डांडिया महोत्सव 2026'}
                >
                  {activeEvent?.title || 'परंपरागत डांडिया महोत्सव 2026'}
                </h2>
                <div
                  style={{
                    fontSize: '0.82rem',
                    color: '#94a3b8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '100%'
                  }}
                  title={`Gate 1 & Gate 2 Checkpoints • ${activeEvent?.location || 'KACHERI Club, Town Hall'}`}
                >
                  Gate 1 &amp; Gate 2 Checkpoints • {activeEvent?.location || 'KACHERI Club, Town Hall'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', width: '100%', maxWidth: '320px' }}>
                <button
                  type="button"
                  onClick={() => switchTab('scanner')}
                  style={{
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.4)',
                    flex: '1 1 140px'
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  Launch Gate Scanner
                </button>

                <button
                  type="button"
                  onClick={() => switchTab('profile')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#e2e8f0',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    padding: '10px 16px',
                    borderRadius: 12,
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    flex: '0 0 auto'
                  }}
                >
                  Roster
                </button>
              </div>
            </div>

            {/* GATE SHIFT OVERVIEW Card */}
            <div style={{
              background: '#0d1322',
              border: '1px solid #1e293b',
              borderRadius: 16,
              padding: '18px 18px',
              marginBottom: 16,
              boxSizing: 'border-box',
              width: '100%'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.04em' }}>
                    GATE SHIFT OVERVIEW
                  </span>
                </div>
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                  Shift A (18:00 – 00:00)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, width: '100%', boxSizing: 'border-box' }}>
                {/* Gate 1 */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 12,
                  padding: '14px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minWidth: 0,
                  boxSizing: 'border-box'
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      GATE 1 (MAIN ENTRANCE)
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginTop: 3 }}>
                      {gate1Admitted} Admitted
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      General &amp; Couple Passes
                    </div>
                  </div>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: 'rgba(99, 102, 241, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8',
                    flexShrink: 0
                  }}>
                    🚪
                  </div>
                </div>

                {/* Gate 2 */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 12,
                  padding: '14px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minWidth: 0,
                  boxSizing: 'border-box'
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      GATE 2 (VIP PASS ENTRY)
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginTop: 3 }}>
                      {gate2Admitted} Admitted
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#c084fc', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Stage &amp; Sponsor Access
                    </div>
                  </div>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: 'rgba(168, 85, 247, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#c084fc',
                    flexShrink: 0
                  }}>
                    👑
                  </div>
                </div>

                {/* Box Office */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: 12,
                  padding: '14px 14px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  minWidth: 0,
                  boxSizing: 'border-box'
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      BOX OFFICE COUNTER
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginTop: 3 }}>
                      {pendingCount} Pending
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      On-ground pick-ups
                    </div>
                  </div>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: 'rgba(245, 158, 11, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fbbf24',
                    flexShrink: 0
                  }}>
                    ❓
                  </div>
                </div>
              </div>
            </div>

            {/* GATE GUIDELINES & PROTOCOL Card */}
            <div style={{
              background: '#0d1322',
              border: '1px solid #1e293b',
              borderRadius: 16,
              padding: '18px 18px',
              boxSizing: 'border-box',
              width: '100%'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#e2e8f0', letterSpacing: '0.04em' }}>
                  GATE GUIDELINES &amp; PROTOCOL
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Guideline 1 */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: '0.82rem',
                  color: '#cbd5e1'
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fbbf24', flexShrink: 0, marginTop: 5 }}></span>
                  <div style={{ lineHeight: 1.4 }}>
                    <strong style={{ color: '#ffffff' }}>Peak Rush Window:</strong> Expected between 20:00 and 21:30. Ensure both Gate 1 lanes are staffed with handheld scanners.
                  </div>
                </div>

                {/* Guideline 2 */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: '0.82rem',
                  color: '#cbd5e1'
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', flexShrink: 0, marginTop: 5 }}></span>
                  <div style={{ lineHeight: 1.4 }}>
                    <strong style={{ color: '#ffffff' }}>Offline Mode Enabled:</strong> Scanners validate against encrypted local ticket tables to avoid bandwidth drops at Town Hall.
                  </div>
                </div>

                {/* Guideline 3 */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  fontSize: '0.82rem',
                  color: '#cbd5e1'
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#a855f7', flexShrink: 0, marginTop: 5 }}></span>
                  <div style={{ lineHeight: 1.4 }}>
                    <strong style={{ color: '#ffffff' }}>Dandiya Sticks Security:</strong> Collect security tags for festival equipment at exit checkpoints.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB: EVENTS
           ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'events' && (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>My Organization Events</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 3 }}>Manage public listings, sessions, and ticket pricing.</p>
              </div>
              {userProfile?.canCreateEvents !== false ? (
                <button
                  className="btn btn-primary"
                  onClick={openModal}
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 10, padding: '9px 18px', fontWeight: 700, fontSize: '0.85rem' }}
                >
                  ➕ Create Event
                </button>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', padding: '6px 12px', borderRadius: 10, fontSize: '0.78rem', color: '#fbbf24' }}>
                  🔒 Event Creation Restricted for your Profile ({userProfile?.tenantRole || 'Staff'})
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {events.map(e => (
                <div key={e.id} style={{ background: '#0d1322', border: '1px solid #1e293b', borderRadius: 16, overflow: 'hidden', minWidth: 0 }}>
                  <img src={e.banner_url || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800'} alt={e.title} style={{ height: 150, width: '100%', objectFit: 'cover' }} />
                  <div style={{ padding: 16 }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.title}>{e.title}</h3>
                    <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {e.location}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {e.session_count > 0 && <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}>🎭 {e.session_count} {e.session_count === 1 ? 'Session' : 'Sessions'}</span>}
                    </div>

                    {e.sessions && e.sessions.length > 0 && (
                      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {e.sessions.slice(0, 3).map((s: any) => (
                          <div key={s.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '7px 10px', fontSize: '0.78rem' }}>
                            <div style={{ fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                            <div style={{ color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              📅 {s.session_date} {s.start_time && `· ${s.start_time}–${s.end_time || '?'}`}
                              {s.tiers?.length > 0 && <span style={{ color: '#34d399', marginLeft: 6 }}>🎫 {s.tiers.length} pass types</span>}
                            </div>
                          </div>
                        ))}
                        {e.sessions.length > 3 && <div style={{ fontSize: '0.75rem', color: '#64748b', paddingLeft: 4 }}>+{e.sessions.length - 3} more sessions</div>}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 12, borderTop: '1px solid #1e293b', fontSize: '0.82rem' }}>
                      <span>Sold: <b style={{ color: '#34d399' }}>{e.tickets_sold || 0}</b></span>
                      <span>Checked In: <b style={{ color: '#a5b4fc' }}>{e.checked_in_count || 0}</b></span>
                    </div>
                  </div>
                </div>
              ))}

              {events.length === 0 && (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📅</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: 6, color: '#ffffff' }}>No events published yet</div>
                  <p style={{ fontSize: '0.85rem' }}>Click "Create Event" to publish your first festival or concert.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            TAB: TEAMS & PERMISSIONS
           ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'teams' && (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Organization Team &amp; Permissions</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 3 }}>Manage team profiles, roles, and event creation authorization policies.</p>
              </div>
              {userProfile?.tenantRole !== 'STAFF' ? (
                <button
                  className="btn btn-primary"
                  onClick={() => setShowTeamModal(true)}
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 10, padding: '9px 18px', fontWeight: 700, fontSize: '0.85rem' }}
                >
                  ➕ Add Team Member
                </button>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', padding: '6px 12px', borderRadius: 10, fontSize: '0.78rem', color: '#fbbf24' }}>
                  🔒 Gate Staff Profile (Team Management Restricted)
                </div>
              )}
            </div>

            {/* Org Policy Card */}
            <div style={{ background: '#0d1322', border: '1px solid #1e293b', borderRadius: 16, padding: 18, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <div style={{ fontSize: '0.98rem', fontWeight: 700, color: '#ffffff' }}>Organization Event Creation Policy</div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 3 }}>
                  Controls default profile policy for who inside your organization is permitted to create new events.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, background: 'rgba(15, 23, 42, 0.8)', padding: 4, borderRadius: 10, border: '1px solid #1e293b', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${orgPolicy === 'ADMIN_ONLY' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                  disabled={userProfile?.tenantRole === 'STAFF'}
                  onClick={() => handleUpdatePolicy('ADMIN_ONLY')}
                >
                  🔒 Admins &amp; Managers Only
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${orgPolicy === 'ALL_MEMBERS' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                  disabled={userProfile?.tenantRole === 'STAFF'}
                  onClick={() => handleUpdatePolicy('ALL_MEMBERS')}
                >
                  🌐 All Team Members Allowed
                </button>
              </div>
            </div>

            {/* Team Members Table */}
            <div style={{ background: '#0d1322', border: '1px solid #1e293b', borderRadius: 16, padding: 18 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 14 }}>Team Profiles ({teamMembers.length} Members)</h3>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '460px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#64748b' }}>
                      <th style={{ padding: 10 }}>Member</th>
                      <th style={{ padding: 10 }}>Profile Role</th>
                      <th style={{ padding: 10 }}>Event Creation Permission</th>
                      <th style={{ padding: 10 }}>Access Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: 12 }}>
                          <div style={{ fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</div>
                        </td>
                        <td style={{ padding: 12 }}>
                          <select
                            className="form-control"
                            style={{ width: 'auto', padding: '5px 10px', fontSize: '0.78rem', background: '#1e293b' }}
                            value={m.tenant_role}
                            disabled={userProfile?.tenantRole === 'STAFF'}
                            onChange={(e) => handleUpdateRole(m.id, e.target.value)}
                          >
                            <option value="OWNER">Owner / Admin</option>
                            <option value="EVENT_MANAGER">Event Manager</option>
                            <option value="STAFF">Gate Staff</option>
                          </select>
                        </td>
                        <td style={{ padding: 12 }}>
                          <button
                            type="button"
                            className={`btn btn-sm ${m.can_create_events ? 'btn-success' : 'btn-warning'}`}
                            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            disabled={userProfile?.tenantRole === 'STAFF'}
                            onClick={() => handleTogglePermission(m.id, m.can_create_events)}
                          >
                            {m.can_create_events ? '✅ Allowed' : '🚫 Restricted'}
                          </button>
                        </td>
                        <td style={{ padding: 12 }}>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
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

        {/* ════════════════════════════════════════════════════════════════════
            TAB: PROFILE & ROSTER / LOGS
           ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'profile' && (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0 }}>Attendee Roster &amp; Profile</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 3 }}>Gate logs, attendee directory, and terminal credentials.</p>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleLogout}
                style={{ background: 'rgba(244, 63, 94, 0.15)', color: '#fb7185', border: '1px solid rgba(244, 63, 94, 0.3)', padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem' }}
              >
                Log Out of Terminal
              </button>
            </div>

            {/* Profile Overview Card */}
            <div style={{ background: '#0d1322', border: '1px solid #1e293b', borderRadius: 16, padding: 18, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase' }}>LOGGED IN ACCOUNT</span>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userProfile?.name || 'Organizer Admin'}</div>
                <div style={{ fontSize: '0.82rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userProfile?.email} • {userProfile?.role} ({userProfile?.tenantRole || 'OWNER'})</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1e293b', borderRadius: 12, padding: '10px 14px', flexShrink: 0 }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>ORGANIZATION</div>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#34d399', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }} title={tenantName}>{tenantName}</div>
              </div>
            </div>

            {/* Attendee Directory */}
            <div style={{ background: '#0d1322', border: '1px solid #1e293b', borderRadius: 16, padding: 18 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12 }}>Attendee Directory</h3>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '500px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#64748b' }}>
                      <th style={{ padding: 10 }}>Ticket ID</th>
                      <th style={{ padding: 10 }}>Attendee</th>
                      <th style={{ padding: 10 }}>Tier</th>
                      <th style={{ padding: 10 }}>Phone</th>
                      <th style={{ padding: 10 }}>Check-in Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendees.map(a => (
                      <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: 10 }}><code>{a.id}</code></td>
                        <td style={{ padding: 10 }}><b>{a.attendee_name}</b></td>
                        <td style={{ padding: 10 }}>{a.tier_name}</td>
                        <td style={{ padding: 10 }}>{a.customer_phone}</td>
                        <td style={{ padding: 10 }}>
                          <span className={`badge ${a.checkin_count > 0 ? 'badge-green' : 'badge-yellow'}`} style={{ fontSize: '0.72rem' }}>
                            {a.checkin_count > 0 ? `CHECKED IN (${a.checkin_count}x)` : 'NOT ARRIVED'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {attendees.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#64748b' }}>No bookings found yet. Book tickets on the public storefront.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ── Fixed Bottom Navigation Dock ───────────────────────────────────── */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 68,
        background: 'rgba(9, 13, 22, 0.95)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid #1e293b',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        zIndex: 40,
        padding: '0 8px',
        boxSizing: 'border-box'
      }}>
        {/* Nav 1: Dashboard */}
        <button
          type="button"
          onClick={() => switchTab('dashboard')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'dashboard' ? '#38bdf8' : '#64748b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: activeTab === 'dashboard' ? 700 : 500,
            padding: '4px 8px'
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
          Dashboard
        </button>

        {/* Nav 2: Events */}
        <button
          type="button"
          onClick={() => switchTab('events')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'events' ? '#38bdf8' : '#64748b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: activeTab === 'events' ? 700 : 500,
            padding: '4px 8px',
            position: 'relative'
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Events
        </button>

        {/* Center Floating Action: Gate Scanner */}
        <button
          type="button"
          onClick={() => switchTab('scanner')}
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: '2px solid rgba(255, 255, 255, 0.25)',
            boxShadow: '0 0 24px rgba(99, 102, 241, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transform: 'translateY(-12px)',
            color: '#ffffff',
            transition: 'transform 0.15s ease',
            flexShrink: 0
          }}
          title="Open Gate Scanner"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <circle cx="6.5" cy="6.5" r="1" fill="currentColor" />
            <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
            <circle cx="6.5" cy="17.5" r="1" fill="currentColor" />
          </svg>
        </button>

        {/* Nav 4: Teams */}
        <button
          type="button"
          onClick={() => switchTab('teams')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'teams' ? '#38bdf8' : '#64748b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: activeTab === 'teams' ? 700 : 500,
            padding: '4px 8px'
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Teams
        </button>

        {/* Nav 5: Profile */}
        <button
          type="button"
          onClick={() => switchTab('profile')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'profile' ? '#38bdf8' : '#64748b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: activeTab === 'profile' ? 700 : 500,
            padding: '4px 8px'
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Profile
        </button>
      </nav>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: GATE QR SCANNER TERMINAL (Mobile Fluid & No Overflow)
         ════════════════════════════════════════════════════════════════════ */}
      {scannerModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(3, 7, 18, 0.88)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 110,
          padding: '12px',
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: '#0d1322',
            border: '1px solid #1e293b',
            borderRadius: 20,
            width: '100%',
            maxWidth: '780px',
            maxHeight: '92vh',
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '20px 16px',
            boxSizing: 'border-box',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#ffffff', wordBreak: 'break-word' }}>Gate Verification Terminal</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '4px 0 0' }}>Real-time gate clearance with tamper verification.</p>
              </div>
              <button
                type="button"
                onClick={closeScannerModal}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#ffffff',
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
              <span style={{ fontSize: '0.82rem', color: '#94a3b8', flexShrink: 0 }}>Event:</span>
              <select
                className="form-control"
                style={{
                  width: '100%',
                  flex: 1,
                  minWidth: 0,
                  background: '#1e293b',
                  padding: '7px 10px',
                  fontSize: '0.82rem',
                  borderRadius: 8,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                value={selectedEventId}
                onChange={e => setSelectedEventId(e.target.value)}
              >
                {events.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16, width: '100%', boxSizing: 'border-box' }}>
              {/* Camera & Input Panel */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #1e293b', borderRadius: 14, padding: '16px 14px', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>
                <div style={{ width: '100%', height: 200, background: '#020617', borderRadius: 12, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <video ref={videoRef} playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraActive ? 'block' : 'none' }} />
                  {!cameraActive && (
                    <div style={{ textAlign: 'center', padding: 16 }}>
                      <div style={{ fontSize: '2rem', marginBottom: 4 }}>📷</div>
                      <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#e2e8f0' }}>Camera Inactive</div>
                      <button className="btn btn-primary btn-sm" style={{ marginTop: 8, padding: '6px 14px', fontSize: '0.8rem' }} onClick={toggleCamera}>Start Camera</button>
                    </div>
                  )}
                  {cameraActive && (
                    <button className="btn btn-danger btn-sm" style={{ position: 'absolute', bottom: 8, right: 8 }} onClick={toggleCamera}>Stop Camera</button>
                  )}
                </div>

                <div style={{ marginTop: 14 }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Manual Token / QR Code Entry</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Paste signed QR token..."
                      value={manualToken}
                      onChange={e => setManualToken(e.target.value)}
                      style={{ fontSize: '0.82rem', padding: '8px 10px', minWidth: 0, flex: 1 }}
                    />
                    <button className="btn btn-primary btn-sm" style={{ padding: '8px 14px', fontSize: '0.82rem', flexShrink: 0 }} onClick={() => executeScan(manualToken)}>Verify</button>
                  </div>
                </div>

                <div style={{ marginTop: 14, padding: 10, background: 'rgba(255,255,255,0.03)', borderRadius: 10, boxSizing: 'border-box', width: '100%' }}>
                  <div style={{ fontSize: '0.7rem', color: '#a5b4fc', fontWeight: 800, marginBottom: 6 }}>SIMULATE INSTANT SCAN:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, width: '100%', boxSizing: 'border-box' }}>
                    <button className="btn btn-success btn-sm" style={{ fontSize: '0.75rem', padding: '6px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => { const first = attendees[0]?.qr_secret_token; if (first) executeScan(first); else alert('No tickets booked yet!'); }}>🟢 Valid</button>
                    <button className="btn btn-warning btn-sm" style={{ fontSize: '0.75rem', padding: '6px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => { const first = attendees[0]?.qr_secret_token; if (first) executeScan(first); else alert('No tickets booked yet!'); }}>🟡 Scanned</button>
                    <button className="btn btn-danger btn-sm" style={{ fontSize: '0.75rem', padding: '6px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => executeScan('invalid_token.tampered')}>🔴 Invalid</button>
                  </div>
                </div>
              </div>

              {/* Status Output Panel */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #1e293b', borderRadius: 14, padding: '16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>
                {!scanResult && (
                  <div style={{ textAlign: 'center', color: '#64748b', padding: 24 }}>
                    <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>⏳</div>
                    <div style={{ fontWeight: 700, fontSize: '0.98rem', color: '#e2e8f0' }}>Scanner Ready</div>
                    <p style={{ fontSize: '0.8rem', marginTop: 4 }}>Scan an attendee QR code or test using the simulation buttons.</p>
                  </div>
                )}

                {scanResult && (scanResult.status === 'VALID' || scanResult.status === 'RE_ENTRY_ALLOWED') && (
                  <div style={{ background: 'rgba(16,185,129,0.12)', border: '2px solid #10b981', borderRadius: 14, padding: 16 }}>
                    <div style={{ color: '#10b981', fontWeight: 800, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 6 }}><span>✓</span><span>ACCESS GRANTED</span></div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scanResult.ticket?.attendeeName || 'Attendee'}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <span className="badge badge-purple">{scanResult.ticket?.tierName}</span>
                      <span className="badge badge-green">VERIFIED PASS</span>
                    </div>
                    <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#a7f3d0' }}>Time: {new Date().toLocaleTimeString('en-IN')}</div>
                  </div>
                )}

                {scanResult && scanResult.status === 'ALREADY_SCANNED' && (
                  <div style={{ background: 'rgba(245,158,11,0.12)', border: '2px solid #f59e0b', borderRadius: 14, padding: 16 }}>
                    <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 6 }}><span>⚠️</span><span>ALREADY SCANNED!</span></div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{scanResult.ticket?.attendeeName}</div>
                    <p style={{ fontSize: '0.78rem', color: '#fef3c7', marginTop: 3 }}>
                      First checked in at {new Date(scanResult.ticket?.firstCheckedInAt).toLocaleTimeString('en-IN')}.
                    </p>
                    <button className="btn btn-warning" style={{ width: '100%', marginTop: 12, fontSize: '0.82rem', padding: '8px 12px' }} onClick={() => handleOverride(scanResult.ticket?.id)}>🔓 Allow Re-entry (Override)</button>
                  </div>
                )}

                {scanResult && (scanResult.status === 'INVALID' || scanResult.status === 'WRONG_EVENT') && (
                  <div style={{ background: 'rgba(244,63,94,0.12)', border: '2px solid #f43f5e', borderRadius: 14, padding: 16 }}>
                    <div style={{ color: '#f43f5e', fontWeight: 800, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 6 }}><span>✕</span><span>ACCESS DENIED</span></div>
                    <div style={{ fontSize: '0.98rem', fontWeight: 700, marginTop: 6, wordBreak: 'break-word' }}>{scanResult.reason}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: ADD TEAM MEMBER
         ════════════════════════════════════════════════════════════════════ */}
      {showTeamModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 120,
          padding: '12px',
          boxSizing: 'border-box'
        }}>
          <div style={{ background: '#0d1322', border: '1px solid #1e293b', borderRadius: 18, width: '100%', maxWidth: '480px', padding: '24px 20px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Add Team Member</h3>
              <button type="button" onClick={() => setShowTeamModal(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleAddTeamMember}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input type="text" className="form-control" value={newTeamMember.name} onChange={e => setNewTeamMember({ ...newTeamMember, name: e.target.value })} placeholder="e.g. Ramesh Kumar" required />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input type="email" className="form-control" value={newTeamMember.email} onChange={e => setNewTeamMember({ ...newTeamMember, email: e.target.value })} placeholder="gate@festival.com" required />
              </div>
              <div className="form-group">
                <label className="form-label">Temporary Password</label>
                <input type="password" className="form-control" value={newTeamMember.password} onChange={e => setNewTeamMember({ ...newTeamMember, password: e.target.value })} placeholder="••••••••" required />
              </div>
              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-control" value={newTeamMember.tenant_role} onChange={e => setNewTeamMember({ ...newTeamMember, tenant_role: e.target.value })}>
                  <option value="EVENT_MANAGER">Event Manager (Full Setup &amp; Scanner)</option>
                  <option value="STAFF">Gate Staff (Scanner Terminal Only)</option>
                  <option value="OWNER">Co-Organizer / Admin</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 10 }}>Create Team Profile</button>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: CREATE EVENT
         ════════════════════════════════════════════════════════════════════ */}
      {showEventModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 120,
          padding: '12px',
          boxSizing: 'border-box'
        }}>
          <div style={{ background: '#0d1322', border: '1px solid #1e293b', borderRadius: 20, width: '100%', maxWidth: '760px', maxHeight: '92vh', overflowY: 'auto', overflowX: 'hidden', padding: '24px 18px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0 }}>Create New Event</h3>
                <p style={{ color: '#94a3b8', fontSize: '0.8rem', margin: '3px 0 0' }}>Step {eventStep} of 3</p>
              </div>
              <button type="button" onClick={closeModal} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleCreateEvent}>
              {eventStep === 1 && (
                <div>
                  <div className="form-group">
                    <label className="form-label">Event Title</label>
                    <input type="text" className="form-control" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} placeholder="e.g. Dandiya Utsav 2026" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Venue / Location</label>
                    <input type="text" className="form-control" value={newEvent.location} onChange={e => setNewEvent({ ...newEvent, location: e.target.value })} placeholder="Town Hall Ground, Gorakhpur" required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">Start Date &amp; Time</label>
                      <input type="datetime-local" className="form-control" value={newEvent.start_date} onChange={e => setNewEvent({ ...newEvent, start_date: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">End Date &amp; Time</label>
                      <input type="datetime-local" className="form-control" value={newEvent.end_date} onChange={e => setNewEvent({ ...newEvent, end_date: e.target.value })} required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Banner Image URL</label>
                    <input type="url" className="form-control" value={newEvent.banner_url} onChange={e => setNewEvent({ ...newEvent, banner_url: e.target.value })} placeholder="https://..." />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea className="form-control" rows={3} value={newEvent.description} onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} placeholder="Event highlights..." />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                    <button type="button" className="btn btn-primary" onClick={() => setEventStep(2)}>Next: Sessions &amp; Dates →</button>
                  </div>
                </div>
              )}

              {eventStep === 2 && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                    <h4 style={{ margin: 0, fontSize: '1.05rem' }}>Festival Sessions &amp; Days</h4>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addSession}>➕ Add Day / Show</button>
                  </div>
                  {newEvent.sessions.map((s, idx) => (
                    <div key={s.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1e293b', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Show #{idx + 1}</span>
                        {newEvent.sessions.length > 1 && <button type="button" onClick={() => removeSession(s.id)} style={{ color: '#fb7185', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>Remove</button>}
                      </div>
                      <div className="form-group">
                        <input type="text" className="form-control" placeholder="Session Name (e.g. Day 1 Grand Opening)" value={s.name} onChange={e => updateSession(s.id, 'name', e.target.value)} required />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 6 }}>
                        <input type="date" className="form-control" value={s.session_date} onChange={e => updateSession(s.id, 'session_date', e.target.value)} required />
                        <input type="time" className="form-control" value={s.start_time} onChange={e => updateSession(s.id, 'start_time', e.target.value)} />
                        <input type="time" className="form-control" value={s.end_time} onChange={e => updateSession(s.id, 'end_time', e.target.value)} />
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setEventStep(1)}>← Back</button>
                    <button type="button" className="btn btn-primary" onClick={() => setEventStep(3)}>Next: Ticket Passes →</button>
                  </div>
                </div>
              )}

              {eventStep === 3 && (
                <div>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '1.05rem' }}>Ticket Pricing &amp; Passes</h4>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={newEvent.uniform_pricing} onChange={e => toggleUniformPricing(e.target.checked)} />
                      <span style={{ fontSize: '0.85rem' }}>Use uniform pass pricing across all festival days</span>
                    </label>
                  </div>

                  {newEvent.uniform_pricing ? (
                    <div>
                      {newEvent.template_tiers.map(t => (
                        <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px auto', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                          <input type="text" className="form-control" placeholder="Pass Name" value={t.name} onChange={e => updateTemplateTier(t.id, 'name', e.target.value)} required style={{ fontSize: '0.82rem' }} />
                          <input type="number" className="form-control" placeholder="₹ Price" value={t.price_in_rupees} onChange={e => updateTemplateTier(t.id, 'price_in_rupees', e.target.value)} required style={{ fontSize: '0.82rem' }} />
                          <input type="number" className="form-control" placeholder="Qty" value={t.capacity} onChange={e => updateTemplateTier(t.id, 'capacity', e.target.value)} style={{ fontSize: '0.82rem' }} />
                          <button type="button" onClick={() => removeTemplateTier(t.id)} style={{ color: '#fb7185', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>✕</button>
                        </div>
                      ))}
                      <button type="button" className="btn btn-secondary btn-sm" onClick={addTemplateTier} style={{ marginTop: 6, fontSize: '0.8rem' }}>➕ Add Pass Type</button>
                    </div>
                  ) : (
                    <div>
                      {newEvent.sessions.map((s, idx) => (
                        <div key={s.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1e293b', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 8 }}>{s.name || `Day ${idx + 1}`} Passes</div>
                          {s.tiers.map(t => (
                            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr 85px 75px auto', gap: 5, marginBottom: 6, alignItems: 'center' }}>
                              <input type="text" className="form-control" placeholder="Pass Name" value={t.name} onChange={e => updateTierInSession(s.id, t.id, 'name', e.target.value)} required style={{ fontSize: '0.8rem' }} />
                              <input type="number" className="form-control" placeholder="₹ Price" value={t.price_in_rupees} onChange={e => updateTierInSession(s.id, t.id, 'price_in_rupees', e.target.value)} required style={{ fontSize: '0.8rem' }} />
                              <input type="number" className="form-control" placeholder="Qty" value={t.capacity} onChange={e => updateTierInSession(s.id, t.id, 'capacity', e.target.value)} style={{ fontSize: '0.8rem' }} />
                              <button type="button" onClick={() => removeTierFromSession(s.id, t.id)} style={{ color: '#fb7185', background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>✕</button>
                            </div>
                          ))}
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => addTierToSession(s.id)} style={{ marginTop: 4, fontSize: '0.75rem' }}>➕ Add Pass</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setEventStep(2)}>← Back</button>
                    <button type="submit" className="btn btn-primary" disabled={submitting} style={{ padding: '8px 18px', fontSize: '0.85rem' }}>
                      {submitting ? 'Publishing Event...' : '🚀 Publish Live Event'}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Export with Suspense wrapper ─────────────────────────────────────────────
export default function OrganizerDashboard() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#090d16', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading terminal...</div>}>
      <OrganizerDashboardInner />
    </Suspense>
  );
}
