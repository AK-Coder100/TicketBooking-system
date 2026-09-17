import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const ordersPaid: any[] = db.prepare(`SELECT * FROM orders WHERE payment_status = 'PAID'`).all();
    const gmvPaise = ordersPaid.reduce((acc, o) => acc + o.total_base_price, 0);
    const platformFeesPaise = ordersPaid.reduce((acc, o) => acc + o.platform_fee, 0);
    const totalChargedPaise = ordersPaid.reduce((acc, o) => acc + o.total_charged, 0);
    const convenienceFeesPaise = ordersPaid.reduce((acc, o) => acc + o.convenience_fee, 0);

    const activeTenantsCount = (db.prepare(`SELECT COUNT(*) as count FROM tenants WHERE status = 'ACTIVE'`).get() as any)?.count || 0;
    const totalTenantsCount = (db.prepare(`SELECT COUNT(*) as count FROM tenants`).get() as any)?.count || 0;
    const totalTicketsSold = (db.prepare(`
      SELECT COUNT(t.id) as count 
      FROM tickets t 
      JOIN orders o ON t.order_id = o.id 
      WHERE o.payment_status = 'PAID'
    `).get() as any)?.count || 0;

    const recentOrders = db.prepare(`
      SELECT o.*, t.name as tenant_name, t.slug as tenant_slug 
      FROM orders o
      JOIN tenants t ON o.tenant_id = t.id
      ORDER BY o.created_at DESC
      LIMIT 12
    `).all();

    const settingRows: any[] = db.prepare('SELECT key, value FROM platform_settings').all();
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
        activeGateway: settings.active_gateway || 'CASHFREE'
      },
      recentOrders,
      settings
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
