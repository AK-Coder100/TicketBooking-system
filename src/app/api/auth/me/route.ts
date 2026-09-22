import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, getSession } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
  response.cookies.delete(AUTH_COOKIE_NAME);
  return response;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, user: null }, { status: 401 });
  }

  const userRow: any = await db.prepare('SELECT id, name, email, role, tenant_id, tenant_role, can_create_events FROM users WHERE id = ?').get(session.userId);
  let effectiveTenantId = session.tenantId || userRow?.tenant_id;
  if (!effectiveTenantId && session.role === 'SUPER_ADMIN') {
    const firstTenant: any = await db.prepare('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1').get();
    effectiveTenantId = firstTenant?.id || null;
  }
  const tenantRow: any = effectiveTenantId ? await db.prepare('SELECT id, name, slug, event_creation_policy FROM tenants WHERE id = ?').get(effectiveTenantId) : null;
  const allTenants: any[] = (session.role === 'SUPER_ADMIN' || !userRow?.tenant_id) ? await db.prepare('SELECT id, name, slug FROM tenants ORDER BY created_at ASC').all() : [];

  return NextResponse.json({
    success: true,
    user: {
      userId: session.userId,
      name: userRow?.name || session.name,
      email: userRow?.email || session.email,
      role: session.role,
      tenantId: effectiveTenantId,
      tenantRole: userRow?.tenant_role || session.tenantRole || 'OWNER',
      canCreateEvents: userRow?.can_create_events != null ? Boolean(userRow.can_create_events) : true,
      tenant: tenantRow,
      allTenants
    }
  });
}
