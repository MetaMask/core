import { describe, expectTypeOf, test } from 'vitest';

import type { Hex } from './index.js';

describe('Hex', () => {
  test('accepts valid hex strings', () => {
    expectTypeOf('0x' as const).toExtend<Hex>();

    expectTypeOf('0x0' as const).toExtend<Hex>();

    expectTypeOf('0x😀' as const).toExtend<Hex>();

    const embeddedString = 'test';
    expectTypeOf(`0x${embeddedString}` as const).toExtend<Hex>();
  });

  test('rejects invalid hex strings', () => {
    const embeddedString = 'test';

    expectTypeOf(`0X${embeddedString}` as const).not.toExtend<Hex>();

    expectTypeOf(`1x${embeddedString}` as const).not.toExtend<Hex>();

    expectTypeOf(0).not.toExtend<Hex>();

    expectTypeOf('0' as const).not.toExtend<Hex>();

    expectTypeOf('🙃' as const).not.toExtend<Hex>();
  });
});
