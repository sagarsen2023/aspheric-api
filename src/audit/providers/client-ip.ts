import { Request } from 'express';

/**
 * The caller's identity for rate limiting and the in-flight lock. Both must
 * agree, or a client could be throttled under one identity and locked under
 * another.
 *
 * NOTE: behind a proxy or load balancer, `req.ip` is the proxy's address
 * unless Express is told to trust it (`app.set('trust proxy', 1)` in main.ts).
 * Without that, every client shares a single identity here.
 */
export const clientIdentifier = (request: Request): string =>
  request.ip ?? request.socket.remoteAddress ?? 'unknown';
