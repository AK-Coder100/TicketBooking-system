import { db } from './db';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSystemBaseUrl(): string {
  if (
    process.env.BASE_URL &&
    !process.env.BASE_URL.includes('localhost') &&
    !process.env.BASE_URL.includes('127.0.0.1')
  ) {
    return process.env.BASE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.BASE_URL || 'http://localhost:5000';
}

/**
 * Returns the base URL that Meta's servers can reach to download ticket images.
 * Priority: WHATSAPP_PUBLIC_BASE_URL → BASE_URL (if non-localhost) → VERCEL_URL → localhost fallback
 * Set WHATSAPP_PUBLIC_BASE_URL=https://event.neoclare.com in .env on the production server.
 * On localhost it will fall back to the direct media-upload path instead.
 */
function getWhatsAppBaseUrl(): string {
  // Highest priority: explicit WhatsApp public URL
  if (process.env.WHATSAPP_PUBLIC_BASE_URL) {
    return process.env.WHATSAPP_PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  return getSystemBaseUrl();
}

function isLocalhostUrl(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1');
}

/**
 * Upload a PNG buffer directly to Meta's WhatsApp Media API.
 * Returns the media_id string on success, or null on failure.
 * This is required when BASE_URL is localhost and Meta cannot download the file.
 */
async function uploadTicketImageToMeta(
  pngBuffer: Buffer,
  phoneNumberId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(pngBuffer)], { type: 'image/png' });
    formData.append('file', blob, 'ticket.png');
    formData.append('type', 'image/png');
    formData.append('messaging_product', 'whatsapp');

    const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData
    });

    const json = await res.json();
    if (res.ok && json.id) {
      console.log('[WhatsApp] Media uploaded successfully, media_id:', json.id);
      return json.id as string;
    }
    console.warn('[WhatsApp] Media upload failed:', json);
    return null;
  } catch (err) {
    console.error('[WhatsApp] Media upload exception:', err);
    return null;
  }
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
  const ticket: any = db
    .prepare(
      `SELECT tk.*, o.customer_phone, o.customer_name, o.id as order_id,
              e.title as event_title, e.location as event_location,
              e.start_date, e.end_date,
              t.name as tenant_name,
              tt.name as tier_name, tt.valid_date
       FROM tickets tk
       JOIN orders o ON tk.order_id = o.id
       JOIN ticket_tiers tt ON tk.tier_id = tt.id
       JOIN events e ON tt.event_id = e.id
       JOIN tenants t ON o.tenant_id = t.id
       WHERE tk.id = ?`
    )
    .get(ticketId);

  if (!ticket) {
    throw new Error('Ticket not found for WhatsApp dispatch');
  }

  // ── Phone normalisation ───────────────────────────────────────────────────
  const rawPhone = toPhone || ticket.customer_phone || '';
  let recipientPhone = rawPhone.replace(/[^0-9]/g, '');
  if (recipientPhone.length === 10) {
    recipientPhone = `91${recipientPhone}`;
  }
  if (!recipientPhone) {
    throw new Error('Recipient phone number is missing or invalid');
  }

  // ── Config ────────────────────────────────────────────────────────────────
  const isEnabled   = process.env.WHATSAPP_ENABLED === 'true';
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const templateName  = process.env.WHATSAPP_TEMPLATE_NAME || 'purchase_receipt_1';
  const templateLang  = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US';

  const baseUrl      = getWhatsAppBaseUrl();
  const pngTicketUrl = `${baseUrl}/api/client/tickets/${ticketId}/png`;
  const messageId    = `wamid_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now          = new Date().toISOString();

  // ── Build body parameter values from event data ───────────────────────────
  const startDate = ticket.start_date ? new Date(ticket.start_date) : null;
  const endDate   = ticket.end_date   ? new Date(ticket.end_date)   : null;

  // {{1}} DATE
  const dateParam =
    ticket.valid_date && ticket.valid_date !== 'ALL_DAYS'
      ? ticket.valid_date
      : startDate && !isNaN(startDate.getTime())
        ? startDate.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })
        : 'TBA';

  // {{2}} TIME  (e.g. "7:00 PM – 11:30 PM")
  const fmtTime = (d: Date) =>
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const timeParam =
    startDate && !isNaN(startDate.getTime())
      ? endDate && !isNaN(endDate.getTime())
        ? `${fmtTime(startDate)} – ${fmtTime(endDate)}`
        : fmtTime(startDate)
      : 'TBA';

  // {{3}} VENUE
  const venueParam = ticket.event_location || 'TBA';

  // {{4}} TICKET (tier name)
  const tierParam = (ticket.tier_name || 'General Admission').toUpperCase();

  // ── Dispatch ──────────────────────────────────────────────────────────────
  let dispatchStatus = 'SIMULATED';
  let errorDetail: string | null = null;
  let mediaIdUsed: string | null = null;

  if (!isEnabled) {
    errorDetail = 'WHATSAPP_ENABLED is set to false in .env';
  } else if (!accessToken) {
    errorDetail = 'WHATSAPP_ACCESS_TOKEN is missing in .env';
  } else if (!phoneNumberId) {
    errorDetail =
      'WHATSAPP_PHONE_NUMBER_ID is missing in .env. Copy the 15-digit Phone Number ID from Meta Developer Console → WhatsApp → API Setup.';
    dispatchStatus = 'FAILED';
  } else {
    try {
      // ── Resolve image header parameter ──────────────────────────────────
      //  Meta's servers cannot reach localhost URLs.
      //  When running locally: upload the PNG directly via Media API → use media_id.
      //  When on a public server: pass the public URL directly.
      let headerImageParam: Record<string, any> | null = null;

      if (templateName !== 'hello_world') {
        if (isLocalhostUrl(pngTicketUrl)) {
          // Fetch the PNG from our own local server first, then upload to Meta
          console.log('[WhatsApp] BASE_URL is localhost – attempting direct media upload to Meta...');
          try {
            const localRes = await fetch(pngTicketUrl);
            if (localRes.ok) {
              const pngBuffer = Buffer.from(await localRes.arrayBuffer());
              const uploadedId = await uploadTicketImageToMeta(pngBuffer, phoneNumberId, accessToken);
              if (uploadedId) {
                mediaIdUsed = uploadedId;
                headerImageParam = { type: 'image', image: { id: uploadedId } };
              } else {
                console.warn('[WhatsApp] Media upload returned no id – sending body-only message.');
              }
            } else {
              console.warn('[WhatsApp] Could not fetch local PNG:', localRes.status, localRes.statusText);
            }
          } catch (fetchErr) {
            console.warn('[WhatsApp] Local PNG fetch failed:', fetchErr);
          }
        } else {
          // Public URL – pass directly
          headerImageParam = { type: 'image', image: { link: pngTicketUrl } };
        }
      }

      // ── Build template payload ──────────────────────────────────────────
      // Template purchase_receipt_1 has a fixed body (0 body variables).
      // Only the header image component is needed.
      const components: any[] = [];

      if (headerImageParam) {
        components.push({
          type: 'header',
          parameters: [headerImageParam]
        });
      }

      const payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
          ...(templateName !== 'hello_world' && { components })
        }
      };

      console.log('[WhatsApp] Sending payload to Meta:', JSON.stringify(payload, null, 2));

      let metaRes = await fetch(
        `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );

      let metaJson = await metaRes.json();
      console.log('[WhatsApp] Meta API response:', JSON.stringify(metaJson));

      // Fallback: template still PENDING approval (132001) → send hello_world
      if (!metaRes.ok && metaJson.error?.code === 132001 && templateName !== 'hello_world') {
        console.warn(`[WhatsApp] Template "${templateName}" is PENDING approval. Falling back to hello_world...`);
        const fallbackPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'template',
          template: { name: 'hello_world', language: { code: 'en_US' } }
        };
        metaRes  = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(fallbackPayload)
        });
        metaJson = await metaRes.json();
        console.log('[WhatsApp] Fallback hello_world response:', JSON.stringify(metaJson));
      }

      if (metaRes.ok && metaJson.messages?.[0]?.id) {
        dispatchStatus = 'DELIVERED';
      } else {
        dispatchStatus = 'FAILED';
        errorDetail =
          metaJson.error?.message || JSON.stringify(metaJson.error || metaJson);
        console.error('[WhatsApp] Meta API Error:', metaJson);
      }
    } catch (err: any) {
      dispatchStatus = 'FAILED';
      errorDetail = err.message;
      console.error('[WhatsApp] Dispatch exception:', err);
    }
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  const auditId = `aud_wa_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  db.prepare(
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
      pngTicketUrl,
      mediaIdUsed,
      template: templateName,
      bodyParams: { date: dateParam, time: timeParam, venue: venueParam, tier: tierParam },
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
