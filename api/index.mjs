// The single API function. vercel.json rewrites /api/<path> here as /api/index?__path=<path>.
import { handle } from '../lib/router.mjs';

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
