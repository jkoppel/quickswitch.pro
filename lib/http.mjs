// Request/response helpers for the Web-standard handlers Vercel runs.
import { timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

// Reads a JSON body, refusing anything over `cap` bytes before and after reading.
export async function readJson(request, cap = 32 * 1024) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > cap) throw new HttpError(413, 'body too large');
  const text = await request.text();
  if (text.length > cap) throw new HttpError(413, 'body too large');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'invalid JSON'); }
}

export function parseCookies(request) {
  const out = {};
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// The origin the browser used: https://quickswitch.pro, a preview URL, or localhost.
export function requestOrigin(request) {
  const url = new URL(request.url);
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host).split(',')[0].trim();
  const proto = (request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')).split(',')[0].trim();
  return `${proto}://${host}`;
}

export function isSecureOrigin(origin) {
  const u = new URL(origin);
  return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
}

export function cookie(name, value, { maxAge, httpOnly = true, secure = true, sameSite = 'Lax' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=${sameSite}`;
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  if (httpOnly) c += '; HttpOnly';
  if (secure) c += '; Secure';
  return c;
}

export function redirect(location, cookies = []) {
  const headers = new Headers({ location, 'cache-control': 'no-store' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

// Constant-time string comparison for bearer tokens.
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function bearer(request) {
  const h = request.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}
