import { BasicApiKeyAuthPlugin } from '../../../src/plugins/bundled/basic-apikey-auth/basicApiKeyAuthPlugin';
import { createMockRequestContext } from '../../fixtures/mockPlugin';
import { IRequestContext } from '@nullplatform/llm-gateway-sdk';

describe('BasicApiKeyAuthPlugin', () => {
  let plugin: BasicApiKeyAuthPlugin;
  let mockContext: IRequestContext;

  beforeEach(async () => {
    plugin = new BasicApiKeyAuthPlugin();
    mockContext = createMockRequestContext();
  });

  describe('Configuration', () => {
    it('should configure with valid API keys', async () => {
      const config = {
        apikeys: ['valid-key-1', 'valid-key-2', 'valid-key-3']
      };

      await expect(plugin.configure(config)).resolves.not.toThrow();
    });

    it('should validate valid configuration', async () => {
      const validConfig = {
        apikeys: ['key1', 'key2']
      };

      const result = await plugin.validateConfig!(validConfig);
      expect(result).toBe(true);
    });

    it('should reject empty apikeys array', async () => {
      const invalidConfig = {
        apikeys: []
      };

      const result = await plugin.validateConfig!(invalidConfig);
      expect(result).toBe('Invalid configuration: apikeys must be a non-empty array');
    });

    it('should reject non-array apikeys', async () => {
      const invalidConfig = {
        apikeys: 'not-an-array'
      };

      const result = await plugin.validateConfig!(invalidConfig);
      expect(result).toBe('Invalid configuration: apikeys must be a non-empty array');
    });

    it('should reject missing apikeys', async () => {
      const invalidConfig = {};

      const result = await plugin.validateConfig!(invalidConfig);
      expect(result).toBe('Invalid configuration: apikeys must be a non-empty array');
    });
  });

  describe('Authentication', () => {
    beforeEach(async () => {
      await plugin.configure({
        apikeys: ['valid-key-1', 'valid-key-2', 'secret-api-key']
      });
    });

    describe('Authorization Header', () => {
      it('should accept valid API key in Authorization header', async () => {
        mockContext.httpRequest.headers['authorization'] = 'valid-key-1';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept valid API key with Bearer prefix', async () => {
        mockContext.httpRequest.headers['authorization'] = 'Bearer valid-key-2';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept valid API key with bearer prefix (lowercase)', async () => {
        mockContext.httpRequest.headers['authorization'] = 'bearer secret-api-key';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject invalid API key in Authorization header', async () => {
        mockContext.httpRequest.headers['authorization'] = 'invalid-key';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(false);
        expect(result.terminate).toBe(true);
        expect(result.status).toBe(401);
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error?.message).toBe('Unauthorized: Invalid API key');
      });

      it('should reject Bearer token with invalid key', async () => {
        mockContext.httpRequest.headers['authorization'] = 'Bearer invalid-key';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(false);
        expect(result.status).toBe(401);
      });
    });

    describe('X-API-Key Header', () => {
      it('should accept valid API key in x-api-key header', async () => {
        mockContext.httpRequest.headers['x-api-key'] = 'valid-key-1';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should reject invalid API key in x-api-key header', async () => {
        mockContext.httpRequest.headers['x-api-key'] = 'invalid-key';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(false);
        expect(result.terminate).toBe(true);
        expect(result.status).toBe(401);
        expect(result.error?.message).toBe('Unauthorized: Invalid API key');
      });
    });

    describe('Header Priority', () => {
      it('should prefer Authorization header over x-api-key', async () => {
        mockContext.httpRequest.headers['authorization'] = 'valid-key-1';
        mockContext.httpRequest.headers['x-api-key'] = 'invalid-key';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(true);
      });

      it('should fallback to x-api-key if Authorization is invalid', async () => {
        mockContext.httpRequest.headers['authorization'] = 'invalid-key';
        mockContext.httpRequest.headers['x-api-key'] = 'valid-key-2';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(false); // Authorization takes precedence
        expect(result.status).toBe(401);
      });
    });

    describe('Missing Headers', () => {
      it('should reject request with no authentication headers', async () => {
        delete mockContext.httpRequest.headers['authorization'];
        delete mockContext.httpRequest.headers['x-api-key'];

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(false);
        expect(result.terminate).toBe(true);
        expect(result.status).toBe(401);
        expect(result.error?.message).toBe('Unauthorized: Invalid API key');
      });

      it('should reject request with empty authorization header', async () => {
        mockContext.httpRequest.headers['authorization'] = '';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(false);
        expect(result.status).toBe(401);
      });

      it('should reject request with only Bearer prefix', async () => {
        mockContext.httpRequest.headers['authorization'] = 'Bearer ';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(false);
        expect(result.status).toBe(401);
      });
    });

    describe('Case Sensitivity', () => {
      it('should be case-sensitive for API keys', async () => {
        mockContext.httpRequest.headers['authorization'] = 'VALID-KEY-1'; // uppercase

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(false);
        expect(result.status).toBe(401);
      });

      it('should handle case-insensitive Bearer prefix', async () => {
        mockContext.httpRequest.headers['authorization'] = 'BEARER valid-key-1';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(true);
      });
    });

    describe('Edge Cases', () => {
      it('should handle whitespace in API keys', async () => {
        await plugin.configure({
          apikeys: [' spaced-key ', 'normal-key']
        });

        mockContext.httpRequest.headers['authorization'] = ' spaced-key ';

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(true);
      });

      it('should handle very long API keys', async () => {
        const longKey = 'a'.repeat(1000);
        await plugin.configure({
          apikeys: [longKey]
        });

        mockContext.httpRequest.headers['authorization'] = longKey;

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(true);
      });

      it('should handle special characters in API keys', async () => {
        const specialKey = 'key-with-$pecial-ch@rs!';
        await plugin.configure({
          apikeys: [specialKey]
        });

        mockContext.httpRequest.headers['authorization'] = specialKey;

        const result = await plugin.beforeModel(mockContext);

        expect(result.success).toBe(true);
      });
    });
  });

  describe('Plugin Lifecycle', () => {
    it('should only implement beforeModel phase', () => {
      expect(typeof plugin.beforeModel).toBe('function');
      expect((plugin as any).afterModel).toBeUndefined();
      expect((plugin as any).afterChunk).toBeUndefined();
      expect((plugin as any).onModelError).toBeUndefined();
      expect((plugin as any).detachedAfterResponse).toBeUndefined();
    });

    it('should terminate request on authentication failure', async () => {
      await plugin.configure({
        apikeys: ['valid-key']
      });

      mockContext.httpRequest.headers['authorization'] = 'invalid-key';

      const result = await plugin.beforeModel(mockContext);

      expect(result.terminate).toBe(true);
      expect(result.success).toBe(false);
    });

    it('should not modify context on successful authentication', async () => {
      await plugin.configure({
        apikeys: ['valid-key']
      });

      mockContext.httpRequest.headers['authorization'] = 'valid-key';

      const result = await plugin.beforeModel(mockContext);

      expect(result.success).toBe(true);
      expect(result.context).toBeUndefined();
    });
  });
});