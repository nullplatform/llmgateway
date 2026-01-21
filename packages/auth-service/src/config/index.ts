import crypto from 'crypto';

/**
 * Auth service configuration loaded from environment variables.
 * Required variables will throw errors in production if missing.
 */

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

// Helper to get required env var
function getRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (isProduction) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    console.warn(`Warning: Missing ${name}, using placeholder in development`);
    return `placeholder-${name.toLowerCase()}`;
  }
  return value;
}

// Generate or get JWT secret
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (isProduction) {
      throw new Error('JWT_SECRET is required in production');
    }
    const generated = crypto.randomBytes(32).toString('hex');
    console.warn('Warning: JWT_SECRET not set, generated random secret for development');
    return generated;
  }
  return secret;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv,

  google: {
    clientId: getRequired('GOOGLE_CLIENT_ID'),
    clientSecret: getRequired('GOOGLE_CLIENT_SECRET'),
    callbackUrl: getRequired('GOOGLE_CALLBACK_URL'),
  },

  jwt: {
    secret: getJwtSecret(),
    issuer: process.env.JWT_ISSUER || 'auth.nullplatform.com',
    audience: process.env.JWT_AUDIENCE || 'llm-gateway.nullplatform.com',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },

  dynamodb: {
    region: process.env.AWS_REGION || 'us-east-1',
    tableName: process.env.DYNAMODB_TABLE || 'nullplatform-auth',
  },

  portalUrl: process.env.PORTAL_URL || 'http://localhost:3000',

  // Hardcoded domain restriction for nullplatform
  allowedDomain: 'nullplatform.com',
} as const;

export type Config = typeof config;
