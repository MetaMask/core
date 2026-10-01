import {
  parseLighterAttachedGroups,
  correlateLighterAttachedOrders,
} from '../../../src/utils/lighterAttachedOrders.js';
import type { LighterAttachedGroup } from '../../../src/utils/lighterAttachedOrders.js';

const group = (): LighterAttachedGroup => ({
  version: 1,
  groupId: 'lighter-attached:testnet:wallet:28:1:101',
  symbol: 'BTC',
  accountIndex: 28,
  apiKeyIndex: 7,
  submission: 'prepared',
  txHash: null,
  nonce: null,
  expiresAt: null,
  orders: [
    [1, 101, '100', '900000', 0, 0, 1, 0, '0', -1],
    [1, 102, '0', '1045000', 1, 4, 0, 1, '1100000', -1],
    [1, 103, '0', '760000', 1, 2, 0, 1, '800000', -1],
  ],
  venueIds: [null, null, null],
});

describe('Lighter attached journal', () => {
  it('retains both exact native tuple shapes', () => {
    const pair = group();
    pair.orders = [pair.orders[0], pair.orders[1]];
    pair.venueIds = [null, null];
    expect(parseLighterAttachedGroups(JSON.stringify([pair]))).toStrictEqual([
      pair,
    ]);
    expect(parseLighterAttachedGroups(JSON.stringify([group()]))).toStrictEqual(
      [group()],
    );
  });

  it.each([
    ['positive child', 1, 2, '1'],
    ['same side', 1, 4, 0],
    ['non-reduce child', 1, 7, 0],
    ['duplicate sibling', 2, 5, 4],
    ['duplicate client ID', 2, 1, 102],
    ['fractional client ID', 1, 1, 1.2],
    ['wrong market', 1, 0, 2],
    ['negative child', 1, 2, '-1'],
    ['fractional child', 1, 2, '0.2'],
    ['uint32 overflow price', 1, 3, '4294967296'],
    ['negative price', 1, 3, '-1'],
    ['zero trigger', 1, 8, '0'],
    ['invalid expiry', 1, 9, -2],
    ['unequal expiry', 2, 9, 999999999],
    ['nonzero parent trigger', 0, 8, '100'],
    ['reduce-only parent', 0, 7, 1],
  ])(
    'rejects corrupt %s before any recovery action',
    (_label, orderIndex, field, value) => {
      const corrupt = group();
      const orders: unknown[][] = corrupt.orders;
      orders[Number(orderIndex)][Number(field)] = value;
      expect(() =>
        parseLighterAttachedGroups(JSON.stringify([corrupt])),
      ).toThrow('Invalid Lighter');
    },
  );

  it('rejects an unknown submission without a complete exact transaction identity', () => {
    expect(() =>
      parseLighterAttachedGroups(
        JSON.stringify([{ ...group(), submission: 'unknown' }]),
      ),
    ).toThrow('dispatch identity');
  });

  it('rejects a child ID reused by a different persisted parent group', () => {
    const other = group();
    other.groupId = 'lighter-attached:testnet:wallet:28:1:104';
    other.orders[0][1] = 104;
    const stopLoss = other.orders[2];
    if (!stopLoss) {
      throw new Error('Expected paired attached fixture');
    }
    stopLoss[1] = 105;
    expect(() =>
      parseLighterAttachedGroups(JSON.stringify([group(), other])),
    ).toThrow('Duplicate Lighter attached client identity');
  });

  it('does not infer missing identities from an empty book', () => {
    expect(correlateLighterAttachedOrders(group(), [])).toStrictEqual([
      null,
      null,
      null,
    ]);
  });
});
