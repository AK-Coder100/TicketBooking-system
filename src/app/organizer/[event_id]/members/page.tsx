'use client';

import { useState, useEffect, useMemo, use, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getActiveSessionByTime } from '@/lib/session-utils';

interface Participant {
  ticket_id: string;
  attendee_name: string;
  attendee_age: number;
  qr_secret_token: string;
  checked_in_at: string | null;
  checkin_count: number;
  is_override_allowed: number;
  ticket_created_at: string;
  order_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  payment_status: string;
  payment_reference: string | null;
  gateway_type: string;
  gateway_payment_id: string | null;
  total_charged: number;
  order_created_at: string;
  tier_id: string;
  tier_name: string;
  price_in_paise: number;
  session_id: string | null;
  session_name: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface EventData {
  id: string;
  title: string;
  banner_url?: string;
  description?: string;
  location: string;
  start_date: string;
  end_date: string;
  is_published: number;
  tenant_id: string;
}

interface SessionData {
  id: string;
  name: string;
  session_date: string;
  start_time?: string;
  end_time?: string;
}

interface TierData {
  id: string;
  name: string;
  price_in_paise: number;
  capacity?: number;
}

function EventMembersContent({ eventId }: { eventId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantIdQuery = searchParams.get('tenantId') || '';
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [tiers, setTiers] = useState<TierData[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedTicketId, setCopiedTicketId] = useState<string | null>(null);

  // Mobile layout state
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('CARDS');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [activeGateSessionId, setActiveGateSessionId] = useState<string>('ALL');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CHECKED_IN' | 'NOT_ARRIVED'>('ALL');
  const [sessionFilter, setSessionFilter] = useState<string>('ALL');
  const [tierFilter, setTierFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'PAID' | 'PENDING'>('ALL');
  const [sortBy, setSortBy] = useState<'NEWEST' | 'OLDEST' | 'NAME_ASC' | 'NAME_DESC' | 'CHECKIN_TIME'>('NEWEST');

  // Selected participant for modal
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [showAuditLogsModal, setShowAuditLogsModal] = useState(false);

  // Detect initial screen size for default view mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.innerWidth >= 1024) {
        setViewMode('TABLE');
      } else {
        setViewMode('CARDS');
      }
    }
  }, []);

  // Fetch Event & Participants Data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/tenant/events/${eventId}/members${tenantIdQuery ? `?tenantId=${tenantIdQuery}` : ''}`;
      const res = await fetch(url);
      if (res.status === 401) {
        router.push('/organizer/login');
        return;
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load participants for this event.');
      }
      setEvent(data.event);
      const loadedSessions: SessionData[] = data.sessions || [];
      setSessions(loadedSessions);
      setTiers(data.tiers || []);
      setParticipants(data.participants || []);
      setAuditLogs(data.auditLogs || []);
      setStats(data.stats || {});
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [eventId, tenantIdQuery]);

  // Automatic Real-Time Date & Time Session Calculation
  const sessionStatus = useMemo(() => {
    return getActiveSessionByTime(sessions, new Date());
  }, [sessions]);

  // Handle participant status actions with Active Session enforcement
  const handleParticipantAction = async (ticketId: string, action: 'CHECKIN' | 'UNCHECK' | 'OVERRIDE', targetParticipant?: Participant) => {
    // If admitting, check automatic date and time session
    if (action === 'CHECKIN' && targetParticipant && sessions.length > 1 && sessionStatus.activeSession) {
      if (targetParticipant.session_id && targetParticipant.session_id !== sessionStatus.activeSession.id) {
        setActionFeedback({
          type: 'error',
          message: `Inactive Show: Pass is valid for "${targetParticipant.session_name || 'Show'}" (${targetParticipant.session_date || ''} ${targetParticipant.start_time || ''}), but currently active show by date & time is "${sessionStatus.activeSession.name}" (${sessionStatus.activeSession.session_date} ${sessionStatus.activeSession.start_time || ''}). Use Supervisor Override to admit anyway.`
        });
        return;
      }
    }

    setActionLoadingId(ticketId);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/tenant/events/${eventId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId,
          action,
          activeSessionId: activeGateSessionId,
          reason: 'Organizer mobile action'
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to update ticket`);
      }
      setActionFeedback({
        type: 'success',
        message: data.message || (action === 'CHECKIN' ? 'Attendee checked in successfully!' : 'Check-in status updated.')
      });
      // Refresh list
      await loadData();
      if (selectedParticipant && selectedParticipant.ticket_id === ticketId) {
        setSelectedParticipant(prev => {
          if (!prev) return null;
          if (action === 'CHECKIN') {
            return { ...prev, checked_in_at: new Date().toISOString(), checkin_count: (prev.checkin_count || 0) + 1 };
          } else if (action === 'UNCHECK') {
            return { ...prev, checked_in_at: null, checkin_count: 0 };
          } else if (action === 'OVERRIDE') {
            return { ...prev, is_override_allowed: 1, checkin_count: (prev.checkin_count || 1) + 1 };
          }
          return prev;
        });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Action failed' });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Copy Ticket ID
  const copyTicketId = (id: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(id);
      setCopiedTicketId(id);
      setTimeout(() => setCopiedTicketId(null), 2000);
    }
  };

  // Filtered & Sorted Participants
  const filteredParticipants = useMemo(() => {
    return participants.filter(p => {
      // Search match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (p.attendee_name || '').toLowerCase().includes(q);
        const matchesCustomer = (p.customer_name || '').toLowerCase().includes(q);
        const matchesPhone = (p.customer_phone || '').toLowerCase().includes(q);
        const matchesEmail = (p.customer_email || '').toLowerCase().includes(q);
        const matchesTicket = (p.ticket_id || '').toLowerCase().includes(q);
        const matchesOrder = (p.order_id || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCustomer && !matchesPhone && !matchesEmail && !matchesTicket && !matchesOrder) {
          return false;
        }
      }

      // Status match
      const isCheckedIn = (p.checkin_count || 0) > 0;
      if (statusFilter === 'CHECKED_IN' && !isCheckedIn) return false;
      if (statusFilter === 'NOT_ARRIVED' && isCheckedIn) return false;

      // Session match
      if (sessionFilter !== 'ALL') {
        if (sessionFilter === 'NO_SESSION' && p.session_id) return false;
        if (sessionFilter !== 'NO_SESSION' && p.session_id !== sessionFilter) return false;
      }

      // Tier match
      if (tierFilter !== 'ALL' && p.tier_id !== tierFilter) {
        return false;
      }

      // Payment match
      if (paymentFilter !== 'ALL' && p.payment_status !== paymentFilter) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'NEWEST') {
        return new Date(b.ticket_created_at || b.order_created_at).getTime() - new Date(a.ticket_created_at || a.order_created_at).getTime();
      }
      if (sortBy === 'OLDEST') {
        return new Date(a.ticket_created_at || a.order_created_at).getTime() - new Date(b.ticket_created_at || b.order_created_at).getTime();
      }
      if (sortBy === 'NAME_ASC') {
        return (a.attendee_name || '').localeCompare(b.attendee_name || '');
      }
      if (sortBy === 'NAME_DESC') {
        return (b.attendee_name || '').localeCompare(a.attendee_name || '');
      }
      if (sortBy === 'CHECKIN_TIME') {
        const timeA = a.checked_in_at ? new Date(a.checked_in_at).getTime() : 0;
        const timeB = b.checked_in_at ? new Date(b.checked_in_at).getTime() : 0;
        return timeB - timeA;
      }
      return 0;
    });
  }, [participants, searchQuery, statusFilter, sessionFilter, tierFilter, paymentFilter, sortBy]);

  // CSV Export
  const exportToCSV = () => {
    if (filteredParticipants.length === 0) {
      alert('No participant records to export.');
      return;
    }

    const headers = [
      'Ticket ID',
      'Attendee Name',
      'Attendee Age',
      'Tier Name',
      'Session',
      'Price (INR)',
      'Customer Name',
      'Customer Phone',
      'Customer Email',
      'Order ID',
      'Payment Status',
      'Check-in Status',
      'Check-in Count',
      'Checked-in At',
      'Booking Date'
    ];

    const rows = filteredParticipants.map(p => [
      `"${p.ticket_id}"`,
      `"${p.attendee_name.replace(/"/g, '""')}"`,
      p.attendee_age || '',
      `"${(p.tier_name || '').replace(/"/g, '""')}"`,
      `"${(p.session_name || 'General').replace(/"/g, '""')}"`,
      ((p.price_in_paise || 0) / 100).toFixed(2),
      `"${(p.customer_name || '').replace(/"/g, '""')}"`,
      `"${p.customer_phone || ''}"`,
      `"${p.customer_email || ''}"`,
      `"${p.order_id}"`,
      `"${p.payment_status}"`,
      (p.checkin_count || 0) > 0 ? 'Checked In' : 'Not Arrived',
      p.checkin_count || 0,
      p.checked_in_at ? `"${new Date(p.checked_in_at).toLocaleString('en-IN')}"` : '""',
      p.ticket_created_at ? `"${new Date(p.ticket_created_at).toLocaleString('en-IN')}"` : '""'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${(event?.title || 'event').replace(/[^a-z0-9]/gi, '_')}_participants.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setSessionFilter('ALL');
    setTierFilter('ALL');
    setPaymentFilter('ALL');
    setSortBy('NEWEST');
  };

  const hasActiveFilters = searchQuery || statusFilter !== 'ALL' || sessionFilter !== 'ALL' || tierFilter !== 'ALL' || paymentFilter !== 'ALL' || sortBy !== 'NEWEST';
  const activeFiltersCount = (searchQuery ? 1 : 0) + (statusFilter !== 'ALL' ? 1 : 0) + (sessionFilter !== 'ALL' ? 1 : 0) + (tierFilter !== 'ALL' ? 1 : 0) + (paymentFilter !== 'ALL' ? 1 : 0) + (sortBy !== 'NEWEST' ? 1 : 0);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at 50% 0%, #171b2d 0%, #090d16 65%, #05070d 100%)',
      color: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
      paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))',
      boxSizing: 'border-box'
    }}>
      {/* ── Top Sticky Mobile-Friendly Header ───────────────────────────────── */}
      <header style={{
        background: 'rgba(13, 19, 34, 0.92)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid #1e293b',
        position: 'sticky',
        top: 0,
        zIndex: 45,
        padding: '10px 14px'
      }}>
        <div style={{
          maxWidth: 1380,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8
        }}>
          {/* Back & Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <Link
              href={`/organizer?tab=events${tenantIdQuery ? `&tenantId=${tenantIdQuery}` : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#f8fafc',
                width: 44,
                height: 44,
                borderRadius: 12,
                fontSize: '1.15rem',
                fontWeight: 700,
                textDecoration: 'none',
                flexShrink: 0
              }}
              title="Back to Events"
            >
              ←
            </Link>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Participant Roster
              </div>
              <div style={{
                fontSize: '0.94rem',
                fontWeight: 800,
                color: '#ffffff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '220px'
              }} title={event?.title}>
                {event?.title || (loading ? 'Loading...' : 'Event Roster')}
              </div>
            </div>
          </div>

          {/* Action Tools Pills (Horizontal scroll on mobile) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* View Mode Toggle Button */}
            <button
              type="button"
              onClick={() => setViewMode(prev => prev === 'CARDS' ? 'TABLE' : 'CARDS')}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cbd5e1',
                padding: '8px 12px',
                borderRadius: 10,
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                minHeight: 44,
                touchAction: 'manipulation'
              }}
              title="Toggle Cards or Table view"
            >
              {viewMode === 'CARDS' ? '📋 Table' : '🃏 Cards'}
            </button>

            {/* Gate Logs Button */}
            <button
              type="button"
              onClick={() => setShowAuditLogsModal(true)}
              style={{
                background: 'rgba(99, 102, 241, 0.18)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                color: '#a5b4fc',
                padding: '8px 12px',
                borderRadius: 10,
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                minHeight: 44,
                touchAction: 'manipulation'
              }}
            >
              📋 Logs ({auditLogs.length})
            </button>

            {/* Direct Scanner Link */}
            <Link
              href={`/organizer/scanner?eventId=${eventId}`}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                textDecoration: 'none',
                padding: '8px 14px',
                borderRadius: 10,
                fontSize: '0.78rem',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                minHeight: 44,
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)'
              }}
            >
              ⚡ Scanner
            </Link>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              style={{
                background: 'linear-gradient(135deg, #38bdf8 0%, #6366f1 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '8px 14px',
                borderRadius: 10,
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                minHeight: 44,
                touchAction: 'manipulation',
                boxShadow: '0 2px 8px rgba(56, 189, 248, 0.25)'
              }}
            >
              🔄 {loading ? '...' : 'Sync'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ─────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 1380, margin: '0 auto', padding: '14px 12px', boxSizing: 'border-box' }}>
        {/* Error State */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 14,
            color: '#fca5a5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.85rem'
          }}>
            <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <strong>Error:</strong> {error}
            </div>
            <button
              type="button"
              onClick={loadData}
              style={{
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                flexShrink: 0,
                marginLeft: 8
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div style={{
            background: actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${actionFeedback.type === 'success' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: actionFeedback.type === 'success' ? '#6ee7b7' : '#fca5a5',
            fontSize: '0.84rem',
            fontWeight: 600
          }}>
            <span>{actionFeedback.type === 'success' ? '✅' : '⚠️'} {actionFeedback.message}</span>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.2rem', padding: '0 4px' }}
            >
              &times;
            </button>
          </div>
        )}



        {/* ── Active Gate Session Banner (Automated by Real-time Date & Time) ─────── */}
        {sessions.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.9) 0%, rgba(13, 19, 34, 0.98) 100%)',
            border: '1.5px solid rgba(99, 102, 241, 0.5)',
            borderRadius: 14,
            padding: '12px 16px',
            marginBottom: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: '1.25rem' }}>{sessionStatus.status === 'LIVE_NOW' ? '🟢' : '⏳'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.68rem', color: '#a5b4fc', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    AUTOMATIC SESSION ENGINE (BY DATE & TIME):
                  </span>
                  <span style={{
                    background: sessionStatus.status === 'LIVE_NOW' ? '#047857' : '#0369a1',
                    color: '#ffffff',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: 4
                  }}>
                    {sessionStatus.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ffffff', marginTop: 2 }}>
                  {sessionStatus.label} • <span style={{ color: '#cbd5e1', fontWeight: 500, fontSize: '0.8rem' }}>{sessionStatus.description}</span>
                </div>
              </div>
            </div>

            <Link
              href={`/organizer/scanner?eventId=${eventId}`}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                textDecoration: 'none',
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: '0.82rem',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
                flexShrink: 0
              }}
            >
              ⚡ Open Gate Scanner →
            </Link>
          </div>
        )}

        {/* ── KPI Stat Summary Cards (2x2 Grid on Mobile) ──────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          marginBottom: 14
        }}>
          {/* Card 1: Total Registered */}
          <div style={{
            background: '#0d1322',
            border: '1px solid #1e293b',
            borderRadius: 14,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minWidth: 0
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.64rem', color: '#64748b', fontWeight: 800, letterSpacing: '0.04em' }}>
                TOTAL PASSES
              </span>
              <span style={{ fontSize: '0.9rem' }}>👥</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', margin: '4px 0 1px' }}>
              {stats.totalTickets ?? participants.length}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stats.paidCount ?? participants.filter(p => p.payment_status === 'PAID').length} Paid
            </div>
          </div>

          {/* Card 2: Admitted / Checked-In */}
          <div style={{
            background: '#0d1322',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            borderRadius: 14,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minWidth: 0
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.64rem', color: '#6ee7b7', fontWeight: 800, letterSpacing: '0.04em' }}>
                ADMITTED
              </span>
              <span style={{ fontSize: '0.9rem' }}>✅</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399', margin: '4px 0 1px' }}>
              {stats.checkedInCount ?? participants.filter(p => (p.checkin_count || 0) > 0).length}
            </div>
            {/* Progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#94a3b8', marginBottom: 2 }}>
                <span>Rate</span>
                <b style={{ color: '#34d399' }}>{stats.checkinPercentage ?? 0}%</b>
              </div>
              <div style={{ width: '100%', height: 4, background: '#1e293b', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{
                  width: `${stats.checkinPercentage ?? 0}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #10b981, #34d399)',
                  borderRadius: 9999
                }} />
              </div>
            </div>
          </div>

          {/* Card 3: Not Arrived */}
          <div style={{
            background: '#0d1322',
            border: '1px solid #1e293b',
            borderRadius: 14,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minWidth: 0
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.64rem', color: '#64748b', fontWeight: 800, letterSpacing: '0.04em' }}>
                NOT ARRIVED
              </span>
              <span style={{ fontSize: '0.9rem' }}>⏳</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b', margin: '4px 0 1px' }}>
              {stats.notArrivedCount ?? participants.filter(p => (p.checkin_count || 0) === 0).length}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 600 }}>
              Expected at gate
            </div>
          </div>

          {/* Card 4: Gross Value */}
          <div style={{
            background: '#0d1322',
            border: '1px solid #1e293b',
            borderRadius: 14,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minWidth: 0
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.64rem', color: '#64748b', fontWeight: 800, letterSpacing: '0.04em' }}>
                GROSS SALES
              </span>
              <span style={{ fontSize: '0.9rem' }}>💰</span>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ffffff', margin: '4px 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ₹{stats.grossRevenueRupees ?? '0'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              Verified bookings
            </div>
          </div>
        </div>

        {/* ── Search & Filter Controls ──────────────────────────────────────── */}
        <div style={{
          background: '#0d1322',
          border: '1px solid #1e293b',
          borderRadius: 16,
          padding: '14px',
          marginBottom: 14
        }}>
          {/* Mobile Search Input */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '0.95rem' }}>
              🔍
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search name, phone, ticket ID..."
              style={{
                width: '100%',
                background: '#131b2e',
                border: '1px solid #334155',
                borderRadius: 10,
                padding: '11px 36px 11px 38px',
                color: '#ffffff',
                fontSize: '16px', // Prevents iOS Safari zoom-in on focus
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: 24,
                  height: 24,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                &times;
              </button>
            )}
          </div>

          {/* 1-Tap Quick Arrival Status Filter Pills (Horizontal Scroll on Mobile) */}
          <div style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 4,
            marginBottom: 8
          }}>
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              style={{
                background: statusFilter === 'ALL' ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: statusFilter === 'ALL' ? '#38bdf8' : '#94a3b8',
                border: `1px solid ${statusFilter === 'ALL' ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: 9999,
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                touchAction: 'manipulation'
              }}
            >
              All ({participants.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('CHECKED_IN')}
              style={{
                background: statusFilter === 'CHECKED_IN' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: statusFilter === 'CHECKED_IN' ? '#34d399' : '#94a3b8',
                border: `1px solid ${statusFilter === 'CHECKED_IN' ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: 9999,
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                touchAction: 'manipulation'
              }}
            >
              ✓ Admitted ({participants.filter(p => (p.checkin_count || 0) > 0).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('NOT_ARRIVED')}
              style={{
                background: statusFilter === 'NOT_ARRIVED' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255, 255, 255, 0.04)',
                color: statusFilter === 'NOT_ARRIVED' ? '#fbbf24' : '#94a3b8',
                border: `1px solid ${statusFilter === 'NOT_ARRIVED' ? 'rgba(245, 158, 11, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: 9999,
                padding: '6px 14px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                touchAction: 'manipulation'
              }}
            >
              ⏳ Not Arrived ({participants.filter(p => (p.checkin_count || 0) === 0).length})
            </button>
          </div>

          {/* Toggle More Filters (Accordion for mobile clean layout) */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setShowMobileFilters(prev => !prev)}
              style={{
                background: showMobileFilters ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              ⚙️ More Filters {activeFiltersCount > 0 && `(${activeFiltersCount})`} {showMobileFilters ? '▲' : '▼'}
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#f43f5e',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ✕ Reset
              </button>
            )}
          </div>

          {/* Expanded Filter Dropdowns */}
          {showMobileFilters && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 8,
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              {/* Session */}
              <div>
                <label style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  SESSION
                </label>
                <select
                  value={sessionFilter}
                  onChange={e => setSessionFilter(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#131b2e',
                    border: '1px solid #334155',
                    borderRadius: 10,
                    padding: '10px 12px',
                    color: '#f8fafc',
                    fontSize: '16px',
                    outline: 'none',
                    minHeight: 44,
                    boxSizing: 'border-box' as const
                  }}
                >
                  <option value="ALL">All Sessions ({sessions.length})</option>
                  {sessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.session_date})
                    </option>
                  ))}
                </select>
              </div>

              {/* Tier */}
              <div>
                <label style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  TICKET TIER
                </label>
                <select
                  value={tierFilter}
                  onChange={e => setTierFilter(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#131b2e',
                    border: '1px solid #334155',
                    borderRadius: 10,
                    padding: '10px 12px',
                    color: '#f8fafc',
                    fontSize: '16px',
                    outline: 'none',
                    minHeight: 44,
                    boxSizing: 'border-box' as const
                  }}
                >
                  <option value="ALL">All Tiers ({tiers.length})</option>
                  {tiers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} (₹{(t.price_in_paise / 100).toFixed(0)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort By */}
              <div>
                <label style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  SORT ORDER
                </label>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  style={{
                    width: '100%',
                    background: '#131b2e',
                    border: '1px solid #334155',
                    borderRadius: 10,
                    padding: '10px 12px',
                    color: '#f8fafc',
                    fontSize: '16px',
                    outline: 'none',
                    minHeight: 44,
                    boxSizing: 'border-box' as const
                  }}
                >
                  <option value="NEWEST">Newest Booking</option>
                  <option value="OLDEST">Oldest Booking</option>
                  <option value="NAME_ASC">Name (A-Z)</option>
                  <option value="NAME_DESC">Name (Z-A)</option>
                  <option value="CHECKIN_TIME">Check-in Time</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Results Header Count */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '0 4px' }}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Found <b style={{ color: '#ffffff' }}>{filteredParticipants.length}</b> participant{filteredParticipants.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* ── Participants View: MOBILE CARDS ──────────────────────────────── */}
        {viewMode === 'CARDS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredParticipants.length === 0 ? (
              <div style={{
                background: '#0d1322',
                border: '1px solid #1e293b',
                borderRadius: 16,
                padding: '40px 18px',
                textAlign: 'center',
                color: '#94a3b8'
              }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔍</div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>
                  No Attendees Found
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: 320, margin: '0 auto 12px' }}>
                  {hasActiveFilters ? 'No records match your active search or filters.' : 'No attendees registered yet.'}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      padding: '7px 16px',
                      borderRadius: 8,
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            ) : (
              filteredParticipants.map(p => {
                const isCheckedIn = (p.checkin_count || 0) > 0;
                const cleanPhone = (p.customer_phone || '').replace(/\D/g, '');

                return (
                  <div
                    key={p.ticket_id}
                    style={{
                      background: '#0d1322',
                      border: `1px solid ${isCheckedIn ? 'rgba(16, 185, 129, 0.35)' : '#1e293b'}`,
                      borderRadius: 16,
                      padding: '14px',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.2s ease',
                      boxShadow: isCheckedIn ? '0 4px 16px rgba(16, 185, 129, 0.08)' : 'none'
                    }}
                  >
                    {/* Card Top Row: Avatar, Attendee Name, Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: '50%',
                          background: isCheckedIn ? 'rgba(16, 185, 129, 0.18)' : 'rgba(99, 102, 241, 0.18)',
                          border: `1.5px solid ${isCheckedIn ? '#34d399' : '#818cf8'}`,
                          color: isCheckedIn ? '#34d399' : '#a5b4fc',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          flexShrink: 0
                        }}>
                          {(p.attendee_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontWeight: 800,
                            color: '#ffffff',
                            fontSize: '0.96rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {p.attendee_name}
                            {p.attendee_age && (
                              <span style={{ fontSize: '0.74rem', color: '#94a3b8', fontWeight: 500, marginLeft: 6 }}>
                                ({p.attendee_age} yrs)
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                            <span>Pass:</span>
                            <code
                              onClick={() => copyTicketId(p.ticket_id)}
                              style={{ color: '#38bdf8', cursor: 'pointer', fontFamily: 'monospace' }}
                              title="Click to copy ticket ID"
                            >
                              {p.ticket_id} {copiedTicketId === p.ticket_id ? '✓' : ''}
                            </code>
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div>
                        {isCheckedIn ? (
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            display: 'inline-block'
                          }}>
                            ✓ ADMITTED ({p.checkin_count}x)
                          </span>
                        ) : (
                          <span style={{
                            background: 'rgba(100, 116, 139, 0.2)',
                            color: '#94a3b8',
                            border: '1px solid rgba(100, 116, 139, 0.3)',
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            display: 'inline-block'
                          }}>
                            ⏳ NOT ARRIVED
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Middle: Pass Tier, Session, Price & Contact Info */}
                    <div style={{
                      background: 'rgba(15, 23, 42, 0.65)',
                      borderRadius: 10,
                      padding: '8px 10px',
                      marginBottom: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            background: 'rgba(99, 102, 241, 0.25)',
                            color: '#c7d2fe',
                            border: '1px solid rgba(99, 102, 241, 0.4)',
                            padding: '1px 7px',
                            borderRadius: 6,
                            fontSize: '0.72rem',
                            fontWeight: 700
                          }}>
                            🎫 {p.tier_name}
                          </span>
                          <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 700 }}>
                            ₹{((p.price_in_paise || 0) / 100).toFixed(0)}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                          Order #{p.order_id}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: '#94a3b8', marginTop: 2, flexWrap: 'wrap', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
                            🎭 {p.session_name || 'General Session'} {p.session_date && `(${p.session_date})`}
                          </span>
                          {activeGateSessionId !== 'ALL' && p.session_id && (
                            <span style={{
                              background: p.session_id === activeGateSessionId ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: p.session_id === activeGateSessionId ? '#34d399' : '#fbbf24',
                              border: `1px solid ${p.session_id === activeGateSessionId ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontSize: '0.64rem',
                              fontWeight: 700
                            }}>
                              {p.session_id === activeGateSessionId ? '🟢 Active Show' : '⚪ Inactive Show'}
                            </span>
                          )}
                        </div>
                        {p.checked_in_at && (
                          <span style={{ color: '#6ee7b7', fontSize: '0.7rem' }}>
                            {new Date(p.checked_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Contact & Action Buttons */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {/* Left: WhatsApp & Phone buttons */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {p.customer_phone ? (
                          <>
                            <a
                              href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hi ${p.attendee_name || p.customer_name}, regarding your pass for ${event?.title || 'the event'} (Ticket #${p.ticket_id}).`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                background: 'rgba(16, 185, 129, 0.15)',
                                color: '#34d399',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: 10,
                                padding: '8px 12px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                minHeight: 44,
                                boxSizing: 'border-box',
                                touchAction: 'manipulation'
                              }}
                            >
                              💬 WA
                            </a>
                            <a
                              href={`tel:${cleanPhone}`}
                              style={{
                                background: 'rgba(255, 255, 255, 0.06)',
                                color: '#cbd5e1',
                                border: '1px solid rgba(255, 255, 255, 0.12)',
                                borderRadius: 10,
                                padding: '8px 12px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                minHeight: 44,
                                boxSizing: 'border-box',
                                touchAction: 'manipulation'
                              }}
                            >
                              📞 Call
                            </a>
                          </>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>No phone</span>
                        )}
                      </div>

                      {/* Right: Primary Checkin / Override / Details Actions */}
                      <div style={{ display: 'flex', gap: 6, flex: '1 1 auto', justifyContent: 'flex-end' }}>
                        {isCheckedIn ? (
                          <>
                            <button
                              type="button"
                              disabled={actionLoadingId === p.ticket_id}
                              onClick={() => handleParticipantAction(p.ticket_id, 'OVERRIDE')}
                              style={{
                                background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: 10,
                                padding: '8px 12px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                minHeight: 44,
                                touchAction: 'manipulation'
                              }}
                            >
                              + Re-entry
                            </button>
                            <button
                              type="button"
                              disabled={actionLoadingId === p.ticket_id}
                              onClick={() => handleParticipantAction(p.ticket_id, 'UNCHECK')}
                              style={{
                                background: 'rgba(239, 68, 68, 0.12)',
                                color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                borderRadius: 10,
                                padding: '8px 10px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                minHeight: 44,
                                touchAction: 'manipulation'
                              }}
                            >
                              Undo
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={actionLoadingId === p.ticket_id}
                            onClick={() => handleParticipantAction(p.ticket_id, 'CHECKIN', p)}
                            style={{
                              background: activeGateSessionId !== 'ALL' && p.session_id && p.session_id !== activeGateSessionId
                                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: 10,
                              padding: '8px 14px',
                              fontSize: '0.85rem',
                              fontWeight: 800,
                              cursor: 'pointer',
                              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
                              minHeight: 44,
                              flex: '1 1 auto',
                              maxWidth: '140px',
                              touchAction: 'manipulation'
                            }}
                            title={activeGateSessionId !== 'ALL' && p.session_id && p.session_id !== activeGateSessionId ? 'Ticket belongs to inactive session show' : 'Admit participant'}
                          >
                            {actionLoadingId === p.ticket_id
                              ? '...'
                              : activeGateSessionId !== 'ALL' && p.session_id && p.session_id !== activeGateSessionId
                                ? '⚠️ Admit'
                                : '✓ Admit'}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedParticipant(p)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.08)',
                            color: '#e2e8f0',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: 10,
                            padding: '8px 12px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            minHeight: 44,
                            touchAction: 'manipulation'
                          }}
                        >
                          Info
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Participants View: DESKTOP / TABLE MODE ──────────────────────── */}
        {viewMode === 'TABLE' && (
          <div style={{
            background: '#0d1322',
            border: '1px solid #1e293b',
            borderRadius: 16,
            overflow: 'hidden'
          }}>
            {filteredParticipants.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '50px 18px', color: '#64748b' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔍</div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>
                  No Participants Found
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', maxWidth: 400, margin: '0 auto 12px' }}>
                  {hasActiveFilters ? 'Try adjusting your search query or filters.' : 'No tickets booked yet.'}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      padding: '7px 16px',
                      borderRadius: 8,
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 900 }}>
                  <thead>
                    <tr style={{
                      background: 'rgba(15, 23, 42, 0.75)',
                      borderBottom: '1px solid #1e293b',
                      textAlign: 'left',
                      color: '#64748b',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase'
                    }}>
                      <th style={{ padding: '12px 16px' }}>Attendee</th>
                      <th style={{ padding: '12px 14px' }}>Buyer &amp; Phone</th>
                      <th style={{ padding: '12px 14px' }}>Ticket &amp; Session</th>
                      <th style={{ padding: '12px 14px' }}>Check-In Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParticipants.map(p => {
                      const isCheckedIn = (p.checkin_count || 0) > 0;
                      const cleanPhone = (p.customer_phone || '').replace(/\D/g, '');

                      return (
                        <tr
                          key={p.ticket_id}
                          style={{
                            borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                            background: selectedParticipant?.ticket_id === p.ticket_id ? 'rgba(56, 189, 248, 0.06)' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ fontWeight: 700, color: '#ffffff' }}>
                              {p.attendee_name} {p.attendee_age && <span style={{ color: '#94a3b8', fontSize: '0.74rem' }}>({p.attendee_age}y)</span>}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontFamily: 'monospace', marginTop: 2 }}>
                              {p.ticket_id}
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 600, color: '#cbd5e1' }}>{p.customer_name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>{p.customer_phone || 'N/A'}</span>
                              {p.customer_phone && (
                                <a
                                  href={`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hi ${p.attendee_name || p.customer_name}, regarding your pass for ${event?.title || 'the event'} (Ticket #${p.ticket_id}).`)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: '#34d399',
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    fontSize: '0.64rem',
                                    fontWeight: 700,
                                    textDecoration: 'none'
                                  }}
                                >
                                  WA ↗
                                </a>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#c7d2fe', padding: '1px 6px', borderRadius: 4, fontSize: '0.72rem', fontWeight: 700 }}>
                                🎫 {p.tier_name}
                              </span>
                              <span style={{ color: '#34d399', fontWeight: 700, fontSize: '0.78rem' }}>
                                ₹{((p.price_in_paise || 0) / 100).toFixed(0)}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span>{p.session_name || 'General'}</span>
                              {activeGateSessionId !== 'ALL' && p.session_id && (
                                <span style={{
                                  background: p.session_id === activeGateSessionId ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                  color: p.session_id === activeGateSessionId ? '#34d399' : '#fbbf24',
                                  padding: '1px 4px',
                                  borderRadius: 4,
                                  fontSize: '0.62rem',
                                  fontWeight: 700
                                }}>
                                  {p.session_id === activeGateSessionId ? '🟢 Active' : '⚪ Inactive'}
                                </span>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '12px 14px' }}>
                            {isCheckedIn ? (
                              <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800 }}>
                                ✓ ADMITTED ({p.checkin_count}x)
                              </span>
                            ) : (
                              <span style={{ background: 'rgba(100, 116, 139, 0.2)', color: '#94a3b8', padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700 }}>
                                ⏳ Not Arrived
                              </span>
                            )}
                          </td>

                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              {isCheckedIn ? (
                                <button
                                  type="button"
                                  disabled={actionLoadingId === p.ticket_id}
                                  onClick={() => handleParticipantAction(p.ticket_id, 'OVERRIDE')}
                                  style={{
                                    background: 'rgba(139, 92, 246, 0.18)',
                                    color: '#c084fc',
                                    border: '1px solid rgba(139, 92, 246, 0.3)',
                                    borderRadius: 6,
                                    padding: '4px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  + Re-entry
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={actionLoadingId === p.ticket_id}
                                  onClick={() => handleParticipantAction(p.ticket_id, 'CHECKIN', p)}
                                  style={{
                                    background: activeGateSessionId !== 'ALL' && p.session_id && p.session_id !== activeGateSessionId
                                      ? 'linear-gradient(135deg, #f59e0b, #d97706)'
                                      : 'linear-gradient(135deg, #10b981, #059669)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: 6,
                                    padding: '4px 10px',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {activeGateSessionId !== 'ALL' && p.session_id && p.session_id !== activeGateSessionId ? '⚠️ Admit' : '✓ Admit'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedParticipant(p)}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.08)',
                                  color: '#cbd5e1',
                                  border: '1px solid rgba(255, 255, 255, 0.15)',
                                  borderRadius: 6,
                                  padding: '4px 8px',
                                  fontSize: '0.72rem',
                                  cursor: 'pointer'
                                }}
                              >
                                Details
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Fixed Mobile Bottom Quick Dock ─────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 'calc(62px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(9, 13, 22, 0.96)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid #1e293b',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 40,
        boxSizing: 'border-box'
      }}>
        {/* Dock 1: Back */}
        <Link
          href={`/organizer?tab=events${tenantIdQuery ? `&tenantId=${tenantIdQuery}` : ''}`}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            textDecoration: 'none',
            fontSize: '0.68rem',
            fontWeight: 600,
            padding: '4px 8px'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>📅</span>
          Events
        </Link>

        {/* Dock 2: Search */}
        <button
          type="button"
          onClick={() => {
            searchInputRef.current?.focus();
            window.scrollTo({ top: 180, behavior: 'smooth' });
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#38bdf8',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            cursor: 'pointer',
            fontSize: '0.68rem',
            fontWeight: 700,
            padding: '4px 8px'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>🔍</span>
          Search
        </button>

        {/* Dock 3: QR Scanner */}
        <Link
          href={`/organizer/scanner?eventId=${eventId}${tenantIdQuery ? `&tenantId=${tenantIdQuery}` : ''}`}
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
            width: 52,
            height: 52,
            borderRadius: '50%',
            boxShadow: '0 4px 16px rgba(16, 185, 129, 0.5)',
            marginBottom: 10,
            fontSize: '1.4rem'
          }}
          title="Launch Gate Scanner"
        >
          ⚡
        </Link>

        {/* Dock 4: Logs */}
        <button
          type="button"
          onClick={() => setShowAuditLogsModal(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#cbd5e1',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            cursor: 'pointer',
            fontSize: '0.68rem',
            fontWeight: 600,
            padding: '4px 8px'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>📋</span>
          Gate Logs
        </button>

        {/* Dock 5: Refresh */}
        <button
          type="button"
          onClick={loadData}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#34d399',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            cursor: 'pointer',
            fontSize: '0.68rem',
            fontWeight: 600,
            padding: '4px 8px'
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>🔄</span>
          Sync
        </button>
      </div>

      {/* ── Mobile-Optimized Participant Details Bottom Sheet Modal ────────── */}
      {selectedParticipant && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.82)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'flex-end', // Bottom sheet on mobile, center on desktop
          justifyContent: 'center',
          zIndex: 100,
          padding: 0
        }}>
          <div style={{
            background: '#0d1322',
            borderTop: '2px solid rgba(99, 102, 241, 0.4)',
            borderLeft: '1px solid #1e293b',
            borderRight: '1px solid #1e293b',
            borderRadius: '24px 24px 0 0',
            width: '100%',
            maxWidth: 620,
            maxHeight: '88vh',
            overflowY: 'auto',
            padding: '18px 18px calc(24px + env(safe-area-inset-bottom, 0px)) 18px',
            boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.7)',
            boxSizing: 'border-box',
            position: 'relative'
          }}>
            {/* Pull Bar / Handle */}
            <div style={{ width: 44, height: 4, background: '#334155', borderRadius: 9999, margin: '0 auto 14px' }} />

            {/* Modal Top Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <span style={{ fontSize: '0.68rem', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Pass Metadata &amp; Attendee
                </span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', margin: '2px 0 0' }}>
                  {selectedParticipant.attendee_name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedParticipant(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#94a3b8',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  fontSize: '1.3rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  touchAction: 'manipulation'
                }}
              >
                &times;
              </button>
            </div>

            {/* Arrival Status & Fast Action Bar */}
            <div style={{
              background: (selectedParticipant.checkin_count || 0) > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              border: `1px solid ${(selectedParticipant.checkin_count || 0) > 0 ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
              borderRadius: 14,
              padding: '12px 14px',
              marginBottom: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8
            }}>
              <div>
                <div style={{
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  color: (selectedParticipant.checkin_count || 0) > 0 ? '#34d399' : '#fbbf24'
                }}>
                  {(selectedParticipant.checkin_count || 0) > 0
                    ? `✓ Admitted (${selectedParticipant.checkin_count}x)`
                    : '⏳ Not Arrived at Venue'}
                </div>
                {selectedParticipant.checked_in_at && (
                  <div style={{ fontSize: '0.74rem', color: '#cbd5e1', marginTop: 2 }}>
                    First scan: {new Date(selectedParticipant.checked_in_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                {(selectedParticipant.checkin_count || 0) > 0 ? (
                  <>
                    <button
                      type="button"
                      disabled={actionLoadingId === selectedParticipant.ticket_id}
                      onClick={() => handleParticipantAction(selectedParticipant.ticket_id, 'OVERRIDE')}
                      style={{
                        background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                        color: '#ffffff',
                        border: 'none',
                        padding: '7px 12px',
                        borderRadius: 8,
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      + Re-entry Pass
                    </button>
                    <button
                      type="button"
                      disabled={actionLoadingId === selectedParticipant.ticket_id}
                      onClick={() => handleParticipantAction(selectedParticipant.ticket_id, 'UNCHECK')}
                      style={{
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        padding: '7px 10px',
                        borderRadius: 8,
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Undo
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={actionLoadingId === selectedParticipant.ticket_id}
                    onClick={() => handleParticipantAction(selectedParticipant.ticket_id, 'CHECKIN')}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: 8,
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    ✓ Admit Now
                  </button>
                )}
              </div>
            </div>

            {/* Info Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
              {/* Attendee Details */}
              <div style={{ background: '#131b2e', padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                  Attendee Details
                </div>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f8fafc' }}>{selectedParticipant.attendee_name}</div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>Age: {selectedParticipant.attendee_age || 'Not specified'}</div>
                <div style={{ fontSize: '0.74rem', color: '#38bdf8', marginTop: 4, fontFamily: 'monospace' }}>
                  ID: {selectedParticipant.ticket_id}
                </div>
              </div>

              {/* Pass Tier & Session */}
              <div style={{ background: '#131b2e', padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                  Tier &amp; Session
                </div>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#c7d2fe' }}>{selectedParticipant.tier_name}</div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>{selectedParticipant.session_name || 'General Session'}</div>
                <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 700, marginTop: 2 }}>
                  ₹{((selectedParticipant.price_in_paise || 0) / 100).toFixed(2)}
                </div>
              </div>

              {/* Buyer Contact */}
              <div style={{ background: '#131b2e', padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                  Buyer Contact
                </div>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f8fafc' }}>{selectedParticipant.customer_name}</div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>📱 {selectedParticipant.customer_phone || 'None'}</div>
                <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>✉️ {selectedParticipant.customer_email || 'None'}</div>
              </div>

              {/* Order & Payment */}
              <div style={{ background: '#131b2e', padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: 4 }}>
                  Order &amp; Payment
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f8fafc', fontFamily: 'monospace' }}>
                  #{selectedParticipant.order_id}
                </div>
                <div style={{ fontSize: '0.78rem', color: selectedParticipant.payment_status === 'PAID' ? '#34d399' : '#fbbf24', marginTop: 2, fontWeight: 700 }}>
                  {selectedParticipant.payment_status} ({selectedParticipant.gateway_type})
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                  {new Date(selectedParticipant.ticket_created_at || selectedParticipant.order_created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>
            </div>

            {/* Direct WhatsApp Contact Button */}
            {selectedParticipant.customer_phone && (
              <a
                href={`https://wa.me/${(selectedParticipant.customer_phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hello ${selectedParticipant.attendee_name || selectedParticipant.customer_name}! Your pass for ${event?.title || 'the event'} (Ticket #${selectedParticipant.ticket_id}) status: ${(selectedParticipant.checkin_count || 0) > 0 ? 'ADMITTED' : 'CONFIRMED'}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)',
                  color: '#ffffff',
                  padding: '11px',
                  borderRadius: 12,
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxSizing: 'border-box'
                }}
              >
                💬 Open WhatsApp Chat
              </a>
            )}
          </div>
        </div>
      )}

      {/* ── Mobile-Optimized Gate Audit Logs Modal ────────────────────────── */}
      {showAuditLogsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.82)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          zIndex: 100,
          padding: 0
        }}>
          <div style={{
            background: '#0d1322',
            borderTop: '2px solid rgba(99, 102, 241, 0.4)',
            borderLeft: '1px solid #1e293b',
            borderRight: '1px solid #1e293b',
            borderRadius: '24px 24px 0 0',
            width: '100%',
            maxWidth: 660,
            maxHeight: '85vh',
            overflowY: 'auto',
            padding: '18px 16px calc(24px + env(safe-area-inset-bottom, 0px)) 16px',
            boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.7)',
            boxSizing: 'border-box'
          }}>
            {/* Pull Handle */}
            <div style={{ width: 44, height: 4, background: '#334155', borderRadius: 9999, margin: '0 auto 14px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                  Gate Checkpoint Logs
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.76rem', margin: '2px 0 0' }}>
                  Live verification history for this event
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditLogsModal(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#94a3b8',
                  borderRadius: '50%',
                  width: 44,
                  height: 44,
                  fontSize: '1.3rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  touchAction: 'manipulation'
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {auditLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b', fontSize: '0.85rem' }}>
                  No checkpoint scan logs recorded yet.
                </div>
              ) : (
                auditLogs.map(log => {
                  return (
                    <div
                      key={log.id}
                      style={{
                        background: '#131b2e',
                        border: '1px solid #1e293b',
                        borderRadius: 10,
                        padding: '9px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.78rem'
                      }}
                    >
                      <div style={{ minWidth: 0, paddingRight: 8 }}>
                        <div style={{ fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {log.attendee_name || 'Attendee'} ({log.tier_name || 'Pass'})
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>
                          Ticket: <code style={{ color: '#38bdf8' }}>{log.ticket_id}</code> • <b style={{ color: log.action_type === 'OVERRIDE_CHECKIN' ? '#c084fc' : '#34d399' }}>{log.action_type}</b>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#64748b', flexShrink: 0 }}>
                        {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EventMembersPage({ params }: { params: Promise<{ event_id: string }> }) {
  const resolvedParams = use(params);
  const eventId = resolvedParams.event_id;

  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#090d16',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        Loading Event Participants...
      </div>
    }>
      <EventMembersContent eventId={eventId} />
    </Suspense>
  );
}
