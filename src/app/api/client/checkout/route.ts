import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getActiveReservation } from '@/lib/reservation';
import { computeSplitRules, PaymentService } from '@/lib/payment';
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
    const activeRes = getActiveReservation(sessionToken, tierId);
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

    // Fetch primary tier for tenant/event context
    const primaryTier: any = db.prepare(`
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
    const getTierPrice = (tId: string): number => {
      if (tierPriceCache[tId] !== undefined) return tierPriceCache[tId];
      const t: any = db.prepare('SELECT price_in_paise FROM ticket_tiers WHERE id = ?').get(tId);
      tierPriceCache[tId] = t ? t.price_in_paise : primaryTier.price_in_paise;
      return tierPriceCache[tId];
    };

    const basePricePaise = attendeeList.reduce((sum, a) => sum + getTierPrice(a.tierId || tierId), 0);

    const settingRows: any[] = db.prepare('SELECT key, value FROM platform_settings').all();
    const platformSettings: Record<string, string> = {};
    for (const r of settingRows) platformSettings[r.key] = r.value;

    const activeGateway = platformSettings.active_gateway || 'CASHFREE';
    const breakdown = computeSplitRules({
      basePricePaise,
      ticketCount: count,
      tenantConfig: primaryTier,
      platformSettings
    });

    const orderId = `ord_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    // Check or create customer
    let generalUserId: string;
    const existingUser: any = db
      .prepare("SELECT id FROM users WHERE phone = ? AND role = 'CUSTOMER'")
      .get(customerPhone);
    if (existingUser) {
      generalUserId = existingUser.id;
    } else {
      generalUserId = `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      db.prepare(`
        INSERT INTO users (id, tenant_id, role, name, email, phone, created_at)
        VALUES (?, NULL, 'CUSTOMER', ?, ?, ?, ?)
      `).run(generalUserId, finalCustomerName, customerEmail || null, customerPhone, now);
    }

    // Insert pending order
    db.prepare(`
      INSERT INTO orders (id, tenant_id, user_id, customer_name, customer_phone, customer_email,
                          total_base_price, platform_fee, convenience_fee, total_charged,
                          payment_status, gateway_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
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
      now
    );

    // Create gateway order
    const adapter = PaymentService.getAdapter(activeGateway);
    let gatewayOrder: any;
    try {
      gatewayOrder = await adapter.createOrder({
        amountPaise: breakdown.totalChargedPaise,
        currency: 'INR',
        customer: { name: customerName, phone: customerPhone, email: customerEmail },
        splitDetails: {
          tenantGatewayAccountId: primaryTier.gateway_account_id,
          platformFeePaise: breakdown.platformFeePaise,
          organizerNetPayoutPaise: breakdown.organizerNetPayoutPaise
        },
        orderId
      });
    } catch (orderErr: any) {
      db.prepare(`UPDATE orders SET payment_status = 'FAILED' WHERE id = ?`).run(orderId);
      return NextResponse.json({ success: false, error: orderErr.message }, { status: 400 });
    }

    db.prepare(`UPDATE orders SET gateway_order_id = ? WHERE id = ?`)
      .run(gatewayOrder.gatewayOrderId, orderId);

    return NextResponse.json({
      success: true,
      orderId,
      gatewayOrder,
      breakdown,
      // echo back so verify-payment can reuse
      resolvedAttendees: attendeeList
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
