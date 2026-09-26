import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import crypto from 'node:crypto';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    let tenantId = (session.role === 'SUPER_ADMIN' && searchParams.get('tenantId'))
      ? searchParams.get('tenantId')
      : (session.tenantId || searchParams.get('tenantId'));

    if (!tenantId && session.role === 'SUPER_ADMIN') {
      const firstTenant: any = await db.prepare('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1').get();
      tenantId = firstTenant?.id;
    }

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'No tenant context found' }, { status: 400 });
    }

    const tenantRow: any = await db.prepare('SELECT id, slug, name FROM tenants WHERE id = ?').get(tenantId);

    const events: any[] = await db.prepare(`
      SELECT e.*,
        t.slug as tenant_slug,
        t.name as tenant_name,
        (SELECT COUNT(*) FROM event_sessions es WHERE es.event_id = e.id) as session_count,
        (SELECT COUNT(tk.id) FROM tickets tk JOIN orders o ON tk.order_id = o.id JOIN ticket_tiers tt ON tk.tier_id = tt.id WHERE tt.event_id = e.id AND o.payment_status = 'PAID') as tickets_sold,
        (SELECT COUNT(tk.id) FROM tickets tk JOIN ticket_tiers tt ON tk.tier_id = tt.id WHERE tt.event_id = e.id AND tk.checkin_count > 0) as checked_in_count
      FROM events e
      LEFT JOIN tenants t ON e.tenant_id = t.id
      WHERE e.tenant_id = ?
      ORDER BY e.created_at DESC
    `).all(tenantId);

    for (const ev of events) {
      // Load sessions for this event
      const sessions: any[] = await db.prepare(`
        SELECT * FROM event_sessions WHERE event_id = ? ORDER BY sort_order ASC, session_date ASC
      `).all(ev.id);

      // Load tiers per session
      for (const sess of sessions) {
        sess.tiers = await db.prepare(`
          SELECT * FROM ticket_tiers WHERE session_id = ? ORDER BY price_in_paise ASC
        `).all(sess.id);
      }

      // Also load global (non-session) tiers for backward compat
      const globalTiers = await db.prepare(`
        SELECT * FROM ticket_tiers WHERE event_id = ? AND (session_id IS NULL OR session_id = '') ORDER BY price_in_paise ASC
      `).all(ev.id);

      ev.sessions = sessions;
      ev.tiers = globalTiers; // legacy fallback
    }

    return NextResponse.json({
      success: true,
      events,
      tenantId,
      tenantSlug: tenantRow?.slug || events[0]?.tenant_slug || '',
      tenantName: tenantRow?.name || events[0]?.tenant_name || ''
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = await request.json();
    const { title, banner_url, description, location, start_date, end_date, sessions: bodySessions } = body;

    let tenantId = (session?.role === 'SUPER_ADMIN' && body.tenantId) ? body.tenantId : (session?.tenantId || body.tenantId);
    if (!tenantId && session?.role === 'SUPER_ADMIN') {
      const firstTenant: any = await db.prepare('SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1').get();
      tenantId = firstTenant?.id;
    }
    if (!tenantId) return NextResponse.json({ success: false, error: 'No tenant context found' }, { status: 400 });

    // Profile Permission Check: Verify if user profile is permitted to create events
    if (session?.role !== 'SUPER_ADMIN' && session?.userId) {
      const userRow: any = await db.prepare('SELECT can_create_events, tenant_role FROM users WHERE id = ?').get(session.userId);
      const tenantRow: any = await db.prepare('SELECT event_creation_policy FROM tenants WHERE id = ?').get(tenantId);

      const canCreate = userRow?.can_create_events != null ? Boolean(userRow.can_create_events) : true;
      const policy = tenantRow?.event_creation_policy || 'ADMIN_ONLY';

      if (!canCreate) {
        return NextResponse.json({
          success: false,
          error: 'Permission Denied: Your profile does not have permission to create events for this organization.'
        }, { status: 403 });
      }

      if (policy === 'ADMIN_ONLY' && userRow?.tenant_role === 'STAFF') {
        return NextResponse.json({
          success: false,
          error: 'Permission Denied: Organization policy restricts event creation to Admins and Event Managers.'
        }, { status: 403 });
      }
    }

    if (!title || !location || !start_date || !end_date) {
      return NextResponse.json({ success: false, error: 'Title, location, and dates are required' }, { status: 400 });
    }

    if (!Array.isArray(bodySessions) || bodySessions.length === 0) {
      return NextResponse.json({ success: false, error: 'At least one session is required' }, { status: 400 });
    }

    // Validate each session has at least one ticket tier
    for (const s of bodySessions) {
      if (!s.name?.trim()) {
        return NextResponse.json({ success: false, error: 'Every session must have a name' }, { status: 400 });
      }
      if (!s.session_date) {
        return NextResponse.json({ success: false, error: `Session "${s.name}" is missing a date` }, { status: 400 });
      }
      const validTiers = (s.tiers || []).filter((t: any) => t.name?.trim() && t.price_in_rupees !== '');
      if (validTiers.length === 0) {
        return NextResponse.json({ success: false, error: `Session "${s.name}" must have at least one ticket type` }, { status: 400 });
      }
    }

    const eventId = `evt_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    // Insert event
    await db.prepare(`
      INSERT INTO events (id, tenant_id, title, banner_url, description, location, start_date, end_date, is_published, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      eventId,
      tenantId,
      title.trim(),
      banner_url || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=1200&q=80',
      description?.trim() || '',
      location.trim(),
      start_date,
      end_date,
      now
    );

    // Insert sessions + tiers
    const insertSession = db.prepare(`
      INSERT INTO event_sessions (id, event_id, name, session_date, start_time, end_time, venue_note, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTier = db.prepare(`
      INSERT INTO ticket_tiers (id, event_id, session_id, name, price_in_paise, capacity, is_unlimited, valid_date, early_bird_deadline, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let si = 0; si < bodySessions.length; si++) {
      const s = bodySessions[si];
      const sessionId = `sess_${Date.now()}_${si}_${crypto.randomBytes(2).toString('hex')}`;

      await insertSession.run(
        sessionId,
        eventId,
        s.name.trim(),
        s.session_date,
        s.start_time || null,
        s.end_time || null,
        s.venue_note?.trim() || null,
        si + 1,
        now
      );

      const validTiers = (s.tiers || []).filter((t: any) => t.name?.trim() && t.price_in_rupees !== '');
      for (let ti = 0; ti < validTiers.length; ti++) {
        const t = validTiers[ti];
        const tierId = `tier_${Date.now()}_${si}_${ti}_${crypto.randomBytes(2).toString('hex')}`;
        const pricePaise = Math.round(parseFloat(t.price_in_rupees) * 100);
        const isUnlimited = t.is_unlimited ? 1 : 0;
        const capacity = isUnlimited ? null : (parseInt(t.capacity, 10) || 100);

        await insertTier.run(
          tierId,
          eventId,
          sessionId,
          t.name.trim(),
          pricePaise,
          capacity,
          isUnlimited,
          s.session_date,
          t.early_bird_deadline || null,
          now
        );
      }
    }

    return NextResponse.json({ success: true, eventId });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
