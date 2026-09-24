import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendWhatsAppOrderDeclinedMessage } from '@/lib/whatsapp';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await context.params;

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    const order: any = await db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // Mark as DECLINED — NO deletion in database!
    await db.prepare(`UPDATE orders SET payment_status = 'DECLINED' WHERE id = ?`).run(orderId);

    // Send WhatsApp notification informing user of decline
    sendWhatsAppOrderDeclinedMessage({
      orderId,
      toPhone: order.customer_phone,
      customerName: order.customer_name,
      eventTitle: order.event_title || 'Your Event'
    }).catch(waErr => {
      console.warn(`WhatsApp decline notification error for order ${orderId}:`, waErr);
    });

    return NextResponse.json({
      success: true,
      message: `Booking request ${orderId} has been declined. Order retained in database.`,
      orderId,
      status: 'DECLINED'
    });
  } catch (err: any) {
    console.error('Admin order decline error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
