import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_multi_tenant_jwt_signing_key_2026';
const secretKey = new TextEncoder().encode(JWT_SECRET);
const AUTH_COOKIE = 'ticket_auth_token';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Super Admin Route Protection
  if (pathname.startsWith('/admin')) {
    // Allow public login page & static assets
    if (pathname.startsWith('/admin/login')) {
      return NextResponse.next();
    }

    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) {
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    try {
      const { payload } = await jwtVerify(token, secretKey);
      if (payload.role !== 'SUPER_ADMIN') {
        const loginUrl = new URL('/admin/login', request.url);
        loginUrl.searchParams.set('error', 'unauthorized_role');
        return NextResponse.redirect(loginUrl);
      }
      return NextResponse.next();
    } catch (err) {
      const loginUrl = new URL('/admin/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 2. Tenant Admin (Organizer) Route Protection
  if (pathname.startsWith('/organizer')) {
    // Allow public login page
    if (pathname.startsWith('/organizer/login')) {
      return NextResponse.next();
    }

    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) {
      const loginUrl = new URL('/organizer/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    try {
      const { payload } = await jwtVerify(token, secretKey);
      if (payload.role !== 'TENANT_ADMIN' && payload.role !== 'SUPER_ADMIN') {
        const loginUrl = new URL('/organizer/login', request.url);
        loginUrl.searchParams.set('error', 'unauthorized_role');
        return NextResponse.redirect(loginUrl);
      }
      return NextResponse.next();
    } catch (err) {
      const loginUrl = new URL('/organizer/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 3. Admin & Tenant Protected API endpoints
  if (pathname.startsWith('/api/admin')) {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    try {
      const { payload } = await jwtVerify(token, secretKey);
      if (payload.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ success: false, error: 'Super Admin privileges required' }, { status: 403 });
      }
    } catch (err) {
      return NextResponse.json({ success: false, error: 'Invalid or expired session token' }, { status: 401 });
    }
  }

  if (pathname.startsWith('/api/tenant')) {
    const token = request.cookies.get(AUTH_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }
    try {
      const { payload } = await jwtVerify(token, secretKey);
      if (payload.role !== 'TENANT_ADMIN' && payload.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ success: false, error: 'Organizer privileges required' }, { status: 403 });
      }
    } catch (err) {
      return NextResponse.json({ success: false, error: 'Invalid or expired session token' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/organizer/:path*',
    '/api/admin/:path*',
    '/api/tenant/:path*'
  ]
};
