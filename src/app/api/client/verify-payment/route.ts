import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { consumeReservation } from '@/lib/reservation';
import { PaymentService } from '@/lib/payment';
import { generateTicketToken } from '@/lib/crypto';
import { sendWhatsAppTicketMessage } from '@/lib/whatsapp';
import crypto from 'node:crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, paymentId, sessionToken, attendees } = body;

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    const order: any = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);
    if (!order) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });

    if (order.payment_status === 'PAID') {
      const existingTickets = db.prepare(`SELECT * FROM tickets WHERE order_id = ?`).all(orderId);
      return NextResponse.json({ success: true, orderId, tickets: existingTickets });
    }

    // Verify payment with gateway adapter
    const adapter = PaymentService.getAdapter(order.gateway_type);
    const verification = await adapter.verifyPayment({
      orderId: order.gateway_order_id || orderId,
      paymentId: paymentId || `pay_cf_live_${Date.now()}`
    });

    if (!verification.success) {
      db.prepare(`UPDATE orders SET payment_status = 'FAILED' WHERE id = ?`).run(orderId);
      return NextResponse.json({ success: false, error: verification.error || 'Payment authorization failed' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Mark PAID
    db.prepare(`UPDATE orders SET payment_status = 'PAID', gateway_payment_id = ? WHERE id = ?`)
      .run(verification.paymentId, orderId);

    // Consume active reservation for this specific tier
    if (sessionToken && body.tierId) {
      consumeReservation(sessionToken, body.tierId);
    }

    // Issue cryptographically signed QR tickets
    const attendeeList = (attendees && Array.isArray(attendees) && attendees.length > 0)
      ? attendees
      : [{ name: order.customer_name, age: 25 }];

    const generatedTickets: any[] = [];
    const insertTicket = db.prepare(`
      INSERT INTO tickets (id, order_id, tier_id, attendee_name, attendee_age, qr_secret_token, checked_in_at, checkin_count, is_override_allowed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0, ?)
    `);

    // Get the specific tier from the request
    const tierId = body.tierId;
    const bookedTier: any = tierId
      ? db.prepare(`SELECT tt.*, e.id as event_id FROM ticket_tiers tt JOIN events e ON tt.event_id = e.id WHERE tt.id = ?`).get(tierId)
      : (() => {
          const tiers: any[] = db.prepare(`SELECT tt.*, e.id as event_id FROM ticket_tiers tt JOIN events e ON tt.event_id = e.id WHERE e.tenant_id = ?`).all(order.tenant_id);
          return tiers[0] || { id: 'tier_default', event_id: 'evt_default' };
        })();

    for (let i = 0; i < attendeeList.length; i++) {
      const att = attendeeList[i];
      const targetTierId = att.tierId || tierId;
      const targetTier: any = targetTierId
        ? db.prepare(`SELECT tt.*, e.id as event_id FROM ticket_tiers tt JOIN events e ON tt.event_id = e.id WHERE tt.id = ?`).get(targetTierId) || bookedTier
        : bookedTier;

      const ticketId = `tkt_${Date.now()}_${i}_${crypto.randomBytes(3).toString('hex')}`;
      const attendeeName = att.name?.trim() || `${order.customer_name} (Guest ${i + 1})`;
      const attendeeAge = parseInt(att.age, 10) || 25;

      const token = generateTicketToken({
        ticketId,
        orderId,
        eventId: targetTier.event_id,
        attendeeName,
        tierId: targetTier.id,
        issuedAt: now
      });

      insertTicket.run(
        ticketId,
        orderId,
        targetTier.id,
        attendeeName,
        attendeeAge,
        token,
        now
      );

      generatedTickets.push({
        id: ticketId,
        order_id: orderId,
        tier_id: targetTier.id,
        tier_name: targetTier.name,
        attendee_name: attendeeName,
        attendee_age: attendeeAge,
        qr_secret_token: token
      });

      // Automatically dispatch WhatsApp ticket message with PNG image header
      sendWhatsAppTicketMessage({ ticketId, toPhone: order.customer_phone }).catch(err => {
        console.warn(`WhatsApp dispatch error for ticket ${ticketId}:`, err);
      });
    }

    return NextResponse.json({
      success: true,
      orderId,
      paymentId: verification.paymentId,
      tickets: generatedTickets
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
