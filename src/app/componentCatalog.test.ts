import { describe, expect, it } from 'vitest';
import { componentDefaults, parseComponentArguments } from './componentCatalog';
import { buildComponent } from '../geometry/architecture/components';
import { ComponentError } from '../geometry/architecture/schema';

describe('component catalogue field validation', () => {
  it.each([
    ['width=NaN', 'width'], ['rotation=Infinity', 'rotation'], ['width=0', 'width'],
    ['width=1 width=2', 'width'], ['unknown=1', 'unknown'],
  ])('returns a field key for %s', (arg, key) => {
    try { parseComponentArguments('windowelevation', 'mm', arg.split(' ')); throw Error('accepted invalid field'); }
    catch (error) { expect(error).toBeInstanceOf(ComponentError); expect(error).toMatchObject({ fieldKeys: [key] }); }
  });
  it('returns the interacting field keys for an impossible frame layout', () => {
    try { buildComponent('windowelevation', { ...componentDefaults('windowelevation', 'mm'), frame: 700 }); throw Error('accepted impossible frame'); }
    catch (error) { expect(error).toBeInstanceOf(ComponentError); expect(error).toMatchObject({ fieldKeys: ['width', 'height', 'frame', 'columns', 'rows'] }); }
  });
});
