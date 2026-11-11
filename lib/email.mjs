// Email sign-in and verification by a six-digit code. Neon Auth (provisioned with the database) sends
// and checks the codes; this server only asks it, so the browser never talks to Neon Auth and no
// email provider or domain of our own is needed. A verified address is a sign-in method like
// Discord: verifying an address that already belongs to another account switches to that account.
import { q } from './db.mjs';
import { HttpError } from './http.mjs';
import { getUser, mergeUsers, updateUser } from './users.mjs';

// Practical, not RFC 5322: one @, a dot in the domain, no spaces, at most 254 characters.
export const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const SEND_WINDOW_MS = 60 * 60 * 1000;
const SENDS_PER_WINDOW = 5;
const RESEND_GAP_MS = 30 * 1000;

// Development gets the development branch's auth service, exactly as it gets its own database.
export function authBase() {
  return process.env.DEV_NEON_AUTH_BASE_URL || process.env.NEON_AUTH_BASE_URL || null;
}
export function emailEnabled() { return !!authBase(); }

export function normalizeEmail(v) {
  const e = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (e.length > 254 || !EMAIL.test(e)) throw new HttpError(400, 'that doesn’t look like an email address');
  return e;
}

// Node's fetch marks requests as browser-mode (sec-fetch-mode: cors), so Neon Auth insists on an
// Origin it trusts. Its own origin always is; this is a server-to-server call, not a browser one.
async function neonAuth(path, body, fetchImpl = fetch) {
  const base = authBase();
  const res = await fetchImpl(`${base}/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: new URL(base).origin }, body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  return { ok: res.ok, status: res.status, data };
}

// Sends a code to `email` and remembers it as the address this session is verifying.
export async function startEmail(ctx, body, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!emailEnabled()) throw new HttpError(503, 'email sign-in is not set up');
  const email = normalizeEmail(body && body.email);
  const user = await ctx.ensureUser();
  const sentAt = user.email_sent_at ? new Date(user.email_sent_at).getTime() : 0;
  const inWindow = now - sentAt < SEND_WINDOW_MS;
  if (sentAt && now - sentAt < RESEND_GAP_MS) throw new HttpError(429, 'wait a few seconds before asking for another code');
  if (inWindow && (user.email_send_count || 0) >= SENDS_PER_WINDOW) throw new HttpError(429, 'too many codes in the last hour; try again later');
  const r = await neonAuth('email-otp/send-verification-otp', { email, type: 'sign-in' }, fetchImpl);
  if (!r.ok) {
    console.error('email code send failed:', r.status, r.data && r.data.code);
    throw new HttpError(502, 'could not send the code; try again in a minute');
  }
  await updateUser(user.id, {
    pending_email: email,
    email_sent_at: new Date(now).toISOString(),
    email_send_count: inWindow ? (user.email_send_count || 0) + 1 : 1,
  });
  return { ok: true, email };
}

// Checks the code for the pending address. On success the address is verified and becomes this
// session's sign-in; if another account already owns it, the session moves to that account and
// whatever this browser did as a guest comes along.
export async function verifyEmail(ctx, body, { fetchImpl = fetch } = {}) {
  if (!emailEnabled()) throw new HttpError(503, 'email sign-in is not set up');
  const code = typeof (body && body.code) === 'string' ? body.code.replace(/\s+/g, '') : '';
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'the code is six digits');
  const current = await ctx.user();
  if (!current || !current.pending_email) throw new HttpError(400, 'ask for a code first');
  const email = current.pending_email;
  const r = await neonAuth('sign-in/email-otp', { email, otp: code }, fetchImpl);
  if (!r.ok) {
    const c = r.data && r.data.code;
    if (c === 'TOO_MANY_ATTEMPTS') throw new HttpError(429, 'too many tries; ask for a new code');
    if (c === 'OTP_EXPIRED') throw new HttpError(400, 'that code has expired; ask for a new one');
    throw new HttpError(400, 'that code isn’t right');
  }
  return attachEmail(ctx, current, email);
}

export async function attachEmail(ctx, current, email) {
  const owner = (await q('SELECT * FROM users WHERE email = $1', [email]))[0];
  let user;
  let merged = false;
  if (owner && owner.id !== current.id) {
    if (current.kind === 'anon') { await mergeUsers(current.id, owner.id); merged = true; }
    else await updateUser(current.id, { pending_email: null });
    user = owner;
  } else {
    user = await updateUser(current.id, { email, email_verified_at: new Date().toISOString(), pending_email: null, kind: 'member' });
  }
  ctx.setSession(user.id);
  ctx._user = await getUser(user.id);
  return { user: ctx._user, merged };
}
