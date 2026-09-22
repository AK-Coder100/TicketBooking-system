import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeSplitRules } from '@/lib/payment';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { items, tierId, quantity } = body;

    let itemList: Array<{ tierId: string; quantity: number }> = [];
    if (Array.isArray(items) && items.length > 0) {
      itemList = items.map(i => ({ tierId: i.tierId, quantity: parseInt(i.quantity, 10) || 0 })).filter(i => i.quantity > 0);
    } else if (tierId) {
      itemList = [{ tierId, quantity: parseInt(quantity, 10) || 1 }];
    }

    if (itemList.length === 0) return NextResponse.json({ success: false, error: 'No items specified' }, { status: 400 });

    const primaryTierId = itemList[0].tierId;
    const primaryTier: any = await db.prepare(`
      SELECT tt.*, e.tenant_id, t.default_platform_fee, t.is_gateway_fee_passed_to_customer, t.gateway_account_id
      FROM ticket_tiers tt
      JOIN events e ON tt.event_id = e.id
      JOIN tenants t ON e.tenant_id = t.id
      WHERE tt.id = ?
    `).get(primaryTierId);

    if (!primaryTier) return NextResponse.json({ success: false, error: 'Tier not found' }, { status: 404 });

    let basePricePaise = 0;
    let totalCount = 0;

    for (const item of itemList) {
      const t: any = await db.prepare('SELECT price_in_paise FROM ticket_tiers WHERE id = ?').get(item.tierId);
      const price = t ? t.price_in_paise : primaryTier.price_in_paise;
      basePricePaise += price * item.quantity;
      totalCount += item.quantity;
    }

    if (totalCount > 10) {
      return NextResponse.json({ success: false, error: 'Maximum 10 tickets allowed per booking' }, { status: 400 });
    }

    const settingRows: any[] = await db.prepare('SELECT key, value FROM platform_settings').all();
    const platformSettings: Record<string, string> = {};
    for (const r of settingRows) platformSettings[r.key] = r.value;

    const breakdown = computeSplitRules({
      basePricePaise,
      ticketCount: totalCount,
      tenantConfig: primaryTier,
      platformSettings
    });

    return NextResponse.json({
      success: true,
      breakdown: {
        ...breakdown,
        basePriceRupees: (breakdown.basePricePaise / 100).toFixed(2),
        platformFeeRupees: (breakdown.platformFeePaise / 100).toFixed(2),
        convenienceFeeRupees: (breakdown.convenienceFeePaise / 100).toFixed(2),
        totalChargedRupees: (breakdown.totalChargedPaise / 100).toFixed(2),
        organizerNetPayoutRupees: (breakdown.organizerNetPayoutPaise / 100).toFixed(2)
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
