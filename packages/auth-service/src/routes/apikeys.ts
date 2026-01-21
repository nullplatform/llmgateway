import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from '../middleware/requireAuth.js';
import { createApiKey, listApiKeys, revokeApiKey, validateApiKey } from '../services/apikey.js';

/**
 * API Key management routes.
 *
 * Protected endpoints (require session authentication):
 * - POST /api/keys - Create new API key
 * - GET /api/keys - List user's API keys
 * - DELETE /api/keys/:keyId - Revoke API key
 *
 * Public endpoints (no authentication required):
 * - GET /api/keys/validate - Validate API key (called by gateway)
 *
 * @param fastify - Fastify instance
 */
export async function apiKeyRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/keys
   *
   * Create a new API key for the authenticated user.
   * Returns the full key only once - it cannot be retrieved again.
   */
  fastify.post<{
    Body: { name: string };
  }>(
    '/api/keys',
    {
      preHandler: [requireAuth],
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
          },
          additionalProperties: false,
        },
        response: {
          201: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              key_id: { type: 'string' },
              name: { type: 'string' },
              key_prefix: { type: 'string' },
              created_at: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: { name: string } }>, reply: FastifyReply) => {
      // request.user is set by requireAuth middleware
      const user = request.user!;

      const result = await createApiKey(user, request.body.name);

      return reply.status(201).send(result);
    }
  );

  /**
   * GET /api/keys
   *
   * List all active API keys for the authenticated user.
   * Keys are returned with prefix only (not full key).
   */
  fastify.get(
    '/api/keys',
    {
      preHandler: [requireAuth],
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              keys: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key_id: { type: 'string' },
                    name: { type: 'string' },
                    key_prefix: { type: 'string' },
                    created_at: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest) => {
      // request.user is set by requireAuth middleware
      const user = request.user!;

      const keys = await listApiKeys(user.sub);

      return { keys };
    }
  );

  /**
   * DELETE /api/keys/:keyId
   *
   * Revoke an API key belonging to the authenticated user.
   * Key must belong to user and must not already be revoked.
   */
  fastify.delete<{
    Params: { keyId: string };
  }>(
    '/api/keys/:keyId',
    {
      preHandler: [requireAuth],
      schema: {
        params: {
          type: 'object',
          required: ['keyId'],
          properties: {
            keyId: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
          404: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { keyId: string } }>, reply: FastifyReply) => {
      // request.user is set by requireAuth middleware
      const user = request.user!;
      const { keyId } = request.params;

      const success = await revokeApiKey(keyId, user.sub);

      if (!success) {
        return reply.status(404).send({
          error: 'not_found',
          message: 'API key not found, already revoked, or does not belong to you',
        });
      }

      return { success: true };
    }
  );

  /**
   * GET /api/keys/validate
   *
   * Validate an API key and return user metadata.
   * This endpoint is PUBLIC - called by the gateway without authentication.
   *
   * Query params:
   * - key: Full API key to validate
   *
   * Returns:
   * - 200: Valid key with user metadata
   * - 400: Missing key parameter
   * - 401: Invalid or revoked key
   */
  fastify.get<{
    Querystring: { key?: string };
  }>(
    '/api/keys/validate',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            key: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              valid: { type: 'boolean' },
              key_id: { type: 'string' },
              key_name: { type: 'string' },
              user_email: { type: 'string' },
              user_sub: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              valid: { type: 'boolean' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          401: {
            type: 'object',
            properties: {
              valid: { type: 'boolean' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { key?: string } }>, reply: FastifyReply) => {
      const { key } = request.query;

      if (!key) {
        return reply.status(400).send({
          valid: false,
          error: 'missing_key',
          message: 'API key parameter is required',
        });
      }

      const result = await validateApiKey(key);

      if (!result.valid) {
        return reply.status(401).send({
          valid: false,
          error: 'invalid_key',
          message: 'API key is invalid or has been revoked',
        });
      }

      return {
        valid: true,
        key_id: result.key_id,
        key_name: result.key_name,
        user_email: result.user_email,
        user_sub: result.user_sub,
      };
    }
  );
}
