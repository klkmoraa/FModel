import { describe, expect, it } from 'vitest';
import { num, TagBuffer } from './tags';

describe('DXF numeric values', () => {
  it.each([1e21, -1e21, 1e100, Number.MAX_VALUE])('preserves the finite value %s in a valid numeric token', (value) => {
    expect(Number(num(value))).toBe(value);
  });

  it.each([NaN, Infinity, -Infinity])('rejects %s instead of substituting zero', (value) => {
    expect(() => num(value)).toThrow(/DXF.*no finito.*non-finite/i);
  });

  it.each([10, 70])('rejects non-finite values in group %s without appending a tag', (code) => {
    const tags = new TagBuffer();
    tags.tag(0, 'POINT');
    const before = tags.toString();

    expect(() => tags.tag(code, Infinity)).toThrow(/DXF.*no finito.*non-finite/i);
    expect(tags.toString()).toBe(before);
  });
});
