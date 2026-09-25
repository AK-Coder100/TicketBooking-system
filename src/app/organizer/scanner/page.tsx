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
  const [loading, setLoading] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);
  const [lastQr, setLastQr] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [manualInput, setManualInput] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<any>(null);
  const lastTokenRef = useRef('');
  const lastTimeRef = useRef(0);

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

  // ── Resolve active session ──
  const activeEvent = useMemo(() => events.find(e => e.id === selectedEventId) || null, [events, selectedEventId]);
  const sessionStatus = useMemo(() => {
    if (!activeEvent?.sessions?.length) return null;
    return getActiveSessionByTime(activeEvent.sessions, new Date());
  }, [activeEvent]);

  // ── Camera ──
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraOn(true);
    } catch {
      alert('Camera permission denied. Please enable camera access in your browser settings.');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearInterval(intervalRef.current);
    setCameraOn(false);
  };

  // Stop camera on unmount / page leave
  useEffect(() => () => stopCamera(), []);

  // ── QR scan loop (jsQR — works in all browsers) ──
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
      if (val === lastTokenRef.current && now - lastTimeRef.current < 3000) return;
      lastTokenRef.current = val;
      lastTimeRef.current = now;
      verify(val);
    }, 250);
    return () => clearInterval(intervalRef.current);
  }, [cameraOn, processing, selectedEventId, sessionStatus]);

  // ── Verify ──
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
          expectedSessionId: sessionStatus?.activeSession?.id || 'AUTO',
        }),
      });
      setResult(await res.json());
    } catch {
      setResult({ status: 'INVALID', reason: 'Network error. Try again.' });
    } finally {
      setProcessing(false);
      setManualInput('');
    }
  };

  const override = async () => {
    const id = result?.ticket?.id;
    if (!id) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/tenant/events/${selectedEventId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'OVERRIDE', ticketId: id, reason: 'Gate Override' }),
      });
      const d = await res.json();
      if (d.success) setResult({ status: 'RE_ENTRY_ALLOWED', reason: 'Override approved', ticket: result?.ticket });
    } finally { setProcessing(false); }
  };

  // ── Result colour ──
  const isGreen = result && (result.status === 'VALID' || result.status === 'RE_ENTRY_ALLOWED');
  const isYellow = result?.status === 'ALREADY_SCANNED';
  const isRed = result && !isGreen && !isYellow;

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ background: '#1e293b', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/organizer" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '1.2rem' }}>←</Link>
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>Gate Scanner</span>
      </div>

      <div style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

        {/* ── Event + Session select ── */}
        {loading ? (
          <p style={{ color: '#64748b', textAlign: 'center' }}>Loading events...</p>
        ) : events.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: '#64748b' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🌙</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No active events right now</div>
            <div style={{ fontSize: '0.85rem' }}>Gate opens 2 hours before each show.</div>
          </div>
        ) : (
          <>
            <select
              value={selectedEventId}
              onChange={e => { setSelectedEventId(e.target.value); setResult(null); }}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.95rem', background: '#fff' }}
            >
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select>

            {sessionStatus && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: sessionStatus.status === 'LIVE_NOW' ? '#dcfce7' : '#fef9c3', border: `1px solid ${sessionStatus.status === 'LIVE_NOW' ? '#86efac' : '#fde047'}`, fontSize: '0.85rem', color: '#374151' }}>
                <strong>{sessionStatus.status === 'LIVE_NOW' ? '🟢 Live:' : '⏳ Next:'}</strong> {sessionStatus.label}
              </div>
            )}

            {/* ── Camera area ── */}
            <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#0f172a', borderRadius: 10, overflow: 'hidden' }}>
              <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraOn ? 'block' : 'none' }} />
              {/* Hidden canvas — jsQR reads frames from here */}
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              {!cameraOn && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <div style={{ fontSize: '2rem' }}>📷</div>
                  <button onClick={startCamera} style={{ padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer' }}>
                    Open Scanner
                  </button>
                </div>
              )}
              {cameraOn && (
                <button onClick={stopCamera} style={{ position: 'absolute', bottom: 10, right: 10, padding: '6px 14px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                  Stop
                </button>
              )}
            </div>

            {/* ── Live QR value ── */}
            {lastQr && (
              <div style={{ padding: '8px 12px', background: '#f1f5f9', borderRadius: 8, fontSize: '0.78rem', color: '#475569', wordBreak: 'break-all', border: '1px solid #e2e8f0' }}>
                <strong>Detected:</strong> {lastQr}
              </div>
            )}

            {/* ── Manual input ── */}
            <form onSubmit={e => { e.preventDefault(); verify(manualInput); }} style={{ display: 'flex', gap: 8 }}>
              <input
                placeholder="Paste QR token manually..."
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
                style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.95rem' }}
              />
              <button type="submit" disabled={processing || !manualInput.trim()} style={{ padding: '10px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: processing || !manualInput.trim() ? 0.5 : 1 }}>
                Verify
              </button>
            </form>

            {/* ── Result ── */}
            {processing && <div style={{ textAlign: 'center', color: '#64748b', padding: 12 }}>Verifying...</div>}

            {result && !processing && (
              <div style={{ borderRadius: 10, padding: '16px', border: `2px solid ${isGreen ? '#22c55e' : isYellow ? '#eab308' : '#ef4444'}`, background: isGreen ? '#f0fdf4' : isYellow ? '#fefce8' : '#fef2f2' }}>
                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: isGreen ? '#15803d' : isYellow ? '#a16207' : '#b91c1c', marginBottom: 6 }}>
                  {isGreen ? '✓ Access Granted' : isYellow ? '⚠ Already Scanned' : '✕ Access Denied'}
                </div>
                {result.ticket?.attendeeName && <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1e293b' }}>{result.ticket.attendeeName}</div>}
                {result.ticket?.tierName && <div style={{ fontSize: '0.85rem', color: '#475569' }}>{result.ticket.tierName}</div>}
                {isYellow && result.ticket?.firstCheckedInAt && (
                  <div style={{ fontSize: '0.82rem', color: '#92400e', marginTop: 4 }}>
                    First scanned: {new Date(result.ticket.firstCheckedInAt).toLocaleTimeString('en-IN')}
                  </div>
                )}
                {(result.reason || result.message) && (
                  <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: 6 }}>{result.reason || result.message}</div>
                )}
                {isRed && lastQr && (
                  <div style={{ fontSize: '0.75rem', color: '#9f1239', marginTop: 8, padding: '6px 8px', background: '#ffe4e6', borderRadius: 6, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                    Scanned: {lastQr}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {isYellow && (
                    <button onClick={override} style={{ padding: '8px 16px', background: '#eab308', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer' }}>
                      Allow Re-entry
                    </button>
                  )}
                  <button onClick={() => { setResult(null); setLastQr(''); }} style={{ padding: '8px 16px', background: '#e2e8f0', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
                    Clear
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function ScannerPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Loading...</div>}>
      <ScannerContent />
    </Suspense>
  );
}
