import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'node:crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event_id, name, price_in_paise, capacity, is_unlimited, valid_date, early_bird_deadline } = body;

    if (!event_id || !name || price_in_paise == null) {
      return NextResponse.json({ success: false, error: 'Event, name, and price are required' }, { status: 400 });
    }

    const tierId = `tier_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO ticket_tiers (id, event_id, name, price_in_paise, capacity, is_unlimited, valid_date, early_bird_deadline, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tierId,
      event_id,
      name,
      parseInt(price_in_paise, 10),
      is_unlimited ? null : (capacity ? parseInt(capacity, 10) : 100),
      is_unlimited ? 1 : 0,
      valid_date || null,
      early_bird_deadline || null,
      now
    );

    return NextResponse.json({ success: true, tierId });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
