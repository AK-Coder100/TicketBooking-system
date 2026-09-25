import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { overrideCheckIn } from '@/lib/scanner';
import crypto from 'node:crypto';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ event_id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { event_id } = await params;
    if (!event_id) {
      return NextResponse.json({ success: false, error: 'Event ID required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    let tenantId = (session.role === 'SUPER_ADMIN' && searchParams.get('tenantId'))
      ? searchParams.get('tenantId')
      : (session.tenantId || searchParams.get('tenantId'));

    // Fetch event
    const event: any = await db.prepare(`SELECT * FROM events WHERE id = ?`).get(event_id);
    if (!event) {
      return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });
    }

    if (session.role !== 'SUPER_ADMIN' && tenantId && event.tenant_id !== tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized for this event' }, { status: 403 });
    }

    // Fetch sessions
    const sessions: any[] = await db.prepare(`
      SELECT * FROM event_sessions WHERE event_id = ? ORDER BY sort_order ASC, session_date ASC
    `).all(event_id);

    // Fetch tiers
    const tiers: any[] = await db.prepare(`
      SELECT * FROM ticket_tiers WHERE event_id = ? ORDER BY price_in_paise ASC
    `).all(event_id);

    // Fetch participants/tickets
    const participants: any[] = await db.prepare(`
      SELECT 
        tk.id as ticket_id,
        tk.attendee_name,
        tk.attendee_age,
        tk.qr_secret_token,
        tk.checked_in_at,
        tk.checkin_count,
        tk.is_override_allowed,
        tk.created_at as ticket_created_at,
        o.id as order_id,
        o.customer_name,
        o.customer_phone,
        o.customer_email,
        o.payment_status,
        o.payment_reference,
        o.gateway_type,
        o.gateway_payment_id,
        o.total_charged,
        o.created_at as order_created_at,
        tt.id as tier_id,
        tt.name as tier_name,
        tt.price_in_paise,
        es.id as session_id,
        es.name as session_name,
        es.session_date,
        es.start_time,
        es.end_time
      FROM tickets tk
      JOIN orders o ON tk.order_id = o.id
      JOIN ticket_tiers tt ON tk.tier_id = tt.id
      LEFT JOIN event_sessions es ON tt.session_id = es.id
      WHERE tt.event_id = ?
      ORDER BY tk.created_at DESC
    `).all(event_id);

    // Fetch audit logs for this event's tickets
    const auditLogs: any[] = await db.prepare(`
      SELECT al.*, tk.attendee_name, tt.name as tier_name
      FROM ticket_audit_logs al
      JOIN tickets tk ON al.ticket_id = tk.id
      JOIN ticket_tiers tt ON tk.tier_id = tt.id
      WHERE tt.event_id = ?
      ORDER BY al.created_at DESC
      LIMIT 50
    `).all(event_id);

    // Calculate statistics
    const totalTickets = participants.length;
    const checkedInCount = participants.filter(p => parseInt(p.checkin_count || '0', 10) > 0).length;
    const checkinPercentage = totalTickets > 0 ? Math.round((checkedInCount / totalTickets) * 100) : 0;
    const paidTickets = participants.filter(p => p.payment_status === 'PAID');
    const grossRevenuePaise = paidTickets.reduce((acc, p) => acc + (parseInt(p.price_in_paise || '0', 10)), 0);

    return NextResponse.json({
      success: true,
      event,
      sessions,
      tiers,
      participants,
      auditLogs,
      stats: {
        totalTickets,
        checkedInCount,
        notArrivedCount: totalTickets - checkedInCount,
        checkinPercentage,
        grossRevenuePaise,
        grossRevenueRupees: (grossRevenuePaise / 100).toFixed(2),
        paidCount: paidTickets.length,
        pendingCount: participants.filter(p => p.payment_status === 'PENDING').length
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ event_id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { event_id } = await params;
    const body = await request.json();
    const { action, ticketId, reason } = body;

    if (!ticketId) {
      return NextResponse.json({ success: false, error: 'Ticket ID is required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const adminName = session.name || session.email || 'Gate Supervisor';

    if (action === 'CHECKIN') {
      const ticketInfo: any = await db.prepare(`
        SELECT tk.id, tt.event_id, tt.session_id, es.name as session_name, es.session_date, es.start_time, es.end_time
        FROM tickets tk
        JOIN ticket_tiers tt ON tk.tier_id = tt.id
        LEFT JOIN event_sessions es ON tt.session_id = es.id
        WHERE tk.id = ?
      `).get(ticketId);

      // Validate session active by date & time if event has multiple sessions
      const eventSessions: any[] = await db.prepare(`
        SELECT * FROM event_sessions WHERE event_id = ? ORDER BY sort_order ASC, session_date ASC
      `).all(event_id);

      if (eventSessions && eventSessions.length > 1 && ticketInfo && ticketInfo.session_id) {
        const { getActiveSessionByTime } = await import('@/lib/session-utils');
        const activeResult = getActiveSessionByTime(eventSessions, new Date());
        const activeSession = activeResult.activeSession;

        // If the ticket session does not match the active session determined by date/time
        if (activeSession && ticketInfo.session_id !== activeSession.id) {
          return NextResponse.json({
            success: false,
            error: `Inactive Session! This pass is valid for "${ticketInfo.session_name || 'Show'}" (${ticketInfo.session_date || ''} ${ticketInfo.start_time || ''}), but the currently active show by date & time is "${activeSession.name}" (${activeSession.session_date} ${activeSession.start_time || ''}). Use Supervisor Override to admit anyway.`
          }, { status: 400 });
        }
      }

      await db.prepare(`
        UPDATE tickets 
        SET checked_in_at = ?, checkin_count = COALESCE(checkin_count, 0) + 1 
        WHERE id = ?
      `).run(now, ticketId);

      const auditId = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await db.prepare(`
        INSERT INTO ticket_audit_logs (id, ticket_id, action_type, metadata, created_at)
        VALUES (?, ?, 'MANUAL_CHECKIN', ?, ?)
      `).run(
        auditId,
        ticketId,
        JSON.stringify({ status: 'VALID', action: 'MANUAL_ORGANIZER_CHECKIN', adminName, scannedAt: now }),
        now
      );

      return NextResponse.json({ success: true, message: 'Participant admitted successfully!' });
    } else if (action === 'UNCHECK') {
      await db.prepare(`
        UPDATE tickets 
        SET checked_in_at = NULL, checkin_count = 0 
        WHERE id = ?
      `).run(ticketId);

      const auditId = `aud_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await db.prepare(`
        INSERT INTO ticket_audit_logs (id, ticket_id, action_type, metadata, created_at)
        VALUES (?, ?, 'RESET_CHECKIN', ?, ?)
      `).run(
        auditId,
        ticketId,
        JSON.stringify({ status: 'RESET', action: 'CHECKIN_REVERTED', adminName, resetAt: now }),
        now
      );

      return NextResponse.json({ success: true, message: 'Check-in status reset to not arrived.' });
    } else if (action === 'OVERRIDE') {
      const result = await overrideCheckIn({
        ticketId,
        adminId: adminName,
        reason: reason || 'Manual Organizer Approval'
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
