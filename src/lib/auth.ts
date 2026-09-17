import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from './db';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_multi_tenant_jwt_signing_key_2026';
export const AUTH_COOKIE_NAME = 'ticket_auth_token';

export interface AuthPayload {
  userId: string;
  email: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'CUSTOMER';
  tenantId: string | null;
  name: string;
  tenantRole?: 'OWNER' | 'EVENT_MANAGER' | 'STAFF';
  canCreateEvents?: boolean;
}

/**
 * Sign JWT session token
 */
export function signAuthToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verify JWT session token
 */
export function verifyAuthToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch (err) {
    return null;
  }
}

/**
 * Authenticate credentials against database
 */
export function authenticateUser(email: string, passwordPlain: string): { success: boolean; user?: any; error?: string } {
  const user: any = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());
  if (!user) {
    return { success: false, error: 'Invalid email or password' };
  }

  if (!user.password_hash) {
    return { success: false, error: 'Account has no password set. Use OTP login.' };
  }

  const isMatch = bcrypt.compareSync(passwordPlain, user.password_hash);
  if (!isMatch) {
    return { success: false, error: 'Invalid email or password' };
  }

  return { success: true, user };
}

/**
 * Get current session from Next.js server context
 */
export async function getSession(): Promise<AuthPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyAuthToken(token);
  } catch (err) {
    return null;
  }
}
