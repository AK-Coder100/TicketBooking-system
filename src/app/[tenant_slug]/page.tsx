import Link from 'next/link';

interface Props {
  params: Promise<{ tenant_slug: string }>;
}

export default async function TenantLandingPage({ params }: Props) {
  const { tenant_slug } = await params;
  
  let tenantData: any = null;
  try {
    const res = await fetch(`${process.env.BASE_URL || 'http://localhost:5000'}/api/client/tenants/${tenant_slug}`, { cache: 'no-store' });
    const json = await res.json();
    if (json.success) tenantData = json;
  } catch (e) {
    console.error(e);
  }

  if (!tenantData) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.8rem' }}>Organizer Not Found</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>The organizer /{tenant_slug} does not exist or is suspended.</p>
        <Link href="/" className="btn btn-primary btn-sm" style={{ marginTop: 20 }}>Browse All Events</Link>
      </div>
    );
  }

  const { tenant, events } = tenantData;

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '36px 20px' }}>
      {/* Branded Banner */}
      <div className="glass-panel" style={{ padding: 36, marginBottom: 36, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #6366f1, #ec4899)' }}></div>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#818cf8', textTransform: 'uppercase' }}>OFFICIAL BOX OFFICE</span>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 800, marginTop: 4 }}>{tenant.name}</h1>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          {tenant.contact_email && <span>📧 {tenant.contact_email}</span>}
          {tenant.contact_phone && <span>📱 {tenant.contact_phone}</span>}
        </div>
      </div>

      <h2 style={{ fontSize: '1.4rem', marginBottom: 20 }}>Upcoming Events</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
        {events.map((e: any) => (
          <Link key={e.id} href={`/${tenant_slug}/checkout?eventId=${e.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="glass-panel" style={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <img src={e.banner_url || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800'} alt={e.title} style={{ height: 180, width: '100%', objectFit: 'cover' }} />
              <div style={{ padding: 22, display: 'flex', flexDirection: 'column', flex: 1 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 6 }}>{e.title}</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 12 }}>📍 {e.location}</div>
                <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="btn btn-primary btn-sm">Select Tickets</span>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
