import { describe, expect, it } from 'vitest';
import { inferMediaContentType, parseRangeHeader } from './http-range-stream';

describe('parseRangeHeader', () => {
  const total = 1000;

  it('returns null when no range header', () => {
    expect(parseRangeHeader(undefined, total)).toBeNull();
  });

  it('parses bytes=start-end', () => {
    expect(parseRangeHeader('bytes=0-99', total)).toEqual({ start: 0, end: 99 });
  });

  it('parses open-ended range', () => {
    expect(parseRangeHeader('bytes=500-', total)).toEqual({ start: 500, end: 999 });
  });

  it('parses suffix range', () => {
    expect(parseRangeHeader('bytes=-100', total)).toEqual({ start: 900, end: 999 });
  });

  it('returns unsatisfiable for out of bounds', () => {
    expect(parseRangeHeader('bytes=2000-3000', total)).toBe('unsatisfiable');
  });
});

describe('inferMediaContentType', () => {
  it('detects pdf by extension', () => {
    expect(inferMediaContentType('user/writing/a.pdf')).toBe('application/pdf');
  });
});
