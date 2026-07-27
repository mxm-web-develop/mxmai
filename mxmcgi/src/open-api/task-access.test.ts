import { describe, expect, it } from 'vitest';
import { canUserAccessTask } from './task-access';

describe('canUserAccessTask', () => {
  const task = {
    requestParams: { callerUserId: 'caller-a', openApiCallerId: 'caller-a' },
    metadata: { userId: 'owner-b' },
  };

  it('allows open api caller', () => {
    expect(canUserAccessTask(task, 'caller-a')).toBe(true);
  });

  it('allows billing owner', () => {
    expect(canUserAccessTask(task, 'owner-b')).toBe(true);
  });

  it('denies unrelated user', () => {
    expect(canUserAccessTask(task, 'stranger')).toBe(false);
  });

  it('isolates partner end users for same caller', () => {
    const t = {
      requestParams: { callerUserId: 'caller-a', endUserId: 'eu-1' },
      metadata: { userId: 'owner-b', endUserId: 'eu-1' },
    };
    expect(canUserAccessTask(t, 'caller-a', { partnerEndUserId: 'eu-1' })).toBe(true);
    expect(canUserAccessTask(t, 'caller-a', { partnerEndUserId: 'eu-2' })).toBe(false);
  });
});
