import { BigNumber } from 'bignumber.js';

import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import type { OrderParams } from '../../../src/types/index.js';
import type { LighterOrderBookMeta } from '../../../src/types/lighter-types.js';
import {
  buildLighterScaleLadder,
  normalizeLighterScalePrices,
  parseLighterScaleGroups,
  toLighterScaleGroup,
} from '../../../src/utils/lighterScaleOrders.js';
import type { LighterScaleGroup } from '../../../src/utils/lighterScaleOrders.js';

const market: LighterOrderBookMeta = {
  symbol: 'SOL',
  marketId: 4097,
  marketType: 'perp',
  status: 'active',
  takerFee: '0',
  makerFee: '0',
  minBaseAmount: '0.05',
  minQuoteAmount: '10',
  supportedSizeDecimals: 3,
  supportedPriceDecimals: 3,
  supportedQuoteDecimals: 6,
};
const intent: OrderParams = {
  symbol: 'SOL',
  orderType: 'scale',
  isBuy: false,
  size: '0.144',
  scaleMinPrice: '125',
  scaleMaxPrice: '156.25',
  scaleNumOrders: 2,
  scaleSkew: 0.8,
};

/** Produce independent durable fixtures.
 * @returns A two-child stopped ladder with one resting child.
 */
function groupFixture(): LighterScaleGroup {
  return {
    version: 1,
    groupId:
      'lighter-scale:testnet:0x1111111111111111111111111111111111111111:28:100',
    symbol: 'SOL',
    accountIndex: 28,
    apiKeyIndex: 7,
    marketId: 4097,
    isBuy: false,
    reduceOnly: false,
    createdAt: 1000,
    walletAddress: '0x1111111111111111111111111111111111111111',
    network: 'testnet',
    sizeDecimals: 3,
    priceDecimals: 3,
    placementStopped: true,
    rungs: [
      {
        clientOrderId: 100,
        price: '125',
        size: '0.08',
        priceInt: 125000,
        sizeInt: 80,
        state: 'resting',
        nonce: 42,
        txHash: 'aabb',
        expiresAt: 10000,
        orderExpiry: 20000,
        orderId: '800',
        filledSize: '0',
      },
      {
        clientOrderId: 101,
        price: '156.25',
        size: '0.064',
        priceInt: 156250,
        sizeInt: 64,
        state: 'prepared',
        nonce: null,
        txHash: null,
        expiresAt: null,
        orderExpiry: null,
      },
    ],
  };
}

describe('Lighter Scale exact builder', () => {
  it('accepts children at the native maximum even when their aggregate exceeds it', () => {
    const result = buildLighterScaleLadder(
      { ...intent, size: '562.94995342131', scaleSkew: 1 },
      { ...market, supportedSizeDecimals: 12 },
    );
    expect(result.sizes).toStrictEqual([
      '281.474976710655',
      '281.474976710655',
    ]);
  });
  it.each([
    { size: '562.949953421312', scaleSkew: 1 },
    { size: '600', scaleSkew: 1 },
    { size: '500', scaleSkew: 2 },
  ])('rejects a child above the native amount maximum %j', (override) => {
    expect(() =>
      buildLighterScaleLadder(
        { ...intent, ...override },
        { ...market, supportedSizeDecimals: 12 },
      ),
    ).toThrow('Lighter Scale child exceeds native base amount');
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY, -1, 21])(
    'rejects invalid price precision %s before applying decimal shifts',
    (decimals) => {
      expect(() =>
        normalizeLighterScalePrices('125', '156.25', 2, decimals),
      ).toThrow('Invalid Lighter Scale precision');
    },
  );

  it.each([
    [
      { scaleMinPrice: undefined },
      PERPS_ERROR_CODES.ORDER_SCALE_RANGE_REQUIRED,
    ],
    [
      { scaleNumOrders: undefined },
      PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID,
    ],
    [{ scaleNumOrders: 1 }, PERPS_ERROR_CODES.ORDER_SCALE_COUNT_INVALID],
    [
      { scaleMinPrice: '125.0001', isBuy: false },
      PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID,
    ],
    [{ scaleMaxPrice: '125' }, PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID],
    [{ size: '0.0001' }, PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL],
    [{ usdAmount: '1' }, PERPS_ERROR_CODES.ORDER_SCALE_SIZE_TOO_SMALL],
  ] as const)('returns shared Scale error codes for %j', (override, code) => {
    expect(() =>
      buildLighterScaleLadder({ ...intent, ...override }, market),
    ).toThrow(code);
  });

  it('conserves skewed integer lots and the exact quote budget', () => {
    const explicit = buildLighterScaleLadder(intent, market);
    const budget = buildLighterScaleLadder(
      { ...intent, usdAmount: '20' },
      market,
    );
    expect(explicit).toStrictEqual({
      prices: ['125', '156.25'],
      sizes: ['0.08', '0.064'],
      size: '0.144',
      notional: '20',
    });
    expect(budget).toStrictEqual(explicit);
  });

  it('floors explicit dust without increasing exposure', () => {
    expect(
      buildLighterScaleLadder({ ...intent, size: '0.144999' }, market).size,
    ).toBe('0.144');
  });

  it.each([2, 3, 7, 20])('conserves exact lots for %s rungs', (count) => {
    const result = buildLighterScaleLadder(
      { ...intent, size: '19.997', scaleNumOrders: count, scaleSkew: 1.7 },
      market,
    );
    expect(
      result.sizes
        .reduce((sum, size) => sum.plus(size), new BigNumber(0))
        .toFixed(),
    ).toBe('19.997');
    expect(new Set(result.prices).size).toBe(count);
  });

  it.each([
    { scaleMinPrice: '125junk' },
    { scaleMaxPrice: '125.001', scaleNumOrders: 3 },
    { size: '0.143' },
    { size: '9007199254740.992' },
    { scaleSkew: Number.POSITIVE_INFINITY },
    { usdAmount: '19.99' },
    { maxSlippageBps: 100 },
    { isFullClose: true },
  ])('rejects malformed, underfunded or unsupported intent: %j', (override) => {
    expect(() =>
      buildLighterScaleLadder({ ...intent, ...override }, market),
    ).toThrow(/scale/iu);
  });

  it('uses exact decimal ticks at the unsigned 32-bit wire boundary', () => {
    expect(
      normalizeLighterScalePrices('4294967.294', '4294967.295', 2, 3),
    ).toStrictEqual(['4294967.294', '4294967.295']);
    expect(() =>
      normalizeLighterScalePrices('4294967.294', '4294967.296', 2, 3),
    ).toThrow(/scale/iu);
  });
});

describe('Lighter Scale durable receipt', () => {
  it('validates persisted native base amounts at the maximum and one unit above', () => {
    const group = groupFixture();
    group.sizeDecimals = 12;
    group.rungs[0].sizeInt = 281474976710655;
    group.rungs[0].size = '281.474976710655';
    group.rungs[1].size = '0.000000000064';
    expect(parseLighterScaleGroups(JSON.stringify([group]))).toStrictEqual([
      group,
    ]);
    group.rungs[0].sizeInt = 281474976710656;
    group.rungs[0].size = '281.474976710656';
    expect(() => parseLighterScaleGroups(JSON.stringify([group]))).toThrow(
      /scale/iu,
    );
  });

  it('retains uncertainty without fabricating child identity or acceptance', () => {
    const group = groupFixture();
    group.rungs[0].state = 'unknown';
    delete group.rungs[0].orderId;
    delete group.rungs[0].filledSize;
    expect(toLighterScaleGroup(group)).toMatchObject({
      state: 'unknown',
      submittedSize: '0.08',
      childOrderIds: [],
      acceptedChildren: [],
    });
    expect(toLighterScaleGroup(group).acceptedSize).toBeUndefined();
    expect(toLighterScaleGroup(group).filledSize).toBeUndefined();
  });

  it('preserves canceled acceptance while excluding it from resting child IDs', () => {
    const group = groupFixture();
    group.rungs[0].state = 'canceled';
    const receipt = toLighterScaleGroup(group);
    expect(receipt).toMatchObject({
      state: 'terminal',
      acceptedSize: '0.08',
      childOrderIds: [],
      acceptedChildren: [{ state: 'canceled', orderId: '800' }],
      filledSize: '0',
    });
    expect(receipt).not.toHaveProperty('averagePrice');
  });

  it('does not substitute the limit price for execution evidence', () => {
    const group = groupFixture();
    group.rungs[0].state = 'filled';
    group.rungs[0].filledSize = '0.08';
    expect(toLighterScaleGroup(group).filledSize).toBe('0.08');
    expect(toLighterScaleGroup(group)).not.toHaveProperty('averagePrice');
  });

  it('round trips validated immutable scope and rejects duplicated identities', () => {
    const group = groupFixture();
    expect(parseLighterScaleGroups(JSON.stringify([group]))).toStrictEqual([
      group,
    ]);
    expect(() =>
      parseLighterScaleGroups(JSON.stringify([group, group])),
    ).toThrow(/scale/iu);
    group.rungs[1].clientOrderId = group.rungs[0].clientOrderId;
    expect(() => parseLighterScaleGroups(JSON.stringify([group]))).toThrow(
      /scale/iu,
    );
  });

  it.each(['priceInt', 'sizeInt', 'nonce', 'orderId', 'orderExpiry'] as const)(
    'rejects invalid persisted %s',
    (field) => {
      const group = groupFixture();
      const raw = JSON.parse(JSON.stringify(group)) as {
        rungs: Record<string, unknown>[];
      };
      raw.rungs[0][field] = null;
      expect(() => parseLighterScaleGroups(JSON.stringify([raw]))).toThrow(
        /scale/iu,
      );
    },
  );
});
