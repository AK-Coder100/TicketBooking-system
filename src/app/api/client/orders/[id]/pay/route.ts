import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateUpiLink, generateAppIntentLinks, validateVpa } from '@/Services/UpiService';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Order ID is required' }, { status: 400 });
    }

    // Fetch verified order details from the database (immutable total_charged)
    const order: any = await db.prepare(`
      SELECT o.*, t.name as tenant_name, t.gateway_account_id,
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

    const payeeVpa = (order.gateway_account_id && validateVpa(order.gateway_account_id))
      ? order.gateway_account_id
      : (process.env.MERCHANT_UPI_ID || 'BHARATPE.8J0S0Z9W9S44900@FBPE');

    const payeeName = order.tenant_name || process.env.MERCHANT_NAME || 'Tickets';
    const amountRupees = Number((order.total_charged / 100).toFixed(2));
    const note = `Booking ${order.id}${order.display_event_title ? ` - ${order.display_event_title}` : ''}`.slice(0, 50);

    const upiLink = generateUpiLink({
      amount: amountRupees,
      currency: 'INR',
      orderId: order.id,
      note,
      payeeVpa,
      payeeName
    });

    const appLinks = generateAppIntentLinks({
      amount: amountRupees,
      currency: 'INR',
      orderId: order.id,
      note,
      payeeVpa,
      payeeName
    });

    const targetApp = request.nextUrl.searchParams.get('app')?.toLowerCase() || 'any';
    let targetUri = upiLink;
    if (targetApp === 'gpay') targetUri = appLinks.gpay;
    else if (targetApp === 'phonepe') targetUri = appLinks.phonepe;
    else if (targetApp === 'paytm') targetUri = appLinks.paytm;
    else if (targetApp === 'bhim') targetUri = appLinks.bhim;
    else if (targetApp === 'cred') targetUri = appLinks.cred;

    // Check if client expects JSON
    const acceptsJson = request.headers.get('accept')?.includes('application/json') || request.nextUrl.searchParams.get('format') === 'json';
    if (acceptsJson) {
      return NextResponse.json({
        success: true,
        orderId: order.id,
        targetApp,
        redirectUri: targetUri,
        upiLink,
        appLinks
      });
    }

    // Server-Side Redirect with HTML Trampoline (supports both HTTP 307 and Android/iOS custom URI launch)
    const htmlTrampoline = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Opening UPI App...</title>
  <meta http-equiv="refresh" content="0;url=${targetUri}">
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
      padding: 24px;
      max-width: 360px;
      width: 100%;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(99, 102, 241, 0.2);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn {
      display: inline-block;
      margin-top: 18px;
      padding: 12px 20px;
      background: #10b981;
      color: #ffffff;
      text-decoration: none;
      font-weight: 700;
      border-radius: 10px;
      font-size: 0.95rem;
    }
  </style>
  <script>
    window.onload = function() {
      window.location.href = ${JSON.stringify(targetUri)};
    };
  </script>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h3 style="margin: 0 0 8px 0; font-size: 1.1rem;">Opening UPI App...</h3>
    <p style="color: #94a3b8; font-size: 0.82rem; margin: 0 0 12px 0;">
      Amount: ₹${amountRupees.toFixed(2)} &bull; Booking #${order.id}
    </p>
    <a href="${targetUri}" class="btn">Tap to Open App Manually</a>
  </div>
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
    console.error('Server-side UPI pay redirect error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
