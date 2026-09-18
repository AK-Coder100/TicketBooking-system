import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      name,
      gateway_account_id,
      fee_bearer_type,
      default_platform_fee,
      is_gateway_fee_passed_to_customer,
      status,
      contact_email,
      contact_phone
    } = body;

    const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    if (!tenant) return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });

    await db.prepare(`
      UPDATE tenants SET
        name = COALESCE(?, name),
        gateway_account_id = COALESCE(?, gateway_account_id),
        fee_bearer_type = COALESCE(?, fee_bearer_type),
        default_platform_fee = COALESCE(?, default_platform_fee),
        is_gateway_fee_passed_to_customer = COALESCE(?, is_gateway_fee_passed_to_customer),
        status = COALESCE(?, status),
        contact_email = COALESCE(?, contact_email),
        contact_phone = COALESCE(?, contact_phone)
      WHERE id = ?
    `).run(
      name,
      gateway_account_id,
      fee_bearer_type,
      default_platform_fee != null ? parseInt(default_platform_fee, 10) : null,
      is_gateway_fee_passed_to_customer != null ? (is_gateway_fee_passed_to_customer ? 1 : 0) : null,
      status,
      contact_email,
      contact_phone,
      id
    );

    return NextResponse.json({ success: true, message: 'Tenant updated' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
