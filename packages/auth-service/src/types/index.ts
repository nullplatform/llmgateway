import type { FastifyRequest } from 'fastify';

/**
 * User stored in DynamoDB
 * Primary key pattern: pk=USER#<google_sub>, sk=PROFILE
 * GSI1 pattern: gsi1pk=EMAIL#<email>, gsi1sk=USER for email lookups
 */
export interface User {
  pk: string;           // USER#<google_sub>
  sk: string;           // PROFILE
  gsi1pk: string;       // EMAIL#<email>
  gsi1sk: string;       // USER
  google_sub: string;   // Google's unique user identifier
  email: string;        // User's email address
  name: string;         // User's display name
  created_at: string;   // ISO 8601 timestamp
  last_login: string;   // ISO 8601 timestamp
}

/**
 * JWT payload structure for authentication tokens
 */
export interface JWTPayload {
  sub: string;    // Subject (google_sub)
  email: string;  // User's email
  iat: number;    // Issued at (Unix timestamp)
  exp: number;    // Expiration (Unix timestamp)
  iss: string;    // Issuer
  aud: string;    // Audience
}

/**
 * User info returned from Google OAuth
 */
export interface GoogleUserInfo {
  sub: string;      // Google's unique user identifier
  email: string;    // User's email address
  name: string;     // User's display name
  hd?: string;      // Hosted domain (for Google Workspace accounts)
}

/**
 * Fastify request with authenticated user attached
 */
export interface AuthenticatedRequest extends FastifyRequest {
  user: JWTPayload;
}

/**
 * API Key item stored in DynamoDB
 * Primary key pattern: pk=KEY#<uuid>, sk=META
 * GSI2: gsi2pk=USER#<sub>, gsi2sk=KEY#<created_at> for user's keys
 * GSI3: gsi3pk=HASH#<sha256>, gsi3sk=KEY for validation lookup
 */
export interface ApiKeyItem {
  pk: string;           // KEY#<uuid>
  sk: string;           // META
  gsi2pk: string;       // USER#<google_sub>
  gsi2sk: string;       // KEY#<created_at>
  gsi3pk: string;       // HASH#<sha256_hash>
  gsi3sk: string;       // KEY
  key_id: string;       // UUID
  key_hash: string;     // SHA-256 hash
  key_prefix: string;   // First 12 chars for display (nll_ + 8)
  name: string;         // User-provided name
  user_sub: string;     // Owner's Google sub
  user_email: string;   // Owner's email
  created_at: string;   // ISO 8601
  revoked_at?: string;  // ISO 8601 if revoked
}

/**
 * API key response for list endpoint (no sensitive data)
 */
export interface ApiKey {
  key_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  revoked_at?: string;
}

/**
 * Result of creating a new API key (includes full key shown once)
 */
export interface CreateKeyResult {
  key: string;          // Full key (shown once only)
  key_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
}

/**
 * Result of validating an API key
 */
export interface ValidateKeyResult {
  valid: boolean;
  key_id?: string;
  key_name?: string;
  user_email?: string;
  user_sub?: string;
}
