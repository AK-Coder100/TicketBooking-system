'use client';

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import jsQR from 'jsqr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getActiveSessionByTime, EventSession } from '@/lib/session-utils';

interface EventItem {
  id: string;
  title: string;
  sessions?: EventSession[];
}

interface ScanResult {
  status: 'VALID' | 'ALREADY_SCANNED' | 'INVALID' | 'WRONG_SESSION' | 'WRONG_EVENT' | 'RE_ENTRY_ALLOWED';
  reason?: string;
  message?: string;
  ticket?: { id: string; attendeeName: string; tierName: string; firstCheckedInAt?: string };
  canOverride?: boolean;
}

function ScannerContent() {
  const searchParams = useSearchParams();
  const urlEventId = searchParams.get('eventId') || '';

  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState(urlEventId);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [lastQr, setLastQr] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);
  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<any>(null);
  const lastTokenRef = useRef('');
  const lastTimeRef = useRef(0);
  const eventDropdownRef = useRef<HTMLDivElement>(null);
  const sessionDropdownRef = useRef<HTMLDivElement>(null);

  // ── Close dropdowns when clicking outside ──
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (eventDropdownRef.current && !eventDropdownRef.current.contains(e.target as Node)) {
        setEventDropdownOpen(false);
      }
      if (sessionDropdownRef.current && !sessionDropdownRef.current.contains(e.target as Node)) {
        setSessionDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // ── Load active events ──
  useEffect(() => {
    fetch('/api/tenant/scanner/active-events')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.events?.length) {
          setEvents(d.events);
          const prefer = d.events.find((e: EventItem) => e.id === urlEventId);
          setSelectedEventId(prefer ? urlEventId : d.events[0].id);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Resolve active event & sessions ──
  const activeEvent = useMemo(() => events.find(e => e.id === selectedEventId) || null, [events, selectedEventId]);

  const sessionStatus = useMemo(() => {
    if (!activeEvent?.sessions?.length) return null;
    return getActiveSessionByTime(activeEvent.sessions, new Date());
  }, [activeEvent]);

  // Evaluated sessions list
  const availableSessions = useMemo(() => {
    if (!sessionStatus?.allSessionsWithStatus?.length) return [];
    return sessionStatus.allSessionsWithStatus;
  }, [sessionStatus]);

  // Set default selected session whenever event changes
  useEffect(() => {
    if (sessionStatus?.activeSession?.id) {
      setSelectedSessionId(sessionStatus.activeSession.id);
    } else if (availableSessions.length > 0) {
      setSelectedSessionId(availableSessions[0].id);
    } else {
      setSelectedSessionId('');
    }
  }, [selectedEventId, sessionStatus, availableSessions]);

  // Current selected session object
  const currentSession = useMemo(() => {
    if (!availableSessions.length) return null;
    return availableSessions.find(s => s.id === selectedSessionId) || availableSessions[0];
  }, [availableSessions, selectedSessionId]);

  // Helper to format concise session title without redundant event name
  const cleanSessionTitle = (rawName?: string) => {
    if (!rawName) return 'Session';
    let clean = rawName.trim();
    if (activeEvent?.title) {
      clean = clean.replace(new RegExp(`^${activeEvent.title.trim()}[:\\s-–—]*`, 'i'), '').trim();
    }
    return clean || rawName;
  };

  // ── Camera management ──
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      alert('Camera permission denied or camera not found. Please check browser permissions.');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearInterval(intervalRef.current);
    setCameraOn(false);
  };

  // Stop camera when user leaves the page or unmounts
  useEffect(() => () => stopCamera(), []);

  // ── QR Scanner loop (jsQR) ──
  useEffect(() => {
    if (!cameraOn) return;
    intervalRef.current = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || video.readyState < 2 || !canvas || processing) return;

      const { videoWidth: w, videoHeight: h } = video;
      if (!w || !h) return;

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const code = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' });

      if (!code) return;
      const val = code.data;
      const now = Date.now();
      setLastQr(val);

      // Debounce identical scans within 3 seconds
      if (val === lastTokenRef.current && now - lastTimeRef.current < 3000) return;
      lastTokenRef.current = val;
      lastTimeRef.current = now;
      verify(val);
    }, 250);

    return () => clearInterval(intervalRef.current);
  }, [cameraOn, processing, selectedEventId, selectedSessionId]);

  // ── Ticket Verification ──
  const verify = async (token: string) => {
    if (!token.trim()) return;
    setProcessing(true);
    setResult(null);
    try {
      const res = await fetch('/api/tenant/scanner/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrToken: token.trim(),
          expectedEventId: selectedEventId || undefined,
          expectedSessionId: selectedSessionId || currentSession?.id || 'AUTO',
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ status: 'INVALID', reason: 'Network communication error. Please try again.' });
    } finally {
      setProcessing(false);
      setManualInput('');
    }
  };

  // ── Override / Re-entry ──
  const handleOverride = async () => {
    const id = result?.ticket?.id;
    if (!id) return;
    setProcessing(true);
    try {
      const targetEventId = result?.ticket?.eventId || selectedEventId;
      const res = await fetch(`/api/tenant/events/${targetEventId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'OVERRIDE', ticketId: id, reason: 'Gate Override' }),
      });
      const d = await res.json();
      if (d.success) {
        setResult({ status: 'RE_ENTRY_ALLOWED', reason: 'Override approved', ticket: result?.ticket });
      }
    } finally {
      setProcessing(false);
    }
  };

  const isGreen = result && (result.status === 'VALID' || result.status === 'RE_ENTRY_ALLOWED');
  const isYellow = result?.status === 'ALREADY_SCANNED';
  const isRed = result && !isGreen && !isYellow;

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: '#090d16',
      color: '#f8fafc',
      fontFamily: 'var(--font-body, system-ui, -apple-system, sans-serif)',
      WebkitTapHighlightColor: 'transparent',
    }}>
      {/* ── Mobile Top Header ── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(9, 13, 22, 0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href="/organizer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.07)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              textDecoration: 'none',
              fontSize: '1.1rem',
            }}
          >
            ←
          </Link>
          <div>
            <h1 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#ffffff', letterSpacing: '-0.01em' }}>
              Gate Scanner
            </h1>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
              Mobile Ticket Validator
            </p>
          </div>
        </div>

        {events.length > 0 && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            borderRadius: 20,
            padding: '4px 10px',
            fontSize: '0.72rem',
            fontWeight: 700,
            color: '#a5b4fc',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8' }} />
            {events.length} {events.length === 1 ? 'Event' : 'Events'}
          </div>
        )}
      </header>

      {/* ── Main Mobile Container ── */}
      <main style={{
        flex: 1,
        padding: '16px',
        maxWidth: 540,
        margin: '0 auto',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxSizing: 'border-box',
      }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 240, gap: 12 }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(99, 102, 241, 0.2)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Loading active events &amp; sessions...</p>
          </div>
        ) : events.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '36px 20px',
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            marginTop: 20,
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🌙</div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>
              No Active Gate Sessions
            </h2>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
              Gate sessions automatically activate 2 hours prior to showtime and stay open 1 hour after conclusion.
            </p>
          </div>
        ) : (
          <>
            {/* ── Event & Session Selection Card ── */}
            <div style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}>
              {/* Event Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 4 }}>
                  Selected Event
                </label>
                <div ref={eventDropdownRef} style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setEventDropdownOpen(prev => !prev);
                      setSessionDropdownOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: 10,
                      background: 'rgba(30, 41, 59, 0.95)',
                      border: `1px solid ${eventDropdownOpen ? '#6366f1' : 'rgba(255, 255, 255, 0.12)'}`,
                      color: '#ffffff',
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      boxShadow: eventDropdownOpen ? '0 0 0 2px rgba(99, 102, 241, 0.25)' : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                      {activeEvent?.title || (!selectedEventId ? '✨ All Events (Auto-Detect)' : 'Select Event')}
                    </span>
                    <span style={{
                      color: '#94a3b8',
                      fontSize: '0.72rem',
                      transform: eventDropdownOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                      flexShrink: 0,
                    }}>
                      ▼
                    </span>
                  </button>

                  {eventDropdownOpen && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      left: 0,
                      right: 0,
                      background: '#1e293b',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: 12,
                      boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7)',
                      zIndex: 100,
                      maxHeight: 240,
                      overflowY: 'auto',
                      padding: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}>
                      {events.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEventId('');
                            setResult(null);
                            setEventDropdownOpen(false);
                          }}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 8,
                            background: !selectedEventId ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                            border: !selectedEventId ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid transparent',
                            color: !selectedEventId ? '#ffffff' : '#cbd5e1',
                            fontSize: '0.88rem',
                            fontWeight: !selectedEventId ? 700 : 500,
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <span>✨ All Events (Auto-Detect)</span>
                          {!selectedEventId && <span style={{ color: '#818cf8', fontSize: '0.8rem' }}>✓</span>}
                        </button>
                      )}
                      {events.map(ev => {
                        const isSelected = ev.id === selectedEventId;
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => {
                              setSelectedEventId(ev.id);
                              setResult(null);
                              setEventDropdownOpen(false);
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 8,
                              background: isSelected ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                              border: isSelected ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid transparent',
                              color: isSelected ? '#ffffff' : '#cbd5e1',
                              fontSize: '0.88rem',
                              fontWeight: isSelected ? 700 : 500,
                              textAlign: 'left',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 8,
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ev.title}
                            </span>
                            {isSelected && <span style={{ color: '#818cf8', fontWeight: 800 }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Session Selector (Allows choosing ongoing or upcoming sessions) */}
              {availableSessions.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b' }}>
                      Gate Session
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 600 }}>
                      {availableSessions.length} {availableSessions.length === 1 ? 'Session' : 'Sessions'} Available
                    </span>
                  </div>

                  <div ref={sessionDropdownRef} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSessionDropdownOpen(prev => !prev);
                        setEventDropdownOpen(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: 'rgba(30, 41, 59, 0.95)',
                        border: `1px solid ${sessionDropdownOpen ? '#6366f1' : currentSession?.isLive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                        color: '#ffffff',
                        fontSize: '0.88rem',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        gap: 8,
                        boxShadow: sessionDropdownOpen ? '0 0 0 2px rgba(99, 102, 241, 0.25)' : 'none',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          flexShrink: 0,
                          background: currentSession?.isLive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                          color: currentSession?.isLive ? '#34d399' : '#fbbf24',
                          border: `1px solid ${currentSession?.isLive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                        }}>
                          {currentSession?.isLive ? '🟢 LIVE' : currentSession?.isFuture ? '⏳ UPCOMING' : '✓ PAST'}
                        </span>
                        <span style={{ fontWeight: 600, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cleanSessionTitle(currentSession?.name)}
                        </span>
                        {currentSession?.start_time && (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', flexShrink: 0 }}>
                            ({currentSession.start_time}{currentSession.end_time ? ` - ${currentSession.end_time}` : ''})
                          </span>
                        )}
                      </div>

                      <span style={{
                        color: '#94a3b8',
                        fontSize: '0.72rem',
                        transform: sessionDropdownOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease',
                        flexShrink: 0,
                      }}>
                        ▼
                      </span>
                    </button>

                    {sessionDropdownOpen && (
                      <div style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        right: 0,
                        background: '#1e293b',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 12,
                        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7)',
                        zIndex: 100,
                        maxHeight: 280,
                        overflowY: 'auto',
                        padding: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}>
                        {availableSessions.map(session => {
                          const isSelected = session.id === selectedSessionId;
                          return (
                            <button
                              key={session.id}
                              type="button"
                              onClick={() => {
                                setSelectedSessionId(session.id);
                                setResult(null);
                                setSessionDropdownOpen(false);
                              }}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 8,
                                background: isSelected ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                                border: isSelected ? '1px solid rgba(99, 102, 241, 0.35)' : '1px solid transparent',
                                color: isSelected ? '#ffffff' : '#cbd5e1',
                                fontSize: '0.85rem',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                                <span style={{
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  flexShrink: 0,
                                  background: session.isLive ? 'rgba(16, 185, 129, 0.15)' : session.isFuture ? 'rgba(245, 158, 11, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                                  color: session.isLive ? '#34d399' : session.isFuture ? '#fbbf24' : '#94a3b8',
                                }}>
                                  {session.isLive ? '🟢 LIVE' : session.isFuture ? '⏳ UPCOMING' : 'PAST'}
                                </span>
                                <div style={{ overflow: 'hidden' }}>
                                  <div style={{ fontWeight: isSelected ? 700 : 600, color: '#f8fafc', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                    {cleanSessionTitle(session.name)}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                    {session.session_date} {session.start_time ? `• ${session.start_time}${session.end_time ? ` - ${session.end_time}` : ''}` : ''}
                                  </div>
                                </div>
                              </div>
                              {isSelected && <span style={{ color: '#818cf8', fontWeight: 800, flexShrink: 0 }}>✓</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Camera Viewfinder Area ── */}
            <div style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              maxHeight: 380,
              background: '#020617',
              borderRadius: 16,
              border: '1px solid rgba(255, 255, 255, 0.1)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
            }}>
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: cameraOn ? 'block' : 'none',
                }}
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Viewfinder Reticle Overlay when Camera is On */}
              {cameraOn && (
                <div style={{
                  position: 'absolute',
                  inset: '16%',
                  border: '2px dashed rgba(255, 255, 255, 0.35)',
                  borderRadius: 16,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <div style={{
                    position: 'absolute',
                    top: 8,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: 'rgba(255, 255, 255, 0.7)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    background: 'rgba(0, 0, 0, 0.4)',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}>
                    Align QR Code
                  </div>
                </div>
              )}

              {/* Camera Off State */}
              {!cameraOn && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 14,
                  padding: 24,
                  textAlign: 'center',
                }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid rgba(99, 102, 241, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.8rem',
                  }}>
                    📷
                  </div>
                  <button
                    onClick={startCamera}
                    style={{
                      padding: '12px 28px',
                      background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)',
                    }}
                  >
                    Start Scanner
                  </button>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Point camera at attendee QR ticket
                  </span>
                </div>
              )}

              {/* Camera Controls Overlay */}
              {cameraOn && (
                <button
                  onClick={stopCamera}
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    padding: '6px 14px',
                    background: 'rgba(0, 0, 0, 0.65)',
                    backdropFilter: 'blur(8px)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: 20,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ✕ Stop Camera
                </button>
              )}
            </div>

            {/* ── Processing indicator ── */}
            {processing && (
              <div style={{
                textAlign: 'center',
                padding: '12px',
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: 10,
                color: '#a5b4fc',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}>
                ⚡ Validating ticket cryptographic token...
              </div>
            )}

            {/* ── Result Status Card ── */}
            {result && !processing && (
              <div style={{
                borderRadius: 14,
                padding: '16px',
                background: isGreen
                  ? 'rgba(16, 185, 129, 0.12)'
                  : isYellow
                    ? 'rgba(245, 158, 11, 0.12)'
                    : 'rgba(244, 63, 94, 0.12)',
                border: `1.5px solid ${isGreen ? '#10b981' : isYellow ? '#f59e0b' : '#f43f5e'}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{
                    fontWeight: 800,
                    fontSize: '1.05rem',
                    color: isGreen ? '#34d399' : isYellow ? '#fbbf24' : '#fb7185',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    {isGreen ? '✓ ACCESS GRANTED' : isYellow ? '⚠️ ALREADY CHECKED IN' : '✕ ACCESS DENIED'}
                  </div>
                  <button
                    onClick={() => { setResult(null); setLastQr(''); }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '1rem',
                      cursor: 'pointer',
                      padding: 4,
                    }}
                  >
                    ✕
                  </button>
                </div>

                {result.ticket?.attendeeName && (
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Attendee Name
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#ffffff' }}>
                      {result.ticket.attendeeName}
                    </div>
                  </div>
                )}

                {result.ticket?.tierName && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#cbd5e1',
                    }}>
                      🎟️ {result.ticket.tierName}
                    </span>
                    {result.ticket.id && (
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                        ID: {result.ticket.id.slice(0, 10)}...
                      </span>
                    )}
                  </div>
                )}

                {isYellow && result.ticket?.firstCheckedInAt && (
                  <div style={{ fontSize: '0.8rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', padding: '6px 10px', borderRadius: 6 }}>
                    First check-in at: {new Date(result.ticket.firstCheckedInAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                )}

                {(result.reason || result.message) && (
                  <div style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                    {result.reason || result.message}
                  </div>
                )}

                {/* Raw QR token value printed on Access Denied */}
                {isRed && lastQr && (
                  <div style={{
                    fontSize: '0.72rem',
                    color: '#fca5a5',
                    background: 'rgba(0, 0, 0, 0.4)',
                    padding: '8px 10px',
                    borderRadius: 8,
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                    border: '1px solid rgba(244, 63, 94, 0.2)',
                  }}>
                    <strong style={{ color: '#fb7185' }}>Scanned Payload:</strong> {lastQr}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  {isYellow && (
                    <button
                      onClick={handleOverride}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                      }}
                    >
                      Allow Re-entry (Override)
                    </button>
                  )}
                  <button
                    onClick={() => { setResult(null); setLastQr(''); }}
                    style={{
                      padding: '10px 16px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#cbd5e1',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* ── Detected QR Value (if not displaying result) ── */}
            {/* {lastQr && !result && !processing && (
              <div style={{
                padding: '8px 12px',
                background: 'rgba(15, 23, 42, 0.8)',
                borderRadius: 10,
                fontSize: '0.75rem',
                color: '#94a3b8',
                wordBreak: 'break-all',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                fontFamily: 'monospace',
              }}>
                <span style={{ color: '#818cf8', fontWeight: 700 }}>Detected: </span>
                {lastQr}
              </div>
            )} */}

            {/* ── Manual Input Entry ── */}
            <form
              onSubmit={e => { e.preventDefault(); verify(manualInput); }}
              style={{
                display: 'flex',
                gap: 8,
                background: 'rgba(15, 23, 42, 0.6)',
                padding: 6,
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <input
                placeholder="Paste token or ticket ID..."
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '0.88rem',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={processing || !manualInput.trim()}
                style={{
                  padding: '10px 18px',
                  background: '#6366f1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  opacity: processing || !manualInput.trim() ? 0.4 : 1,
                }}
              >
                Verify
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

export default function ScannerPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090d16', color: '#94a3b8' }}>Loading gate scanner...</div>}>
      <ScannerContent />
    </Suspense>
  );
}
