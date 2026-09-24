import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const ordersPaid: any[] = await db.prepare(`SELECT * FROM orders WHERE payment_status = 'PAID'`).all();
    const gmvPaise = ordersPaid.reduce((acc, o) => acc + (parseInt(o.total_base_price, 10) || 0), 0);
    const platformFeesPaise = ordersPaid.reduce((acc, o) => acc + (parseInt(o.platform_fee, 10) || 0), 0);
    const totalChargedPaise = ordersPaid.reduce((acc, o) => acc + (parseInt(o.total_charged, 10) || 0), 0);
    const convenienceFeesPaise = ordersPaid.reduce((acc, o) => acc + (parseInt(o.convenience_fee, 10) || 0), 0);

    const activeTenantsRow: any = await db.prepare(`SELECT COUNT(*) as count FROM tenants WHERE status = 'ACTIVE'`).get();
    const activeTenantsCount = parseInt(activeTenantsRow?.count || '0', 10);

    const totalTenantsRow: any = await db.prepare(`SELECT COUNT(*) as count FROM tenants`).get();
    const totalTenantsCount = parseInt(totalTenantsRow?.count || '0', 10);

    const totalTicketsRow: any = await db.prepare(`
      SELECT COUNT(t.id) as count 
      FROM tickets t 
      JOIN orders o ON t.order_id = o.id 
      WHERE o.payment_status = 'PAID'
    `).get();
    const totalTicketsSold = parseInt(totalTicketsRow?.count || '0', 10);

    const recentOrders = await db.prepare(`
      SELECT o.*, t.name as tenant_name, t.slug as tenant_slug 
      FROM orders o
      JOIN tenants t ON o.tenant_id = t.id
      ORDER BY o.created_at DESC
      LIMIT 12
    `).all();

    const pendingOrders = await db.prepare(`
      SELECT o.*, t.name as tenant_name, t.slug as tenant_slug 
      FROM orders o
      JOIN tenants t ON o.tenant_id = t.id
      WHERE o.payment_status = 'PENDING'
      ORDER BY o.created_at DESC
    `).all();

    const settingRows: any[] = await db.prepare('SELECT key, value FROM platform_settings').all();
    const settings: Record<string, string> = {};
    for (const r of settingRows) {
      settings[r.key] = r.value;
    }

    return NextResponse.json({
      success: true,
      stats: {
        gmvPaise,
        gmvRupees: (gmvPaise / 100).toFixed(2),
        platformFeesPaise,
        platformFeesRupees: (platformFeesPaise / 100).toFixed(2),
        totalChargedPaise,
        totalChargedRupees: (totalChargedPaise / 100).toFixed(2),
        convenienceFeesPaise,
        convenienceFeesRupees: (convenienceFeesPaise / 100).toFixed(2),
        activeTenantsCount,
        totalTenantsCount,
        totalTicketsSold,
        activeGateway: settings.active_gateway || 'UPI'
      },
      recentOrders,
      pendingOrders,
      settings
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
