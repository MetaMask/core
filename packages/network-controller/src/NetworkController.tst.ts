import type { Infer } from '@metamask/superstruct';
import { describe, expect, test } from 'tstyche';

import { NetworkController } from './NetworkController.js';
import type { NetworkState } from './NetworkController.js';

describe('NetworkController.struct', () => {
  test('matches the NetworkState type', () => {
    expect<Infer<typeof NetworkController.struct>>().type.toBe<NetworkState>();
  });
});
