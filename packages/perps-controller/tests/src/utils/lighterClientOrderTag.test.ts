import { describe, expect, it } from 'vitest';

import {
  LIGHTER_ORDER_TYPE_LIMIT,
  LIGHTER_ORDER_TYPE_MARKET,
  LIGHTER_ORDER_TYPE_STOP_LOSS,
  LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT,
  LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT,
} from '../../../src/constants/lighterConfig.js';
import {
  getLighterClientOrderKind,
  toLighterClientOrderIndex,
} from '../../../src/utils/lighterClientOrderTag.js';

const LOW_31_BITS = 2 ** 31 - 1;
const MAX_UINT48 = 2 ** 48 - 1;

describe('getLighterClientOrderKind', () => {
  it.each([
    [LIGHTER_ORDER_TYPE_LIMIT, 'other'],
    [LIGHTER_ORDER_TYPE_MARKET, 'other'],
    [LIGHTER_ORDER_TYPE_STOP_LOSS, 'stopLoss'],
    [LIGHTER_ORDER_TYPE_STOP_LOSS_LIMIT, 'stopLoss'],
    [LIGHTER_ORDER_TYPE_TAKE_PROFIT, 'takeProfit'],
    [LIGHTER_ORDER_TYPE_TAKE_PROFIT_LIMIT, 'takeProfit'],
  ])('maps wire order type %i to %s', (wireOrderType, kind) => {
    expect(getLighterClientOrderKind(wireOrderType)).toBe(kind);
  });
});

describe('toLighterClientOrderIndex', () => {
  // Shared with the notify-perps classifier: both sides must agree on these.
  it.each([
    ['stopLoss', 0, 182256937205760],
    ['stopLoss', LOW_31_BITS, 182259084689407],
    ['takeProfit', 0, 182259084689408],
    ['takeProfit', LOW_31_BITS, 182261232173055],
  ] as const)('tags %s with random bits %i as %i', (kind, draw, expected) => {
    expect(toLighterClientOrderIndex(kind, draw)).toBe(expected);
  });

  it.each(['stopLoss', 'takeProfit'] as const)(
    'keeps only the low 31 random bits of a full uint48 draw for %s',
    (kind) => {
      const fromMaxDraw = toLighterClientOrderIndex(kind, MAX_UINT48);
      const fromLowBits = toLighterClientOrderIndex(kind, LOW_31_BITS);

      expect(fromMaxDraw).toBe(fromLowBits);
      expect(Number.isSafeInteger(fromMaxDraw)).toBe(true);
      expect(fromMaxDraw).toBeLessThan(2 ** 48);
    },
  );

  it('returns an untagged draw unchanged, up to the uint48 bound', () => {
    expect(toLighterClientOrderIndex('other', 1)).toBe(1);
    expect(toLighterClientOrderIndex('other', MAX_UINT48)).toBe(MAX_UINT48);
  });

  it.each([182256937205760, 182259084689408, 182261232173055])(
    'rejects an untagged draw %i that carries the MetaMask prefix',
    (draw) => {
      expect(toLighterClientOrderIndex('other', draw)).toBeNull();
    },
  );

  it.each([182256937205759, 182261232173056])(
    'accepts an untagged draw %i just outside the MetaMask prefix',
    (draw) => {
      expect(toLighterClientOrderIndex('other', draw)).toBe(draw);
    },
  );
});
