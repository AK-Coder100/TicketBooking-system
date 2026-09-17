// Tenant Admin & Operations Gate Scanner Controller

let currentTenantId = 'ten_sunburn_01';
let currentEvents = [];
let currentAttendees = [];
let videoStream = null;
let cameraActive = false;
let recentScans = [];

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initTenantSelector();
  loadOrganizerData();
});

function initTabs() {
  const tabBtns = document.querySelectorAll('.nav-tabs .tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.organizer-tab-content').forEach(section => {
        section.style.display = 'none';
      });

      const activeSection = document.getElementById(`tab-${targetTab}`);
      if (activeSection) {
        activeSection.style.display = 'block';
      }

      if (targetTab === 'events') loadEvents();
      else if (targetTab === 'tiers') loadTiers();
      else if (targetTab === 'analytics') loadAnalytics();
    });
  });
}

function initTenantSelector() {
  const select = document.getElementById('tenant-select');
  currentTenantId = select.value;
  updateTenantBadge();
}

function onTenantChanged() {
  const select = document.getElementById('tenant-select');
  currentTenantId = select.value;
  updateTenantBadge();
  loadOrganizerData();
}

function updateTenantBadge() {
  const select = document.getElementById('tenant-select');
  const text = select.options[select.selectedIndex].text;
  const tenantName = text.split(' (')[0];
  const slug = text.match(/\(([^)]+)\)/)?.[1]?.replace('/', '') || 'sunburn';

  document.getElementById('active-tenant-badge').textContent = tenantName;
  const link = document.getElementById('tenant-landing-link');
  link.href = `/${slug}`;
  link.textContent = `/${slug} ↗`;
}

async function loadOrganizerData() {
  await loadEvents();
  await loadAnalytics();
  populateScannerEvents();
}

// Load Events for Current Tenant
async function loadEvents() {
  try {
    const res = await fetch(`/api/tenant/${currentTenantId}/events`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentEvents = data.events || [];
    renderEventsGrid();
    populateScannerEvents();
    populateTierEventSelect();
  } catch (err) {
    console.error('Failed to load events:', err);
  }
}

function renderEventsGrid() {
  const grid = document.getElementById('events-grid');
  if (currentEvents.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--text-dim);">No events created for this organizer yet. Click "Create New Event" above.</div>';
    return;
  }

  grid.innerHTML = currentEvents.map(e => `
    <div class="event-organizer-card">
      <img src="${e.banner_url || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800'}" alt="${escapeHtml(e.title)}" class="event-card-banner">
      <div class="event-card-body">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
          <h3 style="font-size:1.15rem; font-weight:700;">${escapeHtml(e.title)}</h3>
          <span class="badge ${e.is_published ? 'badge-green' : 'badge-yellow'}">
            ${e.is_published ? 'PUBLISHED' : 'DRAFT'}
          </span>
        </div>
        <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:6px;">
          📍 ${escapeHtml(e.location)}
        </div>
        <div style="font-size:0.82rem; color:#818cf8; margin-bottom:14px;">
          🗓️ ${new Date(e.start_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
        </div>
        <div style="margin-top:auto; padding-top:14px; border-top:1px solid var(--border-glass); display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;">
          <span style="color:var(--text-dim);">Tiers: <b>${e.tier_count || 0}</b></span>
          <span style="color:var(--text-dim);">Sold: <b style="color:#34d399;">${e.tickets_sold || 0}</b></span>
          <span style="color:var(--text-dim);">Checked In: <b style="color:#a5b4fc;">${e.checked_in_count || 0}</b></span>
        </div>
      </div>
    </div>
  `).join('');
}

function populateScannerEvents() {
  const select = document.getElementById('scanner-event-select');
  if (!select) return;
  if (currentEvents.length === 0) {
    select.innerHTML = '<option value="">No events available</option>';
    return;
  }
  select.innerHTML = currentEvents.map(e => `
    <option value="${e.id}">${escapeHtml(e.title)}</option>
  `).join('');
}

function populateTierEventSelect() {
  const select = document.getElementById('tier-event-select');
  if (!select) return;
  select.innerHTML = currentEvents.map(e => `
    <option value="${e.id}">${escapeHtml(e.title)}</option>
  `).join('');
}

// Load Ticket Tiers for Table
function loadTiers() {
  const tbody = document.getElementById('tiers-tbody');
  const allTiers = [];
  currentEvents.forEach(e => {
    if (e.tiers) {
      e.tiers.forEach(t => allTiers.push({ ...t, eventTitle: e.title }));
    }
  });

  if (allTiers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--text-dim);">No tiers configured.</td></tr>';
    return;
  }

  tbody.innerHTML = allTiers.map(t => `
    <tr>
      <td><b>${escapeHtml(t.name)}</b></td>
      <td><span style="color:#818cf8;">${escapeHtml(t.eventTitle)}</span></td>
      <td style="font-weight:700; color:#34d399;">₹${(t.price_in_paise / 100).toFixed(2)}</td>
      <td><span class="badge badge-purple">${t.valid_date || 'ALL_DAYS'}</span></td>
      <td>${t.is_unlimited ? '∞ Unlimited' : `${t.capacity || 0} seats`}</td>
      <td><small style="color:var(--text-dim);">${t.early_bird_deadline ? new Date(t.early_bird_deadline).toLocaleDateString() : 'None'}</small></td>
      <td><b>-</b></td>
    </tr>
  `).join('');
}

// =========================================================================
// OPERATIONS GATE QR SCANNER ENGINE
// =========================================================================

// Web Audio API Audio Synthesizer for instant audible feedback
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'valid') {
      // Crisp high melodic chime (Green)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } else if (type === 'duplicate') {
      // Dual warning beep (Yellow)
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(349.23, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else {
      // Low error buzz (Red)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch (e) {
    console.log('Audio not supported or blocked:', e);
  }
}

// Toggle Device Camera
async function toggleCamera() {
  const video = document.getElementById('scanner-video');
  const reticle = document.getElementById('scanner-reticle');
  const placeholder = document.getElementById('scanner-camera-placeholder');
  const btn = document.getElementById('btn-toggle-camera');

  if (cameraActive) {
    // Stop camera
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }
    video.style.display = 'none';
    reticle.style.display = 'none';
    placeholder.style.display = 'block';
    btn.textContent = 'Start Camera';
    cameraActive = false;
  } else {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      video.srcObject = videoStream;
      await video.play();
      video.style.display = 'block';
      reticle.style.display = 'block';
      placeholder.style.display = 'none';
      btn.textContent = 'Stop Camera';
      cameraActive = true;
      window.showToast('Camera stream active. Point at ticket QR code.');
    } catch (err) {
      window.showToast('Camera access denied or not available. Use manual / quick test buttons below.', 'warning');
      console.warn('getUserMedia error:', err);
    }
  }
}

// Verify QR Token
async function executeScan(qrToken) {
  const eventSelect = document.getElementById('scanner-event-select');
  const eventId = eventSelect.value;

  try {
    const res = await fetch('/api/tenant/scanner/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        qrToken: qrToken.trim(),
        eventId,
        adminId: 'gate_operator_pwa_01',
        deviceInfo: navigator.userAgent
      })
    });

    const data = await res.json();
    renderScanResult(data);
  } catch (err) {
    renderScanResult({
      status: 'INVALID',
      color: 'red',
      reason: 'Network error or server connection failed: ' + err.message
    });
  }
}

function scanManualInput() {
  const input = document.getElementById('manual-qr-input');
  const val = input.value.trim();
  if (!val) {
    window.showToast('Please enter or paste a QR code token', 'error');
    return;
  }
  executeScan(val);
}

// Render Instant Visual Status (Green / Yellow / Red)
function renderScanResult(data) {
  const container = document.getElementById('scan-result-container');
  container.className = 'scan-result-card';

  if (data.status === 'VALID' || data.color === 'green') {
    // 🟢 GREEN VALID
    playSound('valid');
    container.classList.add('scan-result-green');

    const t = data.ticket || {};
    container.innerHTML = `
      <div class="status-badge-hero" style="color:#10b981;">
        <span>✓</span>
        <span>ACCESS GRANTED (VALID)</span>
      </div>
      <div style="font-size:1.6rem; font-weight:800; color:#ffffff; margin-bottom:4px;">
        ${escapeHtml(t.attendeeName || 'Attendee')}
      </div>
      <div style="display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
        <span class="badge badge-purple">${escapeHtml(t.tierName || 'General Access')}</span>
        <span class="badge badge-green">PASS #1</span>
        <span style="font-size:0.85rem; color:var(--text-muted);">${t.attendeeAge ? t.attendeeAge + ' yrs' : ''}</span>
      </div>
      <div style="background:rgba(16,185,129,0.15); padding:12px; border-radius:var(--radius-sm); border:1px solid rgba(16,185,129,0.3); font-size:0.85rem;">
        <div><b>Checked in:</b> Just now (${new Date().toLocaleTimeString('en-IN')})</div>
        <div style="color:#a7f3d0; margin-top:2px;">Ticket ID: <code>${t.id}</code></div>
      </div>
    `;

    logRecentTerminalScan(t.attendeeName, 'VALID', 'green');
    loadAnalytics();

  } else if (data.status === 'ALREADY_SCANNED' || data.color === 'yellow') {
    // 🟡 YELLOW ALREADY SCANNED
    playSound('duplicate');
    container.classList.add('scan-result-yellow');

    const t = data.ticket || {};
    const firstCheckinTime = t.firstCheckedInAt 
      ? new Date(t.firstCheckedInAt).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' }) 
      : 'earlier';

    container.innerHTML = `
      <div class="status-badge-hero" style="color:#f59e0b;">
        <span>⚠️</span>
        <span>ALREADY SCANNED!</span>
      </div>
      <div style="font-size:1.4rem; font-weight:800; color:#ffffff; margin-bottom:4px;">
        ${escapeHtml(t.attendeeName || 'Attendee')}
      </div>
      <div style="color:#fef3c7; font-size:0.9rem; margin-bottom:14px;">
        Warning: This ticket was already verified at <b>${firstCheckinTime}</b> (Check-ins: ${t.checkinCount || 1})
      </div>
      <div style="display:flex; gap:10px; margin-bottom:16px;">
        <span class="badge badge-yellow">Duplicate Scan Detected</span>
        <span class="badge badge-purple">${escapeHtml(t.tierName || 'Tier')}</span>
      </div>
      <button class="btn btn-warning" style="width:100%; font-size:1rem;" onclick="triggerReEntryOverride('${t.id}')">
        <span>🔓</span>
        <span>Allow Re-entry (Override)</span>
      </button>
    `;

    logRecentTerminalScan(t.attendeeName, 'ALREADY_SCANNED', 'yellow');

  } else {
    // 🔴 RED INVALID / WRONG EVENT
    playSound('invalid');
    container.classList.add('scan-result-red');

    container.innerHTML = `
      <div class="status-badge-hero" style="color:#f43f5e;">
        <span>✕</span>
        <span>${data.status === 'WRONG_EVENT' ? 'WRONG EVENT!' : 'ACCESS DENIED'}</span>
      </div>
      <div style="font-size:1.1rem; font-weight:700; color:#ffffff; margin-bottom:8px;">
        ${escapeHtml(data.reason || 'Invalid or tampered ticket cryptographic signature.')}
      </div>
      <p style="font-size:0.85rem; color:#fecdd3;">
        Please direct attendee to the gate help desk for order verification.
      </p>
    `;

    logRecentTerminalScan('Unknown / Rejected', 'INVALID', 'red');
  }
}

// Trigger Re-entry manual override
async function triggerReEntryOverride(ticketId) {
  try {
    const res = await fetch('/api/tenant/scanner/override', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticketId,
        adminId: 'gate_supervisor_ops',
        reason: 'Organizer Discretion / Temporary Re-entry'
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    playSound('valid');
    const container = document.getElementById('scan-result-container');
    container.className = 'scan-result-card scan-result-green';
    container.innerHTML = `
      <div class="status-badge-hero" style="color:#10b981;">
        <span>✓</span>
        <span>RE-ENTRY APPROVED</span>
      </div>
      <div style="font-size:1.2rem; font-weight:700; color:#ffffff; margin-bottom:8px;">
        ${escapeHtml(data.message)}
      </div>
      <p style="font-size:0.85rem; color:#a7f3d0;">
        Security log recorded with supervisor authorization.
      </p>
    `;

    window.showToast('Re-entry authorized! Security audit log updated.');
    loadAnalytics();
  } catch (err) {
    window.showToast('Failed to approve override: ' + err.message, 'error');
  }
}

// Log into Terminal Ticker
function logRecentTerminalScan(name, status, color) {
  const ticker = document.getElementById('gate-terminal-recent-scans');
  const item = document.createElement('div');
  item.style.display = 'flex';
  item.style.justifyContent = 'space-between';
  item.style.alignItems = 'center';
  item.style.padding = '8px 12px';
  item.style.background = 'rgba(255,255,255,0.03)';
  item.style.borderRadius = '6px';
  item.style.fontSize = '0.82rem';

  const badgeClass = color === 'green' ? 'badge-green' : (color === 'yellow' ? 'badge-yellow' : 'badge-red');

  item.innerHTML = `
    <span><b>${escapeHtml(name)}</b></span>
    <div style="display:flex; align-items:center; gap:8px;">
      <span class="badge ${badgeClass}">${status}</span>
      <span style="color:var(--text-dim);">${new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit' })}</span>
    </div>
  `;

  ticker.prepend(item);
  if (ticker.children.length > 5) ticker.lastElementChild.remove();
}

// Quick Test Scanner Simulation (Green, Yellow, Red)
async function testScanDemo(testType) {
  if (testType === 'valid') {
    // Generate or fetch a live demo valid ticket for current event
    try {
      const res = await fetch(`/api/tenant/${currentTenantId}/analytics`);
      const data = await res.json();
      const firstTicket = data.attendees?.[0];

      if (firstTicket) {
        // Use token from demo
        executeScan(firstTicket.qr_secret_token);
      } else {
        window.showToast('No tickets found for this event. Book one from the Client Web Storefront first!', 'warning');
      }
    } catch (e) {
      console.error(e);
    }
  } else if (testType === 'duplicate') {
    // Scan previously scanned ticket to trigger YELLOW
    try {
      const res = await fetch(`/api/tenant/${currentTenantId}/analytics`);
      const data = await res.json();
      const firstTicket = data.attendees?.[0];
      if (firstTicket) {
        // Execute scan twice
        await executeScan(firstTicket.qr_secret_token);
      }
    } catch (e) {
      console.error(e);
    }
  } else if (testType === 'wrong_event') {
    // Deliberately trigger wrong event / counterfeit
    executeScan('fake_tampered_payload_xyz.signature_invalid_123');
  }
}

// Load Real-Time Analytics & Attendees
async function loadAnalytics() {
  try {
    const res = await fetch(`/api/tenant/${currentTenantId}/analytics`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const { stats, attendees, auditLogs } = data;
    currentAttendees = attendees || [];

    document.getElementById('stat-checkin-percent').textContent = `${stats.checkinPercentage}%`;
    document.getElementById('stat-checkin-count').textContent = `${stats.checkedInCount} of ${stats.totalTickets} attendees checked in`;
    document.getElementById('stat-gross-rev').textContent = `₹${parseFloat(stats.grossRevenueRupees).toLocaleString('en-IN')}`;
    document.getElementById('stat-total-tickets').textContent = stats.totalTickets;

    renderAttendeesTable(currentAttendees);
    renderAuditLogsTable(auditLogs || []);
  } catch (err) {
    console.error('Failed to load analytics:', err);
  }
}

function renderAttendeesTable(list) {
  const tbody = document.getElementById('attendees-tbody');
  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:var(--text-dim);">No attendees yet. Bookings will appear here in real time.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(a => {
    const isCheckedIn = a.checkin_count > 0;
    return `
      <tr>
        <td><code style="color:#a5b4fc; font-size:0.8rem;">${a.id}</code></td>
        <td><b>${escapeHtml(a.attendee_name)}</b></td>
        <td>${a.attendee_age}</td>
        <td><span class="badge badge-purple">${escapeHtml(a.tier_name)}</span></td>
        <td>${escapeHtml(a.event_title)}</td>
        <td><small style="color:var(--text-muted);">${a.customer_phone}</small></td>
        <td>
          <span class="badge ${isCheckedIn ? 'badge-green' : 'badge-yellow'}">
            ${isCheckedIn ? `CHECKED IN (${a.checkin_count}x)` : 'NOT ARRIVED'}
          </span>
        </td>
        <td><small style="color:var(--text-dim);">${a.checked_in_at ? new Date(a.checked_in_at).toLocaleTimeString('en-IN') : '-'}</small></td>
      </tr>
    `;
  }).join('');
}

function filterAttendees() {
  const query = document.getElementById('attendee-search-input').value.toLowerCase().trim();
  if (!query) {
    renderAttendeesTable(currentAttendees);
    return;
  }
  const filtered = currentAttendees.filter(a => 
    (a.attendee_name && a.attendee_name.toLowerCase().includes(query)) ||
    (a.customer_phone && a.customer_phone.toLowerCase().includes(query)) ||
    (a.id && a.id.toLowerCase().includes(query))
  );
  renderAttendeesTable(filtered);
}

function renderAuditLogsTable(logs) {
  const tbody = document.getElementById('audit-logs-tbody');
  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-dim);">No audit logs recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = logs.map(l => {
    let typeBadge = 'badge-purple';
    if (l.action_type === 'SCAN_ATTEMPT') typeBadge = 'badge-green';
    else if (l.action_type === 'OVERRIDE_CHECKIN') typeBadge = 'badge-yellow';
    else if (l.action_type === 'DOWNLOADED') typeBadge = 'badge-purple';
    else if (l.action_type === 'WHATSAPP_SENT') typeBadge = 'badge-green';

    return `
      <tr>
        <td><span class="badge ${typeBadge}">${l.action_type}</span></td>
        <td><b>${escapeHtml(l.attendee_name || l.ticket_id)}</b></td>
        <td><small style="color:var(--text-muted);">${escapeHtml(l.event_title || '')}</small></td>
        <td><code style="font-size:0.75rem; color:#cbd5e1;">${escapeHtml(l.metadata || '{}')}</code></td>
        <td><small style="color:var(--text-dim);">${new Date(l.created_at).toLocaleString('en-IN')}</small></td>
      </tr>
    `;
  }).join('');
}

// Modals
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function openCreateEventModal() {
  document.getElementById('ev-title').value = '';
  document.getElementById('ev-location').value = '';
  document.getElementById('ev-desc').value = '';
  openModal('modal-create-event');
}

async function submitCreateEvent() {
  const title = document.getElementById('ev-title').value.trim();
  const banner_url = document.getElementById('ev-banner').value.trim();
  const location = document.getElementById('ev-location').value.trim();
  const start_date = document.getElementById('ev-start').value;
  const end_date = document.getElementById('ev-end').value;
  const description = document.getElementById('ev-desc').value.trim();

  if (!title || !location || !start_date || !end_date) {
    window.showToast('Please fill all required fields', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/tenant/${currentTenantId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        banner_url,
        location,
        start_date: new Date(start_date).toISOString(),
        end_date: new Date(end_date).toISOString(),
        description
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    closeModal('modal-create-event');
    window.showToast('Event created successfully!');
    loadEvents();
  } catch (err) {
    window.showToast('Failed to create event: ' + err.message, 'error');
  }
}

function openCreateTierModal() {
  populateTierEventSelect();
  document.getElementById('tier-name').value = '';
  document.getElementById('tier-price').value = '';
  document.getElementById('tier-capacity').value = '150';
  document.getElementById('tier-unlimited').checked = false;
  document.getElementById('tier-valid-date').value = 'ALL_DAYS';
  openModal('modal-create-tier');
}

function toggleUnlimitedCapacity(checked) {
  document.getElementById('tier-capacity').disabled = checked;
}

async function submitCreateTier() {
  const eventId = document.getElementById('tier-event-select').value;
  const name = document.getElementById('tier-name').value.trim();
  const price_in_rupees = parseFloat(document.getElementById('tier-price').value || 0);
  const is_unlimited = document.getElementById('tier-unlimited').checked;
  const capacity = is_unlimited ? null : parseInt(document.getElementById('tier-capacity').value || 100, 10);
  const valid_date = document.getElementById('tier-valid-date').value.trim();
  const early_bird = document.getElementById('tier-early-bird').value;

  if (!name || price_in_rupees < 0) {
    window.showToast('Valid tier name and price required', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/tenant/events/${eventId}/tiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        price_in_paise: Math.round(price_in_rupees * 100),
        capacity,
        is_unlimited: is_unlimited ? 1 : 0,
        valid_date: valid_date || 'ALL_DAYS',
        early_bird_deadline: early_bird ? new Date(early_bird).toISOString() : null
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    closeModal('modal-create-tier');
    window.showToast('Ticket tier created successfully!');
    loadEvents();
    loadTiers();
  } catch (err) {
    window.showToast('Failed to create tier: ' + err.message, 'error');
  }
}

async function openProfileModal() {
  try {
    const res = await fetch(`/api/tenant/${currentTenantId}/profile`);
    const data = await res.json();
    if (data.tenant) {
      document.getElementById('prof-gateway-account').value = data.tenant.gateway_account_id || '';
      document.getElementById('prof-email').value = data.tenant.contact_email || '';
      document.getElementById('prof-phone').value = data.tenant.contact_phone || '';
    }
    openModal('modal-profile');
  } catch (e) {
    console.error(e);
  }
}

async function submitProfileSettings() {
  const gateway_account_id = document.getElementById('prof-gateway-account').value.trim();
  const contact_email = document.getElementById('prof-email').value.trim();
  const contact_phone = document.getElementById('prof-phone').value.trim();

  try {
    const res = await fetch(`/api/tenant/${currentTenantId}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gateway_account_id, contact_email, contact_phone })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    closeModal('modal-profile');
    window.showToast('Profile and payout configuration updated!');
  } catch (err) {
    window.showToast('Failed to update profile: ' + err.message, 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
