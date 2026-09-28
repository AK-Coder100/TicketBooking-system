import { NextRequest } from 'next/server';

/**
 * Resolves the public base URL / origin with proper HTTPS protocol.
 * Ensures HTTPS is strictly used for all public domains (e.g. event.neoclare.com)
 * to prevent browser mixed-content and form security warnings on payment callbacks.
 */
export function getRequestOrigin(request?: NextRequest | null): string {
  // 1. Check explicit BASE_URL from environment
  const envBase = process.env.BASE_URL ? process.env.BASE_URL.trim().replace(/\/$/, '') : '';

  // 2. If request object is available, extract forwarded host/protocol
  if (request) {
    const protoHeader = request.headers.get('x-forwarded-proto');
    const hostHeader = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const originHeader = request.headers.get('origin');

    let host = hostHeader || (originHeader ? originHeader.replace(/^https?:\/\//, '') : '');
    host = host.split(',')[0].trim();

    if (host) {
      // Local development check
      if (host.includes('localhost') || host.includes('127.0.0.1')) {
        const proto = protoHeader === 'https' ? 'https' : 'http';
        return `${proto}://${host}`;
      }

      // For all live domains (e.g. event.neoclare.com), ALWAYS force https://
      return `https://${host}`;
    }
  }

  // 3. Fallback to envBase
  if (envBase) {
    if (envBase.includes('localhost') || envBase.includes('127.0.0.1')) {
      return envBase;
    }
    return envBase.replace(/^http:\/\//, 'https://');
  }

  // 4. Default production fallback
  return 'https://event.neoclare.com';
}
