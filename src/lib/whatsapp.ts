import { db } from './db';
import crypto from 'node:crypto';

function getSystemBaseUrl(): string {
  if (process.env.BASE_URL && !process.env.BASE_URL.includes('localhost:5000') && !process.env.BASE_URL.includes('127.0.0.1')) {
    return process.env.BASE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.BASE_URL || 'http://localhost:5000';
}

let cachedPhoneNumberId: string | null = null;

async function getPhoneNumberId(accessToken: string): Promise<string | null> {
  if (process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return process.env.WHATSAPP_PHONE_NUMBER_ID;
  }
  if (cachedPhoneNumberId) {
    return cachedPhoneNumberId;
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v22.0/me/phone_numbers`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    const data = await res.json();
    if (res.ok && Array.isArray(data.data) && data.data.length > 0) {
      cachedPhoneNumberId = data.data[0].id;
      return cachedPhoneNumberId;
    } else {
      console.warn('Meta WhatsApp API fetch phone numbers error:', data);
    }
  } catch (err) {
    console.error('Failed to fetch Meta WhatsApp Phone Number ID:', err);
  }
  return null;
}

export async function sendWhatsAppTicketMessage({
  ticketId,
  toPhone
}: {
  ticketId: string;
  toPhone?: string;
}) {
  const ticket: any = db.prepare(`
    SELECT tk.*, o.customer_phone, o.customer_name, o.id as order_id,
           e.title as event_title, e.location as event_location, e.start_date,
           t.name as tenant_name, tt.name as tier_name
    FROM tickets tk
    JOIN orders o ON tk.order_id = o.id
    JOIN ticket_tiers tt ON tk.tier_id = tt.id
    JOIN events e ON tt.event_id = e.id
    JOIN tenants t ON o.tenant_id = t.id
    WHERE tk.id = ?
  `).get(ticketId);

  if (!ticket) {
    throw new Error('Ticket not found for WhatsApp dispatch');
  }

  // Recipient phone number entered by the client/customer before payment
  const rawPhone = toPhone || ticket.customer_phone || '';
  let recipientPhone = rawPhone.replace(/[^0-9]/g, '');
  if (recipientPhone.length === 10) {
    recipientPhone = `91${recipientPhone}`;
  }

  if (!recipientPhone) {
    throw new Error('Recipient phone number is missing or invalid');
  }

  const isEnabled = process.env.WHATSAPP_ENABLED === 'true';
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'purchase_receipt_1';
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US';

  const baseUrl = getSystemBaseUrl();
  const pngTicketUrl = `${baseUrl}/api/client/tickets/${ticketId}/png`;
  const messageId = `wamid_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  let dispatchStatus = 'SIMULATED';
  let errorDetail: string | null = null;

  if (!isEnabled) {
    errorDetail = 'WHATSAPP_ENABLED is set to false in .env';
  } else if (!accessToken) {
    errorDetail = 'WHATSAPP_ACCESS_TOKEN is missing in .env';
  } else if (!phoneNumberId) {
    errorDetail = 'WHATSAPP_PHONE_NUMBER_ID is missing in .env. Please copy your 15-digit Phone Number ID from Meta Developer Console (WhatsApp -> API Setup) into .env';
    dispatchStatus = 'FAILED';
  } else {
    try {
      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang }
        }
      };

      if (templateName !== 'hello_world') {
        payload.template.components = [
          {
            type: 'header',
            parameters: [
              {
                type: 'image',
                image: {
                  link: pngTicketUrl
                }
              }
            ]
          }
        ];
      }

      const metaRes = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const metaJson = await metaRes.json();
      if (metaRes.ok && metaJson.messages?.[0]?.id) {
        dispatchStatus = 'DELIVERED';
      } else {
        dispatchStatus = 'FAILED';
        errorDetail = metaJson.error?.message || JSON.stringify(metaJson.error || metaJson);
        console.error('Meta WhatsApp API Error:', metaJson);
      }
    } catch (err: any) {
      dispatchStatus = 'FAILED';
      errorDetail = err.message;
      console.error('WhatsApp dispatch exception:', err);
    }
  }

  // Record audit log entry
  const auditId = `aud_wa_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  db.prepare(`
    INSERT INTO ticket_audit_logs (id, ticket_id, action_type, metadata, created_at)
    VALUES (?, ?, 'WHATSAPP_SENT', ?, ?)
  `).run(
    auditId,
    ticketId,
    JSON.stringify({
      messageId,
      recipientPhone,
      recipientName: ticket.customer_name,
      dispatchStatus,
      pngTicketUrl,
      template: templateName,
      error: errorDetail
    }),
    now
  );

  return {
    success: dispatchStatus !== 'FAILED',
    messageId,
    dispatchStatus,
    pngTicketUrl,
    error: errorDetail
  };
}
