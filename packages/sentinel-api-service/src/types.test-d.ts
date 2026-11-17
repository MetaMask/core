import { assertType, describe, expectTypeOf, test } from 'vitest';

import type { SentinelSimulationResponseTransaction } from './index.js';

describe('SentinelSimulationResponseTransaction', () => {
  test('types gasCost as an optional decimal string', () => {
    expectTypeOf<
      SentinelSimulationResponseTransaction['gasCost']
    >().toEqualTypeOf<string | undefined>();

    assertType<SentinelSimulationResponseTransaction>({
      return: '0x',
      gasCost: '10500500000021001',
    });
    assertType<SentinelSimulationResponseTransaction>({ return: '0x' });

    assertType<SentinelSimulationResponseTransaction>({
      return: '0x',
      // @ts-expect-error The API represents gasCost as a decimal string.
      gasCost: 1,
    });
  });
});
