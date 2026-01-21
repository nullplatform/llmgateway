/**
 * Auth Service Client Tests
 *
 * Tests for the HTTP client that communicates with the auth service.
 * Critical: Verifies fail-closed behavior (throws on errors, NOT returns false).
 */

import nock from 'nock';
import { AuthServiceClient } from '../../../../src/plugins/bundled/auth-gateway/authServiceClient';

describe('AuthServiceClient', () => {
  const AUTH_SERVICE_URL = 'http://auth-service';

  afterEach(() => {
    nock.cleanAll();
  });

  describe('validateKey with successful responses', () => {
    it('should return valid result with user metadata on 200', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'valid-key' })
        .reply(200, {
          valid: true,
          key_id: 'key-123',
          key_name: 'My Key',
          user_email: 'user@example.com',
          user_sub: 'sub-456',
        });

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 5000);
      const result = await client.validateKey('valid-key');

      expect(result.valid).toBe(true);
      expect(result.key_id).toBe('key-123');
      expect(result.key_name).toBe('My Key');
      expect(result.user_email).toBe('user@example.com');
      expect(result.user_sub).toBe('sub-456');
    });

    it('should return valid result without optional fields', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'minimal-key' })
        .reply(200, {
          valid: true,
          key_id: 'key-minimal',
        });

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 5000);
      const result = await client.validateKey('minimal-key');

      expect(result.valid).toBe(true);
      expect(result.key_id).toBe('key-minimal');
      expect(result.user_email).toBeUndefined();
    });
  });

  describe('validateKey with invalid key responses', () => {
    it('should return invalid result on 401', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'invalid-key' })
        .reply(401, { valid: false, error: 'invalid_key' });

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 5000);
      const result = await client.validateKey('invalid-key');

      expect(result.valid).toBe(false);
    });

    it('should return invalid result with missing_key error on 400', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: '' })
        .reply(400, { valid: false, error: 'missing_key' });

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 5000);
      const result = await client.validateKey('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('missing_key');
    });
  });

  describe('validateKey fail-closed behavior (CRITICAL)', () => {
    it('should THROW on network error (not return false)', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'any-key' })
        .replyWithError('Network error');

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 5000);

      // IMPORTANT: Does NOT return { valid: false } - must throw so caller can return 503
      await expect(client.validateKey('any-key')).rejects.toThrow();
    });

    it('should THROW on connection refused', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'any-key' })
        .replyWithError('connect ECONNREFUSED');

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 5000);

      await expect(client.validateKey('any-key')).rejects.toThrow('Auth service unavailable');
    });

    it('should THROW on timeout', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'any-key' })
        .delay(2000) // Longer than timeout
        .reply(200, { valid: true });

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 500); // 500ms timeout

      await expect(client.validateKey('any-key')).rejects.toThrow();
    }, 10000);

    it('should THROW on 500 Internal Server Error (not treat as invalid)', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'any-key' })
        .reply(500, { error: 'Internal Server Error' });

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 5000);

      // 500 is NOT the same as 401 - must fail closed
      await expect(client.validateKey('any-key')).rejects.toThrow();
    });

    it('should THROW on 502 Bad Gateway', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'any-key' })
        .reply(502, { error: 'Bad Gateway' });

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 5000);

      await expect(client.validateKey('any-key')).rejects.toThrow();
    });

    it('should THROW on 503 Service Unavailable', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'any-key' })
        .reply(503, { error: 'Service Unavailable' });

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 5000);

      await expect(client.validateKey('any-key')).rejects.toThrow();
    });
  });

  describe('error message content', () => {
    it('should include meaningful error message on failure', async () => {
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: 'any-key' })
        .replyWithError('Connection reset');

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 5000);

      await expect(client.validateKey('any-key')).rejects.toThrow('Auth service unavailable');
    });
  });

  describe('HTTP client configuration', () => {
    it('should use configured base URL', async () => {
      const customUrl = 'http://custom-auth-service:8080';
      nock(customUrl)
        .get('/api/keys/validate')
        .query({ key: 'test-key' })
        .reply(200, { valid: true, key_id: 'k1' });

      const client = new AuthServiceClient(customUrl, 5000);
      const result = await client.validateKey('test-key');

      expect(result.valid).toBe(true);
    });

    it('should pass API key as query parameter', async () => {
      const specialKey = 'key-with-special-chars-!@#$%';
      nock(AUTH_SERVICE_URL)
        .get('/api/keys/validate')
        .query({ key: specialKey })
        .reply(200, { valid: true, key_id: 'k1' });

      const client = new AuthServiceClient(AUTH_SERVICE_URL, 5000);
      const result = await client.validateKey(specialKey);

      expect(result.valid).toBe(true);
    });
  });
});
