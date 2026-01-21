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
