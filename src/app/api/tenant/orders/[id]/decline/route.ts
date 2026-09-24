import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { sendWhatsAppOrderDeclinedMessage } from '@/lib/whatsapp';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role !== 'SUPER_ADMIN' && session.role !== 'TENANT_ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden: Organizer permissions required' }, { status: 403 });
    }

    const { id: orderId } = await context.params;
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    const order: any = await db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId);
    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    // Verify tenant ownership for organizers
    if (session.role === 'TENANT_ADMIN' && session.tenantId && order.tenant_id !== session.tenantId) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Order belongs to another organization' }, { status: 403 });
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
    console.error('Organizer order decline error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
