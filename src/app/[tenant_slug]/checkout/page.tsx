'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';

interface Attendee {
  id: string;
  name: string;
  age: string;
  tierId: string;
  tierName: string;
  price_in_paise: number;
}

export default function TenantCheckoutPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tenantSlug = params?.tenant_slug as string;
  const preselectedEventId = searchParams.get('eventId');

  const [tenant, setTenant] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [tierQuantities, setTierQuantities] = useState<Record<string, number>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Attendees list: 1 entry per ticket with assigned tier
  const [attendees, setAttendees] = useState<Attendee[]>([]);

  // WhatsApp receiving number & email
  const [whatsappPhone, setWhatsappPhone] = useState('+919876500112');
  const [custEmail, setCustEmail] = useState('vikram@example.com');

  // Multi-step flow: 'select' -> 'attendees' -> 'status'
  const [step, setStep] = useState<'select' | 'attendees' | 'status'>('select');
  const [sessionToken, setSessionToken] = useState('');

  // 10-Minute Reservation Lock Timer State
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);

  // Pricing breakdown & order state
  const [breakdown, setBreakdown] = useState<any>(null);
  const [pendingOrder, setPendingOrder] = useState<any>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<any>(null);
  const [confirmedTickets, setConfirmedTickets] = useState<any[]>([]);
  const [qrCodeMap, setQrCodeMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [cfSdkLoaded, setCfSdkLoaded] = useState(false);

  useEffect(() => {
    let token = localStorage.getItem('multi_tenant_session_token');
    if (!token) {
      token = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('multi_tenant_session_token', token);
    }
    setSessionToken(token);

    // Fetch tenant and events
    fetch(`/api/client/tenants/${tenantSlug}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setTenant(data.tenant);
          const evList = data.events || [];
          setEvents(evList);

          if (evList.length > 0) {
            const ev = (preselectedEventId && evList.find((e: any) => e.id === preselectedEventId)) || evList[0];
            setSelectedEvent(ev);

            const sessList = ev.sessions?.map((s: any) => s.session_date).filter(Boolean) ||
              (ev.tiers ? Array.from(new Set(ev.tiers.map((t: any) => t.session_date).filter(Boolean))) : []);
            const defaultSess = sessList.length > 0 ? sessList[0] : '';
            setSelectedSession(defaultSess);

            const tiers = ev.tiers || [];
            if (tiers.length > 0) {
              const first = defaultSess
                ? tiers.find((t: any) => t.session_date === defaultSess || t.valid_date === defaultSess) || tiers[0]
                : tiers[0];
              if (first) setTierQuantities({ [first.id]: 1 });
            }
          }
        }
      });

    // Load Cashfree JS SDK
    if (!document.getElementById('cashfree-sdk')) {
      const script = document.createElement('script');
      script.id = 'cashfree-sdk';
      script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
      script.onload = () => setCfSdkLoaded(true);
      script.onerror = () => setCfSdkLoaded(false);
      document.head.appendChild(script);
    } else {
      setCfSdkLoaded(true);
    }
  }, [tenantSlug, preselectedEventId]);

  // Countdown timer effect
  useEffect(() => {
    if (secondsRemaining === null || secondsRemaining <= 0) return;
    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          setErrorMsg('Hold expired. Re-select tickets.');
          setStep('select');
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsRemaining]);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Format session date nicely
  const formatSessionLabel = (sess: string) => {
    if (!sess) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(sess)) {
      try {
        const d = new Date(sess + 'T00:00:00');
        return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
      } catch (e) {
        return sess;
      }
    }
    return sess;
  };

  // Extract unique session dates for the selected event
  const eventSessions = selectedEvent?.sessions
    ? selectedEvent.sessions.map((s: any) => s.session_date).filter(Boolean)
    : selectedEvent?.tiers
      ? Array.from(new Set(selectedEvent.tiers.map((t: any) => t.session_date).filter(Boolean)))
      : [];

  // When user toggles a session/date, filter tiers by that session
  const handleSelectSession = (sess: string) => {
    setErrorMsg(null);
    setSelectedSession(sess);
    const tiers = selectedEvent?.tiers || [];
    const dayTiers = tiers.filter((t: any) => t.session_date === sess || t.valid_date === sess);
    if (dayTiers.length > 0) {
      setTierQuantities({ [dayTiers[0].id]: 1 });
    }
  };

  // Filter tiers by selected session date
  const filteredTiers = selectedEvent?.tiers?.filter((t: any) => {
    if (!selectedSession) return true;
    return t.session_date === selectedSession || t.valid_date === selectedSession;
  }) || [];

  const tiersToDisplay = filteredTiers.length > 0 ? filteredTiers : (selectedEvent?.tiers || []);
  const sortedFilteredTiers = [...tiersToDisplay].sort((a, b) => a.price_in_paise - b.price_in_paise);

  // Multi-tier quantity update handler
  const updateTierQty = (tierId: string, qty: number) => {
    setErrorMsg(null);
    setTierQuantities(prev => ({
      ...prev,
      [tierId]: Math.max(0, qty)
    }));
  };

  // Total quantity & total price calculations
  const totalTicketCount = Object.values(tierQuantities).reduce((a, b) => a + (b || 0), 0);
  const totalPricePaise = sortedFilteredTiers.reduce((sum, t) => sum + (t.price_in_paise * (tierQuantities[t.id] || 0)), 0);

  // Attendee helper
  const updateAttendee = (id: string, field: 'name' | 'age', val: string) => {
    setErrorMsg(null);
    setAttendees(prev => prev.map(a => a.id === id ? { ...a, [field]: val } : a));
  };

  // Step 1 -> Step 2: Lock reservations and build attendees list
  const handleProceedToAttendees = async () => {
    setErrorMsg(null);
    if (totalTicketCount === 0) {
      setErrorMsg('Select at least 1 ticket to proceed.');
      return;
    }

    setLoading(true);
    try {
      // 1. Reserve seats for each selected tier
      const selectedItems = sortedFilteredTiers
        .filter(t => (tierQuantities[t.id] || 0) > 0)
        .map(t => ({ tierId: t.id, quantity: tierQuantities[t.id] }));

      for (const item of selectedItems) {
        const res = await fetch('/api/client/reserve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tierId: item.tierId,
            sessionToken,
            quantity: item.quantity
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Selected seats unavailable');
        }
        setSecondsRemaining(data.secondsRemaining || 600);
      }

      // 2. Prepare attendees array matching selected tiers
      const newAttendeesList: Attendee[] = [];
      let attIndex = 1;
      for (const item of selectedItems) {
        const tierObj = sortedFilteredTiers.find(t => t.id === item.tierId);
        for (let i = 0; i < item.quantity; i++) {
          newAttendeesList.push({
            id: `att_${Date.now()}_${attIndex}`,
            name: `Guest ${attIndex}`,
            age: '18',
            tierId: item.tierId,
            tierName: tierObj?.name || 'Ticket',
            price_in_paise: tierObj?.price_in_paise || 0
          });
          attIndex++;
        }
      }
      setAttendees(newAttendeesList);

      // 3. Fetch pricing breakdown for multi-tier selection
      const calcRes = await fetch('/api/client/calculate-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selectedItems })
      });
      const calcData = await calcRes.json();
      if (calcData.success) {
        setBreakdown(calcData.breakdown);
      }

      setStep('attendees');
    } catch (err: any) {
      setErrorMsg(err.message || 'Seat reservation failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 -> Launch Payment
  const handleProceedToPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!whatsappPhone.trim()) {
      setErrorMsg('Enter WhatsApp number.');
      return;
    }

    setLoading(true);
    try {
      const primaryTierId = attendees[0]?.tierId || sortedFilteredTiers[0]?.id;

      const res = await fetch('/api/client/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tierId: primaryTierId,
          quantity: attendees.length,
          sessionToken,
          customerName: 'Guest',
          customerPhone: whatsappPhone.trim(),
          customerEmail: '',
          attendees: attendees.map((a, idx) => ({
            name: a.name || `Guest ${idx + 1}`,
            age: parseInt(a.age, 10) || 18,
            tierId: a.tierId
          }))
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Checkout failed');

      setPendingOrder(data);

      const cf = (window as any).Cashfree;
      const sessionId = data.gatewayOrder?.paymentSessionId;
      if (cf && sessionId && typeof sessionId === 'string' && !sessionId.startsWith('session_cf_')) {
        try {
          const cashfree = cf({ mode: data.gatewayOrder.env || 'sandbox' });
          setLoading(false);
          cashfree.checkout({
            paymentSessionId: data.gatewayOrder.paymentSessionId,
            redirectTarget: '_modal',
          }).then(async (result: any) => {
            if (result.error) {
              setErrorMsg('Payment failed: ' + (result.error.message || 'Gateway error'));
            } else if (result.paymentDetails) {
              await finalizePayment(data.orderId, result.paymentDetails.paymentMessage || `cf_${Date.now()}`);
            }
          });
          return;
        } catch (sdkErr) {
          console.warn('Cashfree SDK error', sdkErr);
        }
      }

      if (data.gatewayOrder?.env === 'simulation') {
        setShowPaymentModal(true);
      } else {
        throw new Error('Payment Gateway Error: Unable to initialize payment session. Please verify payment credentials.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment error');
    } finally {
      setLoading(false);
    }
  };

  // Shared finalization
  const finalizePayment = async (orderId: string, paymentId: string) => {
    setShowPaymentModal(false);
    setLoading(true);
    setErrorMsg(null);
    try {
      const primaryTierId = attendees[0]?.tierId || sortedFilteredTiers[0]?.id;

      const res = await fetch('/api/client/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          tierId: primaryTierId,
          paymentId,
          sessionToken,
          attendees: attendees.map(a => ({
            name: a.name.trim(),
            age: parseInt(a.age, 10) || 18,
            tierId: a.tierId
          }))
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Payment verification failed');

      setSecondsRemaining(null);

      const orderRes = await fetch(`/api/client/orders/${data.orderId}`);
      const orderData = await orderRes.json();
      if (orderData.success) {
        setConfirmedOrder(orderData.order);
        setConfirmedTickets(orderData.tickets || []);

        const qrs: Record<string, string> = {};
        for (const t of (orderData.tickets || [])) {
          const qr = await QRCode.toDataURL(t.qr_secret_token, { width: 240, margin: 1 });
          qrs[t.id] = qr;
        }
        setQrCodeMap(qrs);
        setStep('status');
      }
    } catch (err: any) {
      setErrorMsg('Payment error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSimulatePaymentCapture = async () => {
    if (!pendingOrder) return;
    await finalizePayment(pendingOrder.orderId, `pay_sim_${Date.now()}`);
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '12px 10px' }}>

      {/* STEP 1: SELECT EVENT, DATE, MULTI-TIER QUANTITY */}
      {step === 'select' && (
        <div className="glass-panel" style={{ padding: '16px 14px', borderRadius: 14 }}>
          {/* Header Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              {tenant?.name || 'Box Office'}
            </span>
            <Link href="/" style={{ color: 'var(--text-muted)', fontSize: '0.78rem', textDecoration: 'none', whiteSpace: 'nowrap' }}>
              ← All Events
            </Link>
          </div>

          {/* Event Title */}
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 2, lineHeight: 1.25 }}>
            {selectedEvent?.title || 'Book Tickets'}
          </h1>

          {/* Location & Date Metadata */}
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              📍 {selectedEvent?.location}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {selectedEvent?.start_date && (
                <span>📅 {new Date(selectedEvent.start_date).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              )}
              {secondsRemaining !== null && (
                <span style={{ color: '#fbbf24', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  ⏱️ {formatTimer(secondsRemaining)} hold
                </span>
              )}
            </div>
          </div>

          {/* Inline Error Banner */}
          {errorMsg && (
            <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#fca5a5' }}>
              <span>⚠️ {errorMsg}</span>
              <button type="button" onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '1.1rem', padding: 0 }}>&times;</button>
            </div>
          )}

          {/* 1. Session / Date Pills */}
          {eventSessions.length > 0 && (
            <div style={{ marginBottom: 16, background: 'rgba(15, 23, 42, 0.5)', padding: 12, borderRadius: 10, border: '1px solid var(--border-glass)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Select Date
              </div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
                {eventSessions.map((sess: any) => {
                  const isSelected = selectedSession === sess;
                  return (
                    <button
                      key={sess}
                      type="button"
                      onClick={() => handleSelectSession(sess)}
                      style={{
                        background: isSelected ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'rgba(30, 41, 59, 0.7)',
                        color: isSelected ? '#ffffff' : 'var(--text-muted)',
                        border: isSelected ? '1px solid #818cf8' : '1px solid var(--border-glass)',
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        cursor: 'pointer',
                        boxShadow: isSelected ? '0 4px 10px rgba(99, 102, 241, 0.3)' : 'none',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      📅 {formatSessionLabel(sess)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Multi-Tier Ticket Quantity Cards */}
          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 8, color: '#e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Select Tickets & Quantity</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {sortedFilteredTiers.length} available
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {sortedFilteredTiers.map((t: any) => {
              const qty = tierQuantities[t.id] || 0;
              const isSelected = qty > 0;
              return (
                <div
                  key={t.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: isSelected ? '2px solid #6366f1' : '1px solid var(--border-glass)',
                    background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(15, 23, 42, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    boxShadow: isSelected ? '0 0 14px rgba(99, 102, 241, 0.25)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: isSelected ? '#818cf8' : '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#34d399', marginTop: 2 }}>
                      ₹{(t.price_in_paise / 100).toFixed(2)}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
                      {!t.is_unlimited && t.capacity ? `● ${t.capacity} seats limit` : '⚡ Unlimited'}
                    </div>
                  </div>

                  {/* Quantity Counter for this Tier */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ width: 32, height: 32, padding: 0, fontSize: '1rem', flexShrink: 0 }}
                      onClick={() => updateTierQty(t.id, qty - 1)}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, minWidth: 18, textAlign: 'center', color: qty > 0 ? '#34d399' : '#ffffff' }}>
                      {qty}
                    </span>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ width: 32, height: 32, padding: 0, fontSize: '1rem', flexShrink: 0 }}
                      onClick={() => updateTierQty(t.id, qty + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Primary Action Button */}
          <button
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '0.95rem',
              fontWeight: 700,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            onClick={handleProceedToAttendees}
            disabled={loading || totalTicketCount === 0}
          >
            <span style={{ whiteSpace: 'nowrap' }}>
              {loading ? 'Reserving...' : `Continue (${totalTicketCount} Ticket${totalTicketCount > 1 ? 's' : ''})`}
            </span>
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 8px', borderRadius: 16, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              ₹{(totalPricePaise / 100).toFixed(2)}
            </span>
          </button>
        </div>
      )}

      {/* STEP 2: FILL ATTENDEE DETAILS */}
      {step === 'attendees' && (
        <div className="glass-panel" style={{ padding: '16px 14px', borderRadius: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setStep('select')}
              style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: '0.8rem', padding: 0, whiteSpace: 'nowrap' }}
            >
              ← Back
            </button>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>Step 2 of 3</span>
          </div>

          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: 2 }}>
            Ticket Delivery
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 14 }}>
            Enter your WhatsApp number to receive your digital ticket passes.
          </p>

          {/* Inline Error Banner */}
          {errorMsg && (
            <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#fca5a5' }}>
              <span>⚠️ {errorMsg}</span>
              <button type="button" onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '1.1rem', padding: 0 }}>&times;</button>
            </div>
          )}

          <form onSubmit={handleProceedToPayment}>
            {/* Selected Tickets Summary Card */}
            <div style={{ marginBottom: 16, background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-glass)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
                🎫 Selected Tickets ({attendees.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.entries(tierQuantities).filter(([_, qty]) => qty > 0).map(([tId, qty]) => {
                  const tierObj = sortedFilteredTiers.find(t => t.id === tId);
                  if (!tierObj) return null;
                  return (
                    <div key={tId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#818cf8', fontWeight: 600 }}>
                      <span>• {qty} × {tierObj.name}</span>
                      <span>₹{((tierObj.price_in_paise * qty) / 100).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* WhatsApp Delivery */}
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span>📱</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#34d399', whiteSpace: 'nowrap' }}>
                  WhatsApp Delivery *
                </span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                Digital QR ticket passes will be sent directly to this number.
              </p>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>WhatsApp Mobile Number *</label>
                <input
                  type="tel"
                  className="form-control"
                  placeholder="+91 98765 43210"
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  required
                  style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Price Breakdown */}
            {breakdown && (
              <div style={{ background: 'rgba(15, 23, 42, 0.8)', borderRadius: 10, padding: 12, border: '1px solid var(--border-glass)', marginBottom: 16, fontSize: '0.78rem' }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Breakdown</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Tickets ({attendees.length})</span>
                  <span style={{ whiteSpace: 'nowrap' }}>₹{(breakdown.basePricePaise / 100).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-muted)' }}>
                  <span>Platform fee</span>
                  <span style={{ whiteSpace: 'nowrap' }}>₹{(breakdown.platformFeePaise / 100).toFixed(2)}</span>
                </div>
                {breakdown.convenienceFeePaise > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-muted)' }}>
                    <span>Gateway fee</span>
                    <span style={{ whiteSpace: 'nowrap' }}>₹{(breakdown.convenienceFeePaise / 100).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border-glass)', fontWeight: 800, fontSize: '1rem', color: '#34d399' }}>
                  <span>Total:</span>
                  <span style={{ whiteSpace: 'nowrap' }}>₹{(breakdown.totalChargedPaise / 100).toFixed(2)}</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px 16px', fontSize: '0.95rem', fontWeight: 700 }}
              disabled={loading}
            >
              {loading ? 'Initiating...' : `Make Payment (₹${breakdown ? (breakdown.totalChargedPaise / 100).toFixed(2) : ''})`}
            </button>
          </form>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {showPaymentModal && pendingOrder && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: 400, borderRadius: 14 }}>
            <div className="modal-header" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>🛡️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Cashfree PG / Razorpay</h3>
                </div>
              </div>
              <button onClick={() => setShowPaymentModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.3rem', cursor: 'pointer', padding: 0 }}>&times;</button>
            </div>
            <div className="modal-body" style={{ padding: 14 }}>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Amount to Pay</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#34d399', margin: '2px 0' }}>
                  ₹{(pendingOrder.breakdown.totalChargedPaise / 100).toFixed(2)}
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '0.92rem', fontWeight: 700 }}
                onClick={handleSimulatePaymentCapture}
                disabled={loading}
              >
                {loading ? 'Verifying...' : '✅ Complete Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: CONFIRMATION */}
      {step === 'status' && confirmedOrder && (
        <div>
          <div className="glass-panel" style={{ padding: '20px 14px', marginBottom: 16, textAlign: 'center', borderRadius: 14, border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', margin: '0 auto 10px' }}>
              ✓
            </div>
            <span style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '3px 10px', borderRadius: 16, fontSize: '0.72rem', fontWeight: 800 }}>
              PAYMENT CONFIRMED
            </span>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, marginTop: 8, marginBottom: 4 }}>
              Booking Confirmed!
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: '0 auto 12px' }}>
              Order <code>{confirmedOrder.id}</code> confirmed.
            </p>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '5px 12px', borderRadius: 6, fontSize: '0.78rem', color: '#34d399' }}>
              <span>📲</span>
              <span>Dispatched to WhatsApp: <b>{confirmedOrder.customer_phone}</b></span>
            </div>
          </div>

          <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 12 }}>
            Digital Entry Passes ({confirmedTickets.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {confirmedTickets.map((t, idx) => (
              <div
                key={t.id}
                className="glass-panel"
                style={{
                  padding: 14,
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  border: '1px solid var(--border-glass-glow)'
                }}
              >
                <div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase' }}>
                    TICKET #{idx + 1} &nbsp;•&nbsp; {t.tier_name || 'Ticket'}
                  </span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: 2, marginBottom: 4 }}>
                    {t.attendee_name}
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Age: <b>{t.attendee_age}</b> &nbsp;•&nbsp; ID: <code>{t.id}</code>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <a
                      href={`/api/client/tickets/${t.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', padding: '5px 10px', fontSize: '0.78rem' }}
                    >
                      <span>📥</span> Download PDF
                    </a>
                  </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ background: '#ffffff', padding: 8, borderRadius: 10, display: 'inline-block' }}>
                    {qrCodeMap[t.id] ? (
                      <img src={qrCodeMap[t.id]} alt="Ticket QR Code" style={{ width: 140, height: 140, display: 'block' }} />
                    ) : (
                      <div style={{ width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
                        Loading...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Link href="/wallet" className="btn btn-primary btn-sm" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
              🎟️ My Wallet
            </Link>
            <Link href="/" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none', fontSize: '0.8rem' }}>
              🏠 Discover Events
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
