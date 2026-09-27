import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import QRCode from 'qrcode';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ success: false, error: 'Tenant slug is required' }, { status: 400 });
    }

    const tenant: any = await db.prepare('SELECT id, slug, name FROM tenants WHERE slug = ?').get(slug);
    if (!tenant) {
      return NextResponse.json({ success: false, error: 'Tenant not found' }, { status: 404 });
    }

    const origin = request.headers.get('origin') || request.headers.get('host') ? `http://${request.headers.get('host')}` : 'http://localhost:5000';
    const targetUrl = `${origin}/${tenant.slug}`;

    const sizeParam = request.nextUrl.searchParams.get('size');
    const width = sizeParam ? parseInt(sizeParam, 10) : 1024;
    const isDownload = request.nextUrl.searchParams.get('download') === 'true' || request.nextUrl.searchParams.get('download') === '1';

    const pngBuffer = await QRCode.toBuffer(targetUrl, {
      type: 'png',
      width: Math.min(Math.max(width, 300), 2048),
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });

    const headers: Record<string, string> = {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400'
    };

    if (isDownload) {
      headers['Content-Disposition'] = `attachment; filename="${tenant.slug}-booking-qr.png"`;
    }

    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
