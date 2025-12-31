/**
 * 错误类单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  DataAccessError,
  NotFoundError,
  DuplicateError,
  ValidationError,
  ConnectionError,
  TransactionError,
} from '../../interfaces/errors';

describe('Error Classes', () => {
  describe('DataAccessError', () => {
    it('should create a DataAccessError with message and code', () => {
      const error = new DataAccessError('Test error', 'TEST_CODE');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('DataAccessError');
    });

    it('should include original error', () => {
      const originalError = new Error('Original error');
      const error = new DataAccessError('Test error', 'TEST_CODE', originalError);
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('NotFoundError', () => {
    it('should create a NotFoundError with resource and identifier', () => {
      const error = new NotFoundError('User', 'user-123');
      expect(error.message).toBe('User not found: user-123');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.name).toBe('NotFoundError');
    });
  });

  describe('DuplicateError', () => {
    it('should create a DuplicateError with resource, field and value', () => {
      const error = new DuplicateError('User', 'email', 'test@example.com');
      expect(error.message).toBe("User with email 'test@example.com' already exists");
      expect(error.code).toBe('DUPLICATE');
      expect(error.name).toBe('DuplicateError');
    });
  });

  describe('ValidationError', () => {
    it('should create a ValidationError with message', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });

    it('should include field information', () => {
      const error = new ValidationError('Invalid email', 'email');
      expect(error.field).toBe('email');
    });
  });

  describe('ConnectionError', () => {
    it('should create a ConnectionError', () => {
      const originalError = new Error('Connection failed');
      const error = new ConnectionError('Database connection error', originalError);
      expect(error.message).toBe('Database connection error');
      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('TransactionError', () => {
    it('should create a TransactionError', () => {
      const originalError = new Error('Transaction failed');
      const error = new TransactionError('Transaction error', originalError);
      expect(error.message).toBe('Transaction error');
      expect(error.code).toBe('TRANSACTION_ERROR');
      expect(error.originalError).toBe(originalError);
    });
  });
});

