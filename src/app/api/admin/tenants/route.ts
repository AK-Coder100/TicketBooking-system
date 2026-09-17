import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    const tenants = db.prepare(`
      SELECT t.*,
        (SELECT COUNT(*) FROM events e WHERE e.tenant_id = t.id) as events_count,
        (SELECT COUNT(tk.id) FROM tickets tk JOIN orders o ON tk.order_id = o.id WHERE o.tenant_id = t.id AND o.payment_status = 'PAID') as tickets_sold,
        (SELECT COALESCE(SUM(o.total_base_price), 0) FROM orders o WHERE o.tenant_id = t.id AND o.payment_status = 'PAID') as gross_sales_paise,
        (SELECT COALESCE(SUM(o.platform_fee), 0) FROM orders o WHERE o.tenant_id = t.id AND o.payment_status = 'PAID') as platform_fees_generated_paise
      FROM tenants t
      ORDER BY t.created_at DESC
    `).all();

    return NextResponse.json({ success: true, tenants });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      slug,
      gateway_account_id,
      fee_bearer_type,
      default_platform_fee,
      is_gateway_fee_passed_to_customer,
      contact_email,
      contact_phone,
      admin_password
    } = body;

    if (!name || !slug || !contact_email || !admin_password) {
      return NextResponse.json({ success: false, error: 'Name, slug, contact email, and admin password are required.' }, { status: 400 });
    }

    const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
    const existing: any = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(cleanSlug);
    if (existing) {
      return NextResponse.json({ success: false, error: 'Slug already taken. Please choose another.' }, { status: 400 });
    }

    const tenantId = `ten_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tenants (id, slug, name, gateway_account_id, fee_bearer_type, default_platform_fee, is_gateway_fee_passed_to_customer, status, contact_email, contact_phone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
    `).run(
      tenantId,
      cleanSlug,
      name,
      gateway_account_id || `acc_${cleanSlug}_split`,
      fee_bearer_type || 'USER',
      parseInt(default_platform_fee, 10) || 200,
      is_gateway_fee_passed_to_customer != null ? (is_gateway_fee_passed_to_customer ? 1 : 0) : 1,
      contact_email.trim(),
      contact_phone || null,
      now
    );

    // Create organizer admin credentials with bcrypt
    const userId = `usr_${cleanSlug}_admin`;
    const passwordHash = bcrypt.hashSync(admin_password.trim(), 10);

    db.prepare(`
      INSERT INTO users (id, tenant_id, role, name, email, phone, password_hash, created_at)
      VALUES (?, ?, 'TENANT_ADMIN', ?, ?, ?, ?, ?)
    `).run(
      userId,
      tenantId,
      `${name} Organizer Admin`,
      contact_email.trim(),
      contact_phone || null,
      passwordHash,
      now
    );

    return NextResponse.json({ success: true, tenantId, slug: cleanSlug });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
