import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/index.js';
import type { GoogleUserInfo } from '../types/index.js';

/**
 * Google OAuth2 client singleton for token verification
 */
const googleClient = new OAuth2Client(config.google.clientId);

/**
 * Verifies a Google ID token and extracts user information.
 *
 * CRITICAL: This function enforces domain restriction to nullplatform.com only.
 * The domain is verified using Google's `hd` (hosted domain) claim, which is
 * cryptographically signed and cannot be spoofed.
 *
 * @param idToken - The Google ID token received from OAuth callback
 * @returns User information extracted from the verified token
 * @throws Error if token is invalid or user is not from nullplatform.com
 */
export async function verifyGoogleToken(idToken: string): Promise<GoogleUserInfo> {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.google.clientId,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    throw new Error('Invalid token: no payload');
  }

  // CRITICAL: Verify hosted domain to restrict access to nullplatform.com
  if (payload.hd !== config.allowedDomain) {
    throw new Error(`Access denied: Only @${config.allowedDomain} accounts are allowed`);
  }

  if (!payload.sub || !payload.email || !payload.name) {
    throw new Error('Invalid token: missing required claims (sub, email, name)');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name,
    hd: payload.hd,
  };
}

/**
 * OAuth service class for dependency injection patterns
 */
export class OAuthService {
  private client: OAuth2Client;
  private allowedDomain: string;
  private clientId: string;

  constructor(clientId: string, allowedDomain: string) {
    this.client = new OAuth2Client(clientId);
    this.allowedDomain = allowedDomain;
    this.clientId = clientId;
  }

  async verifyGoogleToken(idToken: string): Promise<GoogleUserInfo> {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: this.clientId,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      throw new Error('Invalid token: no payload');
    }

    if (payload.hd !== this.allowedDomain) {
      throw new Error(`Access denied: Only @${this.allowedDomain} accounts are allowed`);
    }

    if (!payload.sub || !payload.email || !payload.name) {
      throw new Error('Invalid token: missing required claims (sub, email, name)');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      hd: payload.hd,
    };
  }
}
