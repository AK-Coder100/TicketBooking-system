import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

/**
 * GET /api/tenant/scanner/sample-token
 * Dev/debug only — returns a real qr_secret_token from a PAID ticket
 * so you can paste it into the scanner manual input for testing.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('eventId');

    const tickets: any[] = await db.prepare(`
      SELECT 
        t.id as ticket_id,
        t.qr_secret_token,
        t.attendee_name,
        t.checkin_count,
        o.payment_status,
        tt.name as tier_name,
        e.title as event_title,
        e.id as event_id
      FROM tickets t
      JOIN orders o ON t.order_id = o.id
      JOIN ticket_tiers tt ON t.tier_id = tt.id
      JOIN events e ON tt.event_id = e.id
      WHERE o.payment_status = 'PAID'
      ${eventId ? 'AND e.id = ?' : ''}
      ORDER BY t.created_at DESC
      LIMIT 10
    `).all(...(eventId ? [eventId] : []));

    return NextResponse.json({
      success: true,
      count: tickets.length,
      tickets: tickets.map(t => ({
        ticketId: t.ticket_id,
        eventId: t.event_id,
        eventTitle: t.event_title,
        attendeeName: t.attendee_name,
        tierName: t.tier_name,
        checkinCount: t.checkin_count,
        paymentStatus: t.payment_status,
        qrToken: t.qr_secret_token,   // ← paste this into scanner
      }))
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
