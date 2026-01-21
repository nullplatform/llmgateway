/**
 * Auth Gateway Plugin Types
 *
 * TypeScript interfaces for API key validation against the auth service.
 */

/**
 * Result of API key validation from auth service.
 * Matches the response schema from GET /api/keys/validate endpoint.
 */
export interface ValidationResult {
  valid: boolean;
  key_id?: string;
  key_name?: string;
  user_email?: string;
  user_sub?: string;
  error?: string;
}

/**
 * Configuration for the AuthGatewayPlugin.
 */
export interface AuthGatewayPluginConfig {
  /** Base URL of the auth service (e.g., "http://localhost:3001") */
  authServiceUrl: string;
  /** Cache TTL in seconds (default: 30) */
  cacheTtlSeconds?: number;
  /** Maximum cache entries (default: 10000) */
  cacheMaxSize?: number;
  /** HTTP timeout for auth service calls in ms (default: 5000) */
  serviceTimeoutMs?: number;
}
