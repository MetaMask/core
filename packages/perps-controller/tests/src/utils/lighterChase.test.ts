import type {
  LighterApiOrder,
  LighterBookOrder,
  LighterRestTrade,
} from '../../../src/types/lighter-types.js';
import {
  identifyLighterChaseChild,
  readLighterChaseQuote,
  reconcileLighterChaseChild,
} from '../../../src/utils/lighterChase.js';

const row = (
  id: number,
  price: string,
  ownerAccountIndex = 99,
): LighterBookOrder => ({
  orderIndex: id,
  orderId: String(id),
  ownerAccountIndex,
  initialBaseAmount: '1',
  remainingBaseAmount: '1',
  price,
  orderExpiry: 1000000,
  transactionTime: 100000,
});
const book = {
  code: 200,
  totalBids: 3,
  totalAsks: 1,
  bids: [row(1, '100', 28), row(2, '99.9', 28), row(3, '99')],
  asks: [row(4, '101')],
};
const quote = { isBuy: true, accountIndex: 28, priceDecimals: 1 };
const intent = {
  owner: {
    wallet: '0xabc',
    network: 'testnet' as const,
    accountIndex: 28,
    apiKeyIndex: 7,
  },
  symbol: 'BTC',
  marketId: 1,
  isBuy: true,
  reduceOnly: false,
  sizeDecimals: 5,
  priceDecimals: 1,
};
const child = {
  clientOrderId: '100',
  size: '0.0002',
  price: '100000',
  nonce: 8,
};
const order: LighterApiOrder = {
  orderIndex: 9001,
  orderId: '9001',
  clientOrderIndex: 100,
  clientOrderId: '100',
  ownerAccountIndex: 28,
  marketIndex: 1,
  initialBaseAmount: '0.0002',
  remainingBaseAmount: '0.00015',
  filledBaseAmount: '0.00005',
  filledQuoteAmount: '5',
  price: '100000',
  isAsk: false,
  type: 'limit',
  timeInForce: 'post-only',
  reduceOnly: 0,
  status: 'canceled',
  orderExpiry: 1000000,
  timestamp: 100001,
  nonce: 8,
};
const trade: LighterRestTrade = {
  tradeId: 1,
  txHash: 'fill',
  marketId: 1,
  size: '0.00005',
  price: '100000',
  usdAmount: '5',
  bidId: 9001,
  askId: 9002,
  bidAccountId: 28,
  askAccountId: 99,
  isMakerAsk: false,
  timestamp: 100002,
  type: 'trade',
  askAccountPnl: '0',
  bidAccountPnl: '0',
  takerPositionSizeBefore: '0',
  makerPositionSizeBefore: '0',
  takerPositionSignChanged: false,
  makerPositionSignChanged: false,
};

describe('Lighter Chase native book and fill accounting', () => {
  it('subtracts all same-side account orders before choosing the fixed-tick quote', () => {
    expect(readLighterChaseQuote(book, quote)).toBe('99.1');
    expect(readLighterChaseQuote(book, { ...quote, isBuy: false })).toBe(
      '100.9',
    );
  });
  it('never crosses a one-tick spread', () => {
    const thin = {
      ...book,
      totalBids: 1,
      bids: [row(1, '100')],
      asks: [row(2, '100.1')],
    };
    expect(readLighterChaseQuote(thin, quote)).toBe('100');
    expect(readLighterChaseQuote(thin, { ...quote, isBuy: false })).toBe(
      '100.1',
    );
  });
  it.each([
    { ...book, bids: [] },
    { ...book, asks: [row(4, '98')] },
    { ...book, bids: [row(1, '100', 28)] },
  ])('refuses missing external or crossed books', (badBook) => {
    expect(() => readLighterChaseQuote(badBook, quote)).toThrow('book');
  });
  it('refuses malformed or conflicting native order identity', () => {
    expect(() =>
      readLighterChaseQuote(
        { ...book, bids: [row(3, '99'), row(3, '98')] },
        quote,
      ),
    ).toThrow('identity');
  });
  it.each([2075941, undefined])(
    'identifies a signed child independently of venue order nonce %s',
    (nonce) => {
      expect(
        identifyLighterChaseChild(intent, child, { ...order, nonce }),
      ).toBe('9001');
      expect(
        reconcileLighterChaseChild(intent, child, { ...order, nonce }, [trade]),
      ).toMatchObject({
        orderId: '9001',
        terminal: true,
        filledSize: '0.00005',
      });
    },
  );
  it.each([
    { ownerAccountIndex: 99 },
    { marketIndex: 2 },
    { clientOrderIndex: 101, clientOrderId: '101' },
    { orderId: '9002' },
    { clientOrderId: '101' },
    { initialBaseAmount: '0.0003' },
    { price: '100001' },
    { isAsk: true },
    { timeInForce: 'good-till-time' },
    { type: 'market' },
    { reduceOnly: 1 },
  ])(
    'rejects foreign immutable order identity %j despite an independent nonce',
    (override) => {
      expect(() =>
        identifyLighterChaseChild(intent, child, {
          ...order,
          nonce: 2075941,
          ...override,
        }),
      ).toThrow('identity');
    },
  );
  it('still requires a persisted signed child nonce', () => {
    expect(() =>
      identifyLighterChaseChild(intent, { ...child, nonce: undefined }, order),
    ).toThrow('identity');
  });
  it('accounts canceled partial fills from exact individual trades', () => {
    expect(
      reconcileLighterChaseChild(intent, child, order, [
        { ...trade, size: '0.00002', usdAmount: '2' },
        { ...trade, tradeId: 2, size: '0.00003', usdAmount: '3' },
      ]),
    ).toStrictEqual({
      orderId: '9001',
      terminal: true,
      filledSize: '0.00005',
      filledNotional: '5',
      remainingSize: '0.00015',
    });
  });
  it.each([{ bidIdStr: '2' }, { askIdStr: '2' }, { tradeIdStr: '2' }])(
    'rejects conflicting numeric/string trade counterparts %s',
    (override) => {
      expect(() =>
        reconcileLighterChaseChild(intent, child, order, [
          { ...trade, ...override },
        ]),
      ).toThrow('identity');
    },
  );
  it('deduplicates identical fill replay without increasing execution', () => {
    expect(
      reconcileLighterChaseChild(intent, child, order, [trade, trade])
        .filledSize,
    ).toBe('0.00005');
    expect(() =>
      reconcileLighterChaseChild(intent, child, order, [
        trade,
        { ...trade, size: '0.0001' },
      ]),
    ).toThrow('duplicate');
  });
  it('refuses missing fills, wrong ownership and overfilled children', () => {
    expect(() => reconcileLighterChaseChild(intent, child, order, [])).toThrow(
      'totals',
    );
    expect(() =>
      reconcileLighterChaseChild(
        intent,
        child,
        { ...order, ownerAccountIndex: 99 },
        [trade],
      ),
    ).toThrow('identity');
    expect(() =>
      reconcileLighterChaseChild(intent, child, order, [
        { ...trade, bidAccountId: 99 },
      ]),
    ).toThrow('identity');
    expect(() =>
      reconcileLighterChaseChild(
        intent,
        child,
        { ...order, status: 'filled' },
        [trade],
      ),
    ).toThrow('underfilled');
  });
});
