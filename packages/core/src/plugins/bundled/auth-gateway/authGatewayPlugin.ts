/**
 * Auth Gateway Plugin
 *
 * Validates API keys against the auth service and injects user metadata
 * into request context. This enables request tracing back to individual users.
 *
 * Security features:
 * - Strips forged X-Auth-* and X-User-* headers from incoming requests
 * - Fails closed (503) when auth service is unreachable
 * - Caches with composite key (apiKey:method:path) to prevent authz bypass
 */

import {
  ILLMPlugin,
  ExtensionMetadata,
  IRequestContext,
  ILLMPluginResult,
} from '@nullplatform/llm-gateway-sdk';
import { ValidationCache } from './validationCache.js';
import { AuthServiceClient } from './authServiceClient.js';
import { AuthGatewayPluginConfig, ValidationResult } from './types.js';

// Default configuration values
const DEFAULT_CACHE_TTL_SECONDS = 30;
const DEFAULT_CACHE_MAX_SIZE = 10000;
const DEFAULT_SERVICE_TIMEOUT_MS = 5000;

@ExtensionMetadata({
  name: 'auth-gateway',
  version: '1.0.0',
  description: 'Validates API keys against auth service and injects user metadata',
  configurationSchema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    title: 'Auth Gateway Plugin Configuration',
    description: 'Configuration for the auth gateway plugin',
    required: ['authServiceUrl'],
    properties: {
      authServiceUrl: {
        type: 'string',
        description: 'Base URL of the auth service (e.g., http://localhost:3001)',
        minLength: 1,
      },
      cacheTtlSeconds: {
        type: 'number',
        description: 'Cache TTL in seconds (default: 30)',
        minimum: 1,
        maximum: 300,
        default: 30,
      },
      cacheMaxSize: {
        type: 'number',
        description: 'Maximum cache entries (default: 10000)',
        minimum: 100,
        maximum: 100000,
        default: 10000,
      },
      serviceTimeoutMs: {
        type: 'number',
        description: 'HTTP timeout for auth service calls in ms (default: 5000)',
        minimum: 1000,
        maximum: 30000,
        default: 5000,
      },
    },
    additionalProperties: false,
  },
})
export class AuthGatewayPlugin implements ILLMPlugin {
  private config!: AuthGatewayPluginConfig;
  private cache!: ValidationCache;
  private httpClient!: AuthServiceClient;

  /**
   * Configure the plugin with auth service settings.
   */
  async configure(config: AuthGatewayPluginConfig): Promise<void> {
    this.config = config;

    const ttlSeconds = config.cacheTtlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
    const maxSize = config.cacheMaxSize ?? DEFAULT_CACHE_MAX_SIZE;
    const timeoutMs = config.serviceTimeoutMs ?? DEFAULT_SERVICE_TIMEOUT_MS;

    this.cache = new ValidationCache(maxSize, ttlSeconds);
    this.httpClient = new AuthServiceClient(config.authServiceUrl, timeoutMs);
  }

  /**
   * Validate plugin configuration.
   */
  async validateConfig(config: AuthGatewayPluginConfig): Promise<boolean | string> {
    if (!config.authServiceUrl || typeof config.authServiceUrl !== 'string') {
      return 'Invalid configuration: authServiceUrl must be a non-empty string';
    }

    if (
      config.cacheTtlSeconds !== undefined &&
      (config.cacheTtlSeconds < 1 || config.cacheTtlSeconds > 300)
    ) {
      return 'Invalid configuration: cacheTtlSeconds must be between 1 and 300';
    }

    return true;
  }

  /**
   * Validate API key and enrich request context before model invocation.
   *
   * Flow:
   * 1. Strip forged X-Auth-* and X-User-* headers
   * 2. Extract API key from Authorization or X-API-Key header
   * 3. Check cache for validation result
   * 4. If not cached, call auth service
   * 5. Return 401 for invalid keys, 503 for service errors
   * 6. Enrich context with user metadata for valid keys
   */
  async beforeModel(llmRequest: IRequestContext): Promise<ILLMPluginResult> {
    // Step 1: Strip forged headers (security requirement)
    const sanitizedHeaders = this.stripForgableHeaders(llmRequest.httpRequest?.headers || {});

    // Step 2: Extract API key
    const authHeader = sanitizedHeaders['authorization'] || sanitizedHeaders['x-api-key'] || '';
    const apiKey = authHeader.replace(/^Bearer\s+/i, '');

    if (!apiKey) {
      return {
        success: false,
        terminate: true,
        status: 401,
        error: new Error('Unauthorized: Missing API key'),
      };
    }

    // Step 3: Build cache key (CRITICAL - includes method and path to prevent authz bypass)
    const method = llmRequest.httpRequest?.method || 'GET';
    const path = llmRequest.httpRequest?.url || '/';
    const cacheKey = this.cache.getCacheKey(apiKey, method, path);

    // Step 4: Check cache
    let validationResult = this.cache.get(cacheKey);

    if (!validationResult) {
      // Step 5: Call auth service
      try {
        validationResult = await this.httpClient.validateKey(apiKey);
        this.cache.set(cacheKey, validationResult);
      } catch (error) {
        // FAIL CLOSED - service unavailable returns 503, NOT 200
        return {
          success: false,
          terminate: true,
          status: 503,
          error: new Error('Auth service unavailable'),
        };
      }
    }

    // Step 6: Handle invalid key
    if (!validationResult.valid) {
      return {
        success: false,
        terminate: true,
        status: 401,
        error: new Error('Unauthorized: Invalid API key'),
      };
    }

    // Step 7: Handle valid key - enrich context
    return {
      success: true,
      context: {
        ...llmRequest,
        user_id: validationResult.user_sub,
        httpRequest: {
          ...llmRequest.httpRequest!,
          headers: sanitizedHeaders, // Use sanitized headers
        },
        metadata: {
          ...llmRequest.metadata,
          auth_key_id: validationResult.key_id,
          auth_key_name: validationResult.key_name,
          auth_user_email: validationResult.user_email,
          auth_user_sub: validationResult.user_sub,
        },
      },
    };
  }

  /**
   * Strip headers that could be used to forge authentication.
   *
   * SECURITY: Incoming requests could include forged X-Auth-* or X-User-*
   * headers to impersonate other users. We must strip these before processing.
   *
   * @param headers - Original request headers
   * @returns Headers with X-Auth-* and X-User-* removed
   */
  private stripForgableHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      if (!lowerKey.startsWith('x-auth-') && !lowerKey.startsWith('x-user-')) {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

export { AuthGatewayPluginConfig } from './types.js';
