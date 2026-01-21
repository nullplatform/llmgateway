/**
 * Validation Cache
 *
 * LRU cache wrapper for API key validation results.
 * Uses composite key (apiKey:method:path) to prevent authorization bypass.
 */

import { LRUCache } from 'lru-cache';
import { ValidationResult } from './types.js';

export class ValidationCache {
  private cache: LRUCache<string, ValidationResult>;

  /**
   * Create a new validation cache.
   *
   * @param maxSize - Maximum number of entries in the cache
   * @param ttlSeconds - Time-to-live for cache entries in seconds
   */
  constructor(maxSize: number, ttlSeconds: number) {
    this.cache = new LRUCache<string, ValidationResult>({
      max: maxSize,
      ttl: ttlSeconds * 1000, // Convert to milliseconds
    });
  }

  /**
   * Build a composite cache key.
   *
   * CRITICAL: The cache key MUST include apiKey, method, and path to prevent
   * authorization bypass attacks. Without path in the key, a user could:
   * 1. Make valid request to GET /api/v1/public (cached as valid)
   * 2. Make request to POST /api/v1/admin (returns cached valid result)
   *
   * @param apiKey - The API key being validated
   * @param method - HTTP method (GET, POST, etc.)
   * @param path - Request path
   * @returns Composite cache key
   */
  getCacheKey(apiKey: string, method: string, path: string): string {
    return `${apiKey}:${method}:${path}`;
  }

  /**
   * Get a cached validation result.
   *
   * @param key - Cache key (from getCacheKey)
   * @returns Cached result or undefined if not found/expired
   */
  get(key: string): ValidationResult | undefined {
    return this.cache.get(key);
  }

  /**
   * Store a validation result in cache.
   *
   * @param key - Cache key (from getCacheKey)
   * @param result - Validation result to cache
   */
  set(key: string, result: ValidationResult): void {
    this.cache.set(key, result);
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }
}
