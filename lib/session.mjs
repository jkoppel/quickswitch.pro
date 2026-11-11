// Session cookie: base64url(userId).issuedAtSeconds.hmacSha256, signed with SESSION_SECRET.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookie, isSecureOrigin, parseCookies, requestOrigin } from './http.mjs';

export const SESSION_COOKIE = 'st_session';
export const SESSION_MAX_AGE = 400 * 86400; // seconds; Chrome's cap on cookie lifetime

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is missing or too short');
  return s;
}

export function hmac(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function signSession(userId, issuedAt = Math.floor(Date.now() / 1000)) {
  const payload = `${Buffer.from(userId).toString('base64url')}.${issuedAt}`;
  return `${payload}.${hmac(payload)}`;
}

// Returns the user id, or null for anything malformed, forged or expired.
export function verifySession(value, now = Math.floor(Date.now() / 1000)) {
  if (typeof value !== 'string') return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [idPart, iatPart, sig] = parts;
  const expected = hmac(`${idPart}.${iatPart}`);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const iat = Number(iatPart);
  if (!Number.isInteger(iat) || iat > now + 60 || now - iat > SESSION_MAX_AGE) return null;
  const id = Buffer.from(idPart, 'base64url').toString();
  return UUID.test(id) ? id : null;
}

export function sessionUserId(request) {
  return verifySession(parseCookies(request)[SESSION_COOKIE]);
}

export function sessionCookie(request, userId) {
  return cookie(SESSION_COOKIE, signSession(userId), { maxAge: SESSION_MAX_AGE, secure: isSecureOrigin(requestOrigin(request)) });
}

export function clearSessionCookie(request) {
  return cookie(SESSION_COOKIE, '', { maxAge: 0, secure: isSecureOrigin(requestOrigin(request)) });
}
