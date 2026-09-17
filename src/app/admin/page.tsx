'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'tenants' | 'payments'>('overview');
  const [data, setData] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // New tenant modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTenant, setNewTenant] = useState({
    name: '',
    slug: '',
    gateway_account_id: '',
    default_platform_fee: 200,
    fee_bearer_type: 'USER',
    contact_email: '',
    admin_password: 'organizer123'
  });

  // Gateway config state
  const [activeGateway, setActiveGateway] = useState('CASHFREE');
  const [commissionPaise, setCommissionPaise] = useState('200');

  useEffect(() => {
    loadOverview();
    loadTenants();
  }, []);

  const loadOverview = async () => {
    try {
      const res = await fetch('/api/admin/overview');
      if (res.status === 401) {
        router.push('/admin/login');
        return;
      }
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (json.settings?.active_gateway) setActiveGateway(json.settings.active_gateway);
        if (json.settings?.default_commission_paise) setCommissionPaise(json.settings.default_commission_paise);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadTenants = async () => {
    try {
      const res = await fetch('/api/admin/tenants');
      const json = await res.json();
      if (json.success) setTenants(json.tenants);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTenant)
      });
      const json = await res.json();
      if (json.success) {
        setShowCreateModal(false);
        setNewTenant({
          name: '',
          slug: '',
          gateway_account_id: '',
          default_platform_fee: 200,
          fee_bearer_type: 'USER',
          contact_email: '',
          admin_password: 'organizer123'
        });
        loadTenants();
        loadOverview();
      } else {
        alert(json.error);
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleTenantStatus = async (id: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    await fetch(`/api/admin/tenants/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    });
    loadTenants();
  };

  const handleSaveSettings = async () => {
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        active_gateway: activeGateway,
        default_commission_paise: parseInt(commissionPaise, 10)
      })
    });
    alert('Settings updated successfully!');
    loadOverview();
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading Super Admin Executive Portal...</div>;
  }

  const stats = data?.stats || {};

  return (
    <div style={{ minHeight: 'calc(100vh - 45px)', display: 'flex', flexDirection: 'column' }}>
      {/* Portal Top Bar */}
      <div style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid var(--border-glass)', padding: '16px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #4f46e5)' }}>🛡️</div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Super Admin Executive Portal</h1>
            <span style={{ fontSize: '0.78rem', color: '#34d399' }}>● Authenticated Session Active</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>admin@platform.com</span>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>Log Out</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar Nav */}
        <aside style={{ width: 240, background: 'rgba(15, 23, 42, 0.7)', borderRight: '1px solid var(--border-glass)', padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              className={`btn btn-sm ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start' }}
              onClick={() => setActiveTab('overview')}
            >
              📊 Global Overview
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'tenants' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start' }}
              onClick={() => setActiveTab('tenants')}
            >
              🏢 Tenant Management
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'payments' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'flex-start' }}
              onClick={() => setActiveTab('payments')}
            >
              💳 Payment & Split Rules
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main style={{ flex: 1, padding: 32, maxWidth: 1200 }}>
          {activeTab === 'overview' && (
            <div>
              <h2 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Executive Platform Metrics</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>System-wide volume, developer fees, and active tenant status.</p>

              {/* Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginBottom: 32 }}>
                <div className="glass-panel" style={{ padding: 22 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>AGGREGATE GMV</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', marginTop: 4 }}>₹{parseFloat(stats.gmvRupees || 0).toLocaleString('en-IN')}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Gross ticket sales volume</div>
                </div>
                <div className="glass-panel" style={{ padding: 22 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>PLATFORM FEES COLLECTED</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#34d399', marginTop: 4 }}>₹{parseFloat(stats.platformFeesRupees || 0).toLocaleString('en-IN')}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fixed ₹2/ticket developer cut</div>
                </div>
                <div className="glass-panel" style={{ padding: 22 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>ACTIVE TENANTS</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>{stats.activeTenantsCount} / {stats.totalTenantsCount}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Independent event organizers</div>
                </div>
                <div className="glass-panel" style={{ padding: 22 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 'bold' }}>TOTAL TICKETS ISSUED</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: '#a5b4fc', marginTop: 4 }}>{stats.totalTicketsSold}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cryptographically signed passes</div>
                </div>
              </div>

              {/* Recent Orders Stream */}
              <div className="glass-panel" style={{ padding: 24 }}>
                <h3 style={{ fontSize: '1.1rem', marginBottom: 16 }}>Recent System-Wide Orders & Splits</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-dim)' }}>
                        <th style={{ padding: 10 }}>Order ID</th>
                        <th style={{ padding: 10 }}>Tenant</th>
                        <th style={{ padding: 10 }}>Customer</th>
                        <th style={{ padding: 10 }}>Base Price</th>
                        <th style={{ padding: 10 }}>Platform Fee</th>
                        <th style={{ padding: 10 }}>Total Charged</th>
                        <th style={{ padding: 10 }}>Gateway</th>
                        <th style={{ padding: 10 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.recentOrders?.map((o: any) => (
                        <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: 12 }}><code>{o.id}</code></td>
                          <td style={{ padding: 12 }}><b>{o.tenant_name}</b></td>
                          <td style={{ padding: 12 }}>{o.customer_name}</td>
                          <td style={{ padding: 12 }}>₹{(o.total_base_price / 100).toFixed(2)}</td>
                          <td style={{ padding: 12, color: '#34d399', fontWeight: 'bold' }}>+₹{(o.platform_fee / 100).toFixed(2)}</td>
                          <td style={{ padding: 12, fontWeight: 'bold' }}>₹{(o.total_charged / 100).toFixed(2)}</td>
                          <td style={{ padding: 12 }}><span className="badge badge-purple">{o.gateway_type}</span></td>
                          <td style={{ padding: 12 }}><span className="badge badge-green">{o.payment_status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tenants' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <h2 style={{ fontSize: '1.6rem' }}>Tenant Management</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Provision and configure independent event organizers.</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                  ➕ Create New Tenant
                </button>
              </div>

              <div className="glass-panel" style={{ padding: 24 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left', color: 'var(--text-dim)' }}>
                      <th style={{ padding: 10 }}>Organizer Name</th>
                      <th style={{ padding: 10 }}>Slug / Box Office</th>
                      <th style={{ padding: 10 }}>Gateway Account ID</th>
                      <th style={{ padding: 10 }}>Surcharge Rule</th>
                      <th style={{ padding: 10 }}>Platform Cut</th>
                      <th style={{ padding: 10 }}>Status</th>
                      <th style={{ padding: 10 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map(t => (
                      <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: 12 }}><b>{t.name}</b></td>
                        <td style={{ padding: 12 }}><a href={`/${t.slug}`} target="_blank" style={{ color: '#818cf8' }}>/{t.slug} ↗</a></td>
                        <td style={{ padding: 12 }}><code>{t.gateway_account_id}</code></td>
                        <td style={{ padding: 12 }}>
                          <span className={`badge ${t.fee_bearer_type === 'USER' ? 'badge-purple' : 'badge-yellow'}`}>
                            {t.fee_bearer_type === 'USER' ? 'Client Pays Surcharge' : 'Organizer Absorbs'}
                          </span>
                        </td>
                        <td style={{ padding: 12, color: '#34d399', fontWeight: 'bold' }}>₹{(t.default_platform_fee / 100).toFixed(2)}</td>
                        <td style={{ padding: 12 }}>
                          <span className={`badge ${t.status === 'ACTIVE' ? 'badge-green' : 'badge-red'}`}>{t.status}</span>
                        </td>
                        <td style={{ padding: 12 }}>
                          <button
                            className={`btn btn-sm ${t.status === 'ACTIVE' ? 'btn-danger' : 'btn-success'}`}
                            onClick={() => toggleTenantStatus(t.id, t.status)}
                          >
                            {t.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'payments' && (
            <div>
              <h2 style={{ fontSize: '1.6rem', marginBottom: 6 }}>Payment Gateway Split & Surcharge Settings</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24 }}>Switch gateway adapters and configure platform commission settlement rules.</p>

              <div className="glass-panel" style={{ padding: 28, maxWidth: 640 }}>
                <div className="form-group">
                  <label className="form-label">Active Platform Gateway</label>
                  <select className="form-control" value={activeGateway} onChange={(e) => setActiveGateway(e.target.value)}>
                    <option value="CASHFREE">Cashfree (Easy Split Marketplace - PG API v3)</option>
                    <option value="RAZORPAY">Razorpay (Route Multi-Party Split)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Default Super Admin Platform Commission per Ticket (in Paise)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={commissionPaise}
                    onChange={(e) => setCommissionPaise(e.target.value)}
                  />
                  <small style={{ color: 'var(--text-dim)', marginTop: 4 }}>200 paise = ₹2.00 fixed deduction per ticket.</small>
                </div>

                <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={handleSaveSettings}>
                  Save Gateway Rules
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Create Tenant Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Create Event Organizer Tenant</h3>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}>&times;</button>
            </div>
            <form onSubmit={handleCreateTenant}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Organizer / Brand Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Tomorrowland India"
                    value={newTenant.name}
                    onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Unique Slug (URL) *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. tomorrowland"
                    value={newTenant.slug}
                    onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Gateway Linked Account ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="acc_cf_split_123 or rzp_linked_acc"
                    value={newTenant.gateway_account_id}
                    onChange={(e) => setNewTenant({ ...newTenant, gateway_account_id: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Fee Bearer Rule</label>
                  <select
                    className="form-control"
                    value={newTenant.fee_bearer_type}
                    onChange={(e) => setNewTenant({ ...newTenant, fee_bearer_type: e.target.value })}
                  >
                    <option value="USER">Customer (Add Convenience Fee)</option>
                    <option value="ORGANIZER">Organizer (Absorb Fee in Payout)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Organizer Admin Password</label>
                  <input
                    type="password"
                    className="form-control"
                    value={newTenant.admin_password}
                    onChange={(e) => setNewTenant({ ...newTenant, admin_password: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Tenant</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
