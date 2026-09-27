import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getActiveReservation } from '@/lib/reservation';
import { computeSplitRules, PaymentService } from '@/lib/payment';
import { generateOrderId } from '@/lib/id';
import crypto from 'node:crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tierId,         // primary / reservation tier
      quantity,
      sessionToken,
      customerName,
      customerPhone,
      customerEmail,
      attendees       // [{ name, age, tierId? }] — each can have own tier
    } = body;

    const finalCustomerName = (customerName || 'Guest').trim();
    if (!tierId || !sessionToken || !customerPhone) {
      return NextResponse.json(
        { success: false, error: 'Tier, sessionToken, and customerPhone are required' },
        { status: 400 }
      );
    }

    // Concurrency check against the primary reservation tier
    const activeRes = await getActiveReservation(sessionToken, tierId);
    if (!activeRes) {
      return NextResponse.json({
        success: false,
        error: 'Your 10-minute reservation has expired. Please select seats again.'
      }, { status: 410 });
    }

    // Resolve attendee list (fall back to single primary if not provided)
    const attendeeList: Array<{ name: string; age: number; tierId?: string }> =
      Array.isArray(attendees) && attendees.length > 0
        ? attendees.map((a: any) => ({
            name: (a.name || finalCustomerName).trim(),
            age: parseInt(a.age, 10) || 18,
            tierId: a.tierId || tierId
          }))
        : Array.from({ length: parseInt(quantity, 10) || 1 }, () => ({
            name: finalCustomerName,
            age: 18,
            tierId
          }));

    const count = attendeeList.length;
    if (count > 10) {
      return NextResponse.json({
        success: false,
        error: 'Maximum 10 tickets allowed per booking.'
      }, { status: 400 });
    }

    // Fetch primary tier for tenant/event context
    const primaryTier: any = await db.prepare(`
      SELECT tt.*, e.id as event_id, e.title as event_title, e.tenant_id,
             t.name as tenant_name, t.default_platform_fee,
             t.is_gateway_fee_passed_to_customer, t.gateway_account_id
      FROM ticket_tiers tt
      JOIN events e ON tt.event_id = e.id
      JOIN tenants t ON e.tenant_id = t.id
      WHERE tt.id = ?
    `).get(tierId);

    if (!primaryTier) {
      return NextResponse.json({ success: false, error: 'Tier not found' }, { status: 404 });
    }

    // Calculate total base price summing each attendee's actual tier price
    const tierPriceCache: Record<string, number> = {};
    const getTierPrice = async (tId: string): Promise<number> => {
      if (tierPriceCache[tId] !== undefined) return tierPriceCache[tId];
      const t: any = await db.prepare('SELECT price_in_paise FROM ticket_tiers WHERE id = ?').get(tId);
      tierPriceCache[tId] = t ? t.price_in_paise : primaryTier.price_in_paise;
      return tierPriceCache[tId];
    };

    let basePricePaise = 0;
    for (const a of attendeeList) {
      const p = await getTierPrice(a.tierId || tierId);
      basePricePaise += p;
    }

    const settingRows: any[] = await db.prepare('SELECT key, value FROM platform_settings').all();
    const platformSettings: Record<string, string> = {};
    for (const r of settingRows) platformSettings[r.key] = r.value;

    const activeGateway = 'PAYTM';
    const breakdown = computeSplitRules({
      basePricePaise,
      ticketCount: count,
      tenantConfig: primaryTier,
      platformSettings
    });

    // Generate clean readable Booking ID (e.g. BK-7M4P9X, 9 characters)
    const orderId = generateOrderId('BK');
    const now = new Date().toISOString();

    // Check or create customer
    let generalUserId: string;
    const existingUser: any = await db
      .prepare("SELECT id FROM users WHERE phone = ? AND role = 'CUSTOMER'")
      .get(customerPhone);
    if (existingUser) {
      generalUserId = existingUser.id;
    } else {
      generalUserId = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const placeholderEmail = customerEmail || `${customerPhone}@guest.neoclare.com`;
      await db.prepare(`
        INSERT INTO users (id, tenant_id, role, name, email, phone, password_hash, created_at)
        VALUES (?, NULL, 'CUSTOMER', ?, ?, ?, 'GUEST_NO_PASSWORD', ?)
        ON CONFLICT (email) DO NOTHING
      `).run(generalUserId, finalCustomerName, placeholderEmail, customerPhone, now);
    }

    // Insert pending order with persisted attendee records
    await db.prepare(`
      INSERT INTO orders (id, tenant_id, user_id, customer_name, customer_phone, customer_email,
                          total_base_price, platform_fee, convenience_fee, total_charged,
                          payment_status, gateway_type, attendees_data, tier_id, event_title, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)
    `).run(
      orderId,
      primaryTier.tenant_id,
      generalUserId,
      finalCustomerName,
      customerPhone,
      customerEmail || null,
      breakdown.basePricePaise,
      breakdown.platformFeePaise,
      breakdown.convenienceFeePaise,
      breakdown.totalChargedPaise,
      activeGateway,
      JSON.stringify(attendeeList),
      primaryTier.id,
      primaryTier.event_title || null,
      now
    );

    // Create Paytm Payment Gateway session order
    const adapter = PaymentService.getAdapter(activeGateway);
    let gatewayOrder: any;
    try {
      const isMobile = request.headers.get('user-agent')?.toLowerCase().includes('mobile') || false;
      const origin = request.headers.get('origin') || request.headers.get('host') ? `http://${request.headers.get('host')}` : (process.env.BASE_URL || 'http://localhost:5000');
      const callbackUrl = `${origin}/api/client/paytm/callback`;

      gatewayOrder = await adapter.createOrder({
        amountPaise: breakdown.totalChargedPaise,
        currency: 'INR',
        customer: { name: finalCustomerName, phone: customerPhone, email: customerEmail },
        splitDetails: {
          tenantGatewayAccountId: primaryTier.gateway_account_id,
          platformFeePaise: breakdown.platformFeePaise,
          organizerNetPayoutPaise: breakdown.organizerNetPayoutPaise
        },
        orderId,
        eventTitle: primaryTier.event_title,
        tenantName: primaryTier.tenant_name,
        isMobile,
        callbackUrl
      });
    } catch (orderErr: any) {
      console.error('Paytm order creation error:', orderErr);
      await db.prepare(`UPDATE orders SET payment_status = 'FAILED' WHERE id = ?`).run(orderId);
      return NextResponse.json({ success: false, error: orderErr.message }, { status: 400 });
    }

    await db.prepare(`UPDATE orders SET gateway_order_id = ? WHERE id = ?`)
      .run(gatewayOrder.gatewayOrderId, orderId);

    return NextResponse.json({
      success: true,
      orderId,
      gatewayOrder,
      paytmParams: gatewayOrder.paytmParams,
      processTxnUrl: gatewayOrder.processTxnUrl,
      breakdown,
      tenantSlug: primaryTier.tenant_slug || undefined,
      resolvedAttendees: attendeeList
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
