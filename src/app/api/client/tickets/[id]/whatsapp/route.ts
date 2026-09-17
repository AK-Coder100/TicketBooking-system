import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppTicketMessage } from '@/lib/whatsapp';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const customPhone = body?.phone;

    const result = await sendWhatsAppTicketMessage({
      ticketId: id,
      toPhone: customPhone
    });

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error || 'WhatsApp message dispatch failed'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Official ticket pass sent to WhatsApp!`,
      result
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
