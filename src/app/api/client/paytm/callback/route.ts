import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPaytmCallback } from '@/Services/PaytmService';
import { consumeReservation } from '@/lib/reservation';
import { sendWhatsAppTicketMessage } from '@/lib/whatsapp';
import { getRequestOrigin } from '@/lib/url';
import crypto from 'node:crypto';

export async function POST(request: NextRequest) {
  try {
    let postData: Record<string, string> = {};

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        postData[key] = String(value);
      }
    } else if (contentType.includes('application/json')) {
      postData = await request.json();
    } else {
      const text = await request.text();
      const params = new URLSearchParams(text);
      for (const [key, value] of params.entries()) {
        postData[key] = value;
      }
    }

    const verification = verifyPaytmCallback(postData);
    const orderId = verification.orderId;

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Missing ORDERID in callback' }, { status: 400 });
    }

    const order: any = await db.prepare(`
      SELECT o.*, t.slug as tenant_slug, t.name as tenant_name,
             COALESCE(e.title, o.event_title, 'Event') as display_event_title,
             e.location as event_location, e.start_time as event_start_time
      FROM orders o
      JOIN tenants t ON o.tenant_id = t.id
      LEFT JOIN ticket_tiers tt ON o.tier_id = tt.id
      LEFT JOIN events e ON tt.event_id = e.id
      WHERE o.id = ?
    `).get(orderId);

    if (!order) {
      return NextResponse.json({ success: false, error: `Order ${orderId} not found` }, { status: 404 });
    }

    const tenantSlug = order.tenant_slug || 'default';
    const origin = getRequestOrigin(request);

    if (verification.isSuccess) {
      // Mark order as PAID
      await db.prepare(`
        UPDATE orders
        SET payment_status = 'PAID',
            gateway_payment_id = ?,
            gateway_type = 'PAYTM',
            payment_reference = ?
        WHERE id = ?
      `).run(verification.txnId, `paytm_${verification.txnId}`, orderId);

      // Generate tickets if not already generated
      const existingTickets = await db.prepare(`SELECT * FROM tickets WHERE order_id = ?`).all(orderId);
      if (existingTickets.length === 0) {
        let attendeesList: Array<{ name: string; age: number; tierId?: string }> = [];
        try {
          if (order.attendees_data) {
            attendeesList = JSON.parse(order.attendees_data);
          }
        } catch (e) {
          attendeesList = [{ name: order.customer_name, age: 18, tierId: order.tier_id }];
        }

        if (attendeesList.length === 0) {
          attendeesList = [{ name: order.customer_name, age: 18, tierId: order.tier_id }];
        }

        for (let i = 0; i < attendeesList.length; i++) {
          const a = attendeesList[i];
          const ticketId = `TCK-${orderId.replace('BK-', '')}-${i + 1}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
          const qrSecretToken = `TKT:${ticketId}:${orderId}:${crypto.randomBytes(8).toString('hex')}`;
          const tierToAssign = a.tierId || order.tier_id;

          await db.prepare(`
            INSERT INTO tickets (id, order_id, tier_id, attendee_name, attendee_age, qr_secret_token, created_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW())
          `).run(ticketId, orderId, tierToAssign, a.name, a.age, qrSecretToken);
        }
      }

      // Consume hold reservation
      if (order.tier_id) {
        try {
          await consumeReservation(`order_${orderId}`, order.tier_id);
        } catch (e) { }
      }

      // Send WhatsApp Ticket Pass for each attendee ticket
      const tickets: any[] = await db.prepare(`
        SELECT t.id
        FROM tickets t
        WHERE t.order_id = ?
      `).all(orderId);

      for (const t of tickets) {
        sendWhatsAppTicketMessage({
          ticketId: t.id,
          toPhone: order.customer_phone
        }).catch(err => console.warn(`WhatsApp dispatch error for ticket ${t.id}:`, err));
      }

      // Redirect back to checkout confirmation status
      const redirectUrl = `${origin}/${tenantSlug}/checkout?orderId=${encodeURIComponent(orderId)}&paymentStatus=PAID&txnId=${encodeURIComponent(verification.txnId || '')}`;
      return NextResponse.redirect(redirectUrl, { status: 303 });
    } else {
      // Payment Failed or Invalid Signature
      console.warn(`Paytm payment failed for order ${orderId}:`, verification.respMsg);
      await db.prepare(`
        UPDATE orders
        SET payment_status = 'FAILED',
            payment_reference = ?
        WHERE id = ?
      `).run(`FAILED: ${verification.respMsg || 'Paytm Verification Failed'}`, orderId);

      const redirectUrl = `${origin}/${tenantSlug}/checkout?orderId=${encodeURIComponent(orderId)}&paymentStatus=FAILED&error=${encodeURIComponent(verification.respMsg || 'Payment Failed or Cancelled')}`;
      return NextResponse.redirect(redirectUrl, { status: 303 });
    }
  } catch (err: any) {
    console.error('Paytm callback processing error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  // Support redirect / manual status check
  const orderId = request.nextUrl.searchParams.get('orderId') || request.nextUrl.searchParams.get('ORDERID');
  if (!orderId) {
    return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
  }
  const order: any = await db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  return NextResponse.json({ success: true, order });
}
