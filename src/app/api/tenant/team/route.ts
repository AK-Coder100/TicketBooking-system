import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const tenantId = session.tenantId;
    if (!tenantId && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ success: false, error: 'No tenant context found' }, { status: 400 });
    }

    const tId = tenantId || new URL(request.url).searchParams.get('tenantId') || 'ten_sunburn_01';

    const tenant: any = db.prepare('SELECT id, name, slug, event_creation_policy FROM tenants WHERE id = ?').get(tId);

    const teamMembers: any[] = db.prepare(`
      SELECT id, name, email, phone, role, tenant_role, can_create_events, created_at
      FROM users
      WHERE tenant_id = ?
      ORDER BY created_at ASC
    `).all(tId);

    return NextResponse.json({
      success: true,
      tenant,
      teamMembers: teamMembers.map(m => ({
        ...m,
        can_create_events: m.can_create_events != null ? Boolean(m.can_create_events) : true,
        tenant_role: m.tenant_role || 'OWNER'
      }))
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'SUPER_ADMIN' && session.role !== 'TENANT_ADMIN')) {
      return NextResponse.json({ success: false, error: 'Permission Denied' }, { status: 403 });
    }

    if (session.role !== 'SUPER_ADMIN' && session.userId) {
      const userRow: any = db.prepare('SELECT tenant_role FROM users WHERE id = ?').get(session.userId);
      if (userRow?.tenant_role === 'STAFF') {
        return NextResponse.json({ success: false, error: 'Permission Denied: Gate Staff profile cannot manage team members or permissions' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { name, email, password, tenant_role, can_create_events } = body;

    const tenantId = session.tenantId || body.tenantId;
    if (!tenantId) return NextResponse.json({ success: false, error: 'Tenant context required' }, { status: 400 });

    if (!name?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json({ success: false, error: 'Name, email, and password are required' }, { status: 400 });
    }

    const existing: any = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim());
    if (existing) {
      return NextResponse.json({ success: false, error: 'A user with this email already exists' }, { status: 400 });
    }

    const userId = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const passwordHash = bcrypt.hashSync(password.trim(), 10);
    const role = 'TENANT_ADMIN'; // All tenant users use TENANT_ADMIN system role
    const tRole = tenant_role || 'EVENT_MANAGER';
    const canCreate = can_create_events != null ? (can_create_events ? 1 : 0) : (tRole === 'STAFF' ? 0 : 1);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, tenant_id, role, tenant_role, can_create_events, name, email, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, tenantId, role, tRole, canCreate, name.trim(), email.trim(), passwordHash, now);

    return NextResponse.json({ success: true, userId, message: 'Team member added successfully' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || (session.role !== 'SUPER_ADMIN' && session.role !== 'TENANT_ADMIN')) {
      return NextResponse.json({ success: false, error: 'Permission Denied' }, { status: 403 });
    }

    if (session.role !== 'SUPER_ADMIN' && session.userId) {
      const userRow: any = db.prepare('SELECT tenant_role FROM users WHERE id = ?').get(session.userId);
      if (userRow?.tenant_role === 'STAFF') {
        return NextResponse.json({ success: false, error: 'Permission Denied: Gate Staff profile cannot manage team members or permissions' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { targetUserId, tenant_role, can_create_events, event_creation_policy } = body;
    const tenantId = session.tenantId || body.tenantId;

    if (event_creation_policy && tenantId) {
      db.prepare(`UPDATE tenants SET event_creation_policy = ? WHERE id = ?`).run(event_creation_policy, tenantId);
    }

    if (targetUserId) {
      if (tenant_role) {
        db.prepare(`UPDATE users SET tenant_role = ? WHERE id = ?`).run(tenant_role, targetUserId);
      }
      if (can_create_events != null) {
        db.prepare(`UPDATE users SET can_create_events = ? WHERE id = ?`).run(can_create_events ? 1 : 0, targetUserId);
      }
    }

    return NextResponse.json({ success: true, message: 'Permissions updated successfully' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
