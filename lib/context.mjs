// Per-request state: the session user, and cookies to set on the way out.
import { sessionCookie, sessionUserId } from './session.mjs';
import { createUser, getUser } from './users.mjs';

export function makeContext(request, url, params = {}) {
  const ctx = {
    request, url, params, cookies: [], _user: undefined,
    // The session user's row, or null. A cookie for a deleted (merged) user counts as no session.
    async user() {
      if (ctx._user === undefined) ctx._user = await getUser(sessionUserId(request));
      return ctx._user;
    },
    // The session user, creating an anonymous one (and its cookie) if there is none.
    async ensureUser() {
      const u = await ctx.user();
      if (u) return u;
      ctx._user = await createUser();
      ctx.setSession(ctx._user.id);
      return ctx._user;
    },
    setSession(userId) { ctx.cookies.push(sessionCookie(request, userId)); },
  };
  return ctx;
}
