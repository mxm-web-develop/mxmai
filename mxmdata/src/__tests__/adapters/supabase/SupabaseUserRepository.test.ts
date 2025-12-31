/**
 * Supabase User Repository 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SupabaseUserRepository } from '../../../adapters/supabase/SupabaseUserRepository';
import { NotFoundError, DuplicateError, DataAccessError } from '../../../interfaces/errors';
import type { User, CreateUserDto, UpdateUserDto } from '../../../interfaces/IUserRepository';

// Mock Supabase Client
const mockSupabaseClient = {
  from: vi.fn(),
};

describe('SupabaseUserRepository', () => {
  let repository: SupabaseUserRepository;
  let mockQuery: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
      upsert: vi.fn().mockReturnThis(),
    };
    mockSupabaseClient.from.mockReturnValue(mockQuery);
    repository = new SupabaseUserRepository(mockSupabaseClient as any);
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        password_hash: 'hashed',
        level: 1,
        balance: 0,
        membership_type: 'free',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockQuery.single.mockResolvedValue({ data: mockUser, error: null });

      const result = await repository.findById('user-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('user-123');
      expect(result?.username).toBe('testuser');
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('users');
      expect(mockQuery.eq).toHaveBeenCalledWith('id', 'user-123');
    });

    it('should return null when user not found', async () => {
      mockQuery.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });

    it('should throw DataAccessError on query error', async () => {
      mockQuery.single.mockResolvedValue({
        data: null,
        error: { code: 'OTHER_ERROR', message: 'Database error' },
      });

      await expect(repository.findById('user-123')).rejects.toThrow(DataAccessError);
    });
  });

  describe('create', () => {
    it('should create user successfully', async () => {
      const createDto: CreateUserDto = {
        username: 'newuser',
        email: 'new@example.com',
        password_hash: 'hashed',
      };

      const mockCreatedUser = {
        id: 'user-456',
        ...createDto,
        level: 1,
        balance: 0,
        membership_type: 'free',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockQuery.single.mockResolvedValue({ data: mockCreatedUser, error: null });

      const result = await repository.create(createDto);

      expect(result).toBeDefined();
      expect(result.username).toBe('newuser');
      expect(mockQuery.insert).toHaveBeenCalled();
    });

    it('should throw DuplicateError on unique constraint violation', async () => {
      const createDto: CreateUserDto = {
        username: 'existing',
        password_hash: 'hashed',
      };

      mockQuery.single.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint "users_username_key"' },
      });

      await expect(repository.create(createDto)).rejects.toThrow();
      await expect(repository.create(createDto)).rejects.toMatchObject({
        code: 'DUPLICATE',
        name: 'DuplicateError',
      });
    });
  });

  describe('update', () => {
    it('should update user successfully', async () => {
      const updateDto: UpdateUserDto = {
        username: 'updated',
      };

      const mockUpdatedUser = {
        id: 'user-123',
        username: 'updated',
        email: 'test@example.com',
        password_hash: 'hashed',
        level: 1,
        balance: 0,
        membership_type: 'free',
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      mockQuery.single.mockResolvedValue({ data: mockUpdatedUser, error: null });

      const result = await repository.update('user-123', updateDto);

      expect(result.username).toBe('updated');
      expect(mockQuery.update).toHaveBeenCalled();
    });

    it('should throw NotFoundError when user not found', async () => {
      mockQuery.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      await expect(repository.update('non-existent', { username: 'new' })).rejects.toThrow();
      await expect(repository.update('non-existent', { username: 'new' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        name: 'NotFoundError',
      });
    });
  });

  describe('delete', () => {
    it('should delete user successfully', async () => {
      const mockDeleteQuery = {
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      mockQuery.delete.mockReturnValue(mockDeleteQuery);

      await repository.delete('user-123');

      expect(mockQuery.delete).toHaveBeenCalled();
      expect(mockDeleteQuery.eq).toHaveBeenCalledWith('id', 'user-123');
    });

    it('should throw DataAccessError on delete error', async () => {
      mockQuery.delete.mockResolvedValue({
        error: { message: 'Delete failed' },
      });

      await expect(repository.delete('user-123')).rejects.toThrow(DataAccessError);
    });
  });
});

