import { describe, expect, it } from 'vitest';
import { DEG } from '../../geometry/angle';
import { TOL } from '../../geometry/tolerance';
import type { Pair } from './parser';
import { recoverUserHatchPattern } from './userHatchPattern';

const family = (angle: number, x: number, y: number, dx: number, dy: number): Pair[] =>
  [[53, String(angle)], [43, String(x)], [44, String(y)], [45, String(dx)], [46, String(dy)], [79, '0']];
const recover = (...families: Pair[][]) => recoverUserHatchPattern([[78, String(families.length)], ...families.flat(), [98, '0']], '_USER');

describe('DXF user pattern normalization and tolerances', () => {
  it('normalizes negative angle and signed offsets without moving the world origin', () => {
    const result = recover(family(-90, 12, 34, -7, 0));
    expect(result).toMatchObject({ pattern: { angle: 270 * DEG, spacing: 7, scale: 1, double: false }, origin: { x: 12, y: 34 } });
  });

  it('accepts the opposite direction of an orthogonal second family', () => {
    expect(recover(family(0, 12, 34, 0, -7), family(-90, 12, 34, 7, 0))).toMatchObject({ pattern: { spacing: 7, double: true } });
  });

  it('uses central relative tolerance for common UTM origins', () => {
    expect(recover(family(0, 1000000, 2000000, 0, 0.1), family(90, 1000000 + 0.0000005, 2000000, -0.1, 0))).toMatchObject({ origin: { x: 1000000, y: 2000000 }, pattern: { double: true } });
    expect(recover(family(0, 1000000, 2000000, 0, 0.1), family(90, 1000000 + 0.000002, 2000000, -0.1, 0))).toHaveProperty('reason');
  });

  it('verifies orthogonality with the central angular tolerance', () => {
    const delta = TOL.ANGULAR / DEG;
    const rotated = (degrees: number) => family(degrees, 0, 0, -7 * Math.sin(degrees * DEG), 7 * Math.cos(degrees * DEG));
    expect(recover(family(0, 0, 0, 0, 7), rotated(90 + delta / 2))).toHaveProperty('pattern');
    expect(recover(family(0, 0, 0, 0, 7), rotated(90 + delta * 2))).toHaveProperty('reason');
  });

  it('verifies spacing equality independently of the orthogonal flag', () => {
    expect(recover(family(0, 0, 0, 0, 7), family(90, 0, 0, -7 - TOL.LINEAR / 2, 0))).toHaveProperty('pattern');
    expect(recover(family(0, 0, 0, 0, 7), family(90, 0, 0, -7 - TOL.LINEAR * 2, 0))).toHaveProperty('reason');
  });

  it('rejects collapsed spacing and retains finite spacing just above the central limit', () => {
    expect(recover(family(0, 0, 0, 0, TOL.LINEAR))).toHaveProperty('reason');
    expect(recover(family(0, 0, 0, 0, TOL.LINEAR * 2))).toMatchObject({ pattern: { spacing: TOL.LINEAR * 2 } });
  });

  it.each([53, 43, 44, 45, 46, 79])('rejects nonfinite family field %s without replacing it by zero', (code) => {
    const pairs: Pair[] = [[78, '1'], ...family(0, 0, 0, 0, 7), [98, '0']];
    pairs.find((pair) => pair[0] === code)![1] = 'NaN';
    expect(recoverUserHatchPattern(pairs, '_USER')).toHaveProperty('reason');
  });
});
