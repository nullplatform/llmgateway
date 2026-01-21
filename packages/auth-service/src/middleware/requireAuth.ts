import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifySessionToken } from '../services/jwt.js';

/**
 * Module augmentation to add user property to FastifyRequest
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      sub: string;
      email: string;
    };
  }
}

/**
 * Authentication middleware that validates session tokens.
 *
 * - Extracts JWT from 'session' cookie
 * - Verifies token signature and expiration
 * - Attaches user info (sub, email) to request object
 *
 * Use as preHandler on protected routes:
 *   fastify.get('/protected', { preHandler: [requireAuth] }, handler)
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies.session;

  if (!token) {
    return reply.status(401).send({
      error: 'unauthorized',
      message: 'No session token provided',
    });
  }

  try {
    const payload = await verifySessionToken(token);

    // Attach user info to request for use in route handlers
    request.user = {
      sub: payload.sub,
      email: payload.email,
    };
  } catch (error) {
    // Clear invalid/expired session cookie
    reply.clearCookie('session', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return reply.status(401).send({
      error: 'invalid_session',
      message: 'Session expired or invalid',
    });
  }
}
