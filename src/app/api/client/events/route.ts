import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTierCapacity } from '@/lib/reservation';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventId = searchParams.get('id');

    if (eventId) {
      const event: any = await db.prepare(`
        SELECT e.*, t.name as tenant_name, t.slug as tenant_slug, t.fee_bearer_type, t.is_gateway_fee_passed_to_customer, t.default_platform_fee
        FROM events e
        JOIN tenants t ON e.tenant_id = t.id
        WHERE e.id = ?
      `).get(eventId);

      if (!event) return NextResponse.json({ success: false, error: 'Event not found' }, { status: 404 });

      event.sessions = await db.prepare(`SELECT * FROM event_sessions WHERE event_id = ? ORDER BY sort_order ASC, session_date ASC`).all(event.id);
      const rawTiers: any[] = await db.prepare(`
        SELECT tt.*, es.name as session_name, es.session_date, es.start_time, es.end_time, es.venue_note
        FROM ticket_tiers tt
        LEFT JOIN event_sessions es ON tt.session_id = es.id
        WHERE tt.event_id = ? 
        ORDER BY tt.price_in_paise ASC
      `).all(event.id);

      event.tiers = await Promise.all(rawTiers.map(async t => {
        const cap = await getTierCapacity(t.id);
        return {
          ...t,
          soldCount: cap.soldCount,
          activeReservedCount: cap.activeReservedCount,
          availableCount: cap.availableCount
        };
      }));

      return NextResponse.json({ success: true, event });
    }

    const events: any[] = await db.prepare(`
      SELECT e.*, t.name as tenant_name, t.slug as tenant_slug
      FROM events e
      JOIN tenants t ON e.tenant_id = t.id
      WHERE e.is_published = 1 AND t.status = 'ACTIVE'
      ORDER BY e.start_date ASC
    `).all();

    for (const ev of events) {
      ev.sessions = await db.prepare(`SELECT * FROM event_sessions WHERE event_id = ? ORDER BY sort_order ASC, session_date ASC`).all(ev.id);
      ev.tiers = await db.prepare(`
        SELECT tt.*, es.name as session_name, es.session_date, es.start_time, es.end_time, es.venue_note
        FROM ticket_tiers tt
        LEFT JOIN event_sessions es ON tt.session_id = es.id
        WHERE tt.event_id = ? 
        ORDER BY tt.price_in_paise ASC
      `).all(ev.id);
    }

    return NextResponse.json({ success: true, events });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
