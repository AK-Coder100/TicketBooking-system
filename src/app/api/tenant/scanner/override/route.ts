import { NextRequest, NextResponse } from 'next/server';
import { overrideCheckIn } from '@/lib/scanner';
import { getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = await request.json();
    const { ticketId, reason } = body;

    if (!ticketId) {
      return NextResponse.json({ success: false, error: 'Ticket ID is required' }, { status: 400 });
    }

    const result = await overrideCheckIn({
      ticketId,
      adminId: session?.name || session?.email || 'gate_supervisor',
      reason: reason || 'Manual Organizer Clearance'
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
