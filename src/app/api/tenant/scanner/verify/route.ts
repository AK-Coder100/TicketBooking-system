import { NextRequest, NextResponse } from 'next/server';
import { verifyAndScanTicket } from '@/lib/scanner';
import { getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = await request.json();
    const { qrToken, eventId, expectedEventId, sessionId, expectedSessionId, deviceInfo } = body;

    if (!qrToken) {
      return NextResponse.json({ success: false, error: 'QR token is required' }, { status: 400 });
    }

    const ip = request.headers.get('x-forwarded-for') || '127.0.0.1';
    const result = await verifyAndScanTicket({
      qrToken,
      expectedEventId: expectedEventId || eventId,
      expectedSessionId: expectedSessionId || sessionId,
      adminId: session?.name || session?.email || 'gate_scanner',
      ip,
      deviceInfo: deviceInfo || 'Mobile PWA Camera'
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
