'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SuperAdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'tenants' | 'payments' | 'pending'>('overview');
  const [data, setData] = useState<any>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
  const [activeGateway, setActiveGateway] = useState('UPI');
  const [commissionPaise, setCommissionPaise] = useState('200');
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

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
        setPendingOrders(json.pendingOrders || []);
        if (json.settings?.active_gateway) setActiveGateway(json.settings.active_gateway);
        if (json.settings?.default_commission_paise) setCommissionPaise(json.settings.default_commission_paise);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const [orderActionModal, setOrderActionModal] = useState<{
    orderId: string;
    customerName: string;
    customerPhone: string;
    amountFormatted: string;
    eventTitle?: string;
    tenantName?: string;
    type: 'CONFIRM' | 'DECLINE';
  } | null>(null);

  const executeOrderAction = async () => {
    if (!orderActionModal) return;
    const { orderId, type } = orderActionModal;
    setActionLoadingId(orderId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const endpoint = type === 'CONFIRM'
        ? `/api/admin/orders/${orderId}/confirm`
        : `/api/admin/orders/${orderId}/decline`;

      const res = await fetch(endpoint, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setSuccessMsg(json.message || (type === 'CONFIRM'
          ? 'Payment confirmed and passes sent to WhatsApp!'
          : 'Booking request declined. Order retained in database.'));
        setOrderActionModal(null);
        await loadOverview();
      } else {
        setErrorMsg(json.error || `Failed to ${type.toLowerCase()} order`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error processing order');
    } finally {
      setActionLoadingId(null);
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
        setSuccessMsg(`Organization '${newTenant.name}' created successfully!`);
      } else {
        setErrorMsg(json.error || 'Failed to create organization');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating organization');
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
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_gateway: activeGateway,
          default_commission_paise: parseInt(commissionPaise, 10)
        })
      });
      if (res.ok) {
        setSuccessMsg('Platform settings updated successfully!');
        loadOverview();
      } else {
        setErrorMsg('Failed to save settings');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving settings');
    }
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

      {/* Glassmorphic Toast Notifications */}
      {errorMsg && (
        <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.4)', borderRadius: 10, margin: '14px 28px 0', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: '#fca5a5' }}>
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '1.1rem' }}>&times;</button>
        </div>
      )}

      {successMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.4)', borderRadius: 10, margin: '14px 28px 0', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: '#6ee7b7' }}>
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', color: '#6ee7b7', cursor: 'pointer', fontSize: '1.1rem' }}>&times;</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar Nav */}
        <aside style={{ width: 240, background: 'rgba(15, 23, 42, 0.7)', borderRight: '1px solid var(--border-glass)', padding: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              className={`btn btn-sm ${activeTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}
              onClick={() => setActiveTab('pending')}
            >
              <span>🔔 Pending Bookings</span>
              {pendingOrders.length > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  borderRadius: 12,
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 800
                }}>
                  {pendingOrders.length}
                </span>
              )}
            </button>
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
              {pendingOrders.length > 0 && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: 12,
                  padding: '14px 18px',
                  marginBottom: 24,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.4rem' }}>🔔</span>
                    <div>
                      <b style={{ color: '#fca5a5', fontSize: '0.95rem' }}>
                        {pendingOrders.length} Pending Booking Request{pendingOrders.length > 1 ? 's' : ''} Awaiting Payment Verification
                      </b>
                      <div style={{ color: '#cbd5e1', fontSize: '0.8rem' }}>
                        Attendees have completed UPI checkout and are waiting for payment verification.
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ background: '#ef4444', borderColor: '#ef4444' }}
                    onClick={() => setActiveTab('pending')}
                  >
                    Review Requests →
                  </button>
                </div>
              )}

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
                        <th style={{ padding: 10 }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.recentOrders?.map((o: any) => (
                        <tr key={o.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: 12 }}><code>{o.id}</code></td>
                          <td style={{ padding: 12 }}><b>{o.tenant_name}</b></td>
                          <td style={{ padding: 12 }}>
                            <div>{o.customer_name}</div>
                            {o.customer_phone && <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{o.customer_phone}</div>}
                          </td>
                          <td style={{ padding: 12 }}>₹{(o.total_base_price / 100).toFixed(2)}</td>
                          <td style={{ padding: 12, color: '#34d399', fontWeight: 'bold' }}>+₹{(o.platform_fee / 100).toFixed(2)}</td>
                          <td style={{ padding: 12, fontWeight: 'bold' }}>₹{(o.total_charged / 100).toFixed(2)}</td>
                          <td style={{ padding: 12 }}><span className="badge badge-purple">{o.gateway_type}</span></td>
                          <td style={{ padding: 12 }}>
                            {o.payment_status === 'PAID' && <span className="badge badge-green">PAID</span>}
                            {o.payment_status === 'PENDING' && <span className="badge badge-yellow">PENDING</span>}
                            {o.payment_status === 'DECLINED' && <span className="badge badge-red">DECLINED</span>}
                            {o.payment_status === 'FAILED' && <span className="badge badge-red">FAILED</span>}
                          </td>
                          <td style={{ padding: 12 }}>
                            {o.payment_status === 'PENDING' ? (
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  className="btn btn-success btn-sm"
                                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                                  disabled={actionLoadingId === o.id}
                                  onClick={() => setOrderActionModal({
                                    orderId: o.id,
                                    customerName: o.customer_name,
                                    customerPhone: o.customer_phone,
                                    amountFormatted: `₹${(o.total_charged / 100).toFixed(2)}`,
                                    eventTitle: o.event_title,
                                    tenantName: o.tenant_name,
                                    type: 'CONFIRM'
                                  })}
                                >
                                  Confirm
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                                  disabled={actionLoadingId === o.id}
                                  onClick={() => setOrderActionModal({
                                    orderId: o.id,
                                    customerName: o.customer_name,
                                    customerPhone: o.customer_phone,
                                    amountFormatted: `₹${(o.total_charged / 100).toFixed(2)}`,
                                    eventTitle: o.event_title,
                                    tenantName: o.tenant_name,
                                    type: 'DECLINE'
                                  })}
                                >
                                  Decline
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pending' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <h2 style={{ fontSize: '1.6rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span>Pending Booking Requests</span>
                    <span className="badge badge-yellow">{pendingOrders.length} Waiting</span>
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    Verify bank/UPI statement against submitted UTR numbers. Approve to generate passes and WhatsApp them to attendees, or decline without deleting from the database.
                  </p>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={loadOverview}>
                  🔄 Refresh Requests
                </button>
              </div>

              {pendingOrders.length === 0 ? (
                <div className="glass-panel" style={{ padding: 48, textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎉</div>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: 6 }}>All Caught Up!</h3>
                  <p style={{ color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto' }}>
                    There are no pending ticket booking requests awaiting payment confirmation. When attendees complete their UPI checkout, their requests will appear here instantly.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {pendingOrders.map((order: any) => {
                    let attendees: any[] = [];
                    try {
                      if (order.attendees_data) {
                        attendees = JSON.parse(order.attendees_data);
                      }
                    } catch (e) {}

                    return (
                      <div
                        key={order.id}
                        className="glass-panel"
                        style={{
                          padding: 24,
                          border: '1px solid rgba(245, 158, 11, 0.35)',
                          background: 'rgba(30, 41, 59, 0.85)'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 16 }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                              <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc' }}>
                                Booking #{order.id}
                              </span>
                              <span className="badge badge-yellow">Awaiting Confirmation</span>
                              <span className="badge badge-purple">{order.gateway_type || 'UPI'}</span>
                            </div>
                            <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                              Event: <b style={{ color: '#f8fafc' }}>{order.event_title || 'General Event'}</b> • Organizer: <b style={{ color: '#818cf8' }}>{order.tenant_name}</b>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: 2 }}>
                              Submitted on: {new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                            </div>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount to Verify</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#34d399' }}>
                              ₹{(order.total_charged / 100).toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              Base: ₹{(order.total_base_price / 100).toFixed(2)} + Fee: ₹{(order.platform_fee / 100).toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Customer & Payment Reference Highlights */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, padding: '16px', background: 'rgba(15, 23, 42, 0.65)', borderRadius: 10, marginBottom: 16 }}>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                              Customer Information
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{order.customer_name}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>📱 {order.customer_phone || 'No phone'}</span>
                              {order.customer_phone && (
                                <a
                                  href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="badge badge-green"
                                  style={{ textDecoration: 'none', cursor: 'pointer', fontSize: '0.7rem' }}
                                >
                                  Open WhatsApp ↗
                                </a>
                              )}
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                              UPI Parameters (<span style={{ color: '#38bdf8' }}>tr</span> &amp; <span style={{ color: '#fbbf24' }}>tn</span>)
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace', fontWeight: 800, fontSize: '0.68rem' }}>tr</span>
                                <code style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace' }}>{order.id}</code>
                              </div>
                              <div style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '1px 5px', borderRadius: 4, fontFamily: 'monospace', fontWeight: 800, fontSize: '0.68rem' }}>tn</span>
                                <code style={{ color: '#fbbf24', fontWeight: 700, fontFamily: 'monospace', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`Booking ${order.id}${order.event_title ? ` - ${order.event_title}` : ''}`}>
                                  Booking {order.id}{order.event_title ? ` - ${order.event_title}` : ''}
                                </code>
                              </div>
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                              Submitted UTR / Transaction Reference
                            </div>
                            <div style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              fontSize: '0.95rem',
                              color: '#34d399',
                              background: 'rgba(16, 185, 129, 0.12)',
                              border: '1px solid rgba(16, 185, 129, 0.25)',
                              padding: '6px 12px',
                              borderRadius: 6,
                              display: 'inline-block'
                            }}>
                              {order.gateway_payment_id || order.payment_reference || 'Self-reported by customer'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: 4 }}>
                              Check your bank statement or UPI app notification for this reference.
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                              Attendee Passes ({attendees.length || 1})
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                              {attendees.length > 0 ? (
                                attendees.map((a: any, i: number) => (
                                  <div key={i} style={{ marginBottom: 2 }}>
                                    • {a.name || a.full_name || order.customer_name} {a.phone ? `(${a.phone})` : ''}
                                  </div>
                                ))
                              ) : (
                                <div>• {order.customer_name} (Primary Guest)</div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border-glass)' }}>
                          <button
                            className="btn btn-danger btn-sm"
                            disabled={actionLoadingId === order.id}
                            onClick={() => setOrderActionModal({
                              orderId: order.id,
                              customerName: order.customer_name,
                              customerPhone: order.customer_phone,
                              amountFormatted: `₹${(order.total_charged / 100).toFixed(2)}`,
                              eventTitle: order.event_title,
                              tenantName: order.tenant_name,
                              type: 'DECLINE'
                            })}
                            style={{ minWidth: 120 }}
                          >
                            ❌ Decline Request
                          </button>
                          <button
                            className="btn btn-success btn-sm"
                            disabled={actionLoadingId === order.id}
                            onClick={() => setOrderActionModal({
                              orderId: order.id,
                              customerName: order.customer_name,
                              customerPhone: order.customer_phone,
                              amountFormatted: `₹${(order.total_charged / 100).toFixed(2)}`,
                              eventTitle: order.event_title,
                              tenantName: order.tenant_name,
                              type: 'CONFIRM'
                            })}
                            style={{ minWidth: 200, fontWeight: 700 }}
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
                  <label className="form-label">Active Platform Payment Mode</label>
                  <select className="form-control" value={activeGateway} onChange={(e) => setActiveGateway(e.target.value)}>
                    <option value="UPI">Direct UPI Service (Zero Gateway Fee / Instant Settlement via UpiService)</option>
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

      {/* Order Confirmation / Decline Dialog Modal */}
      {orderActionModal && (
        <div className="modal-backdrop" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16
        }}>
          <div style={{
            background: 'var(--bg-surface)',
            border: `1px solid ${orderActionModal.type === 'CONFIRM' ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)'}`,
            borderRadius: 20,
            maxWidth: 480,
            width: '100%',
            padding: 24,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
            boxSizing: 'border-box'
          }}>
            {/* Header */}
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
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
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

            {/* Details Box */}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#94a3b8' }}>Event:</span>
                  <span style={{ color: '#e2e8f0', textAlign: 'right' }}>{orderActionModal.eventTitle}</span>
                </div>
              )}
              {orderActionModal.tenantName && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Organizer:</span>
                  <span style={{ color: '#818cf8', fontWeight: 600 }}>{orderActionModal.tenantName}</span>
                </div>
              )}
            </div>

            <p style={{ fontSize: '0.82rem', color: '#94a3b8', marginBottom: 20, lineHeight: 1.5 }}>
              {orderActionModal.type === 'CONFIRM'
                ? 'Have you verified this transaction in your bank or UPI statement? Confirming will mark the order as PAID, generate official QR passes in the database, and send them directly to the user on WhatsApp.'
                : 'Are you sure you want to decline this booking request? The order will be marked as DECLINED without deletion, and a WhatsApp notification will be sent informing the attendee.'}
            </p>

            {/* Footer Buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setOrderActionModal(null)}
                disabled={actionLoadingId === orderActionModal.orderId}
                style={{ padding: '9px 18px', fontSize: '0.84rem' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={orderActionModal.type === 'CONFIRM' ? 'btn btn-success btn-sm' : 'btn btn-danger btn-sm'}
                onClick={executeOrderAction}
                disabled={actionLoadingId === orderActionModal.orderId}
                style={{ padding: '9px 20px', fontSize: '0.84rem', fontWeight: 700 }}
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
    </div>
  );
}
