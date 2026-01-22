import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import cookiePlugin from './plugins/cookie.js';
import oauth2Plugin from './plugins/oauth2.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { apiKeyRoutes } from './routes/apikeys.js';

// ESM directory resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Auth Service - Google OAuth authentication for nullplatform
 *
 * This service handles:
 * - Google OAuth login flow with PKCE
 * - Domain restriction to @nullplatform.com
 * - JWT session management via httpOnly cookies
 * - User storage in DynamoDB
 *
 * Plugin registration order matters:
 * 1. CORS - Enable cross-origin requests from portal
 * 2. Cookie - Required by OAuth2 for state storage
 * 3. OAuth2 - Google OAuth flow with PKCE
 * 4. Routes - Auth and health endpoints
 */

const fastify = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
    transport: config.nodeEnv === 'development' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
  },
});

// Register plugins in correct order
async function registerPlugins(): Promise<void> {
  // 1. CORS - Allow credentials from portal
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // 2. Static file serving - MUST be before routes
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
    decorateReply: true,
  });

  // 3. Cookie plugin - MUST be before OAuth2
  await fastify.register(cookiePlugin);

  // 4. OAuth2 plugin - Depends on cookie plugin
  await fastify.register(oauth2Plugin);
}

// Register routes
async function registerRoutes(): Promise<void> {
  // Health check endpoint
  await fastify.register(healthRoutes);

  // Auth routes (login, callback, logout, me)
  await fastify.register(authRoutes);

  // API key management routes
  await fastify.register(apiKeyRoutes);

  // SPA fallback - serve index.html for all non-API routes
  // This must be registered LAST to avoid overriding API routes
  fastify.setNotFoundHandler((request, reply) => {
    // Only serve index.html for HTML requests (browser navigation)
    const acceptsHtml = request.headers.accept?.includes('text/html');

    if (acceptsHtml && !request.url.startsWith('/api') && !request.url.startsWith('/auth')) {
      return reply.sendFile('index.html');
    }

    // For API routes or non-HTML requests, return 404
    reply.status(404).send({ error: 'not_found', message: 'Endpoint not found' });
  });
}

// Graceful shutdown handling
const shutdown = async (signal: string): Promise<void> => {
  fastify.log.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await fastify.close();
    fastify.log.info('Server closed successfully');
    process.exit(0);
  } catch (err) {
    fastify.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
const start = async (): Promise<void> => {
  try {
    // Register plugins and routes before starting
    await registerPlugins();
    await registerRoutes();

    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    fastify.log.info(`Auth service listening on port ${config.port}`);
    fastify.log.info({
      endpoints: {
        health: `http://localhost:${config.port}/health`,
        login: `http://localhost:${config.port}/auth/google`,
        me: `http://localhost:${config.port}/auth/me`,
      },
    }, 'Available endpoints');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
