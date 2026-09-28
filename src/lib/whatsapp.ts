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

  // ── Dispatch via WhatsApp Microservice (/api/send-ticket) ──────────────────
  let dispatchStatus = 'SIMULATED';
  let errorDetail: string | null = null;

  const ticketServiceUrl = `${process.env.WHATSAPP_SERVICE_BASE_URL || 'http://localhost:8000'}/api/send-ticket`;

  const disclaimerCaption =
    `🎟️ Ticket Booking Confirmed!\n\nYour ticket has been successfully booked.\n⚠️ ⚠️ Disclaimer: The event is solely managed by the Organizer. Any cancellation, postponement, rescheduling, venue change, refund, or other event-related matters are the Organizer’s responsibility. Our platform only facilitates ticket booking and is not liable for such matters.\n\nThank you.`;

  const ticketPayload = {
    phone: recipientPhone,
    ticket_id: ticket.id,
    attendee_name: ticket.attendee_name || ticket.customer_name || 'Valued Attendee',
    ticket_type: tierParam,
    venue: venueParam,
    date: dateParam,
    time: timeParam,
    qr_data: ticket.qr_secret_token || ticket.id,
    caption: disclaimerCaption
  };

  try {
    console.log(`[WhatsApp Ticket Service] Calling ${ticketServiceUrl}:`, JSON.stringify(ticketPayload, null, 2));

    const res = await fetch(ticketServiceUrl, {
      method: 'POST',
      headers: {
        'accept': '*/*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ticketPayload)
    });

    const json = await res.json().catch(() => null);
    console.log(`[WhatsApp Ticket API Response ${res.status}]:`, json);

    if (res.ok && json?.success !== false) {
      dispatchStatus = 'DELIVERED';
    } else {
      dispatchStatus = 'FAILED';
      errorDetail = json?.detail || json?.message || 'Failed to dispatch ticket via WhatsApp service';
    }
  } catch (err: any) {
    console.error('[WhatsApp Ticket Service Exception]:', err);
    dispatchStatus = 'FAILED';
    errorDetail = err.message;
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  const auditId = `aud_wa_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  await db.prepare(
    `INSERT INTO ticket_audit_logs (id, ticket_id, action_type, metadata, created_at)
     VALUES (?, ?, 'WHATSAPP_SENT', ?, ?)`
  ).run(
    auditId,
    ticketId,
    JSON.stringify({
      messageId,
      recipientPhone,
      recipientName: ticket.customer_name,
      dispatchStatus,
      ticketPayload,
      error: errorDetail
    }),
    now
  );

  return {
    success: dispatchStatus !== 'FAILED',
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
  const recipientPhone = normalizePhoneForService(toPhone);

  const apiUrl = `${process.env.WHATSAPP_SERVICE_BASE_URL || 'http://localhost:8000'}/api/send-message`;

  try {
    console.log(`[WhatsApp Service] Sending message to ${recipientPhone} via ${apiUrl}...`);
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'accept': '*/*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone: recipientPhone,
        message: messageText
      })
    });

    const json = await res.json().catch(() => null);
    console.log(`[WhatsApp Service Response ${res.status}]:`, json);

    if (!res.ok) {
      console.warn(`[WhatsApp Service Warning]: HTTP ${res.status}`, json);
      return {
        success: false,
        status: res.status,
        detail: json?.detail || json?.message || 'Failed to send WhatsApp message'
      };
    }

    return { success: true, data: json };
  } catch (err: any) {
    console.error('[WhatsApp Service Exception]:', err);
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
