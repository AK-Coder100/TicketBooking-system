// Super Admin Portal Controller

let currentTenants = [];

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadOverview();
  loadTenants();
  loadSettings();
});

function initTabs() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      const targetTab = item.getAttribute('data-tab');
      document.querySelectorAll('.admin-tab-content').forEach(section => {
        section.style.display = 'none';
      });

      const activeSection = document.getElementById(`tab-${targetTab}`);
      if (activeSection) {
        activeSection.style.display = 'block';
      }

      if (targetTab === 'overview') loadOverview();
      else if (targetTab === 'tenants') loadTenants();
      else if (targetTab === 'payments') loadSettings();
      else if (targetTab === 'orders') loadAllOrders();
    });
  });
}

// Load Global Overview
async function loadOverview() {
  try {
    const res = await fetch('/api/admin/overview');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const { stats, recentOrders, settings } = data;

    // Metrics
    document.getElementById('stat-gmv').textContent = `₹${parseFloat(stats.gmvRupees).toLocaleString('en-IN')}`;
    document.getElementById('stat-fees').textContent = `₹${parseFloat(stats.platformFeesRupees).toLocaleString('en-IN')}`;
    document.getElementById('stat-charged').textContent = `₹${parseFloat(stats.totalChargedRupees).toLocaleString('en-IN')}`;
    document.getElementById('stat-tenants').textContent = `${stats.activeTenantsCount} / ${stats.totalTenantsCount}`;

    // Recent orders table
    const tbody = document.getElementById('overview-orders-tbody');
    if (!recentOrders || recentOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-dim);">No orders placed yet.</td></tr>';
      return;
    }

    tbody.innerHTML = recentOrders.map(o => `
      <tr>
        <td><code style="color:#a5b4fc; font-size:0.82rem;">${o.id}</code></td>
        <td>
          <span style="font-weight:600;">${escapeHtml(o.tenant_name)}</span><br>
          <small style="color:var(--text-dim);">/${o.tenant_slug}</small>
        </td>
        <td>
          <div>${escapeHtml(o.customer_name)}</div>
          <small style="color:var(--text-dim);">${o.customer_phone}</small>
        </td>
        <td>₹${(o.total_base_price / 100).toFixed(2)}</td>
        <td style="color:#34d399; font-weight:600;">+₹${(o.platform_fee / 100).toFixed(2)}</td>
        <td style="color:#fbbf24;">₹${(o.convenience_fee / 100).toFixed(2)}</td>
        <td style="font-weight:700;">₹${(o.total_charged / 100).toFixed(2)}</td>
        <td><span class="badge badge-purple">${o.gateway_type}</span></td>
        <td>
          <span class="badge ${o.payment_status === 'PAID' ? 'badge-green' : 'badge-yellow'}">
            ${o.payment_status}
          </span>
        </td>
      </tr>
    `).join('');

  } catch (err) {
    console.error('Failed to load overview:', err);
    window.showToast('Failed to load platform overview: ' + err.message, 'error');
  }
}

// Load Tenants
async function loadTenants() {
  try {
    const res = await fetch('/api/admin/tenants');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    currentTenants = data.tenants;
    const tbody = document.getElementById('tenants-tbody');
    if (!currentTenants || currentTenants.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:var(--text-dim);">No tenants found. Click "Create New Tenant" above.</td></tr>';
      return;
    }

    tbody.innerHTML = currentTenants.map(t => {
      const isFeeUser = t.fee_bearer_type === 'USER';
      const statusBadge = t.status === 'ACTIVE' 
        ? '<span class="badge badge-green">ACTIVE</span>' 
        : '<span class="badge badge-red">SUSPENDED</span>';

      return `
        <tr>
          <td>
            <div style="font-weight:700; font-size:0.95rem;">${escapeHtml(t.name)}</div>
            <small style="color:var(--text-dim);">${escapeHtml(t.contact_email || 'No email')}</small>
          </td>
          <td>
            <a href="/${t.slug}" target="_blank" style="color:#818cf8; text-decoration:none; font-weight:600;">
              /${t.slug} ↗
            </a>
          </td>
          <td><code style="color:#a5b4fc; font-size:0.8rem;">${t.gateway_account_id || 'Not linked'}</code></td>
          <td>
            <span class="badge ${isFeeUser ? 'badge-purple' : 'badge-yellow'}">
              ${isFeeUser ? 'Client Pays Surcharge' : 'Organizer Absorbs'}
            </span>
          </td>
          <td style="color:#34d399; font-weight:700;">₹${(t.default_platform_fee / 100).toFixed(2)}</td>
          <td>${t.events_count || 0}</td>
          <td><b>${t.tickets_sold || 0}</b></td>
          <td>${statusBadge}</td>
          <td>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-secondary btn-sm" onclick="openEditTenantModal('${t.id}')">⚙️ Edit</button>
              <button class="btn ${t.status === 'ACTIVE' ? 'btn-danger' : 'btn-success'} btn-sm" onclick="toggleTenantStatus('${t.id}', '${t.status}')">
                ${t.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('Failed to load tenants:', err);
    window.showToast('Failed to load tenants: ' + err.message, 'error');
  }
}

// Load Master Settings
async function loadSettings() {
  try {
    const res = await fetch('/api/admin/overview');
    const data = await res.json();
    if (!data.success) return;

    const s = data.settings || {};
    if (s.active_gateway) document.getElementById('cfg-active-gateway').value = s.active_gateway;
    if (s.default_commission_paise) document.getElementById('cfg-default-commission').value = s.default_commission_paise;
    if (s.gateway_surcharge_percent) document.getElementById('cfg-surcharge-percent').value = s.gateway_surcharge_percent;
    if (s.gst_on_fee_percent) document.getElementById('cfg-gst-percent').value = s.gst_on_fee_percent;
    if (s.razorpay_master_key) document.getElementById('cfg-rzp-key').value = s.razorpay_master_key;
    if (s.cashfree_master_id) document.getElementById('cfg-cf-id').value = s.cashfree_master_id;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

// Save Payment Settings
async function savePaymentSettings() {
  try {
    const payload = {
      active_gateway: document.getElementById('cfg-active-gateway').value,
      default_commission_paise: parseInt(document.getElementById('cfg-default-commission').value, 10),
      gateway_surcharge_percent: parseFloat(document.getElementById('cfg-surcharge-percent').value),
      gst_on_fee_percent: parseFloat(document.getElementById('cfg-gst-percent').value),
      razorpay_master_key: document.getElementById('cfg-rzp-key').value,
      cashfree_master_id: document.getElementById('cfg-cf-id').value
    };

    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    window.showToast('Platform payment split & surcharge settings updated successfully!');
  } catch (err) {
    window.showToast('Error saving settings: ' + err.message, 'error');
  }
}

// Load All Orders
async function loadAllOrders() {
  try {
    const res = await fetch('/api/admin/overview');
    const data = await res.json();
    if (!data.success) return;

    const tbody = document.getElementById('all-orders-tbody');
    const orders = data.recentOrders || [];

    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:30px; color:var(--text-dim);">No orders recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = orders.map(o => `
      <tr>
        <td><code style="color:#a5b4fc; font-size:0.8rem;">${o.id}</code></td>
        <td><b>${escapeHtml(o.tenant_name)}</b></td>
        <td>${escapeHtml(o.customer_name)}</td>
        <td>${escapeHtml(o.customer_phone)}</td>
        <td>₹${(o.total_base_price / 100).toFixed(2)}</td>
        <td style="color:#34d399;">₹${(o.platform_fee / 100).toFixed(2)}</td>
        <td style="color:#fbbf24;">₹${(o.convenience_fee / 100).toFixed(2)}</td>
        <td style="font-weight:700;">₹${(o.total_charged / 100).toFixed(2)}</td>
        <td><small style="color:var(--text-muted);">${o.gateway_order_id || 'DIRECT'}</small></td>
        <td><span class="badge ${o.payment_status === 'PAID' ? 'badge-green' : 'badge-yellow'}">${o.payment_status}</span></td>
        <td><small style="color:var(--text-dim);">${new Date(o.created_at).toLocaleString('en-IN')}</small></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load all orders:', err);
  }
}

// Modal Helpers
function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

function openCreateTenantModal() {
  document.getElementById('new-tenant-name').value = '';
  document.getElementById('new-tenant-slug').value = '';
  document.getElementById('new-tenant-gateway-acc').value = '';
  document.getElementById('new-tenant-cut').value = '2';
  document.getElementById('new-tenant-bearer').value = 'USER';
  document.getElementById('new-tenant-email').value = '';
  openModal('modal-create-tenant');
}

async function submitCreateTenant() {
  const name = document.getElementById('new-tenant-name').value.trim();
  const slug = document.getElementById('new-tenant-slug').value.trim();
  const gateway_account_id = document.getElementById('new-tenant-gateway-acc').value.trim();
  const default_platform_fee = Math.round(parseFloat(document.getElementById('new-tenant-cut').value || 2) * 100);
  const fee_bearer_type = document.getElementById('new-tenant-bearer').value;
  const is_gateway_fee_passed_to_customer = fee_bearer_type === 'USER' ? 1 : 0;
  const contact_email = document.getElementById('new-tenant-email').value.trim();
  const admin_password = document.getElementById('new-tenant-pass').value.trim();

  if (!name || !slug) {
    window.showToast('Name and Slug are required fields', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        slug,
        gateway_account_id,
        default_platform_fee,
        fee_bearer_type,
        is_gateway_fee_passed_to_customer,
        contact_email,
        admin_password
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    closeModal('modal-create-tenant');
    window.showToast(`Tenant "${name}" successfully created with slug /${data.slug}!`);
    loadTenants();
  } catch (err) {
    window.showToast('Failed to create tenant: ' + err.message, 'error');
  }
}

function openEditTenantModal(tenantId) {
  const tenant = currentTenants.find(t => t.id === tenantId);
  if (!tenant) return;

  document.getElementById('edit-tenant-id').value = tenant.id;
  document.getElementById('edit-tenant-name').value = tenant.name;
  document.getElementById('edit-tenant-gateway-acc').value = tenant.gateway_account_id || '';
  document.getElementById('edit-tenant-cut').value = (tenant.default_platform_fee / 100).toFixed(2);
  document.getElementById('edit-tenant-bearer').value = tenant.fee_bearer_type || 'USER';
  document.getElementById('edit-tenant-status').value = tenant.status;

  openModal('modal-edit-tenant');
}

async function submitEditTenant() {
  const id = document.getElementById('edit-tenant-id').value;
  const name = document.getElementById('edit-tenant-name').value.trim();
  const gateway_account_id = document.getElementById('edit-tenant-gateway-acc').value.trim();
  const default_platform_fee = Math.round(parseFloat(document.getElementById('edit-tenant-cut').value || 2) * 100);
  const fee_bearer_type = document.getElementById('edit-tenant-bearer').value;
  const is_gateway_fee_passed_to_customer = fee_bearer_type === 'USER' ? 1 : 0;
  const status = document.getElementById('edit-tenant-status').value;

  try {
    const res = await fetch(`/api/admin/tenants/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        gateway_account_id,
        default_platform_fee,
        fee_bearer_type,
        is_gateway_fee_passed_to_customer,
        status
      })
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    closeModal('modal-edit-tenant');
    window.showToast('Tenant configuration updated successfully!');
    loadTenants();
  } catch (err) {
    window.showToast('Failed to update tenant: ' + err.message, 'error');
  }
}

async function toggleTenantStatus(id, currentStatus) {
  const newStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  if (!confirm(`Are you sure you want to change this tenant status to ${newStatus}?`)) return;

  try {
    const res = await fetch(`/api/admin/tenants/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    window.showToast(`Tenant status updated to ${newStatus}`);
    loadTenants();
  } catch (err) {
    window.showToast('Failed to update status: ' + err.message, 'error');
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
