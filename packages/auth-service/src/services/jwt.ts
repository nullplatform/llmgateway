import { SignJWT, jwtVerify, type JWTPayload as JoseJWTPayload } from 'jose';
import { config } from '../config/index.js';
import type { JWTPayload } from '../types/index.js';

/**
 * JWT secret key encoded for jose library
 */
const JWT_SECRET = new TextEncoder().encode(config.jwt.secret);

/**
 * Creates a signed session token (JWT) for an authenticated user.
 *
 * The token contains:
 * - sub: User's Google sub (unique identifier)
 * - email: User's email address
 * - iat: Issued at timestamp
 * - exp: Expiration timestamp (default 1 hour)
 * - iss: Token issuer
 * - aud: Token audience
 *
 * @param user - User information to encode in the token
 * @returns Signed JWT string
 */
export async function createSessionToken(user: { sub: string; email: string }): Promise<string> {
  const token = await new SignJWT({
    sub: user.sub,
    email: user.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(config.jwt.issuer)
    .setAudience(config.jwt.audience)
    .setExpirationTime(config.jwt.expiresIn)
    .sign(JWT_SECRET);

  return token;
}

/**
 * Verifies a session token and extracts the payload.
 *
 * Validates:
 * - Signature using HS256 algorithm
 * - Issuer matches configured issuer
 * - Audience matches configured audience
 * - Token is not expired
 *
 * @param token - JWT string to verify
 * @returns Verified payload with user information
 * @throws Error if token is invalid, expired, or has wrong issuer/audience
 */
export async function verifySessionToken(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      algorithms: ['HS256'],
    });

    // Validate required claims exist
    if (!payload.sub || typeof payload.sub !== 'string') {
      throw new Error('Invalid token: missing sub claim');
    }

    const email = (payload as JoseJWTPayload & { email?: string }).email;
    if (!email || typeof email !== 'string') {
      throw new Error('Invalid token: missing email claim');
    }

    return {
      sub: payload.sub,
      email: email,
      iat: payload.iat as number,
      exp: payload.exp as number,
      iss: payload.iss as string,
      aud: payload.aud as string,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
    throw new Error('Token verification failed: unknown error');
  }
}

/**
 * JWT service class for dependency injection patterns
 */
export class JWTService {
  private secret: Uint8Array;
  private issuer: string;
  private audience: string;
  private expiresIn: string;

  constructor(secret: string, issuer: string, audience: string, expiresIn: string = '1h') {
    this.secret = new TextEncoder().encode(secret);
    this.issuer = issuer;
    this.audience = audience;
    this.expiresIn = expiresIn;
  }

  async createSessionToken(user: { sub: string; email: string }): Promise<string> {
    return await new SignJWT({
      sub: user.sub,
      email: user.email,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setExpirationTime(this.expiresIn)
      .sign(this.secret);
  }

  async verifySessionToken(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256'],
      });

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new Error('Invalid token: missing sub claim');
      }

      const email = (payload as JoseJWTPayload & { email?: string }).email;
      if (!email || typeof email !== 'string') {
        throw new Error('Invalid token: missing email claim');
      }

      return {
        sub: payload.sub,
        email: email,
        iat: payload.iat as number,
        exp: payload.exp as number,
        iss: payload.iss as string,
        aud: payload.aud as string,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Token verification failed: ${error.message}`);
      }
      throw new Error('Token verification failed: unknown error');
    }
  }
}
