import { describe, expect, test } from 'tstyche';

import type { Hex } from './index.js';

describe('Hex', () => {
  test('accepts valid hex strings', () => {
    expect('0x').type.toBeAssignableTo<Hex>();

    expect('0x0').type.toBeAssignableTo<Hex>();

    expect('0x😀').type.toBeAssignableTo<Hex>();

    const embeddedString = 'test';
    expect(`0x${embeddedString}`).type.toBeAssignableTo<Hex>();
  });

  test('rejects invalid hex strings', () => {
    const embeddedString = 'test';

    expect(`0X${embeddedString}`).type.not.toBeAssignableTo<Hex>();

    expect(`1x${embeddedString}`).type.not.toBeAssignableTo<Hex>();

    expect(0).type.not.toBeAssignableTo<Hex>();

    expect('0').type.not.toBeAssignableTo<Hex>();

    expect('🙃').type.not.toBeAssignableTo<Hex>();
  });
});
