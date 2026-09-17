import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, signAuthToken, AUTH_COOKIE_NAME } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password are required' }, { status: 400 });
    }

    const authResult = authenticateUser(email, password);
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ success: false, error: authResult.error || 'Authentication failed' }, { status: 401 });
    }

    const user = authResult.user;
    const tenantRole = user.tenant_role || (user.role === 'SUPER_ADMIN' ? 'OWNER' : 'OWNER');
    const canCreateEvents = user.can_create_events != null ? Boolean(user.can_create_events) : true;

    const token = signAuthToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      name: user.name,
      tenantRole,
      canCreateEvents
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        tenantRole,
        canCreateEvents
      }
    });

    // Set secure HTTP-only cookie
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
