/**
 * Test Cleanup Utilities
 *
 * Helper functions for cleaning up test data.
 */

import { RepositoryFactory } from '@mxmai/mxmdata';

/**
 * Delete test user by email
 */
export async function deleteTestUser(email: string): Promise<void> {
  try {
    const userRepo = RepositoryFactory.createUserRepository();
    const user = await userRepo.findByEmail(email);
    if (user) {
      await userRepo.delete(user.id);
    }
  } catch (error) {
    console.warn(`Failed to delete test user ${email}:`, error);
  }
}

/**
 * Delete test user by username
 */
export async function deleteTestUserByUsername(username: string): Promise<void> {
  try {
    const userRepo = RepositoryFactory.createUserRepository();
    const user = await userRepo.findByUsername(username);
    if (user) {
      await userRepo.delete(user.id);
    }
  } catch (error) {
    console.warn(`Failed to delete test user ${username}:`, error);
  }
}

/**
 * Generate unique test email for each test run
 */
export function generateTestEmail(prefix: string = 'test'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`;
}

/**
 * Generate unique test username
 */
export function generateTestUsername(prefix: string = 'testuser'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}