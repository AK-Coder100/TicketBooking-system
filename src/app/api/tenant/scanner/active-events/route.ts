import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getActiveSessionByTime } from '@/lib/session-utils';

/**
 * GET /api/tenant/scanner/active-events
 *
 * Returns only events that currently have an active or upcoming gate window,
 * based on real-time clock + 2-hour pre-open / 1-hour post-close buffers.
 *
 * Events with NO sessions, or all sessions past/concluded, are excluded.
 */
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

    // Fetch all published events for this tenant
    const allEvents: any[] = await db.prepare(`
      SELECT e.id, e.title, e.location, e.start_date, e.end_date
      FROM events e
      WHERE e.tenant_id = ? AND e.is_published = 1
      ORDER BY e.start_date ASC
    `).all(tenantId);

    const now = new Date();
    const activeEvents: any[] = [];

    for (const ev of allEvents) {
      // Load sessions for this event
      const sessions: any[] = await db.prepare(`
        SELECT * FROM event_sessions WHERE event_id = ? ORDER BY sort_order ASC, session_date ASC
      `).all(ev.id);

      // Use the same session engine as the gate scanner
      const sessionResult = getActiveSessionByTime(sessions, now);

      // Only skip multi-session events where all sessions have completely concluded
      if (sessions.length > 0 && sessionResult.status === 'CONCLUDED') {
        continue; // skip — all sessions finished
      }

      ev.sessions = sessions;
      ev.activeSession = sessionResult.activeSession;
      ev.sessionStatus = sessionResult.status;   // 'LIVE_NOW' | 'UPCOMING'
      ev.sessionLabel = sessionResult.label;
      ev.sessionDescription = sessionResult.description;

      activeEvents.push(ev);
    }

    return NextResponse.json({
      success: true,
      events: activeEvents,
      total: activeEvents.length,
      checkedAt: now.toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
