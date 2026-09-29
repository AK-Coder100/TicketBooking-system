import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'PENDING';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const phone = searchParams.get('phone');

    let query = `SELECT * FROM whatsapp_msg_in_queue WHERE status = ?`;
    const params: any[] = [status];

    if (phone) {
      query += ` AND phone = ?`;
      params.push(phone);
    }

    query += ` ORDER BY created_at ASC LIMIT ?`;
    params.push(limit);

    const messages = await db.prepare(query).all(...params);

    return NextResponse.json({
      success: true,
      count: messages.length,
      messages
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, last_error } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'id and status are required' }, { status: 400 });
    }

    await db.prepare(`
      UPDATE whatsapp_msg_in_queue
      SET status = ?,
          last_error = ?,
          attempts = attempts + 1,
          processed_at = NOW()
      WHERE id = ?
    `).run(status, last_error || null, id);

    return NextResponse.json({ success: true, message: `Message ${id} updated to ${status}` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
