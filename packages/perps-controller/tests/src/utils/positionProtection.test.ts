import { assertExpectedPosition } from '../../../src/utils/positionProtection.js';

describe('assertExpectedPosition', () => {
  it('allows absent opt-in and equivalent decimal representations', () => {
    expect(() => assertExpectedPosition(undefined, undefined)).not.toThrow();
    expect(() =>
      assertExpectedPosition(
        { size: '-1.50', entryPrice: '3000.00' },
        { size: '-1.5', entryPrice: '3000' },
      ),
    ).not.toThrow();
  });

  it.each([
    { size: '0', entryPrice: '3000' },
    { size: '1', entryPrice: '0' },
    { size: '1', entryPrice: '-1' },
    { size: '1e2', entryPrice: '3000' },
    { size: 'NaN', entryPrice: '3000' },
    { size: '1', entryPrice: '' },
  ])('rejects invalid matching snapshots %j', (snapshot) => {
    expect(() => assertExpectedPosition(snapshot, snapshot)).toThrow(
      'expected position',
    );
  });

  it('rejects a disappeared position', () => {
    expect(() =>
      assertExpectedPosition({ size: '1', entryPrice: '3000' }, undefined),
    ).toThrow('expected position');
  });
});
