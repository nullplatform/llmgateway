import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyGoogleToken } from '../services/oauth.js';
import { createSessionToken } from '../services/jwt.js';
import { upsertUser } from '../services/user.js';
import { config } from '../config/index.js';
import { requireAuth } from '../middleware/requireAuth.js';

/**
 * Authentication routes for Google OAuth flow.
 *
 * Endpoints:
 * - GET /auth/google - Initiates OAuth flow (handled by @fastify/oauth2 plugin)
 * - GET /auth/google/callback - Handles OAuth callback, creates session
 * - POST /auth/logout - Clears session cookie
 * - GET /auth/me - Returns current user info (protected)
 *
 * @param fastify - Fastify instance with googleOAuth2 decorator
 */
export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /auth/google
   *
   * Initiates the Google OAuth flow by redirecting to Google's authorization page.
   * This route is automatically handled by @fastify/oauth2 plugin configured with
   * startRedirectPath: '/auth/google'
   *
   * The plugin automatically:
   * - Generates PKCE code challenge (S256)
   * - Creates state parameter for CSRF protection
   * - Stores state in httpOnly cookie
   * - Redirects to Google with configured scopes (openid, email, profile)
   *
   * No additional implementation needed - route is handled by oauth2 plugin.
   */

  /**
   * GET /auth/google/callback
   *
   * Handles the OAuth callback from Google.
   * - Exchanges authorization code for tokens
   * - Verifies ID token and domain restriction
   * - Creates/updates user in DynamoDB
   * - Issues session cookie with JWT
   * - Redirects to portal
   */
  fastify.get(
    '/auth/google/callback',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Exchange authorization code for tokens
        // @ts-expect-error - googleOAuth2 is decorated by the oauth2 plugin
        const token = await fastify.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(
          request
        );

        // Extract ID token from the response
        // The token object structure depends on @fastify/oauth2 version
        const idToken = token.token.id_token;

        if (!idToken) {
          fastify.log.error('No id_token in OAuth response');
          return reply.status(400).send({
            error: 'oauth_error',
            message: 'No ID token received from Google',
          });
        }

        // Verify the ID token and enforce domain restriction
        // This throws if the token is invalid or domain is not nullplatform.com
        const googleUser = await verifyGoogleToken(idToken);

        // Create or update user in DynamoDB
        const user = await upsertUser(googleUser);
        fastify.log.info({ email: user.email }, 'User authenticated');

        // Create session JWT
        const sessionToken = await createSessionToken({
          sub: googleUser.sub,
          email: googleUser.email,
        });

        // Set session cookie
        reply.setCookie('session', sessionToken, {
          httpOnly: true,
          secure: config.nodeEnv === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 3600, // 1 hour in seconds
        });

        // Redirect to portal
        return reply.redirect(config.portalUrl);
      } catch (error) {
        // Handle domain restriction error specifically
        if (error instanceof Error && error.message.includes('Access denied')) {
          fastify.log.warn({ error: error.message }, 'Domain restriction blocked login');
          return reply.status(403).send({
            error: 'access_denied',
            message: error.message,
          });
        }

        // Log and return generic OAuth error
        fastify.log.error({ error }, 'OAuth callback error');
        return reply.status(500).send({
          error: 'oauth_error',
          message: 'Authentication failed. Please try again.',
        });
      }
    }
  );

  /**
   * POST /auth/logout
   *
   * Clears the session cookie to log the user out.
   * The client should redirect to the login page after calling this.
   */
  fastify.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('session', {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return {
      success: true,
      message: 'Logged out successfully',
    };
  });

  /**
   * GET /auth/me
   *
   * Returns the current authenticated user's information.
   * Protected by requireAuth middleware - returns 401 if no valid session.
   */
  fastify.get(
    '/auth/me',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest) => {
      // request.user is set by requireAuth middleware
      return request.user;
    }
  );
}
