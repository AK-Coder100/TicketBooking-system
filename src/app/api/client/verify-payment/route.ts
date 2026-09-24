import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { consumeReservation } from '@/lib/reservation';
import { sendWhatsAppOrderProcessedMessage } from '@/lib/whatsapp';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, paymentId, utr, sessionToken, attendees, tierId } = body;

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    const order: any = await db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);
    if (!order) return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });

    // If order was already approved and paid
    if (order.payment_status === 'PAID') {
      const existingTickets = await db.prepare(`SELECT * FROM tickets WHERE order_id = ?`).all(orderId);
      return NextResponse.json({ success: true, status: 'PAID', orderId, tickets: existingTickets });
    }

    // Validate 12-digit numeric UTR if user entered one
    if (utr) {
      const cleanUtr = String(utr).trim();
      if (!/^\d{12}$/.test(cleanUtr)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid 12-digit UPI UTR / Ref number. Please check your UPI transaction receipt.'
        }, { status: 400 });
      }
    }

    const cleanUtr = utr ? String(utr).trim() : null;
    const paymentRef = cleanUtr ? `utr_${cleanUtr}` : (paymentId || `upi_sub_${Date.now()}`);

    // Update order with payment reference & ensure attendees data is preserved
    const attendeePayload = attendees && Array.isArray(attendees) && attendees.length > 0
      ? JSON.stringify(attendees)
      : order.attendees_data;

    await db.prepare(`
      UPDATE orders
      SET gateway_payment_id = ?,
          attendees_data = COALESCE(attendees_data, ?)
      WHERE id = ?
    `).run(paymentRef, attendeePayload, orderId);

    // Consume hold reservation so seats are retained for this booking
    const activeTierId = tierId || order.tier_id;
    if (sessionToken && activeTierId) {
      try {
        await consumeReservation(sessionToken, activeTierId);
      } catch (resErr) {
        console.warn('Reservation consume warning:', resErr);
      }
    }

    // Send WhatsApp notification to customer: "Your ticket request has been processed"
    sendWhatsAppOrderProcessedMessage({
      orderId,
      toPhone: order.customer_phone,
      customerName: order.customer_name,
      eventTitle: order.event_title || 'Your Event',
      amount: (order.total_charged / 100).toFixed(2),
      utr: cleanUtr || undefined
    }).catch(waErr => {
      console.warn(`WhatsApp processed message error for order ${orderId}:`, waErr);
    });

    return NextResponse.json({
      success: true,
      status: 'PENDING_APPROVAL',
      orderId,
      customerPhone: order.customer_phone,
      message: 'Your ticket request has been processed. The event organizer will verify payment and dispatch your passes to WhatsApp.'
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
