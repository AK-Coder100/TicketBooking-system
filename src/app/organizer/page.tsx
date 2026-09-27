'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'requests' | 'events' | 'teams' | 'profile'>('dashboard');
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [attendees, setAttendees] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState(false);

  // Organization / Tenant state
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [tenantSlug, setTenantSlug] = useState<string>('');

  // QR Code Modal & Downloader state
  const [qrModalData, setQrModalData] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    url: string;
    qrDataUrl?: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [downloadingQr, setDownloadingQr] = useState(false);

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
  const [showTeamPassword, setShowTeamPassword] = useState(false);

  // Scanner state
  const [manualToken, setManualToken] = useState('');
  const [scanResult, setScanResult] = useState<any>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('ALL');
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
      if (tabParam === 'events' || tabParam === 'teams' || tabParam === 'profile' || tabParam === 'dashboard' || tabParam === 'requests') {
        setActiveTab(tabParam as any);
      } else if (tabParam === 'scanner') {
        router.push('/organizer/scanner');
      }
      const tenantParam = params.get('tenantId');
      if (tenantParam) {
        setSelectedTenantId(tenantParam);
      }
    }
  }, [router]);

  useEffect(() => {
    loadUserProfile();
  }, []);

  // ── Tab Switcher with URL persistence ──
  const switchTab = (tab: 'dashboard' | 'requests' | 'events' | 'scanner' | 'teams' | 'profile') => {
    if (tab === 'scanner') {
      router.push('/organizer/scanner');
      return;
    }
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState(null, '', url.toString());
    }
  };

  const [orderActionModal, setOrderActionModal] = useState<{
    orderId: string;
    customerName: string;
    customerPhone: string;
    amountFormatted: string;
    eventTitle?: string;
    type: 'CONFIRM' | 'DECLINE';
  } | null>(null);

  const executeOrderAction = async () => {
    if (!orderActionModal) return;
    const { orderId, type } = orderActionModal;
    setActionLoadingId(orderId);
    setActionFeedback(null);
    try {
      const endpoint = type === 'CONFIRM'
        ? `/api/tenant/orders/${orderId}/confirm`
        : `/api/tenant/orders/${orderId}/decline`;

      const res = await fetch(endpoint, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setActionFeedback({
          type: 'success',
          message: json.message || (type === 'CONFIRM'
            ? 'Payment confirmed! Official tickets sent to customer WhatsApp.'
            : 'Booking request declined. Order retained in database.')
        });
        setOrderActionModal(null);
        await loadAnalytics();
      } else {
        setActionFeedback({ type: 'error', message: json.error || `Failed to ${type.toLowerCase()} order` });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || `Error processing order` });
    } finally {
      setActionLoadingId(null);
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
        if (json.user.tenant?.slug) {
          setTenantSlug(json.user.tenant.slug);
        }
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
        if (json.tenantSlug) setTenantSlug(json.tenantSlug);
        else if (evList[0]?.tenant_slug) setTenantSlug(evList[0].tenant_slug);

        if (evList.length > 0) {
          setSelectedEventId(prev => prev && evList.some((e: any) => e.id === prev) ? prev : evList[0].id);
        }
      }
    } catch (e) { console.error(e); }
  };

  // ── High Quality QR Code Generator & Downloader ──────────────────────────────
  const openQrModal = async (targetUrl: string, title: string, subtitle?: string) => {
    try {
      const fullUrl = targetUrl.startsWith('http')
        ? targetUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;

      const qrDataUrl = await QRCode.toDataURL(fullUrl, {
        width: 800,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });

      setQrModalData({
        isOpen: true,
        title,
        subtitle: subtitle || 'Scan to book tickets instantly via Paytm Payment Gateway',
        url: fullUrl,
        qrDataUrl
      });
      setCopiedLink(false);
    } catch (err: any) {
      console.error('Error generating QR preview:', err);
      alert('Failed to generate QR code: ' + err.message);
    }
  };

  const downloadHighQualityQrPng = async (targetUrl: string, title: string, subtitle?: string) => {
    try {
      const fullUrl = targetUrl.startsWith('http')
        ? targetUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;

      // 1. Generate base high-resolution QR data URL (1024x1024 with High error correction level H)
      const qrDataUrl = await QRCode.toDataURL(fullUrl, {
        width: 1024,
        margin: 1,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });

      // 2. Create offscreen canvas for a beautiful print-ready standee poster
      const canvas = document.createElement('canvas');
      const width = 1200;
      const height = 1500;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context not available');

      // Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#090d16');
      bgGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Card Container (White)
      const cardMargin = 60;
      const cardWidth = width - cardMargin * 2;
      const cardHeight = height - cardMargin * 2;
      const cardRadius = 32;

      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 20;

      // Rounded rectangle for card
      ctx.beginPath();
      ctx.roundRect(cardMargin, cardMargin, cardWidth, cardHeight, cardRadius);
      ctx.fill();
      ctx.restore();

      // Top Header Accent Bar
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(cardMargin, cardMargin, cardWidth, 24, [cardRadius, cardRadius, 0, 0]);
      const barGrad = ctx.createLinearGradient(cardMargin, 0, cardMargin + cardWidth, 0);
      barGrad.addColorStop(0, '#6366f1');
      barGrad.addColorStop(0.5, '#8b5cf6');
      barGrad.addColorStop(1, '#ec4899');
      ctx.fillStyle = barGrad;
      ctx.fill();
      ctx.restore();

      // Top Title
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(title.slice(0, 32), width / 2, cardMargin + 100);

      // Subtitle / Tagline
      ctx.fillStyle = '#6366f1';
      ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('⚡ SCAN TO BOOK TICKETS INSTANTLY', width / 2, cardMargin + 145);

      // Draw QR Code in center
      const qrImg = new Image();
      await new Promise((resolve, reject) => {
        qrImg.onload = resolve;
        qrImg.onerror = reject;
        qrImg.src = qrDataUrl;
      });

      const qrSize = 820;
      const qrX = (width - qrSize) / 2;
      const qrY = cardMargin + 180;
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // Bottom URL Box
      const urlBoxY = qrY + qrSize + 20;
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.roundRect(cardMargin + 40, urlBoxY, cardWidth - 80, 75, 16);
      ctx.fill();

      // URL Text inside box
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 26px monospace';
      ctx.textAlign = 'center';
      const displayUrl = fullUrl.replace(/^https?:\/\//, '');
      ctx.fillText(displayUrl, width / 2, urlBoxY + 48);

      // Footer Notes
      ctx.fillStyle = '#64748b';
      ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Paytm Payment Gateway • Fast Entry Gate Verification', width / 2, cardMargin + cardHeight - 35);

      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
        a.download = `${safeTitle || 'event'}-booking-qr-hq.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }, 'image/png');
    } catch (err: any) {
      console.error('Error generating HQ QR:', err);
      alert('Failed to generate high-resolution QR: ' + err.message);
    }
  };

  const downloadPureQrPng = async (targetUrl: string, title: string) => {
    try {
      const fullUrl = targetUrl.startsWith('http')
        ? targetUrl
        : `${typeof window !== 'undefined' ? window.location.origin : ''}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;

      const qrDataUrl = await QRCode.toDataURL(fullUrl, {
        width: 1024,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });
      const a = document.createElement('a');
      a.href = qrDataUrl;
      const safeTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
      a.download = `${safeTitle || 'event'}-qr-code-1024px.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Error downloading pure QR:', err);
      alert('Failed to download QR: ' + err.message);
    }
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
        setPendingOrders(json.pendingOrders || []);
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
    } catch (_) { }
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
        body: JSON.stringify({
          qrToken: token.trim(),
          eventId: selectedEventId,
          sessionId: selectedSessionId !== 'ALL' ? selectedSessionId : undefined,
          deviceInfo: 'Organizer PWA Scanner'
        })
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
          {pendingOrders.length > 0 && (
            <button
              type="button"
              onClick={() => switchTab('requests')}
              style={{
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.45)',
                color: '#fbbf24',
                padding: '5px 12px',
                borderRadius: 8,
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span>🔔</span>
              <span>{pendingOrders.length}</span>
            </button>
          )}
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

            {/* Action Feedback Banner */}
            {actionFeedback && (
              <div style={{
                background: actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                borderRadius: 12,
                padding: '12px 16px',
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: actionFeedback.type === 'success' ? '#6ee7b7' : '#fca5a5',
                fontSize: '0.86rem',
                fontWeight: 600
              }}>
                <span>{actionFeedback.type === 'success' ? '✅' : '⚠️'} {actionFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setActionFeedback(null)}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}
                >
                  &times;
                </button>
              </div>
            )}

            {/* Pending Requests Alert Banner */}
            {pendingOrders.length > 0 && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: 14,
                padding: '14px 18px',
                marginBottom: 18,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.4rem' }}>🔔</span>
                  <div>
                    <div style={{ color: '#fbbf24', fontWeight: 800, fontSize: '0.92rem' }}>
                      {pendingOrders.length} Pending Booking Request{pendingOrders.length > 1 ? 's' : ''} Awaiting Payment Verification
                    </div>
                    <div style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>
                      Attendees have completed UPI checkout and are waiting for your approval to receive their WhatsApp tickets.
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => switchTab('requests')}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#ffffff',
                    fontWeight: 700,
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)'
                  }}
                >
                  Review Requests ({pendingOrders.length}) →
                </button>
              </div>
            )}

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
            TAB: REQUESTS (PENDING PAYMENT VERIFICATION)
           ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'requests' && (
          <div style={{ width: '100%', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
                    Pending Booking Requests
                  </h1>
                  <span style={{
                    background: 'rgba(245, 158, 11, 0.2)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    padding: '2px 10px',
                    borderRadius: 9999,
                    fontSize: '0.74rem',
                    fontWeight: 800
                  }}>
                    {pendingOrders.length} Waiting Verification
                  </span>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: 4, marginBottom: 0 }}>
                  Match the submitted 12-digit UTR against your UPI app / bank SMS. Confirm to generate tickets and WhatsApp them directly to the customer, or decline the request without database deletion.
                </p>
              </div>

              <button
                type="button"
                onClick={() => loadAnalytics()}
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
                  gap: 6
                }}
              >
                🔄 Refresh
              </button>
            </div>

            {/* Action Feedback Banner */}
            {actionFeedback && (
              <div style={{
                background: actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: `1px solid ${actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                borderRadius: 12,
                padding: '12px 16px',
                marginBottom: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: actionFeedback.type === 'success' ? '#6ee7b7' : '#fca5a5',
                fontSize: '0.86rem',
                fontWeight: 600
              }}>
                <span>{actionFeedback.type === 'success' ? '✅' : '⚠️'} {actionFeedback.message}</span>
                <button
                  type="button"
                  onClick={() => setActionFeedback(null)}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}
                >
                  &times;
                </button>
              </div>
            )}

            {/* Empty State */}
            {pendingOrders.length === 0 ? (
              <div style={{
                background: '#0d1322',
                border: '1px solid #1e293b',
                borderRadius: 16,
                padding: '48px 24px',
                textAlign: 'center',
                color: '#94a3b8'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: 6 }}>
                  All Caught Up!
                </h3>
                <p style={{ fontSize: '0.85rem', maxWidth: 440, margin: '0 auto 16px', color: '#64748b' }}>
                  There are no pending booking requests awaiting payment confirmation. When customers complete UPI checkout for your events, they will appear here instantly.
                </p>
                <button
                  type="button"
                  onClick={() => switchTab('dashboard')}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '8px 18px', fontSize: '0.82rem' }}
                >
                  Return to Dashboard
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {pendingOrders.map((order: any) => {
                  let attendeesList: any[] = [];
                  try {
                    if (order.attendees_data) {
                      attendeesList = JSON.parse(order.attendees_data);
                    }
                  } catch (e) { }

                  const utrText = order.gateway_payment_id || order.payment_reference || 'Self-reported by customer';

                  return (
                    <div
                      key={order.id}
                      style={{
                        background: '#0d1322',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        borderRadius: 16,
                        padding: '18px 20px',
                        boxSizing: 'border-box'
                      }}
                    >
                      {/* Top Header of Card */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff' }}>
                              Booking #{order.id}
                            </span>
                            <span style={{
                              background: 'rgba(245, 158, 11, 0.15)',
                              color: '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: '0.72rem',
                              fontWeight: 700
                            }}>
                              Awaiting Verification
                            </span>
                            <span style={{
                              background: 'rgba(99, 102, 241, 0.15)',
                              color: '#a5b4fc',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: '0.72rem',
                              fontWeight: 700
                            }}>
                              {order.gateway_type || 'UPI'}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: 4 }}>
                            Event: <b style={{ color: '#e2e8f0' }}>{order.display_event_title || order.event_title || 'General Event'}</b>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                            Submitted on: {new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Amount to Verify</div>
                          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#34d399' }}>
                            ₹{(order.total_charged / 100).toFixed(2)}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            Base: ₹{(order.total_base_price / 100).toFixed(2)} + Fee: ₹{(order.platform_fee / 100).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Info Grid: Customer, Submitted UTR, Attendees */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: 12,
                        padding: '14px',
                        background: 'rgba(15, 23, 42, 0.65)',
                        borderRadius: 12,
                        marginBottom: 14
                      }}>
                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 3 }}>Customer Details</div>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#ffffff' }}>{order.customer_name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>📱 {order.customer_phone || 'No phone'}</span>
                            {order.customer_phone && (
                              <a
                                href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  background: 'rgba(16, 185, 129, 0.2)',
                                  color: '#34d399',
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                              >
                                WhatsApp ↗
                              </a>
                            )}
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 3 }}>
                            UPI Parameters (<span style={{ color: '#38bdf8' }}>tr</span> &amp; <span style={{ color: '#fbbf24' }}>tn</span>)
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace', fontWeight: 800, fontSize: '0.68rem' }}>tr</span>
                              <code style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace' }}>{order.id}</code>
                            </div>
                            <div style={{ fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace', fontWeight: 800, fontSize: '0.68rem' }}>tn</span>
                              <code style={{ color: '#fbbf24', fontWeight: 700, fontFamily: 'monospace', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`Booking ${order.id}${order.display_event_title || order.event_title ? ` - ${order.display_event_title || order.event_title}` : ''}`}>
                                Booking {order.id}{order.display_event_title || order.event_title ? ` - ${order.display_event_title || order.event_title}` : ''}
                              </code>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 3 }}>Submitted UTR / Transaction Ref</div>
                          <div style={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            fontSize: '0.92rem',
                            color: '#34d399',
                            background: 'rgba(16, 185, 129, 0.12)',
                            border: '1px solid rgba(16, 185, 129, 0.25)',
                            padding: '5px 10px',
                            borderRadius: 6,
                            display: 'inline-block'
                          }}>
                            {utrText}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>
                            Match with your UPI bank account statement before approving.
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 3 }}>
                            Passes Requested ({attendeesList.length || 1})
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                            {attendeesList.length > 0 ? (
                              attendeesList.map((a: any, i: number) => (
                                <div key={i} style={{ marginBottom: 2 }}>
                                  • {a.name || order.customer_name} (Age: {a.age || 18})
                                </div>
                              ))
                            ) : (
                              <div>• {order.customer_name} (Primary Guest)</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        <button
                          type="button"
                          disabled={actionLoadingId === order.id}
                          onClick={() => setOrderActionModal({
                            orderId: order.id,
                            customerName: order.customer_name,
                            customerPhone: order.customer_phone,
                            amountFormatted: `₹${(order.total_charged / 100).toFixed(2)}`,
                            eventTitle: order.display_event_title || order.event_title,
                            type: 'DECLINE'
                          })}
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            color: '#fca5a5',
                            padding: '8px 16px',
                            borderRadius: 8,
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          ❌ Decline Request
                        </button>
                        <button
                          type="button"
                          disabled={actionLoadingId === order.id}
                          onClick={() => setOrderActionModal({
                            orderId: order.id,
                            customerName: order.customer_name,
                            customerPhone: order.customer_phone,
                            amountFormatted: `₹${(order.total_charged / 100).toFixed(2)}`,
                            eventTitle: order.display_event_title || order.event_title,
                            type: 'CONFIRM'
                          })}
                          style={{
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            border: 'none',
                            color: '#ffffff',
                            padding: '8px 18px',
                            borderRadius: 8,
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                          }}
                        >
                          ✅ Confirm Payment & Send Tickets
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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

            {/* Box Office Standee & QR Action Banner */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              borderRadius: 16,
              padding: '16px 20px',
              marginBottom: 20,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 14
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 260 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  flexShrink: 0
                }}>
                  📱
                </div>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ffffff' }}>
                    Organization Public Box Office QR
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>
                    Public URL:{' '}
                    <a
                      href={typeof window !== 'undefined' ? `${window.location.origin}/${tenantSlug || userProfile?.tenant?.slug || 'dandiya-26'}` : `/${tenantSlug || 'dandiya-26'}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 700 }}
                    >
                      {typeof window !== 'undefined' ? `${window.location.host}/${tenantSlug || userProfile?.tenant?.slug || 'dandiya-26'}` : `/${tenantSlug || 'dandiya-26'}`} ↗
                    </a>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => {
                    const currentSlug = tenantSlug || userProfile?.tenant?.slug || 'dandiya-26';
                    const targetUrl = `${window.location.origin}/${currentSlug}`;
                    openQrModal(targetUrl, tenantName, 'Official Festival Box Office');
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span>📷</span> View &amp; Download QR
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const currentSlug = tenantSlug || userProfile?.tenant?.slug || 'dandiya-26';
                    const targetUrl = `${window.location.origin}/${currentSlug}`;
                    downloadHighQualityQrPng(targetUrl, tenantName, 'Official Festival Box Office');
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#e2e8f0',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 10,
                    padding: '8px 16px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <span>⬇️</span> Quick Standee PNG
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
              {events.map(e => (
                <div
                  key={e.id}
                  onClick={() => router.push(`/organizer/${e.id}/members${selectedTenantId ? `?tenantId=${selectedTenantId}` : ''}`)}
                  style={{
                    background: '#0d1322',
                    border: '1px solid #1e293b',
                    borderRadius: 16,
                    overflow: 'hidden',
                    minWidth: 0,
                    cursor: 'pointer',
                    transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                  onMouseEnter={el => {
                    el.currentTarget.style.transform = 'translateY(-3px)';
                    el.currentTarget.style.borderColor = '#38bdf8';
                    el.currentTarget.style.boxShadow = '0 12px 28px rgba(56, 189, 248, 0.15)';
                  }}
                  onMouseLeave={el => {
                    el.currentTarget.style.transform = 'translateY(0)';
                    el.currentTarget.style.borderColor = '#1e293b';
                    el.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div>
                    <div style={{ position: 'relative', height: 160, width: '100%', overflow: 'hidden' }}>
                      <img
                        src={e.banner_url || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800'}
                        alt={e.title}
                        style={{ height: '100%', width: '100%', objectFit: 'cover' }}
                      />
                      <button
                        type="button"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          const slugToUse = e.tenant_slug || tenantSlug || 'test-dandiya-26';
                          const targetUrl = `${window.location.origin}/${slugToUse}`;
                          openQrModal(targetUrl, e.title, e.location);
                        }}
                        style={{
                          position: 'absolute',
                          top: 10,
                          left: 10,
                          background: 'rgba(9, 13, 22, 0.85)',
                          backdropFilter: 'blur(8px)',
                          border: '1px solid rgba(16, 185, 129, 0.4)',
                          borderRadius: 8,
                          padding: '3px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: '#34d399',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title="Download Booking QR PNG"
                      >
                        <span>📷</span> QR PNG
                      </button>
                      <div style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                        background: 'rgba(9, 13, 22, 0.85)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: 8,
                        padding: '3px 8px',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: '#38bdf8'
                      }}>
                        👥 View Roster →
                      </div>
                    </div>

                    <div style={{ padding: 16 }}>
                      <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }} title={e.title}>
                        {e.title}
                      </h3>
                      <div style={{ fontSize: '0.82rem', color: '#94a3b8', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        📍 {e.location}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        {e.session_count > 0 && (
                          <span className="badge badge-purple" style={{ fontSize: '0.72rem' }}>
                            🎭 {e.session_count} {e.session_count === 1 ? 'Session' : 'Sessions'}
                          </span>
                        )}
                        <span style={{
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          borderRadius: 6,
                          padding: '2px 8px',
                          fontSize: '0.72rem',
                          fontWeight: 700
                        }}>
                          🎫 {e.tickets_sold || 0} Registered
                        </span>
                      </div>

                      {e.sessions && e.sessions.length > 0 && (
                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {e.sessions.slice(0, 3).map((s: any) => (
                            <div key={s.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '7px 10px', fontSize: '0.78rem' }}>
                              <div style={{ fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                              <div style={{ color: '#94a3b8', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                📅 {s.session_date} {s.start_time && `· ${s.start_time}–${s.end_time || '?'}`}
                                {s.tiers?.length > 0 && <span style={{ color: '#34d399', marginLeft: 6 }}>🎫 {s.tiers.length} tiers</span>}
                              </div>
                            </div>
                          ))}
                          {e.sessions.length > 3 && <div style={{ fontSize: '0.75rem', color: '#64748b', paddingLeft: 4 }}>+{e.sessions.length - 3} more sessions</div>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: '0 16px 16px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingTop: 10, borderTop: '1px solid #1e293b', fontSize: '0.82rem' }}>
                      <span>Sold Passes: <b style={{ color: '#34d399' }}>{e.tickets_sold || 0}</b></span>
                      <span>Checked In: <b style={{ color: '#a5b4fc' }}>{e.checked_in_count || 0}</b></span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <button
                        type="button"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          const slugToUse = e.tenant_slug || tenantSlug || 'test-dandiya-26';
                          const targetUrl = `${window.location.origin}/${slugToUse}`;
                          openQrModal(targetUrl, e.title, e.location);
                        }}
                        style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          color: '#34d399',
                          padding: '8px 10px',
                          borderRadius: 10,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 5
                        }}
                      >
                        <span>📷</span> QR PNG
                      </button>
                      <button
                        type="button"
                        onClick={(evt) => {
                          evt.stopPropagation();
                          router.push(`/organizer/${e.id}/members${selectedTenantId ? `?tenantId=${selectedTenantId}` : ''}`);
                        }}
                        style={{
                          background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(99, 102, 241, 0.2) 100%)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          color: '#38bdf8',
                          padding: '8px 10px',
                          borderRadius: 10,
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 5
                        }}
                      >
                        <span>👥</span> Roster →
                      </button>
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

        {/* Nav: Requests */}
        <button
          type="button"
          onClick={() => switchTab('requests')}
          style={{
            background: 'transparent',
            border: 'none',
            color: activeTab === 'requests' ? '#f59e0b' : '#64748b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            cursor: 'pointer',
            fontSize: '0.72rem',
            fontWeight: activeTab === 'requests' ? 700 : 500,
            padding: '4px 8px',
            position: 'relative'
          }}
        >
          <div style={{ position: 'relative' }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {pendingOrders.length > 0 && (
              <span style={{
                position: 'absolute',
                top: -5,
                right: -8,
                background: '#ef4444',
                color: '#fff',
                borderRadius: '50%',
                width: 15,
                height: 15,
                fontSize: '0.62rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {pendingOrders.length}
              </span>
            )}
          </div>
          Requests
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
        {/* <button
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
        </button> */}
      </nav>

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: CONFIRM / DECLINE ORDER ACTION DIALOG
         ════════════════════════════════════════════════════════════════════ */}
      {orderActionModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(3, 7, 18, 0.85)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 120,
          padding: 16,
          boxSizing: 'border-box'
        }}>
          <div style={{
            background: '#0f172a',
            border: `1px solid ${orderActionModal.type === 'CONFIRM' ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'}`,
            borderRadius: 20,
            maxWidth: 480,
            width: '100%',
            padding: 24,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
            boxSizing: 'border-box'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: orderActionModal.type === 'CONFIRM' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: orderActionModal.type === 'CONFIRM' ? '#34d399' : '#f87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                flexShrink: 0
              }}>
                {orderActionModal.type === 'CONFIRM' ? '✓' : '⚠️'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {orderActionModal.type === 'CONFIRM' ? 'Confirm Payment & Issue Passes' : 'Decline Booking Request'}
                </h3>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>
                  Booking ID: <code style={{ color: '#fbbf24' }}>{orderActionModal.orderId}</code>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrderActionModal(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.4rem', cursor: 'pointer', padding: 4 }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 12,
              padding: '14px 16px',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              marginBottom: 18,
              fontSize: '0.84rem',
              color: '#cbd5e1',
              lineHeight: 1.5
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94a3b8' }}>Customer:</span>
                <span style={{ fontWeight: 700, color: '#ffffff' }}>{orderActionModal.customerName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94a3b8' }}>WhatsApp:</span>
                <span style={{ color: '#38bdf8' }}>{orderActionModal.customerPhone}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94a3b8' }}>Amount to Verify:</span>
                <span style={{ fontWeight: 800, color: '#34d399' }}>{orderActionModal.amountFormatted}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94a3b8' }}>UPI Ref (tr):</span>
                <code style={{ color: '#38bdf8', fontWeight: 700 }}>{orderActionModal.orderId}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#94a3b8' }}>Payment Note (tn):</span>
                <code style={{ color: '#fbbf24', fontWeight: 700, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Booking {orderActionModal.orderId}{orderActionModal.eventTitle ? ` - ${orderActionModal.eventTitle}` : ''}
                </code>
              </div>
              {orderActionModal.eventTitle && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Event:</span>
                  <span style={{ color: '#e2e8f0', textAlign: 'right', maxWidth: '60%' }}>{orderActionModal.eventTitle}</span>
                </div>
              )}
            </div>

            <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 20, lineHeight: 1.5 }}>
              {orderActionModal.type === 'CONFIRM'
                ? 'Have you verified this transaction in your UPI or bank statement? Approving will generate the cryptographically signed QR tickets and dispatch them directly to the attendee via WhatsApp.'
                : 'Are you sure you want to decline this booking request? The record will remain stored in the database as DECLINED without deletion, and a WhatsApp notification will be sent informing the attendee.'}
            </p>

            {/* Modal Footer Buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setOrderActionModal(null)}
                disabled={actionLoadingId === orderActionModal.orderId}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#cbd5e1',
                  padding: '9px 18px',
                  borderRadius: 8,
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeOrderAction}
                disabled={actionLoadingId === orderActionModal.orderId}
                style={{
                  background: orderActionModal.type === 'CONFIRM'
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : 'linear-gradient(135deg, #f43f5e, #e11d48)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '9px 20px',
                  borderRadius: 8,
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: orderActionModal.type === 'CONFIRM'
                    ? '0 4px 14px rgba(16, 185, 129, 0.35)'
                    : '0 4px 14px rgba(244, 63, 94, 0.35)'
                }}
              >
                {actionLoadingId === orderActionModal.orderId
                  ? 'Processing...'
                  : orderActionModal.type === 'CONFIRM'
                    ? 'Yes, Confirm & Send Tickets'
                    : 'Yes, Decline Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: GATE QR SCANNER TERMINAL (Mobile Fluid & No Overflow)
         ════════════════════════════════════════════════════════════════════ */}


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
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type={showTeamPassword ? 'text' : 'password'}
                    className="form-control"
                    style={{ width: '100%', paddingRight: 42 }}
                    value={newTeamMember.password}
                    onChange={e => setNewTeamMember({ ...newTeamMember, password: e.target.value })}
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowTeamPassword(!showTeamPassword)}
                    aria-label={showTeamPassword ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute',
                      right: 12,
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 4,
                      borderRadius: 4
                    }}
                  >
                    {showTeamPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
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
                        <input type="text" className="form-control" placeholder="Day 1" value={s.name} onChange={e => updateSession(s.id, 'name', e.target.value)} required />
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

      {/* ════════════════════════════════════════════════════════════════════
          MODAL: HIGH QUALITY QR CODE VIEWER & DOWNLOADER
         ════════════════════════════════════════════════════════════════════ */}
      {qrModalData && qrModalData.isOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setQrModalData(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16
          }}
        >
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f172a',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              borderRadius: 20,
              maxWidth: 480,
              width: '100%',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(15, 23, 42, 0.95)'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#ffffff' }}>
                  Event Booking QR Code
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                  Print-ready high resolution &amp; sharable link
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrModalData(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              {/* Standee Preview Card */}
              <div style={{
                background: '#ffffff',
                padding: '20px 24px',
                borderRadius: 16,
                boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                maxWidth: 300,
                width: '100%',
                marginBottom: 18,
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 6,
                  background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899)'
                }} />
                <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1rem', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {qrModalData.title}
                </div>
                <div style={{ color: '#6366f1', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0 10px' }}>
                  ⚡ Scan to Book Tickets
                </div>

                {qrModalData.qrDataUrl && (
                  <img
                    src={qrModalData.qrDataUrl}
                    alt="Event Booking QR"
                    style={{ width: '100%', height: 'auto', borderRadius: 8, display: 'block' }}
                  />
                )}

                <div style={{
                  marginTop: 10,
                  background: '#f1f5f9',
                  padding: '6px 8px',
                  borderRadius: 6,
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  color: '#0f172a',
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {qrModalData.url.replace(/^https?:\/\//, '')}
                </div>
              </div>

              {/* Copy URL Row */}
              <div style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 10,
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 16
              }}>
                <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', flex: 1 }}>
                  {qrModalData.url}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(qrModalData.url);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2500);
                  }}
                  style={{
                    background: copiedLink ? '#10b981' : 'rgba(99, 102, 241, 0.25)',
                    border: `1px solid ${copiedLink ? '#10b981' : 'rgba(99, 102, 241, 0.5)'}`,
                    color: '#ffffff',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {copiedLink ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>

              {/* Action Buttons */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  type="button"
                  disabled={downloadingQr}
                  onClick={async () => {
                    setDownloadingQr(true);
                    await downloadHighQualityQrPng(qrModalData.url, qrModalData.title, qrModalData.subtitle);
                    setDownloadingQr(false);
                  }}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '11px',
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  <span>📥</span> {downloadingQr ? 'Generating High-Res Poster...' : 'Download HQ Poster PNG (1200×1500 Print)'}
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => downloadPureQrPng(qrModalData.url, qrModalData.title)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.07)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#e2e8f0',
                      borderRadius: 10,
                      padding: '9px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <span>🔳</span> Pure QR (1024px)
                  </button>

                  <a
                    href={qrModalData.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      background: 'rgba(56, 189, 248, 0.12)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      borderRadius: 10,
                      padding: '9px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <span>↗️</span> Test Live Page
                  </a>
                </div>
              </div>
            </div>
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
