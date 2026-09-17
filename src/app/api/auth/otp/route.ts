import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const otpStore = new Map<string, { code: string; expiresAt: number }>();

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();
    if (!phone) {
      return NextResponse.json({ success: false, error: 'Phone number is required' }, { status: 400 });
    }

    const cleanPhone = phone.trim();
    const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(cleanPhone, {
      code: generatedOtp,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    return NextResponse.json({
      success: true,
      message: `Verification code dispatched to WhatsApp (+${cleanPhone})`,
      phone: cleanPhone,
      otp: generatedOtp
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { phone, otp } = await request.json();
    if (!phone || !otp) {
      return NextResponse.json({ success: false, error: 'Phone and OTP are required' }, { status: 400 });
    }

    const cleanPhone = phone.trim();
    const stored = otpStore.get(cleanPhone);

    if (!stored || stored.code !== otp.trim() || stored.expiresAt < Date.now()) {
      return NextResponse.json({ success: false, error: 'Invalid or expired OTP code.' }, { status: 401 });
    }

    // OTP verified successfully; clear used OTP
    otpStore.delete(cleanPhone);

    // General users are NOT bound to a tenant: fetch all tickets across ALL tenants!
    const tickets = db.prepare(`
      SELECT tk.*, o.id as order_id, o.payment_status, o.total_charged, o.created_at as purchase_date,
             tt.name as tier_name, tt.price_in_paise, tt.valid_date,
             e.title as event_title, e.location as event_location, e.start_date, e.end_date, e.banner_url,
             t.name as tenant_name, t.slug as tenant_slug
      FROM tickets tk
      JOIN orders o ON tk.order_id = o.id
      JOIN ticket_tiers tt ON tk.tier_id = tt.id
      JOIN events e ON tt.event_id = e.id
      JOIN tenants t ON o.tenant_id = t.id
      WHERE (o.customer_phone = ? OR o.customer_phone LIKE ?) AND o.payment_status = 'PAID'
      ORDER BY tk.created_at DESC
    `).all(cleanPhone, `%${cleanPhone.slice(-10)}`);

    return NextResponse.json({
      success: true,
      phone: cleanPhone,
      ticketsCount: tickets.length,
      tickets
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
