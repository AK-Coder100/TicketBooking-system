import { db } from './db';
import crypto from 'node:crypto';

function normalizePhoneForService(rawPhone: string): string {
  let cleaned = (rawPhone || '').replace(/[^0-9]/g, '');
  if (cleaned.length === 10) {
    const prefix = process.env.WHATSAPP_PHONE_PREFIX || '0';
    return `${prefix}${cleaned}`;
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function sendWhatsAppTicketMessage({
  ticketId,
  toPhone
}: {
  ticketId: string;
  toPhone?: string;
}) {
  const ticket: any = await db
    .prepare(
      `SELECT tk.*, o.customer_phone, o.customer_name, o.id as order_id,
              COALESCE(e.title, o.event_title, 'Live Event') as event_title,
              COALESCE(e.location, 'Gorakhpur') as event_location,
              e.start_date, e.end_date,
              COALESCE(t.name, 'EventHub') as tenant_name,
              COALESCE(tt.name, 'Entry Pass') as tier_name, tt.valid_date
       FROM tickets tk
       JOIN orders o ON tk.order_id = o.id
       LEFT JOIN ticket_tiers tt ON tk.tier_id = tt.id
       LEFT JOIN events e ON tt.event_id = e.id
       LEFT JOIN tenants t ON o.tenant_id = t.id
       WHERE tk.id = ?`
    )
    .get(ticketId);

  if (!ticket) {
    throw new Error('Ticket not found for WhatsApp dispatch');
  }

  // ── Phone normalisation ───────────────────────────────────────────────────
  const rawPhone = toPhone || ticket.customer_phone || '';
  const recipientPhone = normalizePhoneForService(rawPhone);
  if (!recipientPhone) {
    throw new Error('Recipient phone number is missing or invalid');
  }

  const messageId = `wamid_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  // ── Build body parameter values from event data ───────────────────────────
  const startDate = ticket.start_date ? new Date(ticket.start_date) : null;
  const endDate = ticket.end_date ? new Date(ticket.end_date) : null;

  // Format Date (e.g. "15 TO 19 OCT 2026" or "15 OCT 2026")
  let dateParam = 'TBA';
  if (ticket.valid_date && ticket.valid_date !== 'ALL_DAYS') {
    dateParam = ticket.valid_date.toUpperCase();
  } else if (startDate && !isNaN(startDate.getTime())) {
    if (endDate && !isNaN(endDate.getTime()) && startDate.toDateString() !== endDate.toDateString()) {
      const startDay = startDate.getDate();
      const endDay = endDate.getDate();
      const endMonthYear = endDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase();
      dateParam = `${startDay} TO ${endDay} ${endMonthYear}`;
    } else {
      dateParam = startDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).toUpperCase();
    }
  }

  // Format Time (e.g. "7:00 PM – 11:30 PM")
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
  const timeParam =
    startDate && !isNaN(startDate.getTime())
      ? endDate && !isNaN(endDate.getTime()) && fmtTime(startDate) !== fmtTime(endDate)
        ? `${fmtTime(startDate)} – ${fmtTime(endDate)}`
        : fmtTime(startDate)
      : '7:00 PM – 11:30 PM';

  const venueParam = ticket.event_location || 'Kacheri Club, Town Hall, Gorakhpur';
  const tierParam = (ticket.tier_name || 'GENERAL ADMISSION').toUpperCase();

  // ── Enqueue Message into whatsapp_msg_in_queue Table ─────────────────────
  let dispatchStatus = 'QUEUED';
  let errorDetail: string | null = null;
  const queueId = `wa_msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const disclaimerCaption =
    `🎟️ Ticket Booking Confirmed!\n\nYour ticket has been successfully booked.\n⚠️ ⚠️ Disclaimer: The event is solely managed by the Organizer. Any cancellation, postponement, rescheduling, venue change, refund, or other event-related matters are the Organizer’s responsibility. Our platform only facilitates ticket booking and is not liable for such matters.\n\nThank you.`;

  const ticketPayload = {
    phone: recipientPhone,
    ticket_id: ticket.id,
    order_id: ticket.order_id,
    attendee_name: ticket.attendee_name || ticket.customer_name || 'Valued Attendee',
    ticket_type: tierParam,
    venue: venueParam,
    date: dateParam,
    time: timeParam,
    qr_data: ticket.qr_secret_token || ticket.id,
    caption: disclaimerCaption
  };

  try {
    // Ensure table exists
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS whatsapp_msg_in_queue (
        id VARCHAR(100) PRIMARY KEY,
        phone VARCHAR(50) NOT NULL,
        msg_type VARCHAR(50) NOT NULL DEFAULT 'TICKET',
        ticket_id VARCHAR(100),
        order_id VARCHAR(100),
        attendee_name VARCHAR(255),
        ticket_type VARCHAR(100),
        venue TEXT,
        date VARCHAR(100),
        time VARCHAR(100),
        qr_data TEXT,
        caption TEXT,
        message_text TEXT,
        payload TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).run();

    await db.prepare(`
      INSERT INTO whatsapp_msg_in_queue (
        id, phone, msg_type, ticket_id, order_id, attendee_name, ticket_type,
        venue, date, time, qr_data, caption, payload, status, created_at
      ) VALUES (?, ?, 'TICKET', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())
    `).run(
      queueId,
      recipientPhone,
      ticket.id,
      ticket.order_id,
      ticketPayload.attendee_name,
      ticketPayload.ticket_type,
      ticketPayload.venue,
      ticketPayload.date,
      ticketPayload.time,
      ticketPayload.qr_data,
      ticketPayload.caption,
      JSON.stringify(ticketPayload)
    );

    console.log(`[WhatsApp Queue] Enqueued ticket message ${queueId} for phone ${recipientPhone}`);
    dispatchStatus = 'QUEUED';
  } catch (err: any) {
    console.error('[WhatsApp Queue Exception]:', err);
    dispatchStatus = 'FAILED';
    errorDetail = err.message;
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  const auditId = `aud_wa_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  try {
    await db.prepare(
      `INSERT INTO ticket_audit_logs (id, ticket_id, action_type, metadata, created_at)
       VALUES (?, ?, 'WHATSAPP_SENT', ?, ?)`
    ).run(
      auditId,
      ticketId,
      JSON.stringify({
        queueId,
        messageId,
        recipientPhone,
        recipientName: ticket.customer_name,
        dispatchStatus,
        ticketPayload,
        error: errorDetail
      }),
      now
    );
  } catch (auditErr) {
    console.warn('Audit log error:', auditErr);
  }

  return {
    success: dispatchStatus !== 'FAILED',
    queueId,
    messageId,
    dispatchStatus,
    error: errorDetail
  };
}

export async function sendWhatsAppTextMessage({
  toPhone,
  messageText
}: {
  toPhone: string;
  messageText: string;
}) {
  const recipientPhone = normalizePhoneForService(toPhone || '7054916134');
  const queueId = `wa_txt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS whatsapp_msg_in_queue (
        id VARCHAR(100) PRIMARY KEY,
        phone VARCHAR(50) NOT NULL,
        msg_type VARCHAR(50) NOT NULL DEFAULT 'TEXT',
        ticket_id VARCHAR(100),
        order_id VARCHAR(100),
        attendee_name VARCHAR(255),
        ticket_type VARCHAR(100),
        venue TEXT,
        date VARCHAR(100),
        time VARCHAR(100),
        qr_data TEXT,
        caption TEXT,
        message_text TEXT,
        payload TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        attempts INTEGER DEFAULT 0,
        last_error TEXT,
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).run();

    await db.prepare(`
      INSERT INTO whatsapp_msg_in_queue (
        id, phone, msg_type, message_text, payload, status, created_at
      ) VALUES (?, ?, 'TEXT', ?, ?, 'PENDING', NOW())
    `).run(
      queueId,
      recipientPhone,
      messageText,
      JSON.stringify({ phone: recipientPhone, message: messageText })
    );

    console.log(`[WhatsApp Queue] Enqueued text message ${queueId} for phone ${recipientPhone}`);
    return { success: true, queueId };
  } catch (err: any) {
    console.error('[WhatsApp Queue Text Exception]:', err);
    return { success: false, error: err.message };
  }
}

export async function sendWhatsAppOrderProcessedMessage({
  orderId,
  toPhone,
  customerName,
  eventTitle,
  amount,
  utr
}: {
  orderId: string;
  toPhone: string;
  customerName?: string;
  eventTitle?: string;
  amount?: string | number;
  utr?: string;
}) {
  const name = customerName || 'Valued Attendee';
  const event = eventTitle || 'Your Event';
  const utrLine = utr ? `\n• *UPI Ref / UTR:* ${utr}` : '';
  const amountLine = amount ? `\n• *Amount:* ₹${amount}` : '';

  const messageText =
    `🎟️ *Transaction In Process!*

Hi ${name}, we are processing your transaction for *${event}*!

• *Booking ID:* ${orderId}${amountLine}${utrLine}
• *Status:* ⏳ Verification In Progress

Our team is verifying your payment with the bank. Once confirmed, your ticket pass with digital QR code will be dispatched here directly on WhatsApp.

Thank you!`;

  const res = await sendWhatsAppTextMessage({ toPhone, messageText });
  if (res.success) {
    const organizerPhone = process.env.ORGANIZER_PHONE || process.env.ORGANIZER_WHATSAPP_PHONE || process.env.ADMIN_PHONE;
    if (organizerPhone) {
      const notificationmsg = `🤑 *New Order Request*
• *Order ID:* ${orderId}
• *Event:* ${event}
• *Customer:* ${name} (${toPhone})
• *Amount:* ₹${amount}`;
      return sendWhatsAppTextMessage({ toPhone: organizerPhone, messageText: notificationmsg });
    }
  }
  return res;
}

export async function sendWhatsAppOrderDeclinedMessage({
  orderId,
  toPhone,
  customerName,
  eventTitle
}: {
  orderId: string;
  toPhone: string;
  customerName?: string;
  eventTitle?: string;
}) {
  const name = customerName || 'Valued Attendee';
  const event = eventTitle || 'Your Event';

  const messageText =
    `⚠️ *Ticket Request Update*

Hi ${name}, we could not verify the payment for your booking request:

• *Booking ID:* ${orderId}
• *Event:* ${event}
• *Status:* Declined

If you have already paid or believe this is an error, please reach out to event support with your payment receipt and reference number.`;

  return sendWhatsAppTextMessage({ toPhone, messageText });
}

export async function sendWhatsAppOrganizerPaymentNotification({
  orderId,
  organizerPhone
}: {
  orderId: string;
  organizerPhone?: string;
}) {
  try {
    const order: any = await db.prepare(`
      SELECT o.*, t.name as tenant_name, t.slug as tenant_slug,
             t.contact_phone as tenant_organizer_phone,
             COALESCE(e.title, o.event_title, 'Live Event') as event_title,
             (SELECT COUNT(*) FROM tickets tk WHERE tk.order_id = o.id) as ticket_count
      FROM orders o
      JOIN tenants t ON o.tenant_id = t.id
      LEFT JOIN ticket_tiers tt ON o.tier_id = tt.id
      LEFT JOIN events e ON tt.event_id = e.id
      WHERE o.id = ?
    `).get(orderId);

    if (!order) return { success: false, error: 'Order not found' };

    const rawPhone = organizerPhone || order.tenant_organizer_phone || process.env.ORGANIZER_PHONE || '7054916134';
    const cleanPhone = normalizePhoneForService(rawPhone);
    const queueId = `wa_org_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const amountFormatted = `₹${((order.total_charged || order.total_base_price || 0) / 100).toFixed(2)}`;
    const ticketCount = order.ticket_count || 1;
    const txnId = order.gateway_payment_id || order.payment_reference || 'Confirmed';

    const messageText =
      `🎉 *Payment Received & Confirmed!*\n\n• *Tenant / Organizer:* ${order.tenant_name}\n• *Event:* ${order.event_title}\n• *Booking ID:* ${order.id}\n• *Customer:* ${order.customer_name || 'Customer'} (${order.customer_phone || ''})\n• *Amount Paid:* ${amountFormatted}\n• *Passes Issued:* ${ticketCount} Ticket(s)\n• *Paytm Txn ID:* ${txnId}\n• *Time:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

    const payloadObj = {
      msg_type: 'PAYMENT_CONFIRMATION_TO_ORGANIZER',
      phone: cleanPhone,
      order_id: order.id,
      tenant_name: order.tenant_name,
      event_title: order.event_title,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      amount_charged_paise: order.total_charged,
      ticket_count: ticketCount,
      txn_id: txnId
    };

    await db.prepare(`
      INSERT INTO whatsapp_msg_in_queue (
        id, phone, msg_type, order_id, attendee_name, ticket_type,
        venue, caption, message_text, payload, status, created_at
      ) VALUES (?, ?, 'PAYMENT_CONFIRMATION_TO_ORGANIZER', ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())
    `).run(
      queueId,
      cleanPhone,
      order.id,
      order.customer_name,
      order.event_title,
      order.tenant_name,
      messageText,
      messageText,
      JSON.stringify(payloadObj)
    );

    console.log(`[WhatsApp Queue] Enqueued PAYMENT_CONFIRMATION_TO_ORGANIZER ${queueId} for phone ${cleanPhone}`);
    return { success: true, queueId };
  } catch (err: any) {
    console.error('[WhatsApp Organizer Notification Exception]:', err);
    return { success: false, error: err.message };
  }
}
