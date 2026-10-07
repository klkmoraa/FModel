import { expect, it } from 'vitest';
import { DWG_ENABLED } from './capabilities';

it('normal development and unit tests retain the experimental DWG capability', () => {
  expect(DWG_ENABLED).toBe(true);
});
