import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { generateTicketToken } from '@/lib/crypto';
import { sendWhatsAppTicketMessage } from '@/lib/whatsapp';
import crypto from 'node:crypto';

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

    if (order.payment_status === 'PAID') {
      const existingTickets = await db.prepare(`SELECT * FROM tickets WHERE order_id = ?`).all(orderId);
      return NextResponse.json({
        success: true,
        message: 'Order is already marked as PAID.',
        orderId,
        tickets: existingTickets
      });
    }

    const now = new Date().toISOString();

    // Mark order as PAID
    await db.prepare(`
      UPDATE orders
      SET payment_status = 'PAID',
          gateway_payment_id = COALESCE(gateway_payment_id, 'CONFIRMED_BY_ORGANIZER')
      WHERE id = ?
    `).run(orderId);

    // Resolve attendees list from persisted order data
    let attendeeList: Array<{ name: string; age?: number; tierId?: string }> = [];
    if (order.attendees_data) {
      try {
        const parsed = JSON.parse(order.attendees_data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          attendeeList = parsed;
        }
      } catch (parseErr) {
        console.warn('Error parsing order.attendees_data:', parseErr);
      }
    }

    if (attendeeList.length === 0) {
      attendeeList = [{ name: order.customer_name, age: 25, tierId: order.tier_id }];
    }

    // Resolve event and tier context
    const primaryTierId = order.tier_id;
    const bookedTier: any = primaryTierId
      ? await db.prepare(`
          SELECT tt.*, e.id as event_id, e.title as event_title 
          FROM ticket_tiers tt 
          JOIN events e ON tt.event_id = e.id 
          WHERE tt.id = ?
        `).get(primaryTierId)
      : await (async () => {
          const tiers: any[] = await db.prepare(`
            SELECT tt.*, e.id as event_id, e.title as event_title 
            FROM ticket_tiers tt 
            JOIN events e ON tt.event_id = e.id 
            WHERE e.tenant_id = ?
          `).all(order.tenant_id);
          return tiers[0] || { id: 'tier_default', event_id: 'evt_default', name: 'Standard Pass' };
        })();

    const generatedTickets: any[] = [];
    const insertTicket = db.prepare(`
      INSERT INTO tickets (id, order_id, tier_id, attendee_name, attendee_age, qr_secret_token, checked_in_at, checkin_count, is_override_allowed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0, ?)
    `);

    for (let i = 0; i < attendeeList.length; i++) {
      const att = attendeeList[i];
      const targetTierId = att.tierId || primaryTierId || bookedTier.id;
      const targetTier: any = targetTierId
        ? (await db.prepare(`
            SELECT tt.*, e.id as event_id, e.title as event_title 
            FROM ticket_tiers tt 
            JOIN events e ON tt.event_id = e.id 
            WHERE tt.id = ?
          `).get(targetTierId)) || bookedTier
        : bookedTier;

      const ticketId = `tkt_${Date.now()}_${i}_${crypto.randomBytes(3).toString('hex')}`;
      const attendeeName = att.name?.trim() || `${order.customer_name} (Guest ${i + 1})`;
      const attendeeAge = parseInt(String(att.age), 10) || 25;

      const token = generateTicketToken({
        ticketId,
        orderId,
        eventId: targetTier.event_id,
        attendeeName,
        tierId: targetTier.id,
        issuedAt: now
      });

      await insertTicket.run(
        ticketId,
        orderId,
        targetTier.id,
        attendeeName,
        attendeeAge,
        token,
        now
      );

      generatedTickets.push({
        id: ticketId,
        order_id: orderId,
        tier_id: targetTier.id,
        tier_name: targetTier.name,
        attendee_name: attendeeName,
        attendee_age: attendeeAge,
        qr_secret_token: token
      });

      // Dispatch verified QR pass to user's WhatsApp
      sendWhatsAppTicketMessage({ ticketId, toPhone: order.customer_phone }).catch(waErr => {
        console.warn(`WhatsApp dispatch error for approved ticket ${ticketId}:`, waErr);
      });
    }

    return NextResponse.json({
      success: true,
      message: `Payment confirmed! ${generatedTickets.length} ticket(s) issued and sent to WhatsApp ${order.customer_phone}.`,
      orderId,
      tickets: generatedTickets
    });
  } catch (err: any) {
    console.error('Organizer order confirmation error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
