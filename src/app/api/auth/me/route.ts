import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, getSession } from '@/lib/auth';

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

  const { db } = await import('@/lib/db');
  const userRow: any = db.prepare('SELECT id, name, email, role, tenant_id, tenant_role, can_create_events FROM users WHERE id = ?').get(session.userId);

  const tenantRow: any = session.tenantId ? db.prepare('SELECT id, name, slug, event_creation_policy FROM tenants WHERE id = ?').get(session.tenantId) : null;

  return NextResponse.json({
    success: true,
    user: {
      userId: session.userId,
      name: userRow?.name || session.name,
      email: userRow?.email || session.email,
      role: session.role,
      tenantId: session.tenantId,
      tenantRole: userRow?.tenant_role || session.tenantRole || 'OWNER',
      canCreateEvents: userRow?.can_create_events != null ? Boolean(userRow.can_create_events) : true,
      tenant: tenantRow
    }
  });
}
