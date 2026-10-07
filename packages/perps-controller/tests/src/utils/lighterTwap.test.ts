import { prepareLighterTwapOrder } from '../../../src/utils/lighterTwap.js';

const intent = {
  size: '0.125',
  referencePrice: '100.03',
  sizeDecimals: 3,
  priceDecimals: 2,
  isBuy: true,
  slippage: '0.01',
  durationMinutes: 1,
  nowMilliseconds: 1_800_000_000_000,
  randomize: false,
  reduceOnly: false,
};

describe('prepareLighterTwapOrder', () => {
  it('prepares exact native type6 fields without borrowing Hyperliquid duration limits', () => {
    expect(prepareLighterTwapOrder(intent)).toStrictEqual({
      baseAmount: '125',
      price: '10103',
      isAsk: 0,
      orderType: 6,
      timeInForce: 1,
      reduceOnly: 0,
      triggerPrice: '0',
      orderExpiry: 1_800_000_060_000,
    });
  });

  it('rounds a sell bound inward so price protection never widens', () => {
    expect(
      prepareLighterTwapOrder({ ...intent, isBuy: false, reduceOnly: true }),
    ).toMatchObject({ price: '9903', isAsk: 1, reduceOnly: 1 });
  });

  it('preserves the exact maximum 48-bit amount', () => {
    expect(
      prepareLighterTwapOrder({ ...intent, size: '281474976710.655' }),
    ).toMatchObject({ baseAmount: '281474976710655' });
  });

  it.each([
    { size: '281474976710.656' },
    { size: '0.0001' },
    { size: '0' },
    { size: '-1' },
    { size: 'NaN' },
    { size: '1tail' },
    { size: 'Infinity' },
    { referencePrice: '0' },
    { referencePrice: 'Infinity' },
    { referencePrice: '42949672.96', slippage: '0' },
    { referencePrice: '0.001', slippage: '0' },
    { slippage: '-0.1' },
    { slippage: '1' },
    { slippage: 'Infinity' },
    { sizeDecimals: 1.5 },
    { sizeDecimals: -1 },
    { priceDecimals: 256 },
    { durationMinutes: 0 },
    { durationMinutes: -1 },
    { durationMinutes: 0.5 },
    { durationMinutes: Number.MAX_SAFE_INTEGER },
    { nowMilliseconds: -1 },
    { nowMilliseconds: Number.NaN },
    { nowMilliseconds: Number.MAX_SAFE_INTEGER },
    { randomize: true },
  ])('rejects invalid wire intent %j', (override) => {
    expect(() => prepareLighterTwapOrder({ ...intent, ...override })).toThrow(
      /Lighter native TWAP/u,
    );
  });
});
