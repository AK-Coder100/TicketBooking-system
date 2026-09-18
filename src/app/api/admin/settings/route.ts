import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      active_gateway,
      default_commission_paise,
      gateway_surcharge_percent,
      gst_on_fee_percent,
      cashfree_app_id,
      razorpay_key_id
    } = body;

    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
    `);

    if (active_gateway) await updateStmt.run('active_gateway', active_gateway, now);
    if (default_commission_paise != null) await updateStmt.run('default_commission_paise', String(default_commission_paise), now);
    if (gateway_surcharge_percent != null) await updateStmt.run('gateway_surcharge_percent', String(gateway_surcharge_percent), now);
    if (gst_on_fee_percent != null) await updateStmt.run('gst_on_fee_percent', String(gst_on_fee_percent), now);
    if (cashfree_app_id != null) await updateStmt.run('cashfree_app_id', String(cashfree_app_id), now);
    if (razorpay_key_id != null) await updateStmt.run('razorpay_key_id', String(razorpay_key_id), now);

    return NextResponse.json({ success: true, message: 'Settings saved' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
