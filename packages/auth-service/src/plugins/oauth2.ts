import fp from 'fastify-plugin';
import oauthPlugin from '@fastify/oauth2';
import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

/**
 * Google OAuth2 provider configuration
 * Extracted to avoid TypeScript issues with accessing static property on default import
 */
const GOOGLE_CONFIGURATION = {
  authorizeHost: 'https://accounts.google.com',
  authorizePath: '/o/oauth2/v2/auth',
  tokenHost: 'https://www.googleapis.com',
  tokenPath: '/oauth2/v4/token',
};

/**
 * OAuth2 plugin registration with Google configuration.
 *
 * Features:
 * - PKCE (S256) for enhanced security
 * - Automatic state parameter CSRF protection
 * - HttpOnly cookies with secure settings in production
 * - Scopes: openid, email, profile
 *
 * Prerequisites:
 * - Cookie plugin must be registered first
 *
 * After registration, the fastify instance has:
 * - fastify.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply)
 * - Automatic redirect at /auth/google
 */
export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(oauthPlugin, {
      name: 'googleOAuth2',
      scope: ['openid', 'email', 'profile'],
      credentials: {
        client: {
          id: config.google.clientId,
          secret: config.google.clientSecret,
        },
        auth: GOOGLE_CONFIGURATION,
      },
      startRedirectPath: '/auth/google',
      callbackUri: config.google.callbackUrl,
      pkce: 'S256',
      cookie: {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        path: '/',
      },
    });
  },
  {
    name: 'oauth2-plugin',
    dependencies: ['cookie-plugin'],
  }
);
