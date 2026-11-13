import type { Infer } from '@metamask/superstruct';
import { describe, expectTypeOf, test } from 'vitest';

import { NetworkController } from './NetworkController.js';
import type { NetworkState } from './NetworkController.js';

describe('NetworkController.struct', () => {
  test('is assignable to the NetworkState type', () => {
    expectTypeOf<
      Infer<typeof NetworkController.struct>
    >().toExtend<NetworkState>();
  });
});
