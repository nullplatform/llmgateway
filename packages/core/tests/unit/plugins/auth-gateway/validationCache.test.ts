/**
 * Validation Cache Tests
 *
 * Tests for the LRU cache wrapper that stores API key validation results.
 * Critical: Verifies composite cache key (apiKey:method:path) to prevent authorization bypass.
 */

import { ValidationCache } from '../../../../src/plugins/bundled/auth-gateway/validationCache';
import { ValidationResult } from '../../../../src/plugins/bundled/auth-gateway/types';

describe('ValidationCache', () => {
  describe('getCacheKey', () => {
    it('should include method and path in cache key to prevent authz bypass', () => {
      const cache = new ValidationCache(100, 30);

      const key1 = cache.getCacheKey('apikey123', 'GET', '/api/chat');
      const key2 = cache.getCacheKey('apikey123', 'POST', '/api/chat');
      const key3 = cache.getCacheKey('apikey123', 'GET', '/api/other');

      // All three should be different (prevents authorization bypass)
      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
      expect(key2).not.toBe(key3);
    });

    it('should return same key for identical apiKey, method, and path', () => {
      const cache = new ValidationCache(100, 30);

      const key1 = cache.getCacheKey('apikey123', 'POST', '/api/chat');
      const key2 = cache.getCacheKey('apikey123', 'POST', '/api/chat');

      expect(key1).toBe(key2);
    });

    it('should differentiate between different API keys', () => {
      const cache = new ValidationCache(100, 30);

      const key1 = cache.getCacheKey('apikey123', 'POST', '/api/chat');
      const key2 = cache.getCacheKey('apikey456', 'POST', '/api/chat');

      expect(key1).not.toBe(key2);
    });
  });

  describe('set and get', () => {
    it('should store and retrieve cached validation result', () => {
      const cache = new ValidationCache(100, 30);
      const result: ValidationResult = {
        valid: true,
        key_id: 'k1',
        key_name: 'test',
        user_email: 'test@example.com',
        user_sub: 'sub1',
      };

      const cacheKey = cache.getCacheKey('apikey', 'GET', '/api/chat');
      cache.set(cacheKey, result);

      expect(cache.get(cacheKey)).toEqual(result);
    });

    it('should return undefined for missing key', () => {
      const cache = new ValidationCache(100, 30);

      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should store invalid validation result', () => {
      const cache = new ValidationCache(100, 30);
      const result: ValidationResult = {
        valid: false,
        error: 'invalid_key',
      };

      const cacheKey = cache.getCacheKey('invalid-api-key', 'POST', '/api/chat');
      cache.set(cacheKey, result);

      expect(cache.get(cacheKey)).toEqual(result);
    });

    it('should overwrite existing entry with same key', () => {
      const cache = new ValidationCache(100, 30);
      const cacheKey = cache.getCacheKey('apikey', 'GET', '/api/chat');

      const result1: ValidationResult = { valid: true, key_id: 'k1' };
      const result2: ValidationResult = { valid: false };

      cache.set(cacheKey, result1);
      cache.set(cacheKey, result2);

      expect(cache.get(cacheKey)).toEqual(result2);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new ValidationCache(100, 30);

      cache.set('key1', { valid: true });
      cache.set('key2', { valid: false });

      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });

    it('should allow setting new entries after clear', () => {
      const cache = new ValidationCache(100, 30);

      cache.set('key1', { valid: true });
      cache.clear();
      cache.set('key2', { valid: false });

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toEqual({ valid: false });
    });
  });

  describe('TTL expiration', () => {
    // Helper to wait for a specified number of milliseconds using real timers
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    it('should return entry before TTL expires', () => {
      const cache = new ValidationCache(100, 30); // 30 second TTL

      cache.set('key', { valid: true });

      // Entry should be available immediately
      expect(cache.get('key')).toBeDefined();
    });

    it('should expire entry after TTL', async () => {
      // Use very short TTL for test (1 second converts to 1000ms in cache)
      // We use a TTL of 1 second and wait slightly longer
      const cache = new ValidationCache(100, 1); // 1 second TTL

      cache.set('key', { valid: true });
      expect(cache.get('key')).toBeDefined();

      // Wait past TTL (lru-cache uses performance.now() internally)
      await wait(1100);

      expect(cache.get('key')).toBeUndefined();
    }, 5000);

    it('should configure with custom TTL values', () => {
      // Test that TTL configuration is passed correctly
      const shortCache = new ValidationCache(100, 5);
      const longCache = new ValidationCache(100, 300);

      // Both caches should work independently
      shortCache.set('key', { valid: true });
      longCache.set('key', { valid: false });

      expect(shortCache.get('key')).toEqual({ valid: true });
      expect(longCache.get('key')).toEqual({ valid: false });
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries when max size exceeded', () => {
      const cache = new ValidationCache(3, 30); // Max 3 entries

      cache.set('key1', { valid: true });
      cache.set('key2', { valid: true });
      cache.set('key3', { valid: true });

      // Access key1 to make it recently used
      cache.get('key1');

      // Add key4, which should evict key2 (least recently used)
      cache.set('key4', { valid: true });

      expect(cache.get('key1')).toBeDefined(); // Recently accessed
      expect(cache.get('key2')).toBeUndefined(); // Should be evicted
      expect(cache.get('key3')).toBeDefined();
      expect(cache.get('key4')).toBeDefined();
    });
  });
});
