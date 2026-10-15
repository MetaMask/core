import { noop } from './index.js';

describe('noop', () => {
  it('returns nothing', () => {
    expect(noop()).toBeUndefined();
  });
});
