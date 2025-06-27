import { ProviderRegistry } from '../../../src/providers/providerRegistry';
import { Logger } from '../../../src/utils/logger';

describe('ProviderRegistry', () => {
  let providerRegistry: ProviderRegistry;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = new Logger('error');
    providerRegistry = new ProviderRegistry(new Map(), mockLogger);
  });

  describe('initialization', () => {
    it('should initialize without errors', () => {
      expect(providerRegistry).toBeDefined();
    });

    it('should have built-in provider types', () => {
      const availableTypes = providerRegistry.getAvailableProviderTypes();
      
      expect(Array.isArray(availableTypes)).toBe(true);
      expect(availableTypes.length).toBeGreaterThan(0);
    });
  });

  describe('factory management', () => {
    it('should have available provider types', () => {
      const availableTypes = providerRegistry.getAvailableProviderTypes();
      
      expect(availableTypes).toContain('openai');
      expect(availableTypes).toContain('anthropic');
    });

    it('should create provider for valid type', async () => {
      const openaiConfig = {
        apiKey: 'test-key',
        baseURL: 'https://api.openai.com/v1'
      };

      const provider = await providerRegistry.createProvider('openai', openaiConfig);
      
      expect(provider).toBeDefined();
    });

    it('should throw error for unknown provider type', async () => {
      await expect(
        providerRegistry.createProvider('unknown', {})
      ).rejects.toThrow();
    });
  });

  describe('provider creation', () => {
    it('should create OpenAI provider with valid config', async () => {
      const openaiConfig = {
        apiKey: 'test-key',
        baseURL: 'https://api.openai.com/v1'
      };

      const provider = await providerRegistry.createProvider('openai', openaiConfig);
      
      expect(provider).toBeDefined();
      expect(provider.name).toBe('openai');
    });

    it('should throw error when creating provider with invalid type', async () => {
      await expect(
        providerRegistry.createProvider('invalid', {})
      ).rejects.toThrow();
    });
  });
});