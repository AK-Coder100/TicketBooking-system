'use client';

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { getActiveSessionByTime, EventSession } from '@/lib/session-utils';

interface EventItem {
  id: string;
  title: string;
  venue?: string;
  city?: string;
  start_date?: string;
  end_date?: string;
  sessions?: EventSession[];
}

interface ScanResultData {
  status: 'VALID' | 'ALREADY_SCANNED' | 'WRONG_SESSION' | 'WRONG_EVENT' | 'INVALID' | 'RE_ENTRY_ALLOWED';
  color: 'green' | 'yellow' | 'red';
  reason?: string;
  message?: string;
  ticket?: {
    id: string;
    attendeeName: string;
    attendeeAge?: string | number;
    tierName: string;
    price?: number;
    eventTitle?: string;
    sessionName?: string;
    sessionDate?: string;
    activeSessionName?: string;
    firstCheckedInAt?: string;
    checkinCount?: number;
  };
  canOverride?: boolean;
}

// Synthesize audio feedback via Web Audio API
function playScanSound(type: 'success' | 'warning' | 'error') {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'success') {
      // Pleasant high double beep
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, ctx.currentTime); // A5
      osc1.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.1); // D6
      gain1.gain.setValueAtTime(0.15, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.25);
    } else if (type === 'warning') {
      // Amber tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(370, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else {
      // Low double error buzz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.setValueAtTime(180, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    }
  } catch (e) {
    // Ignore audio context autoplay errors
  }
}

function ScannerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const urlEventId = searchParams.get('eventId') || searchParams.get('event_id') || '';

  // Core Data State
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>(urlEventId);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Scanner & Hardware State
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isScanning, setIsScanning] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [scanResult, setScanResult] = useState<ScanResultData | null>(null);
  const [isProcessingScan, setIsProcessingScan] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [recentScans, setRecentScans] = useState<Array<{
    id: string;
    timestamp: string;
    status: string;
    attendeeName: string;
    tierName?: string;
    reason?: string;
  }>>([]);

  // Stats
  const [stats, setStats] = useState({
    totalTickets: 0,
    admittedCount: 0,
    remainingCount: 0
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<any>(null);
  const lastScannedTokenRef = useRef<string>('');
  const lastScanTimestampRef = useRef<number>(0);

  // Real-time clock update (every second)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch tenant events & sessions
  const fetchEvents = async () => {
    try {
      setLoadingEvents(true);
      const res = await fetch('/api/tenant/events');
      const data = await res.json();
      if (data.success && data.events) {
        setEvents(data.events);
        if (!selectedEventId && data.events.length > 0) {
          setSelectedEventId(data.events[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // Update selected event if query param changes
  useEffect(() => {
    if (urlEventId && urlEventId !== selectedEventId) {
      setSelectedEventId(urlEventId);
    }
  }, [urlEventId]);

  // Active event object
  const activeEvent = useMemo(() => {
    return events.find(e => e.id === selectedEventId) || events[0] || null;
  }, [events, selectedEventId]);

  // Automatic Date & Time Session Calculation
  const sessionStatus = useMemo(() => {
    if (!activeEvent?.sessions || activeEvent.sessions.length === 0) {
      return {
        activeSession: null,
        status: 'NO_SESSIONS' as const,
        label: 'Single Event / No Sessions',
        description: 'Standard event admissions active',
        allSessionsWithStatus: []
      };
    }
    return getActiveSessionByTime(activeEvent.sessions, currentTime);
  }, [activeEvent, currentTime]);

  // Load Event Statistics
  const loadEventStats = async (eventId: string) => {
    if (!eventId) return;
    try {
      const res = await fetch(`/api/tenant/events/${eventId}/members`);
      const data = await res.json();
      if (data.success && data.stats) {
        setStats({
          totalTickets: data.stats.totalTickets || 0,
          admittedCount: data.stats.checkedInCount || 0,
          remainingCount: data.stats.notArrivedCount || 0
        });
      }
    } catch (e) {
      // Ignore background stats load error
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadEventStats(selectedEventId);
    }
  }, [selectedEventId]);

  // Camera Management
  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    try {
      stopCamera();
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setIsScanning(true);
    } catch (err: any) {
      console.error('Camera access error:', err);
      alert('Unable to access camera. Please check camera permissions in your mobile browser.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setIsScanning(false);
  };

  const toggleCamera = () => {
    if (cameraActive) {
      stopCamera();
    } else {
      startCamera(facingMode);
    }
  };

  const flipCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (cameraActive) {
      startCamera(nextMode);
    }
  };

  // Continuous QR Barcode Detection Loop
  useEffect(() => {
    if (!cameraActive || !isScanning) return;

    let detector: any = null;
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        detector = new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
      } catch (e) {
        detector = null;
      }
    }

    const interval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2 || isProcessingScan) return;

      if (detector) {
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            const now = Date.now();
            // Throttle duplicate scans within 3 seconds
            if (rawValue === lastScannedTokenRef.current && (now - lastScanTimestampRef.current) < 3000) {
              return;
            }
            lastScannedTokenRef.current = rawValue;
            lastScanTimestampRef.current = now;
            executeScan(rawValue);
          }
        } catch (e) {
          // Frame detection fail (ignore)
        }
      }
    }, 250);

    scanIntervalRef.current = interval;
    return () => clearInterval(interval);
  }, [cameraActive, isScanning, isProcessingScan, selectedEventId, sessionStatus]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, []);

  // Execute Ticket Scan Verification
  const executeScan = async (tokenOrId: string) => {
    if (!tokenOrId || !tokenOrId.trim()) return;
    const cleanToken = tokenOrId.trim();

    setIsProcessingScan(true);
    try {
      const res = await fetch('/api/tenant/scanner/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrToken: cleanToken,
          expectedEventId: selectedEventId || undefined,
          expectedSessionId: sessionStatus.activeSession?.id || 'AUTO',
          deviceInfo: 'Gate Terminal Web PWA'
        })
      });

      const data = await res.json();
      setScanResult(data);

      // Sound & Haptic
      if (soundEnabled) {
        if (data.status === 'VALID' || data.status === 'RE_ENTRY_ALLOWED') {
          playScanSound('success');
        } else if (data.status === 'ALREADY_SCANNED') {
          playScanSound('warning');
        } else {
          playScanSound('error');
        }
      }

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (data.status === 'VALID' || data.status === 'RE_ENTRY_ALLOWED') {
          navigator.vibrate(150);
        } else {
          navigator.vibrate([100, 50, 100, 50, 100]);
        }
      }

      // Add to recent scans log
      setRecentScans(prev => [
        {
          id: `scan_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          status: data.status,
          attendeeName: data.ticket?.attendeeName || 'Unknown Pass',
          tierName: data.ticket?.tierName,
          reason: data.reason || (data.status === 'VALID' ? 'Admitted Successfully' : data.status)
        },
        ...prev.slice(0, 14)
      ]);

      // Refresh event statistics
      if (selectedEventId) {
        loadEventStats(selectedEventId);
      }
    } catch (err: any) {
      setScanResult({
        status: 'INVALID',
        color: 'red',
        reason: 'Network or scanner error. Please try again.'
      });
      if (soundEnabled) playScanSound('error');
    } finally {
      setIsProcessingScan(false);
      setManualInput('');
    }
  };

  // Supervisor Override
  const handleOverride = async (ticketId?: string) => {
    const idToOverride = ticketId || scanResult?.ticket?.id;
    if (!idToOverride || !selectedEventId) return;

    try {
      setIsProcessingScan(true);
      const res = await fetch(`/api/tenant/events/${selectedEventId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'OVERRIDE',
          ticketId: idToOverride,
          reason: 'Gate Terminal Supervisor Manual Authorization'
        })
      });

      const data = await res.json();
      if (data.success) {
        setScanResult({
          status: 'RE_ENTRY_ALLOWED',
          color: 'green',
          reason: 'Supervisor override approved! Pass admitted.',
          ticket: scanResult?.ticket
        });
        if (soundEnabled) playScanSound('success');
        loadEventStats(selectedEventId);
      } else {
        alert(data.error || 'Override failed');
      }
    } catch (e: any) {
      alert('Override request failed');
    } finally {
      setIsProcessingScan(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#070b14',
      color: '#f8fafc',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      paddingBottom: '60px'
    }}>
      {/* ── TOP TERMINAL BAR ──────────────────────────────────────── */}
      <header style={{
        background: 'linear-gradient(180deg, #0f172a 0%, #090d16 100%)',
        borderBottom: '1px solid #1e293b',
        padding: '12px 16px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Link
              href={selectedEventId ? `/organizer/${selectedEventId}/members` : '/organizer?tab=events'}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#94a3b8',
                textDecoration: 'none',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              ← Back
            </Link>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h1 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, color: '#ffffff', letterSpacing: '-0.02em' }}>
                  GATE VERIFICATION TERMINAL
                </h1>
                <span style={{
                  background: '#10b981',
                  color: '#022c22',
                  fontSize: '0.62rem',
                  fontWeight: 900,
                  padding: '2px 6px',
                  borderRadius: 4,
                  textTransform: 'uppercase'
                }}>
                  ONLINE
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 1 }}>
                Real-Time HMAC-SHA256 Gate Checkpoint
              </div>
            </div>
          </div>

          {/* Clock & Sound Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              background: '#1e293b',
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: '0.82rem',
              fontWeight: 800,
              color: '#38bdf8',
              fontFamily: 'monospace'
            }}>
              🕒 {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              style={{
                background: soundEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                border: `1px solid ${soundEnabled ? 'rgba(16, 185, 129, 0.5)' : '#334155'}`,
                color: soundEnabled ? '#34d399' : '#94a3b8',
                padding: '6px 10px',
                borderRadius: 8,
                fontSize: '0.82rem',
                cursor: 'pointer',
                fontWeight: 700
              }}
              title={soundEnabled ? 'Mute Audio Beep' : 'Enable Audio Beep'}
            >
              {soundEnabled ? '🔊 Sound ON' : '🔇 Muted'}
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px' }}>
        {/* ── EVENT & REAL-TIME ACTIVE SESSION STATUS HUD ─────────────── */}
        <section style={{
          background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.75) 0%, #0d1322 100%)',
          border: '1px solid #312e81',
          borderRadius: 16,
          padding: '16px 18px',
          marginBottom: 16,
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: '260px' }}>
              <label style={{ fontSize: '0.72rem', color: '#a5b4fc', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                Selected Gate Event:
              </label>
              <select
                value={selectedEventId}
                onChange={e => {
                  setSelectedEventId(e.target.value);
                  router.push(`/organizer/scanner?eventId=${e.target.value}`);
                }}
                style={{
                  background: '#1e293b',
                  border: '1px solid #475569',
                  color: '#ffffff',
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  padding: '9px 14px',
                  borderRadius: 10,
                  width: '100%',
                  maxWidth: '460px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>
                    🎟️ {ev.title} {ev.city ? `(${ev.city})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Stats Pill */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #334155', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Admitted</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#34d399' }}>{stats.admittedCount}</div>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #334155', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Not Arrived</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#f59e0b' }}>{stats.remainingCount}</div>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.8)', border: '1px solid #334155', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Total Passes</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffffff' }}>{stats.totalTickets}</div>
              </div>
            </div>
          </div>

          {/* Real-time Session Schedule Banner (Decided automatically by Date & Time) */}
          <div style={{
            background: sessionStatus.status === 'LIVE_NOW' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.1)',
            border: `1.5px solid ${sessionStatus.status === 'LIVE_NOW' ? '#10b981' : '#0284c7'}`,
            borderRadius: 12,
            padding: '12px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: sessionStatus.status === 'LIVE_NOW' ? '#10b981' : '#0284c7',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                flexShrink: 0
              }}>
                {sessionStatus.status === 'LIVE_NOW' ? '🟢' : '⏳'}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    color: sessionStatus.status === 'LIVE_NOW' ? '#6ee7b7' : '#7dd3fc',
                    letterSpacing: '0.04em'
                  }}>
                    AUTOMATIC SESSION ENGINE (BY REAL-TIME CLOCK):
                  </span>
                  <span style={{
                    background: sessionStatus.status === 'LIVE_NOW' ? '#047857' : '#0369a1',
                    color: '#ffffff',
                    fontSize: '0.64rem',
                    fontWeight: 800,
                    padding: '1px 6px',
                    borderRadius: 4
                  }}>
                    {sessionStatus.status}
                  </span>
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#ffffff', marginTop: 2 }}>
                  {sessionStatus.label} • <span style={{ color: '#cbd5e1', fontWeight: 500, fontSize: '0.82rem' }}>{sessionStatus.description}</span>
                </div>
              </div>
            </div>

            {/* Session schedule chips */}
            {sessionStatus.allSessionsWithStatus.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {sessionStatus.allSessionsWithStatus.map(s => (
                  <span
                    key={s.id}
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '4px 8px',
                      borderRadius: 6,
                      background: s.isLive ? 'rgba(16, 185, 129, 0.3)' : '#1e293b',
                      color: s.isLive ? '#6ee7b7' : '#94a3b8',
                      border: `1px solid ${s.isLive ? '#10b981' : '#334155'}`
                    }}
                  >
                    {s.isLive ? '🟢 ' : ''}{s.name} ({s.start_time || s.session_date})
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── SCANNER TERMINAL MAIN GRID ───────────────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
          gap: 20
        }}>
          {/* LEFT: LIVE CAMERA VIEWPORT & MANUAL ENTRY */}
          <div style={{
            background: '#0d1322',
            border: '1px solid #1e293b',
            borderRadius: 18,
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                📷 Camera Barcode Feed
              </h2>
              <div style={{ display: 'flex', gap: 8 }}>
                {cameraActive && (
                  <button
                    type="button"
                    onClick={flipCamera}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      padding: '5px 10px',
                      borderRadius: 8,
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🔄 Flip Lens
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleCamera}
                  style={{
                    background: cameraActive ? '#ef4444' : '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    padding: '6px 14px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  {cameraActive ? '⏹ Stop Camera' : '▶ Start Camera'}
                </button>
              </div>
            </div>

            {/* Live Video Viewport */}
            <div style={{
              width: '100%',
              height: 320,
              background: '#020617',
              borderRadius: 14,
              overflow: 'hidden',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #1e293b'
            }}>
              <video
                ref={videoRef}
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: cameraActive ? 'block' : 'none'
                }}
              />

              {/* Scanning Target HUD Overlay */}
              {cameraActive && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <div style={{
                    width: '220px',
                    height: '220px',
                    border: '2px dashed rgba(56, 189, 248, 0.7)',
                    borderRadius: 20,
                    position: 'relative',
                    boxShadow: '0 0 0 4000px rgba(0, 0, 0, 0.45)'
                  }}>
                    {/* Laser scanning line */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: 0,
                      right: 0,
                      height: '2px',
                      background: '#10b981',
                      boxShadow: '0 0 8px #10b981'
                    }} />
                  </div>
                </div>
              )}

              {/* Camera Off Placeholder */}
              {!cameraActive && (
                <div style={{ textAlign: 'center', padding: 20, color: '#64748b' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 8 }}>📷</div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#e2e8f0', marginBottom: 4 }}>
                    Camera Offline
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', maxWidth: '280px', margin: '0 auto 12px' }}>
                    Tap Start Camera or enter signed ticket tokens manually below.
                  </p>
                  <button
                    type="button"
                    onClick={() => startCamera(facingMode)}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '10px 22px',
                      borderRadius: 10,
                      fontWeight: 800,
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                    }}
                  >
                    ⚡ Activate Camera
                  </button>
                </div>
              )}
            </div>

            {/* Manual Token / Pass ID Input */}
            <div>
              <label style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700, display: 'block', marginBottom: 6 }}>
                Manual QR Token or Ticket ID Input:
              </label>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  executeScan(manualInput);
                }}
                style={{ display: 'flex', gap: 8 }}
              >
                <input
                  type="text"
                  placeholder="Paste QR secret token (e.g. tkt_...)"
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: '#1e293b',
                    border: '1px solid #475569',
                    color: '#ffffff',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontSize: '0.85rem',
                    outline: 'none'
                  }}
                />
                <button
                  type="submit"
                  disabled={isProcessingScan || !manualInput.trim()}
                  style={{
                    background: '#3b82f6',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: 10,
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    opacity: isProcessingScan || !manualInput.trim() ? 0.6 : 1
                  }}
                >
                  {isProcessingScan ? 'Checking...' : 'Verify'}
                </button>
              </form>
            </div>

            {/* Simulation Fast Buttons */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid #1e293b',
              borderRadius: 12,
              padding: '12px'
            }}>
              <div style={{ fontSize: '0.7rem', color: '#a5b4fc', fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>
                ⚡ Simulate Instant Gate Scans:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedEventId) return;
                    const res = await fetch(`/api/tenant/events/${selectedEventId}/members`);
                    const data = await res.json();
                    const first = data.participants?.[0]?.qr_secret_token;
                    if (first) executeScan(first);
                    else alert('No tickets found in event.');
                  }}
                  style={{
                    background: 'rgba(16, 185, 129, 0.2)',
                    border: '1px solid #10b981',
                    color: '#34d399',
                    padding: '7px 4px',
                    borderRadius: 8,
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  🟢 Valid Pass
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedEventId) return;
                    const res = await fetch(`/api/tenant/events/${selectedEventId}/members`);
                    const data = await res.json();
                    const first = data.participants?.[0]?.qr_secret_token;
                    if (first) executeScan(first);
                    else alert('No tickets found in event.');
                  }}
                  style={{
                    background: 'rgba(245, 158, 11, 0.2)',
                    border: '1px solid #f59e0b',
                    color: '#fbbf24',
                    padding: '7px 4px',
                    borderRadius: 8,
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  🟡 Duplicate
                </button>

                <button
                  type="button"
                  onClick={() => executeScan('fake_invalid_token.tampered')}
                  style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid #ef4444',
                    color: '#f87171',
                    padding: '7px 4px',
                    borderRadius: 8,
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  🔴 Fake / Tampered
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: GIANT CLEARANCE HUD DISPLAY */}
          <div style={{
            background: '#0d1322',
            border: '1px solid #1e293b',
            borderRadius: 18,
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: 16
          }}>
            <div>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '0 0 14px 0', color: '#ffffff' }}>
                🛡️ Live Clearance HUD
              </h2>

              {/* Waiting for Scan Placeholder */}
              {!scanResult && (
                <div style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px dashed #334155',
                  borderRadius: 16,
                  padding: '50px 20px',
                  textAlign: 'center',
                  color: '#64748b'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: 10 }}>⚡</div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#e2e8f0', margin: '0 0 6px 0' }}>
                    Ready for Next Attendee
                  </h3>
                  <p style={{ fontSize: '0.84rem', color: '#94a3b8', maxWidth: '320px', margin: '0 auto' }}>
                    Aim camera at attendee pass QR code or test using the simulation buttons.
                  </p>
                </div>
              )}

              {/* 🟢 ACCESS GRANTED / ADMITTED HUD */}
              {scanResult && (scanResult.status === 'VALID' || scanResult.status === 'RE_ENTRY_ALLOWED') && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.7) 0%, rgba(6, 95, 70, 0.4) 100%)',
                  border: '2.5px solid #10b981',
                  borderRadius: 18,
                  padding: '24px 20px',
                  boxShadow: '0 0 35px rgba(16, 185, 129, 0.25)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: '#10b981',
                      color: '#022c22',
                      fontSize: '1.5rem',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      ✓
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#a7f3d0', fontWeight: 900, letterSpacing: '0.06em' }}>
                        GATE CLEARANCE GRANTED
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#ffffff' }}>
                        {scanResult.status === 'RE_ENTRY_ALLOWED' ? 'RE-ENTRY AUTHORIZED' : 'ACCESS ADMITTED'}
                      </div>
                    </div>
                  </div>

                  {/* Attendee Info Card */}
                  <div style={{ background: 'rgba(2, 44, 34, 0.65)', borderRadius: 12, padding: '14px', marginBottom: 12 }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffffff' }}>
                      {scanResult.ticket?.attendeeName || 'Verified Guest'}
                      {scanResult.ticket?.attendeeAge && (
                        <span style={{ fontSize: '0.82rem', color: '#94a3b8', marginLeft: 8 }}>
                          ({scanResult.ticket.attendeeAge} yrs)
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        background: '#6366f1',
                        color: '#ffffff',
                        fontSize: '0.76rem',
                        fontWeight: 800,
                        padding: '3px 10px',
                        borderRadius: 6
                      }}>
                        🎫 {scanResult.ticket?.tierName}
                      </span>
                      {scanResult.ticket?.sessionName && (
                        <span style={{
                          background: '#047857',
                          color: '#6ee7b7',
                          fontSize: '0.76rem',
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: 6
                        }}>
                          🎭 {scanResult.ticket.sessionName}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '0.76rem', color: '#6ee7b7', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Pass ID: <code style={{ color: '#ffffff' }}>{scanResult.ticket?.id}</code></span>
                    <span>Admitted: {new Date().toLocaleTimeString('en-IN')}</span>
                  </div>
                </div>
              )}

              {/* 🟡 ALREADY SCANNED / DUPLICATE WARNING */}
              {scanResult && scanResult.status === 'ALREADY_SCANNED' && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.7) 0%, rgba(146, 64, 14, 0.3) 100%)',
                  border: '2.5px solid #f59e0b',
                  borderRadius: 18,
                  padding: '24px 20px',
                  boxShadow: '0 0 35px rgba(245, 158, 11, 0.25)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: '#f59e0b',
                      color: '#451a03',
                      fontSize: '1.5rem',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      ⚠️
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#fde68a', fontWeight: 900, letterSpacing: '0.06em' }}>
                        ATTENTION REQUIRED
                      </div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#ffffff' }}>
                        ALREADY CHECKED IN
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(69, 26, 3, 0.65)', borderRadius: 12, padding: '14px', marginBottom: 14 }}>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#ffffff' }}>
                      {scanResult.ticket?.attendeeName || 'Guest'}
                    </div>
                    <p style={{ fontSize: '0.82rem', color: '#fef3c7', margin: '6px 0 0' }}>
                      First checked in at {scanResult.ticket?.firstCheckedInAt ? new Date(scanResult.ticket.firstCheckedInAt).toLocaleTimeString('en-IN') : 'Earlier'}.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOverride(scanResult.ticket?.id)}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      color: '#000000',
                      border: 'none',
                      padding: '12px 16px',
                      borderRadius: 10,
                      fontSize: '0.9rem',
                      fontWeight: 900,
                      cursor: 'pointer'
                    }}
                  >
                    🔓 Allow Re-Entry (Supervisor Override)
                  </button>
                </div>
              )}

              {/* 🔴 WRONG SESSION / INACTIVE SHOW REJECTION */}
              {scanResult && scanResult.status === 'WRONG_SESSION' && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(136, 19, 55, 0.8) 0%, rgba(159, 18, 57, 0.4) 100%)',
                  border: '2.5px solid #f43f5e',
                  borderRadius: 18,
                  padding: '24px 20px',
                  boxShadow: '0 0 35px rgba(244, 63, 94, 0.25)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: '#f43f5e',
                      color: '#ffffff',
                      fontSize: '1.5rem',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      ✕
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#fecdd3', fontWeight: 900, letterSpacing: '0.06em' }}>
                        ACCESS DENIED
                      </div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#ffffff' }}>
                        INACTIVE SHOW / WRONG SESSION
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(76, 5, 25, 0.65)', borderRadius: 12, padding: '14px', marginBottom: 14 }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#ffffff' }}>
                      {scanResult.ticket?.attendeeName}
                    </div>
                    <p style={{ fontSize: '0.84rem', color: '#ffe4e6', margin: '6px 0 0', lineHeight: 1.4 }}>
                      {scanResult.reason}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOverride(scanResult.ticket?.id)}
                    style={{
                      width: '100%',
                      background: 'rgba(255, 255, 255, 0.15)',
                      border: '1px solid #fda4af',
                      color: '#ffffff',
                      padding: '10px 16px',
                      borderRadius: 10,
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    🔓 Emergency Supervisor Override
                  </button>
                </div>
              )}

              {/* 🔴 INVALID / TAMPERED REJECTION */}
              {scanResult && (scanResult.status === 'INVALID' || scanResult.status === 'WRONG_EVENT') && (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(136, 19, 55, 0.8) 0%, rgba(159, 18, 57, 0.4) 100%)',
                  border: '2.5px solid #ef4444',
                  borderRadius: 18,
                  padding: '24px 20px',
                  boxShadow: '0 0 35px rgba(239, 68, 68, 0.25)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: '#ef4444',
                      color: '#ffffff',
                      fontSize: '1.5rem',
                      fontWeight: 900,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      ✕
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', color: '#fecdd3', fontWeight: 900, letterSpacing: '0.06em' }}>
                        SECURITY VIOLATION
                      </div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#ffffff' }}>
                        INVALID PASS
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(76, 5, 25, 0.65)', borderRadius: 12, padding: '14px' }}>
                    <p style={{ fontSize: '0.86rem', color: '#ffe4e6', margin: 0 }}>
                      {scanResult.reason || 'Cryptographic verification failed: tampered QR payload'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Clear Button */}
            {scanResult && (
              <button
                type="button"
                onClick={() => setScanResult(null)}
                style={{
                  background: '#1e293b',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  padding: '10px',
                  borderRadius: 10,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Clear HUD Display
              </button>
            )}
          </div>
        </div>

        {/* ── RECENT SCANS LOG FEED ──────────────────────────────────── */}
        <section style={{
          marginTop: 24,
          background: '#0d1322',
          border: '1px solid #1e293b',
          borderRadius: 16,
          padding: '16px 18px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
              📜 Recent Gate Activity Feed ({recentScans.length})
            </h3>
            {recentScans.length > 0 && (
              <button
                type="button"
                onClick={() => setRecentScans([])}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.74rem', cursor: 'pointer' }}
              >
                Clear Feed
              </button>
            )}
          </div>

          {recentScans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 10px', color: '#64748b', fontSize: '0.82rem' }}>
              No scans completed during this session yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {recentScans.map(scan => {
                const isSuccess = scan.status === 'VALID' || scan.status === 'RE_ENTRY_ALLOWED';
                const isWarning = scan.status === 'ALREADY_SCANNED';
                return (
                  <div
                    key={scan.id}
                    style={{
                      background: '#131b2e',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.78rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: '0.9rem' }}>
                        {isSuccess ? '🟢' : isWarning ? '🟡' : '🔴'}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: '#f8fafc' }}>{scan.attendeeName}</strong>
                        {scan.tierName && <span style={{ color: '#94a3b8', marginLeft: 6 }}>({scan.tierName})</span>}
                        <div style={{ fontSize: '0.7rem', color: isSuccess ? '#6ee7b7' : isWarning ? '#fde68a' : '#fca5a5' }}>
                          {scan.reason}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace', flexShrink: 0, marginLeft: 8 }}>
                      {scan.timestamp}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default function ScannerPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        background: '#070b14',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        Initializing Gate Terminal...
      </div>
    }>
      <ScannerContent />
    </Suspense>
  );
}
