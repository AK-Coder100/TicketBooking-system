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
    const ticket: any = await db.prepare(`
      SELECT tk.*, o.id as order_id, o.customer_name, o.customer_phone, o.customer_email, o.gateway_type, o.created_at as booked_at,
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
      width: 220,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    const eventDateStr = (ticket.valid_date && ticket.valid_date !== 'ALL_DAYS')
      ? ticket.valid_date
      : new Date(ticket.start_date).toLocaleDateString('en-IN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).split('/').reverse().join('-');

    const issuedDateStr = new Date(ticket.created_at).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    return new ImageResponse(
      (
        <div
          style={{
            width: '650px',
            height: '920px',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#ffffff',
            fontFamily: 'sans-serif',
            color: '#0f172a',
            padding: '24px',
            boxSizing: 'border-box'
          }}
        >
          {/* Card Frame */}
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '2px solid #e2e8f0',
              overflow: 'hidden',
              boxSizing: 'border-box'
            }}
          >
            {/* 1. Header Banner */}
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
                  fontSize: '12px',
                  fontWeight: 800,
                  color: '#ffffff',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase'
                }}
              >
                {ticket.tenant_name}
              </span>
              <span
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color: '#ffffff',
                  marginTop: '6px',
                  lineHeight: 1.2
                }}
              >
                {ticket.event_title}
              </span>
            </div>

            {/* 2. Venue / Location & Event Date Bar */}
            <div
              style={{
                width: '100%',
                backgroundColor: '#f8fafc',
                padding: '12px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid #e2e8f0',
                boxSizing: 'border-box'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, letterSpacing: '0.5px' }}>
                  VENUE / LOCATION
                </span>
                <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 800, marginTop: '2px' }}>
                  {ticket.event_location}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, letterSpacing: '0.5px' }}>
                  EVENT DATE
                </span>
                <span style={{ fontSize: '13px', color: '#4f46e5', fontWeight: 800, marginTop: '2px' }}>
                  {eventDateStr}
                </span>
              </div>
            </div>

            {/* 3. Main Body Content (Attendee Info + QR Code) */}
            <div
              style={{
                width: '100%',
                padding: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                boxSizing: 'border-box'
              }}
            >
              {/* Left Column: Attendee & Pass Details */}
              <div style={{ display: 'flex', flexDirection: 'column', width: '56%' }}>
                {/* Attendee Name */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, letterSpacing: '0.5px' }}>
                    ATTENDEE NAME
                  </span>
                  <span style={{ fontSize: '20px', color: '#0f172a', fontWeight: 900, marginTop: '2px' }}>
                    {ticket.attendee_name}
                  </span>
                </div>

                {/* Ticket Tier */}
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '16px' }}>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, letterSpacing: '0.5px' }}>
                    TICKET TIER
                  </span>
                  <span style={{ fontSize: '15px', color: '#4f46e5', fontWeight: 800, marginTop: '2px' }}>
                    {ticket.tier_name}
                  </span>
                </div>

                {/* Age & Ticket ID */}
                <div style={{ display: 'flex', marginTop: '16px', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', width: '70px' }}>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>AGE</span>
                    <span style={{ fontSize: '13px', color: '#0f172a', fontWeight: 700, marginTop: '2px' }}>
                      {ticket.attendee_age} years
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>TICKET ID</span>
                    <span style={{ fontSize: '11px', color: '#0f172a', fontWeight: 800, marginTop: '2px', wordBreak: 'break-all' }}>
                      {ticket.id}
                    </span>
                  </div>
                </div>

                {/* Booking Order & Phone */}
                <div style={{ display: 'flex', marginTop: '14px', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', width: '130px' }}>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>BOOKING ORDER</span>
                    <span style={{ fontSize: '10px', color: '#0f172a', fontWeight: 700, marginTop: '2px', wordBreak: 'break-all' }}>
                      {ticket.order_id}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>PHONE (GUEST AUTH)</span>
                    <span style={{ fontSize: '11px', color: '#0f172a', fontWeight: 700, marginTop: '2px' }}>
                      {ticket.customer_phone || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: QR Code Box */}
              <div
                style={{
                  width: '38%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  backgroundColor: '#ffffff',
                  padding: '14px',
                  borderRadius: '12px',
                  border: '1.5px solid #cbd5e1',
                  boxSizing: 'border-box'
                }}
              >
                {/* QR Code image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="Entry QR Code"
                  width={170}
                  height={170}
                  style={{ width: '170px', height: '170px', display: 'flex' }}
                />
                <span
                  style={{
                    fontSize: '9px',
                    color: '#4f46e5',
                    fontWeight: 800,
                    marginTop: '8px',
                    letterSpacing: '0.5px'
                  }}
                >
                  SCAN AT ENTRY GATE
                </span>
                <span style={{ fontSize: '8px', color: '#64748b', marginTop: '2px' }}>
                  Cryptographically HMAC Signed
                </span>
              </div>
            </div>

            {/* 4. Perforated Divider */}
            <div
              style={{
                width: '100%',
                borderTop: '1.5px dashed #cbd5e1',
                margin: '8px 0'
              }}
            />

            {/* 5. Entry Pass & Gate Policy Instructions */}
            <div
              style={{
                width: '100%',
                padding: '14px 24px',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box'
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#0f172a',
                  letterSpacing: '0.5px'
                }}
              >
                OFFICIAL ENTRY PASS & GATE POLICY
              </span>
              <span style={{ fontSize: '10px', color: '#475569', marginTop: '4px' }}>
                1. Present this digital e-ticket or printed PDF at the designated entry scanner gate.
              </span>
              <span style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                2. This ticket carries a high-entropy tamper-evident cryptographic signature.
              </span>
              <span style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                3. Re-entry requires explicit organizer clearance via Gate Operations Scanner.
              </span>
            </div>

            {/* 6. Bottom Footer Bar */}
            <div
              style={{
                width: '100%',
                backgroundColor: '#0f172a',
                padding: '12px 24px',
                display: 'flex',
                flexDirection: 'column',
                marginTop: 'auto',
                boxSizing: 'border-box'
              }}
            >
              <span style={{ fontSize: '9px', color: '#94a3b8', fontWeight: 600 }}>
                {`ISSUED: ${issuedDateStr} | GATEWAY: ${(ticket.gateway_type || 'CASHFREE').toUpperCase()}`}
              </span>
              <span style={{ fontSize: '9px', color: '#38bdf8', fontWeight: 800, marginTop: '3px' }}>
                POWERED BY MULTI-TENANT TICKETING PLATFORM
              </span>
            </div>
          </div>
        </div>
      ),
      {
        width: 650,
        height: 920
      }
    );
  } catch (err: any) {
    return new NextResponse(`Error generating PNG ticket: ${err.message}`, { status: 500 });
  }
}
