import { NextRequest, NextResponse } from 'next/server';
import { createReservation, getActiveReservation } from '@/lib/reservation';

export async function POST(request: NextRequest) {
  try {
    const { tierId, sessionToken, quantity } = await request.json();
    if (!tierId || !sessionToken || quantity === undefined || quantity === null) {
      return NextResponse.json({ success: false, error: 'tierId, sessionToken, and quantity are required' }, { status: 400 });
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty < 1) {
      return NextResponse.json({ success: false, error: 'Quantity must be at least 1' }, { status: 400 });
    }
    if (parsedQty > 10) {
      return NextResponse.json({ success: false, error: 'Maximum 10 tickets allowed per booking' }, { status: 400 });
    }

    const result = await createReservation({
      tierId,
      sessionToken,
      quantity: parsedQty
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('sessionToken');
    const tierId = searchParams.get('tierId');

    if (!sessionToken || !tierId) {
      return NextResponse.json({ success: false, error: 'sessionToken and tierId required' }, { status: 400 });
    }

    const reservation = await getActiveReservation(sessionToken, tierId);
    return NextResponse.json({
      success: true,
      hasReservation: Boolean(reservation),
      reservation
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
