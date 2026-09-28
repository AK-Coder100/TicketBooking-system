import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const order: any = await db.prepare(`
      SELECT o.*, t.name as tenant_name, t.slug as tenant_slug
      FROM orders o
      JOIN tenants t ON o.tenant_id = t.id
      WHERE o.id = ?
    `).get(id);

    if (!order) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });

    const tickets = await db.prepare(`
      SELECT tk.*, COALESCE(tt.name, 'Ticket') as tier_name, tt.valid_date,
             COALESCE(e.title, o.event_title, 'Event') as event_title,
             e.location as event_location, e.start_date, e.end_date, e.banner_url
      FROM tickets tk
      JOIN orders o ON tk.order_id = o.id
      LEFT JOIN ticket_tiers tt ON tk.tier_id = tt.id
      LEFT JOIN events e ON tt.event_id = e.id
      WHERE tk.order_id = ?
    `).all(order.id);

    return NextResponse.json({ success: true, order, tickets });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
