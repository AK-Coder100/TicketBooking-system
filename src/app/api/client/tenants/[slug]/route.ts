import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const tenant: any = await db.prepare(`SELECT * FROM tenants WHERE slug = ? AND status = 'ACTIVE'`).get(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: `Organizer "${slug}" not found or suspended` }, { status: 404 });
    }

    const events: any[] = await db.prepare(`
      SELECT * FROM events 
      WHERE tenant_id = ? AND is_published = 1
      ORDER BY start_date ASC
    `).all(tenant.id);

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

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        contact_email: tenant.contact_email,
        contact_phone: tenant.contact_phone,
        fee_bearer_type: tenant.fee_bearer_type,
        is_gateway_fee_passed_to_customer: tenant.is_gateway_fee_passed_to_customer
      },
      events
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
