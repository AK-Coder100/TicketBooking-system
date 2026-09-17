// Client Mobile-First Web Storefront & Cross-Tenant Booking Controller

let allEvents = [];
let currentTenant = null;
let selectedEvent = null;
let selectedTier = null;
let selectedSession = null;
let bookingQuantity = 1;
let activeReservation = null;
let reservationTimerInterval = null;
let pendingOrder = null;

// Session Token Preservation for Concurrency & Returning Visits
let sessionToken = localStorage.getItem('multi_tenant_session_token');
if (!sessionToken) {
  sessionToken = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  localStorage.setItem('multi_tenant_session_token', sessionToken);
}

document.addEventListener('DOMContentLoaded', () => {
  checkTenantSlugRoute();
  restoreSavedOrder();
});

// Detect tenant slug in path: /sunburn or /techconf or root /
async function checkTenantSlugRoute() {
  const path = window.location.pathname.replace(/^\/|\/$/g, '');

  if (path && !['admin', 'organizer', 'api', 'shared', 'index.html'].includes(path)) {
    try {
      const res = await fetch(`/api/client/tenants/${path}`);
      const data = await res.json();
      if (data.success) {
        currentTenant = data.tenant;
        renderTenantLanding(data.tenant, data.events);
        return;
      }
    } catch (e) {
      console.warn('Not a tenant slug, loading global catalog:', e);
    }
  }

  loadGlobalCatalog();
}

function renderTenantLanding(tenant, events) {
  document.getElementById('global-hero').style.display = 'none';
  const hero = document.getElementById('tenant-hero');
  hero.style.display = 'flex';

  document.getElementById('tenant-hero-title').textContent = tenant.name;
  document.getElementById('tenant-hero-tag').textContent = `Official Box Office | /${tenant.slug}`;
  document.getElementById('tenant-hero-meta').innerHTML = `
    <span>📧 ${escapeHtml(tenant.contact_email || 'Contact Box Office')}</span>
    <span>📱 ${escapeHtml(tenant.contact_phone || 'WhatsApp Support Active')}</span>
  `;

  const feeBadge = document.getElementById('tenant-fee-policy-badge');
  if (tenant.is_gateway_fee_passed_to_customer) {
    feeBadge.textContent = 'Transparent Convenience Surcharge';
    feeBadge.className = 'badge badge-purple';
  } else {
    feeBadge.textContent = 'Zero Surcharge to Attendee (Absorbed by Organizer)';
    feeBadge.className = 'badge badge-green';
  }

  allEvents = events || [];
  renderEventCards(allEvents);
}

async function loadGlobalCatalog() {
  try {
    const res = await fetch('/api/client/events');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    allEvents = data.events || [];
    renderEventCards(allEvents);
  } catch (err) {
    console.error('Failed to load events:', err);
    window.showToast('Could not load events: ' + err.message, 'error');
  }
}

function renderEventCards(events) {
  const grid = document.getElementById('events-catalog-grid');
  if (!events || events.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-dim);">No active events currently published.</div>';
    return;
  }

  grid.innerHTML = events.map(e => {
    let minPricePaise = 0;
    if (e.tiers && e.tiers.length > 0) {
      minPricePaise = Math.min(...e.tiers.map(t => t.price_in_paise));
    }
    const sessionCount = e.sessions ? e.sessions.length : 0;
    const eventDateStr = new Date(e.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    return `
      <div class="event-card" onclick="openBookingModal('${e.id}')">
        <img src="${e.banner_url || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800'}" alt="${escapeHtml(e.title)}" class="event-card-img">
        <div class="event-content">
          <div class="event-meta-pill">
            <span>🎪 ${escapeHtml(e.tenant_name || 'Organizer')}</span>
            <span style="color:var(--text-dim);">•</span>
            <span>🗓️ ${eventDateStr}</span>
            ${sessionCount > 1 ? `<span style="color:var(--text-dim);">•</span><span>🎭 ${sessionCount} Sessions</span>` : ''}
          </div>
          <h3 class="event-title-main">${escapeHtml(e.title)}</h3>
          <div class="event-location">📍 ${escapeHtml(e.location)}</div>
          <p style="font-size:0.85rem; color:var(--text-dim); margin-bottom:14px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
            ${escapeHtml(e.description || '')}
          </p>
          <div class="event-footer">
            <div>
              <div class="event-price-from">Passes from</div>
              <div class="event-price-amount">₹${(minPricePaise / 100).toFixed(2)}</div>
            </div>
            <button class="btn btn-primary btn-sm">Book Tickets</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterByTenant(slug, btn) {
  const buttons = document.querySelectorAll('#tenant-filter-bar button');
  buttons.forEach(b => b.className = 'btn btn-secondary btn-sm');
  btn.className = 'btn btn-primary btn-sm';
  if (slug === 'ALL') {
    renderEventCards(allEvents);
  } else {
    renderEventCards(allEvents.filter(e => e.tenant_slug === slug));
  }
}

// =========================================================================
// BOOKING MODAL — SESSION SELECTION + TIER SELECTION + PER-TICKET DETAILS
// =========================================================================

async function openBookingModal(eventId) {
  try {
    const res = await fetch(`/api/client/events/${eventId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    selectedEvent = data.event;
    selectedTier = null;
    selectedSession = null;
    bookingQuantity = 1;
    pendingOrder = null;

    document.getElementById('book-modal-title').textContent = selectedEvent.title;

    // Decide which sub-step to show first
    const hasSessions = selectedEvent.sessions && selectedEvent.sessions.length > 0;
    showBookingStep('tiers');
    renderSessionAndTierSelection(hasSessions);
    openModal('modal-booking');
  } catch (err) {
    window.showToast('Could not open event: ' + err.message, 'error');
  }
}

function showBookingStep(step) {
  const steps = ['sessions', 'tiers', 'details'];
  steps.forEach(s => {
    const el = document.getElementById('book-step-' + s);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById('book-step-' + step);
  if (target) target.style.display = 'block';
}

function renderSessionAndTierSelection(hasSessions) {
  const container = document.getElementById('book-tier-options');
  const sessions = selectedEvent.sessions || [];
  const tiers = selectedEvent.tiers || [];

  // Build tier map per session
  const tiersBySession = {};
  for (const t of tiers) {
    const key = t.session_id || '__global__';
    if (!tiersBySession[key]) tiersBySession[key] = [];
    tiersBySession[key].push(t);
  }

  if (sessions.length === 0 && tiers.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim);">No ticket tiers currently available.</div>';
    return;
  }

  // If only 1 session (or no sessions), skip session picker and go straight to tiers
  if (sessions.length <= 1) {
    const sess = sessions[0] || null;
    selectedSession = sess;
    const sessionTiers = sess ? (tiersBySession[sess.id] || []) : tiers;
    if (sessionTiers.length > 0) {
      selectedTier = sessionTiers[0];
    }
    renderTierCards(sessionTiers);
    return;
  }

  // Multiple sessions — render session cards first
  let html = `
    <div style="margin-bottom:16px;">
      <div style="font-size:0.88rem; font-weight:700; color:#c7d2fe; margin-bottom:10px;">🎭 Select a Session:</div>
      <div style="display:flex; flex-direction:column; gap:8px;">
  `;

  for (const sess of sessions) {
    const sessT = tiersBySession[sess.id] || [];
    const minPrice = sessT.length > 0 ? Math.min(...sessT.map(t => t.price_in_paise)) : 0;
    const isSelected = selectedSession && selectedSession.id === sess.id;

    html += `
      <div
        onclick="selectSession('${sess.id}')"
        style="
          padding:12px 16px; border-radius:10px; cursor:pointer; transition:all 0.2s;
          background:${isSelected ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)'};
          border:1px solid ${isSelected ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'};
          display:flex; justify-content:space-between; align-items:center;
        "
      >
        <div>
          <div style="font-weight:700; font-size:0.95rem; color:#e2e8f0;">${escapeHtml(sess.name)}</div>
          <div style="font-size:0.78rem; color:var(--text-dim); margin-top:2px;">
            📅 ${sess.session_date}
            ${sess.start_time ? ` · ${sess.start_time}–${sess.end_time || '?'}` : ''}
            ${sess.venue_note ? ` · 🎤 ${escapeHtml(sess.venue_note)}` : ''}
          </div>
          <div style="font-size:0.75rem; color:#818cf8; margin-top:3px;">${sessT.length} ticket type${sessT.length !== 1 ? 's' : ''}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.75rem; color:var(--text-dim);">from</div>
          <div style="font-size:1.1rem; font-weight:800; color:#34d399;">₹${(minPrice / 100).toFixed(0)}</div>
        </div>
      </div>
    `;
  }

  html += `</div></div>`;

  // If session selected, show its tiers below
  if (selectedSession) {
    const sessT = tiersBySession[selectedSession.id] || [];
    html += renderTierCardsHtml(sessT);
  }

  container.innerHTML = html;
  updateAvailableHelper();
}

function selectSession(sessionId) {
  const sessions = selectedEvent.sessions || [];
  selectedSession = sessions.find(s => s.id === sessionId) || null;

  // Select first available tier for this session
  const tiers = selectedEvent.tiers || [];
  const sessT = tiers.filter(t => t.session_id === sessionId);
  selectedTier = sessT.find(t => t.is_unlimited || (t.availableCount > 0)) || sessT[0] || null;

  renderSessionAndTierSelection(true);
}

function renderTierCards(tiers) {
  const container = document.getElementById('book-tier-options');
  container.innerHTML = renderTierCardsHtml(tiers);
  updateAvailableHelper();
}

function renderTierCardsHtml(tiers) {
  if (!tiers || tiers.length === 0) return '<div style="color:var(--text-dim); padding:10px 0;">No tickets available for this session.</div>';

  return `
    <div>
      <div style="font-size:0.88rem; font-weight:700; color:#c7d2fe; margin-bottom:10px;">🎫 Select Ticket Type:</div>
      ${tiers.map(t => {
        const isSelected = selectedTier && selectedTier.id === t.id;
        const available = t.availableCount != null ? t.availableCount : (t.is_unlimited ? '∞' : t.capacity);
        const isSoldOut = !t.is_unlimited && typeof available === 'number' && available <= 0;

        return `
          <div class="tier-option-card ${isSelected ? 'selected' : ''} ${isSoldOut ? 'disabled' : ''}"
               onclick="${isSoldOut ? '' : `selectTier('${t.id}')`}"
               style="margin-bottom:8px;">
            <div>
              <div style="font-weight:700; font-size:1rem; color:var(--text-main);">${escapeHtml(t.name)}</div>
              ${t.session_name ? `<div style="font-size:0.75rem; color:#818cf8; margin-top:2px;">📅 ${escapeHtml(t.session_name)} · ${t.session_date || ''}</div>` : ''}
              <div style="font-size:0.78rem; color:${typeof available === 'number' && available < 10 ? '#fbbf24' : 'var(--text-dim)'}; margin-top:4px;">
                ${t.is_unlimited ? '⚡ Unlimited seats' : `● ${available} seats remaining`}
              </div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:1.25rem; font-weight:800; color:#34d399;">₹${(t.price_in_paise / 100).toFixed(2)}</div>
              ${isSoldOut ? '<span class="badge badge-red">Sold Out</span>' : '<span style="font-size:0.75rem; color:var(--text-dim);">per person</span>'}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function selectTier(tierId) {
  selectedTier = selectedEvent.tiers.find(t => t.id === tierId);

  // Re-render to show selected state
  const sessions = selectedEvent.sessions || [];
  renderSessionAndTierSelection(sessions.length > 1);
}

function changeQuantity(delta) {
  const newQty = bookingQuantity + delta;
  if (newQty < 1) return;

  if (selectedTier && !selectedTier.is_unlimited && selectedTier.availableCount != null) {
    if (newQty > selectedTier.availableCount) {
      window.showToast(`Only ${selectedTier.availableCount} ticket(s) available`, 'warning');
      return;
    }
  }

  if (newQty > 10) {
    window.showToast('Maximum 10 tickets per booking order', 'warning');
    return;
  }

  bookingQuantity = newQty;
  document.getElementById('book-quantity-display').textContent = bookingQuantity;
  updateAvailableHelper();
}

function updateAvailableHelper() {
  const el = document.getElementById('book-available-helper');
  if (!el || !selectedTier) return;
  if (selectedTier.is_unlimited) {
    el.textContent = 'Instant confirmation';
  } else {
    el.textContent = `Available: ${selectedTier.availableCount || 0} seats`;
  }
}

// ─── Reserve seats (10-min lock) ──────────────────────────────────────────────
async function proceedToHoldReservation() {
  if (!selectedTier) {
    window.showToast('Please select a ticket type first', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/client/reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tierId: selectedTier.id, sessionToken, quantity: bookingQuantity })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Unable to reserve inventory');

    activeReservation = data;
    startReservationCountdown(data.secondsRemaining || 600);

    // Transition to Step 2: Per-ticket attendee details
    showBookingStep('details');
    document.getElementById('book-timer-hud').style.display = 'flex';

    renderAttendeeFields(bookingQuantity);
    await calculatePriceBreakdown();

    window.showToast(`${bookingQuantity} seat(s) reserved! Complete checkout within 10 minutes.`);
  } catch (err) {
    window.showToast(err.message, 'error');
  }
}

// ─── Render per-ticket attendee name+age fields ───────────────────────────────
function renderAttendeeFields(quantity) {
  // Primary attendee (Ticket #1)
  const primaryContainer = document.getElementById('primary-attendee-fields');
  if (primaryContainer) {
    primaryContainer.innerHTML = `
      <div style="font-size:0.82rem; font-weight:700; color:#818cf8; margin-bottom:8px; text-transform:uppercase; letter-spacing:0.04em;">🎫 Ticket 1 — Lead Attendee</div>
      <div class="form-group">
        <label class="form-label">Full Name *</label>
        <input type="text" id="cust-name" class="form-control" placeholder="e.g. Aditya Sharma" autocomplete="name">
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
        <div class="form-group">
          <label class="form-label">Age *</label>
          <input type="number" id="cust-age" class="form-control" value="26" min="5" max="99">
        </div>
        <div class="form-group">
          <label class="form-label">Mobile / WhatsApp *</label>
          <input type="tel" id="cust-phone" class="form-control" placeholder="+91 98765 43210">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email <span style="color:var(--text-dim); font-weight:400;">(optional — for e-ticket delivery)</span></label>
        <input type="email" id="cust-email" class="form-control" placeholder="aditya@example.com">
      </div>
    `;
  }

  // Additional attendees for tickets 2..N
  const container = document.getElementById('additional-attendees-container');
  if (!container) return;

  if (quantity <= 1) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'block';
  let html = '';

  for (let i = 2; i <= quantity; i++) {
    html += `
      <div style="margin-top:16px; padding:16px; background:rgba(30,41,59,0.5); border:1px solid rgba(255,255,255,0.07); border-radius:12px;">
        <div style="font-size:0.82rem; font-weight:700; color:#818cf8; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.04em;">🎫 Ticket ${i}</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label" style="font-size:0.82rem;">Full Name *</label>
            <input type="text" id="att-name-${i}" class="form-control" placeholder="Attendee ${i} name" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label" style="font-size:0.82rem;">Age *</label>
            <input type="number" id="att-age-${i}" class="form-control" value="25" min="5" max="99">
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function backToTierSelection() {
  showBookingStep('tiers');
  document.getElementById('book-timer-hud').style.display = 'none';
}

// 10-Minute Countdown Timer Engine
function startReservationCountdown(seconds) {
  clearInterval(reservationTimerInterval);
  let remaining = seconds;

  const topBar = document.getElementById('reservation-alert-bar');
  const topTimer = document.getElementById('res-banner-timer');
  const modalTimer = document.getElementById('book-timer-countdown');

  topBar.style.display = 'flex';

  function update() {
    if (remaining <= 0) {
      clearInterval(reservationTimerInterval);
      topBar.style.display = 'none';
      window.showToast('Your 10-minute reservation lock has expired. Please select tickets again.', 'warning');
      closeModal('modal-booking');
      return;
    }

    const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
    const secs = (remaining % 60).toString().padStart(2, '0');
    const timeStr = `${mins}:${secs}`;

    if (topTimer) topTimer.textContent = timeStr;
    if (modalTimer) modalTimer.textContent = timeStr;
    remaining--;
  }

  update();
  reservationTimerInterval = setInterval(update, 1000);
}

// Calculate Fee Surcharge and Split Breakdown
async function calculatePriceBreakdown() {
  try {
    const res = await fetch('/api/client/calculate-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tierId: selectedTier.id, quantity: bookingQuantity })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const bd = data.breakdown;
    document.getElementById('bd-qty').textContent = bookingQuantity;
    document.getElementById('bd-base').textContent = `₹${bd.basePriceRupees}`;
    document.getElementById('bd-platform').textContent = `+₹${bd.platformFeeRupees}`;

    const convRow = document.getElementById('bd-convenience-row');
    const orgNote = document.getElementById('bd-organizer-note');

    if (bd.isFeePassedToCustomer) {
      convRow.style.display = 'flex';
      document.getElementById('bd-convenience').textContent = `+₹${bd.convenienceFeeRupees}`;
      orgNote.textContent = 'Gateway surcharge & GST added transparently as convenience fee.';
    } else {
      convRow.style.display = 'none';
      orgNote.textContent = '✨ Organizer absorbs all payment gateway fees. Convenience fee is ₹0 to you!';
    }

    document.getElementById('bd-total').textContent = `₹${bd.totalChargedRupees}`;
  } catch (err) {
    console.error('Calculation error:', err);
  }
}

// =========================================================================
// INITIATE REAL CASHFREE CHECKOUT + VERIFY PAYMENT
// =========================================================================

function collectAttendees() {
  const attendees = [];

  // Ticket 1 — lead attendee
  const name1 = document.getElementById('cust-name')?.value.trim();
  const age1 = parseInt(document.getElementById('cust-age')?.value || '25', 10);
  if (!name1) return null; // indicate validation failure
  attendees.push({ name: name1, age: age1 });

  // Tickets 2..N
  for (let i = 2; i <= bookingQuantity; i++) {
    const nameN = document.getElementById(`att-name-${i}`)?.value.trim();
    const ageN = parseInt(document.getElementById(`att-age-${i}`)?.value || '25', 10);
    if (!nameN) return null; // validation failure
    attendees.push({ name: nameN, age: ageN });
  }

  return attendees;
}

async function initiateGatewayPayment() {
  const phone = document.getElementById('cust-phone')?.value.trim();
  const email = document.getElementById('cust-email')?.value.trim();

  const attendees = collectAttendees();
  if (!attendees) {
    window.showToast(`Please fill in name & age for all ${bookingQuantity} attendee(s)`, 'error');
    return;
  }
  if (!phone) {
    window.showToast('Please enter your mobile / WhatsApp number', 'error');
    return;
  }

  try {
    const res = await fetch('/api/client/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tierId: selectedTier.id,
        quantity: bookingQuantity,
        sessionToken,
        customerName: attendees[0].name,
        customerPhone: phone,
        customerEmail: email,
        attendees
      })
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Checkout failed');

    pendingOrder = { ...data, attendees };

    closeModal('modal-booking');

    // Try real Cashfree JS SDK if paymentSessionId is present
    if (data.gatewayOrder?.paymentSessionId && typeof cashfree !== 'undefined') {
      launchCashfreeSDK(data);
    } else if (data.gatewayOrder?.paymentSessionId) {
      // Load Cashfree SDK dynamically and then launch
      loadCashfreeSDKAndLaunch(data);
    } else {
      // Fallback: show simulation modal
      openPaymentGatewayModal(data);
    }

  } catch (err) {
    window.showToast('Checkout error: ' + err.message, 'error');
  }
}

function loadCashfreeSDKAndLaunch(orderData) {
  // Check if already loaded
  if (window.Cashfree) {
    launchCashfreeSDK(orderData);
    return;
  }
  const script = document.createElement('script');
  // Use sandbox SDK for TEST env, prod SDK for PROD
  script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
  script.onload = () => launchCashfreeSDK(orderData);
  script.onerror = () => {
    console.warn('Cashfree SDK failed to load, falling back to simulation');
    openPaymentGatewayModal(orderData);
  };
  document.head.appendChild(script);
}

function launchCashfreeSDK(orderData) {
  try {
    const cashfree = window.Cashfree({ mode: orderData.gatewayOrder.env || 'sandbox' });
    cashfree.checkout({
      paymentSessionId: orderData.gatewayOrder.paymentSessionId,
      redirectTarget: '_modal',
    }).then(result => {
      if (result.error) {
        window.showToast('Payment failed: ' + result.error.message, 'error');
      } else if (result.paymentDetails) {
        // Payment completed
        handlePaymentSuccess(orderData.orderId, result.paymentDetails.paymentMessage || 'cf_sdk_success');
      }
    });
  } catch (e) {
    console.warn('Cashfree SDK error, falling back:', e);
    openPaymentGatewayModal(orderData);
  }
}

function openPaymentGatewayModal(orderData) {
  const gw = orderData.gatewayOrder?.gateway || 'CASHFREE';
  document.getElementById('pg-title').textContent = gw === 'RAZORPAY' ? 'Razorpay Route Split' : 'Cashfree Easy Split';
  document.getElementById('pg-subtitle').textContent = `Order: ${orderData.gatewayOrder?.gatewayOrderId || orderData.orderId}`;
  document.getElementById('pg-amount-display').textContent = `₹${((orderData.breakdown?.totalChargedPaise || 0) / 100).toFixed(2)}`;
  document.getElementById('pg-split-platform').textContent = `+₹${((orderData.breakdown?.platformFeePaise || 0) / 100).toFixed(2)}`;
  document.getElementById('pg-split-organizer').textContent = `₹${((orderData.breakdown?.organizerNetPayoutPaise || 0) / 100).toFixed(2)}`;
  openModal('modal-payment-gateway');
}

async function confirmPaymentSimulation(isSuccess) {
  if (!isSuccess) {
    closeModal('modal-payment-gateway');
    window.showToast('Payment was cancelled or failed.', 'error');
    return;
  }
  closeModal('modal-payment-gateway');
  await handlePaymentSuccess(pendingOrder.orderId, `pay_sim_${Date.now()}`);
}

async function handlePaymentSuccess(orderId, paymentId) {
  try {
    const res = await fetch('/api/client/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        paymentId,
        sessionToken,
        tierId: pendingOrder?.tierId || selectedTier?.id,
        attendees: pendingOrder?.attendees || []
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    clearInterval(reservationTimerInterval);
    document.getElementById('reservation-alert-bar').style.display = 'none';

    window.showToast('✅ Payment captured! Your e-ticket QR codes are ready.');
    localStorage.setItem('multi_tenant_last_order', orderId);
    displayConfirmedTickets(orderId, data.tickets);

  } catch (err) {
    window.showToast('Payment verification failed: ' + err.message, 'error');
  }
}

// Display Confirmed Digital E-Ticket(s)
async function displayConfirmedTickets(orderId, ticketsFromVerify) {
  try {
    const res = await fetch(`/api/client/orders/${orderId}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const { order, tickets } = data;
    const ticket = (tickets && tickets.length > 0) ? tickets[0] : (ticketsFromVerify && ticketsFromVerify[0]);
    if (!ticket) return;

    document.getElementById('tkt-tenant-name').textContent = (order.tenant_name || '').toUpperCase();
    document.getElementById('tkt-event-title').textContent = ticket.event_title || selectedEvent?.title || '';
    document.getElementById('tkt-event-location').textContent = `📍 ${ticket.event_location || selectedEvent?.location || ''}`;
    document.getElementById('tkt-attendee-name').textContent = ticket.attendee_name;
    document.getElementById('tkt-tier-name').textContent = ticket.tier_name || selectedTier?.name || '';
    document.getElementById('tkt-id-label').textContent = ticket.id;
    document.getElementById('tkt-order-label').textContent = order.id;

    // If multiple tickets, show count badge
    if (tickets.length > 1) {
      const badge = document.getElementById('tkt-tier-name');
      if (badge) badge.textContent = `${ticket.tier_name} (1 of ${tickets.length})`;
    }

    const qrContainer = document.getElementById('tkt-qrcode-container');
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, {
      text: ticket.qr_secret_token,
      width: 170,
      height: 170,
      colorDark: '#0f172a',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });

    document.getElementById('btn-download-pdf').onclick = () => {
      window.location.href = `/api/client/tickets/${ticket.id}/pdf`;
    };

    document.getElementById('btn-send-wa').onclick = async () => {
      try {
        const waRes = await fetch(`/api/client/tickets/${ticket.id}/whatsapp`, { method: 'POST' });
        const waData = await waRes.json();
        window.showToast(waData.message || 'Ticket sent to WhatsApp!');
      } catch (e) {
        window.showToast('WhatsApp dispatch failed: ' + e.message, 'error');
      }
    };

    openModal('modal-order-success');
  } catch (err) {
    console.error('Failed to display ticket:', err);
    // Even if order fetch fails, show basic success
    openModal('modal-order-success');
  }
}

// Alias for backward compat
async function displayConfirmedTicket(orderId) {
  return displayConfirmedTickets(orderId, []);
}

function restoreSavedOrder() {
  // Available if user wants to look it up via wallet
}

// =========================================================================
// GENERAL USER (CROSS-TENANT WALLET) CONTROLLER
// =========================================================================

function openWalletModal() {
  document.getElementById('wallet-auth-step').style.display = 'block';
  document.getElementById('wallet-tickets-step').style.display = 'none';
  document.getElementById('wallet-otp-container').style.display = 'none';
  document.getElementById('btn-request-otp').style.display = 'block';
  openModal('modal-wallet');
}

async function requestWalletOtp() {
  const phone = document.getElementById('wallet-phone-input').value.trim();
  if (!phone) { window.showToast('Please enter your mobile number', 'warning'); return; }

  try {
    const res = await fetch('/api/client/user/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    document.getElementById('wallet-otp-container').style.display = 'block';
    document.getElementById('btn-request-otp').style.display = 'none';
    window.showToast(`OTP Sent! (Demo Code: ${data.simulatedOtp})`);
  } catch (err) {
    window.showToast('Error sending OTP: ' + err.message, 'error');
  }
}

async function verifyWalletOtp() {
  const phone = document.getElementById('wallet-phone-input').value.trim();
  const otp = document.getElementById('wallet-otp-input').value.trim();

  try {
    const res = await fetch('/api/client/user/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    renderWalletTickets(data.phone, data.tickets);
  } catch (err) {
    window.showToast('Verification failed: ' + err.message, 'error');
  }
}

function renderWalletTickets(phone, tickets) {
  document.getElementById('wallet-auth-step').style.display = 'none';
  document.getElementById('wallet-tickets-step').style.display = 'block';
  document.getElementById('wallet-verified-phone').textContent = phone;

  const list = document.getElementById('wallet-tickets-list');
  if (!tickets || tickets.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-dim);">No tickets found for ${escapeHtml(phone)}.</div>`;
    return;
  }

  list.innerHTML = tickets.map(t => {
    const isCheckedIn = t.checkin_count > 0;
    return `
      <div style="background:rgba(255,255,255,0.04); border:1px solid var(--border-glass); border-radius:var(--radius-md); padding:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <div>
            <span style="font-size:0.75rem; color:#818cf8; font-weight:bold; text-transform:uppercase;">${escapeHtml(t.tenant_name)}</span>
            <div style="font-weight:700; font-size:1.05rem; color:var(--text-main);">${escapeHtml(t.event_title)}</div>
          </div>
          <span class="badge ${isCheckedIn ? 'badge-green' : 'badge-purple'}">${isCheckedIn ? 'Checked In' : 'Valid Entry'}</span>
        </div>
        <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:8px;">
          Pass: <b>${escapeHtml(t.tier_name)}</b> | Attendee: <b>${escapeHtml(t.attendee_name)}</b>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:10px; border-top:1px dashed var(--border-glass);">
          <small style="color:var(--text-dim); font-size:0.75rem;">ID: ${t.id}</small>
          <div style="display:flex; gap:8px;">
            <a href="/api/client/tickets/${t.id}/pdf" class="btn btn-secondary btn-sm" style="font-size:0.75rem;">📄 PDF</a>
            <button class="btn btn-primary btn-sm" style="font-size:0.75rem;" onclick="displayConfirmedTickets('${t.order_id}', [])">QR Pass</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function logoutWallet() {
  document.getElementById('wallet-auth-step').style.display = 'block';
  document.getElementById('wallet-tickets-step').style.display = 'none';
  document.getElementById('wallet-otp-input').value = '';
}

// Modal helper
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
