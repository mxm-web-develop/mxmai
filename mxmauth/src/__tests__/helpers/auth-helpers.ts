/**
 * Auth Test Helpers
 *
 * Utilities for authentication in integration tests.
 */

import { generateAccessToken } from '../../auth/jwt';

/**
 * Generate a valid JWT access token for testing
 */
export function createTestToken(userId: string, username: string, role: string = 'user'): string {
  return generateAccessToken({ userId, username, role });
}

/**
 * Create Authorization header for requests
 */
export function createAuthHeader(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Create x-user-id header for CGI services
 */
export function createUserIdHeader(userId: string): Record<string, string> {
  return {
    'x-user-id': userId,
  };
}