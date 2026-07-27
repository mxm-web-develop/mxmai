import { describe, expect, it } from 'vitest';
import { findRepoRoot } from './repo-root';

describe('repo-root', () => {
  it('findRepoRoot 从 process.cwd 向上查找', () => {
    const root = findRepoRoot();
    expect(root).toMatch(/supermxmai$/);
  });
});
