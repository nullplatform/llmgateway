import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import type { FastifyInstance } from 'fastify';

/**
 * Cookie plugin registration.
 *
 * This plugin must be registered BEFORE the oauth2 plugin,
 * as @fastify/oauth2 requires cookie support for state parameter storage.
 *
 * Uses fastify-plugin to ensure the plugin is not encapsulated
 * and is available to sibling plugins.
 */
export default fp(
  async (fastify: FastifyInstance) => {
    await fastify.register(cookie);
  },
  {
    name: 'cookie-plugin',
  }
);
