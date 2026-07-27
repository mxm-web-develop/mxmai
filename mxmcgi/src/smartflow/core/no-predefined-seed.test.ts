import { describe, it, expect } from 'vitest';
import { PREDEFINED_EXAMPLE_FLOWS } from './predefined-flows';
import { PREDEFINED_SMARTFLOWS } from './photographyV2';

/**
 * 回归：运行时不得再自动 seed 硬编码 Smartflow（列表仅以 DB 为准）
 */
describe('Smartflow predefined seed disabled', () => {
  it('PREDEFINED_* exports are empty arrays', () => {
    expect(PREDEFINED_EXAMPLE_FLOWS).toEqual([]);
    expect(PREDEFINED_SMARTFLOWS).toEqual([]);
  });
});
