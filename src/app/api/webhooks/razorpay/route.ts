import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = body.event;
    const payload = body.payload;

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload?.payment?.entity;
      const orderId = paymentEntity?.notes?.order_id || paymentEntity?.order_id;

      if (orderId) {
        await db.prepare('UPDATE orders SET payment_status = \'PAID\', gateway_payment_id = ? WHERE id = ?')
          .run(paymentEntity.id, orderId);
      }
    }

    return NextResponse.json({ status: 'PROCESSED' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
