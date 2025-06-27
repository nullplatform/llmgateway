import { BasicApiKeyAuthPlugin } from '../../../src/plugins/bundled/basic-apikey-auth/basicApiKeyAuthPlugin';
import { ModelRouterPlugin } from '../../../src/plugins/bundled/model-router/modelRouterPlugin';
import { PromptManagerPlugin, PromptInjectionMode } from '../../../src/plugins/bundled/promt-manager/promtManagerPlugin';
import { createMockRequestContext } from '../../fixtures/mockPlugin';

describe('Plugin Tests - Simplified', () => {
  describe('BasicApiKeyAuthPlugin', () => {
    let plugin: BasicApiKeyAuthPlugin;

    beforeEach(() => {
      plugin = new BasicApiKeyAuthPlugin();
    });

    it('should create plugin instance', () => {
      expect(plugin).toBeDefined();
      expect(typeof plugin.beforeModel).toBe('function');
    });

    it('should configure with API keys', async () => {
      const config = { apikeys: ['test-key-1', 'test-key-2'] };
      await expect(plugin.configure(config)).resolves.not.toThrow();
    });

    it('should validate API key configuration', async () => {
      const validConfig = { apikeys: ['key1', 'key2'] };
      const result = await plugin.validateConfig!(validConfig);
      expect(result).toBe(true);
    });

    it('should reject empty API keys', async () => {
      const invalidConfig = { apikeys: [] };
      const result = await plugin.validateConfig!(invalidConfig);
      expect(result).toBe('Invalid configuration: apikeys must be a non-empty array');
    });

    it('should accept valid API key in authorization header', async () => {
      await plugin.configure({ apikeys: ['valid-key'] });
      
      const context = createMockRequestContext({
        httpRequest: {
          method: 'POST',
          url: '/test',
          headers: { 'authorization': 'valid-key' },
          body: {}
        }
      });

      const result = await plugin.beforeModel(context);
      expect(result.success).toBe(true);
    });

    it('should reject invalid API key', async () => {
      await plugin.configure({ apikeys: ['valid-key'] });
      
      const context = createMockRequestContext({
        httpRequest: {
          method: 'POST',
          url: '/test',
          headers: { 'authorization': 'invalid-key' },
          body: {}
        }
      });

      const result = await plugin.beforeModel(context);
      expect(result.success).toBe(false);
      expect(result.status).toBe(401);
    });
  });

  describe('ModelRouterPlugin', () => {
    let plugin: ModelRouterPlugin;

    beforeEach(() => {
      plugin = new ModelRouterPlugin();
    });

    it('should create plugin instance', () => {
      expect(plugin).toBeDefined();
      expect(typeof plugin.beforeModel).toBe('function');
      expect(typeof plugin.onModelError).toBe('function');
    });

    it('should configure with model and fallbacks', async () => {
      const config = {
        model: 'gpt-4',
        fallbacks: ['gpt-3.5-turbo', 'claude-3-sonnet']
      };
      await expect(plugin.configure(config)).resolves.not.toThrow();
    });

    it('should select primary model on first attempt', async () => {
      await plugin.configure({
        model: 'gpt-4',
        fallbacks: ['gpt-3.5-turbo']
      });

      const context = createMockRequestContext({
        available_models: ['gpt-4', 'gpt-3.5-turbo'],
        retry_count: 0
      });

      const result = await plugin.beforeModel(context);
      expect(result.success).toBe(true);
      expect(result.context?.target_model).toBe('gpt-4');
    });

    it('should select fallback on retry', async () => {
      await plugin.configure({
        model: 'gpt-4',
        fallbacks: ['gpt-3.5-turbo']
      });

      const context = createMockRequestContext({
        available_models: ['gpt-4', 'gpt-3.5-turbo'],
        retry_count: 1
      });

      const result = await plugin.beforeModel(context);
      expect(result.success).toBe(true);
      expect(result.context?.target_model).toBe('gpt-3.5-turbo');
    });

    it('should trigger reevaluation on error', async () => {
      const errorContext = createMockRequestContext({
        error: new Error('Model failed'),
        retry_count: 0
      });

      const result = await plugin.onModelError(errorContext);
      expect(result.success).toBe(true);
      expect(result.reevaluateRequest).toBe(true);
    });
  });

  describe('PromptManagerPlugin', () => {
    let plugin: PromptManagerPlugin;

    beforeEach(() => {
      plugin = new PromptManagerPlugin();
    });

    it('should create plugin instance', () => {
      expect(plugin).toBeDefined();
      expect(typeof plugin.beforeModel).toBe('function');
      expect(typeof plugin.configure).toBe('function');
    });

    it('should configure with basic prompt', async () => {
      const config = {
        prompt: 'You are a helpful assistant.',
        mode: PromptInjectionMode.OVERRIDE
      };
      await expect(plugin.configure(config)).resolves.not.toThrow();
    });

    it('should validate prompt configuration', async () => {
      const validConfig = {
        prompt: 'Test prompt',
        mode: PromptInjectionMode.OVERRIDE
      };
      const result = await plugin.validateConfig(validConfig);
      expect(result).toBe(true);
    });

    it('should reject missing prompt', async () => {
      const invalidConfig = {
        mode: PromptInjectionMode.OVERRIDE
      } as any;
      const result = await plugin.validateConfig(invalidConfig);
      expect(result).toBe('Prompt is required and must be a string');
    });

    it('should inject prompt in override mode', async () => {
      await plugin.configure({
        prompt: 'You are a test assistant.',
        mode: PromptInjectionMode.OVERRIDE
      });

      const context = createMockRequestContext({
        request: {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 100,
          temperature: 0.7,
          stream: false,
          target_provider: 'openai'
        }
      });

      const result = await plugin.beforeModel(context);
      expect(result.success).toBe(true);
      expect(result.context?.request.messages).toHaveLength(2);
      expect(result.context?.request.messages[0]).toEqual({
        role: 'system',
        content: 'You are a test assistant.'
      });
    });
  });

  describe('Plugin Integration', () => {
    it('should handle multiple plugin types together', () => {
      const authPlugin = new BasicApiKeyAuthPlugin();
      const routerPlugin = new ModelRouterPlugin();
      const promptPlugin = new PromptManagerPlugin();

      expect(authPlugin).toBeDefined();
      expect(routerPlugin).toBeDefined();
      expect(promptPlugin).toBeDefined();

      // Test that all plugins have their required methods
      expect(typeof authPlugin.beforeModel).toBe('function');
      expect(typeof routerPlugin.beforeModel).toBe('function');
      expect(typeof routerPlugin.onModelError).toBe('function');
      expect(typeof promptPlugin.beforeModel).toBe('function');
    });

    it('should validate all plugins can be configured', async () => {
      const authPlugin = new BasicApiKeyAuthPlugin();
      const routerPlugin = new ModelRouterPlugin();
      const promptPlugin = new PromptManagerPlugin();

      // Configure all plugins
      await expect(authPlugin.configure({ apikeys: ['test-key'] })).resolves.not.toThrow();
      await expect(routerPlugin.configure({ model: 'gpt-4', fallbacks: [] })).resolves.not.toThrow();
      await expect(promptPlugin.configure({
        prompt: 'Test prompt',
        mode: PromptInjectionMode.OVERRIDE
      })).resolves.not.toThrow();
    });
  });
});