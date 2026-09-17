import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import QRCode from 'qrcode';
import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ticket: any = db.prepare(`
      SELECT tk.*, o.customer_name, o.customer_phone, o.customer_email, o.created_at as booked_at,
             tt.name as tier_name, tt.price_in_paise, tt.valid_date,
             e.title as event_title, e.location as event_location, e.start_date, e.end_date,
             t.name as tenant_name
      FROM tickets tk
      JOIN orders o ON tk.order_id = o.id
      JOIN ticket_tiers tt ON tk.tier_id = tt.id
      JOIN events e ON tt.event_id = e.id
      JOIN tenants t ON o.tenant_id = t.id
      WHERE tk.id = ?
    `).get(id);

    if (!ticket) {
      return new NextResponse('Ticket not found', { status: 404 });
    }

    // Generate QR Data URL
    const qrDataUrl = await QRCode.toDataURL(ticket.qr_secret_token, {
      margin: 1,
      width: 240,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    const eventDateStr = (ticket.valid_date && ticket.valid_date !== 'ALL_DAYS')
      ? ticket.valid_date
      : new Date(ticket.start_date).toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });

    return new ImageResponse(
      (
        <div
          style={{
            width: '600px',
            height: '750px',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#0f172a',
            fontFamily: 'sans-serif',
            color: '#ffffff',
            padding: '24px',
            boxSizing: 'border-box'
          }}
        >
          {/* Card Outer */}
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#1e293b',
              borderRadius: '20px',
              border: '2px solid #334155',
              overflow: 'hidden',
              boxSizing: 'border-box'
            }}
          >
            {/* Header Banner */}
            <div
              style={{
                width: '100%',
                backgroundColor: '#4f46e5',
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box'
              }}
            >
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 800,
                  color: '#c7d2fe',
                  letterSpacing: '2px',
                  textTransform: 'uppercase'
                }}
              >
                {ticket.tenant_name}
              </span>
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 900,
                  color: '#ffffff',
                  marginTop: '4px'
                }}
              >
                {ticket.event_title}
              </span>
            </div>

            {/* Event Details Bar */}
            <div
              style={{
                width: '100%',
                backgroundColor: '#0f172a',
                padding: '14px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid #334155',
                boxSizing: 'border-box'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>VENUE</span>
                <span style={{ fontSize: '14px', color: '#f8fafc', fontWeight: 800, marginTop: '2px' }}>
                  📍 {ticket.event_location}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>DATE</span>
                <span style={{ fontSize: '14px', color: '#38bdf8', fontWeight: 800, marginTop: '2px' }}>
                  📅 {eventDateStr}
                </span>
              </div>
            </div>

            {/* Ticket & Attendee Content */}
            <div
              style={{
                width: '100%',
                padding: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxSizing: 'border-box'
              }}
            >
              {/* Attendee Info */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>ATTENDEE NAME</span>
                  <span style={{ fontSize: '20px', color: '#ffffff', fontWeight: 900, marginTop: '2px' }}>
                    {ticket.attendee_name}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>TICKET TIER</span>
                  <span style={{ fontSize: '16px', color: '#818cf8', fontWeight: 800, marginTop: '2px' }}>
                    🎟️ {ticket.tier_name}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>AGE</span>
                    <span style={{ fontSize: '14px', color: '#e2e8f0', fontWeight: 700 }}>
                      {ticket.attendee_age} yrs
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>TICKET ID</span>
                    <span style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 700 }}>
                      {ticket.id}
                    </span>
                  </div>
                </div>
              </div>

              {/* QR Code Container */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  backgroundColor: '#ffffff',
                  padding: '12px',
                  borderRadius: '16px',
                  border: '2px solid #6366f1'
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR Code" width="180" height="180" style={{ borderRadius: '8px' }} />
                <span style={{ fontSize: '10px', color: '#4f46e5', fontWeight: 800, marginTop: '6px' }}>
                  GATE SCANNER QR
                </span>
              </div>
            </div>

            {/* Perforated Divider */}
            <div
              style={{
                width: '100%',
                borderTop: '2px dashed #475569',
                margin: '8px 0'
              }}
            />

            {/* Footer Notice */}
            <div
              style={{
                width: '100%',
                padding: '16px 24px',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#0f172a',
                marginTop: 'auto',
                boxSizing: 'border-box'
              }}
            >
              <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 800 }}>
                ✓ OFFICIAL VERIFIED ENTRY PASS
              </span>
              <span style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
                Cryptographically Signed HMAC-SHA256 Token · Present QR at event gate for admission.
              </span>
            </div>
          </div>
        </div>
      ),
      {
        width: 600,
        height: 750
      }
    );
  } catch (err: any) {
    return new NextResponse(`Error generating PNG ticket: ${err.message}`, { status: 500 });
  }
}
