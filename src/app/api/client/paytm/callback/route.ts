import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPaytmCallback, checkPaytmStatus } from '@/Services/PaytmService';
import { consumeReservation } from '@/lib/reservation';
import { sendWhatsAppTicketMessage, sendWhatsAppOrganizerPaymentNotification } from '@/lib/whatsapp';
import { getRequestOrigin } from '@/lib/url';
import crypto from 'node:crypto';

async function handlePaytmCallbackData(request: NextRequest, isGetMethod = false) {
  let postData: Record<string, any> = {};

  if (!isGetMethod) {
    try {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        postData[key] = String(value);
      }
    } catch (formErr) {
      try {
        const text = await request.text();
        if (text) {
          const params = new URLSearchParams(text);
          for (const [key, value] of params.entries()) {
            postData[key] = value;
          }
        }
      } catch (textErr) {
        try {
          const json = await request.json();
          if (json && typeof json === 'object') {
            postData = json;
          }
        } catch (jsonErr) { }
      }
    }
  }

  // Only merge query params if postData is completely empty
  if (Object.keys(postData).length === 0) {
    request.nextUrl.searchParams.forEach((val, key) => {
      postData[key] = val;
    });
  }

  const origin = getRequestOrigin(request);
  const verification = verifyPaytmCallback(postData);

  const orderId = String(
    verification.orderId ||
    postData.ORDERID ||
    postData.orderId ||
    postData.ORDER_ID ||
    postData.order_id ||
    request.nextUrl.searchParams.get('ORDERID') ||
    request.nextUrl.searchParams.get('orderId') ||
    ''
  ).trim();

  if (!orderId) {
    console.warn('Paytm callback received with no ORDERID. Payload:', postData);
    // If browser accessed callback directly with no params, redirect to home
    return NextResponse.redirect(`${origin}/`, { status: 303 });
  }

  const order: any = await db.prepare(`
    SELECT o.*, t.slug as tenant_slug, t.name as tenant_name,
           COALESCE(e.title, o.event_title, 'Event') as display_event_title,
           e.location as event_location, e.start_date, e.end_date
    FROM orders o
    JOIN tenants t ON o.tenant_id = t.id
    LEFT JOIN ticket_tiers tt ON o.tier_id = tt.id
    LEFT JOIN events e ON tt.event_id = e.id
    WHERE o.id = ?
  `).get(orderId);

  if (!order) {
    return NextResponse.redirect(`${origin}/?error=OrderNotFound`, { status: 303 });
  }

  const tenantSlug = order.tenant_slug || 'default';

  // If order is already PAID, immediately redirect to checkout confirmation
  if (order.payment_status === 'PAID') {
    const redirectUrl = `${origin}/${tenantSlug}/checkout?orderId=${encodeURIComponent(orderId)}&paymentStatus=PAID&txnId=${encodeURIComponent(order.gateway_payment_id || '')}`;
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  // Determine success from callback verification or query Paytm Status API directly as authoritative backup
  let isSuccessful = verification.isSuccess;
  let finalTxnId = verification.txnId || postData.TXNID || postData.txnId || '';
  // Track whether Paytm gave us a definitive failure answer (vs. inconclusive/network error)
  let isDefinitiveFailure = false;

  if (!isSuccessful) {
    try {
      const statusCheck = await checkPaytmStatus(orderId);
      if (statusCheck.success) {
        isSuccessful = true;
        finalTxnId = statusCheck.txnId || finalTxnId;
      } else if (statusCheck.status && statusCheck.status !== 'UNKNOWN') {
        // Paytm gave a definitive failure status (e.g. TXN_FAILURE, PENDING)
        // Only mark FAILED if Paytm explicitly reports failure — not on UNKNOWN/network errors
        const definitivelyFailed = ['TXN_FAILURE', 'FAILED', 'CANCELLED', 'FRAUD'].includes(statusCheck.status?.toUpperCase());
        isDefinitiveFailure = definitivelyFailed;
      }
      // If statusCheck.status === 'UNKNOWN' or similar, isDefinitiveFailure stays false
      // so we leave the order PENDING for later reconciliation
    } catch (statusErr) {
      console.warn('Paytm server-to-server status check error:', statusErr);
      // On error, leave PENDING — do NOT mark as FAILED
    }
  }

  if (isSuccessful) {
    // 1. Mark order as PAID
    await db.prepare(`
      UPDATE orders
      SET payment_status = 'PAID',
          gateway_payment_id = ?,
          gateway_type = 'PAYTM',
          payment_reference = ?
      WHERE id = ?
    `).run(finalTxnId || `paytm_${Date.now()}`, `paytm_${finalTxnId || orderId}`, orderId);

    // 2. Generate tickets if not already present
    const existingTickets = await db.prepare(`SELECT * FROM tickets WHERE order_id = ?`).all(orderId);
    if (existingTickets.length === 0) {
      let attendeesList: Array<{ name: string; age: number; tierId?: string }> = [];
      try {
        if (order.attendees_data) {
          attendeesList = JSON.parse(order.attendees_data);
        }
      } catch (e) {
        attendeesList = [{ name: order.customer_name || 'Pass Holder', age: 0, tierId: order.tier_id }];
      }

      if (attendeesList.length === 0) {
        attendeesList = [{ name: order.customer_name || 'Pass Holder', age: 0, tierId: order.tier_id }];
      }

      for (let i = 0; i < attendeesList.length; i++) {
        const a = attendeesList[i];
        const ticketId = `TCK-${orderId.replace('BK-', '')}-${i + 1}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const qrSecretToken = `TKT:${ticketId}:${orderId}:${crypto.randomBytes(8).toString('hex')}`;
        const tierToAssign = a.tierId || order.tier_id;
        const attendeeName = a.name?.trim() || order.customer_name || (attendeesList.length > 1 ? `Pass #${i + 1}` : 'Pass Holder');
        const attendeeAge = a.age || 0;

        await db.prepare(`
          INSERT INTO tickets (id, order_id, tier_id, attendee_name, attendee_age, qr_secret_token, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NOW())
        `).run(ticketId, orderId, tierToAssign, attendeeName, attendeeAge, qrSecretToken);
      }
    }

    // 3. Consume hold reservation
    if (order.tier_id) {
      try {
        await consumeReservation(`order_${orderId}`, order.tier_id);
      } catch (e) { }
    }

    // 4. Send WhatsApp Ticket Pass for each attendee ticket
    const tickets: any[] = await db.prepare(`
      SELECT t.id
      FROM tickets t
      WHERE t.order_id = ?
    `).all(orderId);

    await Promise.allSettled([
      ...tickets.map(t =>
        sendWhatsAppTicketMessage({
          ticketId: t.id,
          toPhone: order.customer_phone
        }).catch(err => console.warn(`WhatsApp dispatch error for ticket ${t.id}:`, err))
      ),
      sendWhatsAppOrganizerPaymentNotification({
        orderId: order.id
      }).catch(err => console.warn(`WhatsApp organizer alert error for order ${order.id}:`, err))
    ]);

    // 5. Redirect back to checkout confirmation screen over HTTPS
    const redirectUrl = `${origin}/${tenantSlug}/checkout?orderId=${encodeURIComponent(orderId)}&paymentStatus=PAID&txnId=${encodeURIComponent(finalTxnId)}`;
    return NextResponse.redirect(redirectUrl, { status: 303 });
  } else if (isDefinitiveFailure) {
    // Paytm explicitly confirmed failure — safe to mark as FAILED
    console.warn(`Paytm payment definitively failed for order ${orderId}:`, verification.respMsg);
    await db.prepare(`
      UPDATE orders
      SET payment_status = 'FAILED',
          payment_reference = ?
      WHERE id = ?
    `).run(`FAILED: ${verification.respMsg || 'Paytm Verification Failed'}`, orderId);

    const redirectUrl = `${origin}/${tenantSlug}/checkout?orderId=${encodeURIComponent(orderId)}&paymentStatus=FAILED&error=${encodeURIComponent(verification.respMsg || 'Payment Failed or Cancelled')}`;
    return NextResponse.redirect(redirectUrl, { status: 303 });
  } else {
    // Inconclusive — checksum mismatch or Paytm status API unreachable.
    // Leave order as PENDING so it can be reconciled later via admin panel or batch job.
    console.warn(`Paytm payment inconclusive for order ${orderId} — leaving PENDING for reconciliation.`, verification.respMsg);
    const redirectUrl = `${origin}/${tenantSlug}/checkout?orderId=${encodeURIComponent(orderId)}&paymentStatus=PENDING&error=${encodeURIComponent('Payment verification pending. If you paid, please wait — your tickets will be dispatched shortly.')}`;
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }
}

export async function POST(request: NextRequest) {
  try {
    return await handlePaytmCallbackData(request, false);
  } catch (err: any) {
    console.error('Paytm POST callback processing exception:', err);
    const origin = getRequestOrigin(request);
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(err.message)}`, { status: 303 });
  }
}

export async function GET(request: NextRequest) {
  try {
    return await handlePaytmCallbackData(request, true);
  } catch (err: any) {
    console.error('Paytm GET callback processing exception:', err);
    const origin = getRequestOrigin(request);
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(err.message)}`, { status: 303 });
  }
}
