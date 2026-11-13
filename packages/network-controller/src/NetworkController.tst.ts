import type { Infer } from '@metamask/superstruct';
import { describe, expect, test } from 'tstyche';

import { NetworkController } from './NetworkController.js';
import type { NetworkState } from './NetworkController.js';

describe('NetworkController.struct', () => {
  test('is assignable to the NetworkState type', () => {
    expect<
      Infer<typeof NetworkController.struct>
    >().type.toBeAssignableTo<NetworkState>();
  });
});
