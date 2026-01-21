import type { FastifyInstance } from 'fastify';

/**
 * Health check routes for service monitoring and load balancer probes.
 *
 * Endpoints:
 * - GET /health - Basic health check with timestamp
 *
 * @param fastify - Fastify instance
 */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });
}
