/**
 * Auth Service Client
 *
 * HTTP client for communicating with the auth service validation endpoint.
 * Implements fail-closed behavior: network errors throw exceptions rather than
 * returning invalid results, ensuring 503 response instead of unauthorized access.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { ValidationResult } from './types.js';

export class AuthServiceClient {
  private client: AxiosInstance;

  /**
   * Create a new auth service client.
   *
   * @param baseURL - Base URL of the auth service (e.g., "http://localhost:3001")
   * @param timeoutMs - Request timeout in milliseconds
   */
  constructor(baseURL: string, timeoutMs: number) {
    this.client = axios.create({
      baseURL,
      timeout: timeoutMs,
    });
  }

  /**
   * Validate an API key against the auth service.
   *
   * CRITICAL: This method THROWS on network errors rather than returning
   * { valid: false }. This implements "fail closed" behavior - if the auth
   * service is unreachable, requests should get 503 (service unavailable),
   * NOT be allowed through.
   *
   * @param apiKey - The API key to validate
   * @returns ValidationResult with user metadata if valid
   * @throws Error if auth service is unreachable or times out
   */
  async validateKey(apiKey: string): Promise<ValidationResult> {
    try {
      const response = await this.client.get<ValidationResult>('/api/keys/validate', {
        params: { key: apiKey },
      });

      // 200 response - valid key with metadata
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<ValidationResult>;

      // 401 response - invalid or revoked key
      if (axiosError.response?.status === 401) {
        return { valid: false };
      }

      // 400 response - missing key parameter (shouldn't happen but handle it)
      if (axiosError.response?.status === 400) {
        return { valid: false, error: 'missing_key' };
      }

      // Network error, timeout, or other failure - THROW to fail closed
      // This ensures the gateway returns 503 instead of allowing unauthorized access
      throw new Error(`Auth service unavailable: ${axiosError.message}`);
    }
  }
}
