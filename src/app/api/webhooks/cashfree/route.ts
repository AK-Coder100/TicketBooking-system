import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateTicketToken } from '@/lib/crypto';
import { sendWhatsAppTicketMessage } from '@/lib/whatsapp';
import { generateTicketId } from '@/lib/id';
import crypto from 'node:crypto';

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get('x-webhook-signature');
    const timestamp = request.headers.get('x-webhook-timestamp');
    const bodyText = await request.text();
    let eventData: any;

    try {
      eventData = JSON.parse(bodyText);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Cashfree HMAC verification if secret configured
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    if (signature && timestamp && secretKey && !secretKey.includes('test_demo')) {
      const signatureData = `${timestamp}${bodyText}`;
      const expected = crypto.createHmac('sha256', secretKey).update(signatureData).digest('base64');
      if (expected !== signature) {
        console.warn('Cashfree webhook signature mismatch');
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
      }
    }

    const orderData = eventData?.data?.order;
    const paymentData = eventData?.data?.payment;

    if (!orderData || !orderData.order_id) {
      return NextResponse.json({ status: 'IGNORED', message: 'Missing order data' });
    }

    const orderId = orderData.order_id;
    const paymentStatus = orderData.order_status || paymentData?.payment_status;

    if (paymentStatus === 'PAID' || paymentStatus === 'SUCCESS') {
      const order: any = await db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (order && order.payment_status !== 'PAID') {
        const now = new Date().toISOString();
        const paymentId = paymentData?.cf_payment_id || `pay_cf_wh_${Date.now()}`;

        await db.prepare('UPDATE orders SET payment_status = \'PAID\', gateway_payment_id = ? WHERE id = ?')
          .run(paymentId, orderId);

        const existingTickets: any = await db.prepare('SELECT COUNT(*) as count FROM tickets WHERE order_id = ?').get(orderId);
        if (!existingTickets || parseInt(existingTickets.count || '0', 10) === 0) {
          const tenantTiers: any[] = await db.prepare('SELECT tt.*, e.id as event_id FROM ticket_tiers tt JOIN events e ON tt.event_id = e.id WHERE e.tenant_id = ?').all(order.tenant_id);
          const primaryTier = tenantTiers[0] || { id: 'tier_default', event_id: 'evt_default' };
          const ticketId = generateTicketId(orderId, 0);
          const token = generateTicketToken({
            ticketId,
            orderId,
            eventId: primaryTier.event_id,
          });

          await db.prepare(`
            INSERT INTO tickets (id, order_id, tier_id, attendee_name, attendee_age, qr_secret_token, checked_in_at, checkin_count, is_override_allowed, created_at)
            VALUES (?, ?, ?, ?, 25, ?, NULL, 0, 0, ?)
          `).run(ticketId, orderId, primaryTier.id, order.customer_name, token, now);

          sendWhatsAppTicketMessage({ ticketId, toPhone: order.customer_phone }).catch(err => {
            console.warn(`WhatsApp dispatch error from webhook for ticket ${ticketId}:`, err);
          });
        }
      }
    }

    return NextResponse.json({ status: 'PROCESSED', orderId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
