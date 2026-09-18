import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateTicketPdf } from '@/lib/pdf';
import crypto from 'node:crypto';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ticket: any = await db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id);
    if (!ticket) return new NextResponse('Ticket not found', { status: 404 });

    const order: any = await db.prepare(`SELECT * FROM orders WHERE id = ?`).get(ticket.order_id);
    const tier: any = await db.prepare(`SELECT * FROM ticket_tiers WHERE id = ?`).get(ticket.tier_id);
    const event: any = await db.prepare(`SELECT * FROM events WHERE id = ?`).get(tier.event_id);
    const tenant: any = await db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(order.tenant_id);

    // Audit log download
    const auditId = `aud_pdf_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'Browser';

    await db.prepare(`
      INSERT INTO ticket_audit_logs (id, ticket_id, action_type, metadata, created_at)
      VALUES (?, ?, 'DOWNLOADED', ?, ?)
    `).run(
      auditId,
      ticket.id,
      JSON.stringify({ ip, userAgent, status: 'SUCCESS' }),
      new Date().toISOString()
    );

    const pdfBuffer = await generateTicketPdf({ ticket, order, event, tier, tenant });

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ticket_${ticket.id}.pdf"`
      }
    });
  } catch (err: any) {
    return new NextResponse(`Error generating PDF: ${err.message}`, { status: 500 });
  }
}
