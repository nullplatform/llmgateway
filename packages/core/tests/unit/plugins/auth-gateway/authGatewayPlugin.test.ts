/**
 * Auth Gateway Plugin Tests
 *
 * Integration tests for the complete auth gateway plugin.
 * Critical: Verifies 401 for invalid keys, 503 for service errors (fail closed),
 * header stripping, and context enrichment with user metadata.
 */

import nock from 'nock';
import { IRequestContext } from '@nullplatform/llm-gateway-sdk';
import { AuthGatewayPlugin } from '../../../../src/plugins/bundled/auth-gateway/authGatewayPlugin';

describe('AuthGatewayPlugin', () => {
  const AUTH_SERVICE_URL = 'http://auth-service';

  /**
   * Helper function to create a mock request context.
   */
  function createMockContext(overrides: Partial<IRequestContext> = {}): IRequestContext {
    return {
      project: 'test-project',
      adapter: 'openai',
      request_id: 'test-request-123',
      request: {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 100,
        temperature: 0.7,
        stream: false,
        target_provider: 'openai',
      },
      available_models: ['gpt-4'],
      httpRequest: {
        method: 'POST',
        url: '/v1/chat/completions',
        headers: {
          authorization: 'Bearer test-api-key',
          'content-type': 'application/json',
        },
        body: {},
      },
      headers: {},
      query_params: {},
      plugin_data: new Map(),
      metrics: { start_time: new Date() },
      metadata: {},
      retry_count: 0,
      ...overrides,
    } as IRequestContext;
  }

  /**
   * Valid validation response helper.
   */
  const validResponse = {
    valid: true,
    key_id: 'key-123',
    key_name: 'My Key',
    user_email: 'user@test.com',
    user_sub: 'sub-456',
  };

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Configuration', () => {
    it('should configure with valid authServiceUrl', async () => {
      const plugin = new AuthGatewayPlugin();
      await expect(plugin.configure({ authServiceUrl: AUTH_SERVICE_URL })).resolves.not.toThrow();
    });

    it('should validate config returns error for missing authServiceUrl', async () => {
      const plugin = new AuthGatewayPlugin();
      const result = await plugin.validateConfig!({} as any);
      expect(result).toContain('authServiceUrl');
    });

    it('should validate config returns error for empty authServiceUrl', async () => {
      const plugin = new AuthGatewayPlugin();
      const result = await plugin.validateConfig!({ authServiceUrl: '' });
      expect(result).toContain('authServiceUrl');
    });

    it('should validate config returns error for invalid cacheTtlSeconds', async () => {
      const plugin = new AuthGatewayPlugin();
      const result = await plugin.validateConfig!({
        authServiceUrl: AUTH_SERVICE_URL,
        cacheTtlSeconds: 500, // Max is 300
      });
      expect(result).toContain('cacheTtlSeconds');
    });

    it('should validate config returns true for valid config', async () => {
      const plugin = new AuthGatewayPlugin();
      const result = await plugin.validateConfig!({
        authServiceUrl: AUTH_SERVICE_URL,
        cacheTtlSeconds: 60,
        cacheMaxSize: 5000,
      });
      expect(result).toBe(true);
    });
  });

  describe('Authentication - Missing API Key', () => {
    it('should return 401 for missing API key (no headers)', async () => {
      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: { method: 'POST', url: '/api', headers: {}, body: {} },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(false);
      expect(result.terminate).toBe(true);
      expect(result.status).toBe(401);
      expect(result.error?.message).toContain('Missing API key');
    });

    it('should return 401 for empty Authorization header', async () => {
      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { authorization: '' },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
    });

    it('should return 401 for Bearer prefix only', async () => {
      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { authorization: 'Bearer ' },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
    });
  });

  describe('Authentication - Invalid API Key', () => {
    it('should return 401 for invalid API key', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'invalid-key' })
        .reply(401, { valid: false });

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { 'x-api-key': 'invalid-key' },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(false);
      expect(result.terminate).toBe(true);
      expect(result.status).toBe(401);
      expect(result.error?.message).toContain('Invalid API key');
    });

    it('should return 401 for revoked API key', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'revoked-key' })
        .reply(401, { valid: false, error: 'key_revoked' });

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { authorization: 'Bearer revoked-key' },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
    });
  });

  describe('Authentication - Service Errors (CRITICAL - Fail Closed)', () => {
    it('should return 503 when auth service unreachable (NOT 401 or success)', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'any-key' })
        .replyWithError('Connection refused');

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { authorization: 'Bearer any-key' },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(false);
      expect(result.terminate).toBe(true);
      expect(result.status).toBe(503); // NOT 401 or 200
      expect(result.error?.message).toContain('unavailable');
    });

    it('should return 503 on auth service 500 error', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'any-key' })
        .reply(500, { error: 'Internal Server Error' });

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { authorization: 'Bearer any-key' },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(503);
    });

    it('should return 503 on auth service timeout', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'any-key' })
        .delay(2000)
        .reply(200, { valid: true });

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({
        authServiceUrl: AUTH_SERVICE_URL,
        serviceTimeoutMs: 500, // Short timeout
      });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { authorization: 'Bearer any-key' },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(503);
    }, 10000);
  });

  describe('Authentication - Valid Key (Success)', () => {
    it('should return success and enrich context for valid key', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'valid-key' })
        .reply(200, validResponse);

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { authorization: 'Bearer valid-key' },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(true);
      expect(result.context?.user_id).toBe('sub-456');
      expect(result.context?.metadata?.auth_key_id).toBe('key-123');
      expect(result.context?.metadata?.auth_key_name).toBe('My Key');
      expect(result.context?.metadata?.auth_user_email).toBe('user@test.com');
      expect(result.context?.metadata?.auth_user_sub).toBe('sub-456');
    });

    it('should extract API key from Authorization header with Bearer prefix', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'bearer-key' })
        .reply(200, validResponse);

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { authorization: 'Bearer bearer-key' },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);
      expect(result.success).toBe(true);
    });

    it('should extract API key from X-API-Key header', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'x-api-key-value' })
        .reply(200, validResponse);

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { 'x-api-key': 'x-api-key-value' },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);
      expect(result.success).toBe(true);
    });
  });

  describe('Header Stripping (Security)', () => {
    it('should strip forged X-Auth-* and X-User-* headers', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'valid-key' })
        .reply(200, validResponse);

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: {
            authorization: 'Bearer valid-key',
            'x-auth-forged': 'malicious',
            'X-User-Email': 'attacker@evil.com',
            'x-user-id': 'fake-user-id',
            'X-Auth-Token': 'forged-token',
            'x-api-key': 'should-remain', // This is allowed
            'content-type': 'application/json', // This is allowed
          },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(true);
      // Forged headers should be removed
      expect(result.context?.httpRequest?.headers['x-auth-forged']).toBeUndefined();
      expect(result.context?.httpRequest?.headers['X-User-Email']).toBeUndefined();
      expect(result.context?.httpRequest?.headers['x-user-id']).toBeUndefined();
      expect(result.context?.httpRequest?.headers['X-Auth-Token']).toBeUndefined();
      // Safe headers should remain
      expect(result.context?.httpRequest?.headers['x-api-key']).toBe('should-remain');
      expect(result.context?.httpRequest?.headers['content-type']).toBe('application/json');
    });

    it('should strip headers case-insensitively', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'valid-key' })
        .reply(200, validResponse);

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: {
            authorization: 'Bearer valid-key',
            'X-AUTH-ADMIN': 'true',
            'x-user-role': 'superadmin',
          },
          body: {},
        },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(true);
      expect(result.context?.httpRequest?.headers['X-AUTH-ADMIN']).toBeUndefined();
      expect(result.context?.httpRequest?.headers['x-user-role']).toBeUndefined();
    });
  });

  describe('Caching Behavior', () => {
    it('should cache validation response (second call uses cache)', async () => {
      // Only set up nock once - second call should not hit service
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'cached-key' })
        .reply(200, validResponse);

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context1 = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { 'x-api-key': 'cached-key' },
          body: {},
        },
      });
      const context2 = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { 'x-api-key': 'cached-key' },
          body: {},
        },
      });

      const result1 = await plugin.beforeModel(context1);
      expect(result1.success).toBe(true);

      // Second call - if it hit the server, nock would throw (no more mocks)
      const result2 = await plugin.beforeModel(context2);
      expect(result2.success).toBe(true);
    });

    it('should use composite cache key (different path = different cache entry)', async () => {
      // Set up two mocks for different paths (expects 2 calls)
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'same-key' })
        .times(2)
        .reply(200, validResponse);

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context1 = createMockContext({
        httpRequest: {
          method: 'GET',
          url: '/api/path1',
          headers: { 'x-api-key': 'same-key' },
          body: {},
        },
      });
      const context2 = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api/path2',
          headers: { 'x-api-key': 'same-key' },
          body: {},
        },
      });

      await plugin.beforeModel(context1);
      await plugin.beforeModel(context2);

      // Both should succeed and nock expects 2 calls for different cache keys
      expect(nock.isDone()).toBe(true);
    });

    it('should use cached result for same method+path combination', async () => {
      // Only 1 mock - second identical request should use cache
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'same-key' })
        .reply(200, validResponse);

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context1 = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api/same-path',
          headers: { 'x-api-key': 'same-key' },
          body: {},
        },
      });
      const context2 = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api/same-path',
          headers: { 'x-api-key': 'same-key' },
          body: {},
        },
      });

      const result1 = await plugin.beforeModel(context1);
      const result2 = await plugin.beforeModel(context2);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // nock should be done (only 1 call made)
      expect(nock.isDone()).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing httpRequest gracefully', async () => {
      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: undefined as any,
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
    });

    it('should preserve existing metadata when enriching context', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'valid-key' })
        .reply(200, validResponse);

      const plugin = new AuthGatewayPlugin();
      await plugin.configure({ authServiceUrl: AUTH_SERVICE_URL });

      const context = createMockContext({
        httpRequest: {
          method: 'POST',
          url: '/api',
          headers: { authorization: 'Bearer valid-key' },
          body: {},
        },
        metadata: {
          existing_field: 'existing_value',
          custom_data: 123,
        },
      });

      const result = await plugin.beforeModel(context);

      expect(result.success).toBe(true);
      expect(result.context?.metadata?.existing_field).toBe('existing_value');
      expect(result.context?.metadata?.custom_data).toBe(123);
      expect(result.context?.metadata?.auth_key_id).toBe('key-123');
    });
  });
});
