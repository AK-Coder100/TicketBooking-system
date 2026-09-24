import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

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

    const attendees: any[] = await db.prepare(`
      SELECT tk.*, o.id as order_id, o.customer_name, o.customer_phone, o.customer_email, o.created_at as booked_at,
             tt.name as tier_name, tt.price_in_paise, e.title as event_title, e.id as event_id
      FROM tickets tk
      JOIN orders o ON tk.order_id = o.id
      JOIN ticket_tiers tt ON tk.tier_id = tt.id
      JOIN events e ON tt.event_id = e.id
      WHERE o.tenant_id = ? AND o.payment_status = 'PAID'
      ORDER BY tk.created_at DESC
    `).all(tenantId);

    const totalTickets = attendees.length;
    const checkedInCount = attendees.filter(a => parseInt(a.checkin_count || '0', 10) > 0).length;
    const checkinPercentage = totalTickets > 0 ? Math.round((checkedInCount / totalTickets) * 100) : 0;
    const grossRevenuePaise = attendees.reduce((acc, a) => acc + (parseInt(a.price_in_paise || '0', 10)), 0);

    const auditLogs: any[] = await db.prepare(`
      SELECT al.*, tk.attendee_name, e.title as event_title
      FROM ticket_audit_logs al
      JOIN tickets tk ON al.ticket_id = tk.id
      JOIN orders o ON tk.order_id = o.id
      JOIN ticket_tiers tt ON tk.tier_id = tt.id
      JOIN events e ON tt.event_id = e.id
      WHERE o.tenant_id = ?
      ORDER BY al.created_at DESC
      LIMIT 30
    `).all(tenantId);

    const pendingOrders: any[] = await db.prepare(`
      SELECT o.*, t.name as tenant_name, t.slug as tenant_slug,
             COALESCE(e.title, o.event_title, 'General Event') as display_event_title
      FROM orders o
      JOIN tenants t ON o.tenant_id = t.id
      LEFT JOIN ticket_tiers tt ON o.tier_id = tt.id
      LEFT JOIN events e ON tt.event_id = e.id
      WHERE o.tenant_id = ? AND o.payment_status = 'PENDING'
      ORDER BY o.created_at DESC
    `).all(tenantId);

    return NextResponse.json({
      success: true,
      stats: {
        totalTickets,
        checkedInCount,
        checkinPercentage,
        grossRevenuePaise,
        grossRevenueRupees: (grossRevenuePaise / 100).toFixed(2),
        pendingRequestsCount: pendingOrders.length
      },
      attendees,
      auditLogs,
      pendingOrders
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
