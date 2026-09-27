import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createPaytmPayment } from '@/Services/PaytmService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    // Fetch verified order details from database
    const order: any = await db.prepare(`
      SELECT o.*, t.name as tenant_name, t.slug as tenant_slug,
             COALESCE(e.title, o.event_title, 'Tickets') as display_event_title
      FROM orders o
      JOIN tenants t ON o.tenant_id = t.id
      LEFT JOIN ticket_tiers tt ON o.tier_id = tt.id
      LEFT JOIN events e ON tt.event_id = e.id
      WHERE o.id = ?
    `).get(orderId);

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    if (order.payment_status === 'PAID') {
      return NextResponse.json({ success: false, message: 'Order is already marked as PAID' }, { status: 400 });
    }

    const amountRupees = Number((order.total_charged / 100).toFixed(2));
    const isMobile = request.headers.get('user-agent')?.toLowerCase().includes('mobile') || false;
    const origin = request.headers.get('origin') || request.headers.get('host') ? `http://${request.headers.get('host')}` : (process.env.BASE_URL || 'http://localhost:5000');
    const callbackUrl = `${origin}/api/client/paytm/callback`;

    const paytmData = await createPaytmPayment({
      orderId: order.id,
      amount: amountRupees,
      customerPhone: order.customer_phone,
      customerEmail: order.customer_email,
      isMobile,
      callbackUrl
    });

    const acceptsJson = request.headers.get('accept')?.includes('application/json') || request.nextUrl.searchParams.get('format') === 'json';
    if (acceptsJson) {
      return NextResponse.json({
        success: true,
        orderId: order.id,
        processTxnUrl: paytmData.processTxnUrl,
        paytmParams: paytmData.paytmParams,
        checksum: paytmData.checksum
      });
    }

    // HTML Auto-Submitting Form Trampoline for seamless redirection to Paytm Secure Gateway
    const formFields = Object.entries(paytmData.paytmParams)
      .map(([key, val]) => `<input type="hidden" name="${key}" value="${String(val).replace(/"/g, '&quot;')}" />`)
      .join('\n      ');

    const htmlTrampoline = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Redirecting to Paytm Payment Gateway...</title>
  <style>
    body {
      background: #090d16;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
      box-sizing: border-box;
    }
    .card {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 28px 24px;
      max-width: 380px;
      width: 100%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .paytm-badge {
      display: inline-block;
      background: #002970;
      color: #00b9f5;
      font-weight: 900;
      font-size: 1.1rem;
      padding: 6px 14px;
      border-radius: 8px;
      letter-spacing: 0.5px;
      margin-bottom: 16px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(0, 185, 245, 0.2);
      border-top-color: #00b9f5;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn {
      display: inline-block;
      margin-top: 18px;
      padding: 12px 24px;
      background: #00b9f5;
      color: #090d16;
      text-decoration: none;
      font-weight: 800;
      border-radius: 10px;
      font-size: 0.95rem;
      border: none;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="paytm-badge">Paytm <span style="color: #ffffff;">PG</span></div>
    <div class="spinner"></div>
    <h3 style="margin: 0 0 8px 0; font-size: 1.15rem;">Connecting to Paytm Gateway...</h3>
    <p style="color: #94a3b8; font-size: 0.85rem; margin: 0 0 14px 0;">
      Amount: <b>₹${amountRupees.toFixed(2)}</b> &bull; Booking #${order.id}
    </p>
    <p style="color: #64748b; font-size: 0.75rem; margin: 0;">Please do not refresh or close this window.</p>

    <form id="paytmForm" action="${paytmData.processTxnUrl}" method="POST">
      ${formFields}
      <noscript>
        <button type="submit" class="btn">Click here if not redirected automatically</button>
      </noscript>
    </form>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      document.getElementById('paytmForm').submit();
    });
  </script>
</body>
</html>`;

    return new Response(htmlTrampoline, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    });
  } catch (err: any) {
    console.error('Paytm pay route error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
