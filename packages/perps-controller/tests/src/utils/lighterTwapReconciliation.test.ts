import type { LighterTwapRecord } from '../../../src/services/LighterTwapService.js';
import type {
  LighterApiOrder,
  LighterRestTrade,
} from '../../../src/types/lighter-types.js';
import { reconcileLighterTwapObservation } from '../../../src/utils/lighterTwapReconciliation.js';

const record: LighterTwapRecord = {
  intent: {
    owner: {
      wallet: '0xabc',
      network: 'testnet',
      accountIndex: 28,
      apiKeyIndex: 3,
    },
    symbol: 'SOL',
    marketId: 4097,
    clientOrderId: '123',
    size: '0.15',
    price: '121',
    isBuy: true,
    reduceOnly: false,
    sizeDecimals: 3,
    priceDecimals: 3,
    durationMinutes: 1,
    startedAt: 1_800_000_000_000,
    orderExpiry: 1_800_000_060_000,
  },
  placement: {
    phase: 'succeeded',
    nonce: 4,
    txHash: 'abcdabcd',
    expiresAt: 1_800_000_100_000,
  },
  cancellations: [],
  terminalConfirmed: false,
};
const parent: LighterApiOrder = {
  orderIndex: 1000,
  orderId: '1000',
  clientOrderIndex: 123,
  clientOrderId: '123',
  marketIndex: 4097,
  ownerAccountIndex: 28,
  initialBaseAmount: '0.15',
  remainingBaseAmount: '0.10',
  filledBaseAmount: '0.05',
  filledQuoteAmount: '6',
  price: '121',
  isAsk: false,
  type: 'twap',
  timeInForce: 'good-till-time',
  reduceOnly: false,
  status: 'in-progress',
  orderExpiry: record.intent.orderExpiry,
  timestamp: 1_800_000_000,
  nonce: 4,
};
const child: LighterApiOrder = {
  ...parent,
  orderIndex: 1001,
  orderId: '1001',
  clientOrderIndex: 124,
  clientOrderId: '124',
  parentOrderIndex: 1000,
  parentOrderId: '1000',
  type: 'twap-sub',
  initialBaseAmount: '0.05',
  remainingBaseAmount: '0',
  status: 'filled',
};
const trade: LighterRestTrade = {
  tradeId: 1,
  txHash: 'abc1',
  type: 'trade',
  marketId: 4097,
  size: '0.05',
  price: '120',
  usdAmount: '6',
  askId: 999,
  bidId: 1001,
  askAccountId: 99,
  bidAccountId: 28,
  isMakerAsk: true,
  timestamp: 1_800_000_001_000,
  makerPositionSizeBefore: '0',
  takerPositionSizeBefore: '0',
};
const observe = (
  rows = [parent, child],
  trades = [trade],
): ReturnType<typeof reconcileLighterTwapObservation> =>
  reconcileLighterTwapObservation(record, rows, trades, 1_800_000_020_000);

describe('native TWAP parent/child reconciliation', () => {
  it('joins exact children and unique trades without double-counting parent totals', () => {
    const result = observe();
    expect(result.order).toMatchObject({
      orderId: '1000',
      size: '0.15',
      executedSize: '0.05',
      remainingSize: '0.1',
      executedNotional: '6',
      averagePrice: '120',
      status: 'active',
      fills: [{ fillId: '1', orderId: '1001', transactionHash: 'abc1' }],
    });
    expect(result.terminalObserved).toBe(false);
  });

  it('deduplicates identical trade replays', () => {
    expect(observe([parent, child], [trade, trade]).order.executedSize).toBe(
      '0.05',
    );
  });

  it('refuses conflicting trade replays', () => {
    expect(() =>
      observe([parent, child], [trade, { ...trade, size: '0.04' }]),
    ).toThrow('conflicting');
  });

  it('refuses missing fills rather than inventing zero execution', () => {
    expect(() => observe([parent, child], [])).toThrow('fill totals');
  });

  it('rejects wrong parent ownership, nonce, expiry and order ID', () => {
    for (const override of [
      { ownerAccountIndex: 29 },
      { nonce: 5 },
      { orderExpiry: 1 },
    ]) {
      expect(() => observe([{ ...parent, ...override }, child])).toThrow(
        'parent does not match immutable signed intent',
      );
    }
  });

  it('rejects a conflicting parent order ID', () => {
    expect(() => observe([{ ...parent, orderId: '1002' }, child])).toThrow(
      'identity is unsafe or inconsistent',
    );
  });

  it('rejects children with conflicting numeric and string parent links', () => {
    expect(() =>
      observe([parent, { ...child, parentOrderId: '1002' }]),
    ).toThrow('parent linkage');
  });

  it('retains underfilled expiry and cancellation as terminal observations only', () => {
    expect(
      observe([
        { ...parent, status: 'canceled-expired', remainingBaseAmount: '0' },
        child,
      ]).order.status,
    ).toBe('completed_underfilled');
    expect(
      observe([
        { ...parent, status: 'canceled', remainingBaseAmount: '0' },
        child,
      ]).terminalObserved,
    ).toBe(true);
  });

  it('rejects parent totals that disagree with complete child fills', () => {
    expect(() =>
      observe([{ ...parent, filledQuoteAmount: '7' }, child]),
    ).toThrow('parent fill totals');
  });
  describe('TWAP review identity and totals', () => {
    it.each([{ bidIdStr: '1002' }, { askIdStr: '1002' }, { tradeIdStr: '2' }])(
      'rejects conflicting native numeric/string trade IDs %s',
      (override) => {
        expect(() =>
          observe([parent, child], [{ ...trade, ...override }]),
        ).toThrow('identity');
      },
    );
    it('accepts matching native string counterparts', () => {
      expect(
        observe(
          [parent, child],
          [{ ...trade, bidIdStr: '1001', askIdStr: '999', tradeIdStr: '1' }],
        ).order.executedSize,
      ).toBe('0.05');
    });
    it('allows bounded device clock skew for trade provenance', () => {
      expect(
        observe(
          [parent, child],
          [{ ...trade, timestamp: record.intent.startedAt - 1000 }],
        ).order.executedSize,
      ).toBe('0.05');
      expect(() =>
        observe(
          [parent, child],
          [{ ...trade, timestamp: record.intent.startedAt - 60000 }],
        ),
      ).toThrow('provenance');
    });
    it('sums unequal children and multiple fills without copied parent totals', () => {
      const first = {
        ...child,
        filledBaseAmount: '0.03',
        filledQuoteAmount: '3.59',
        initialBaseAmount: '0.03',
      };
      const second = {
        ...child,
        orderIndex: 1002,
        orderId: '1002',
        clientOrderIndex: 125,
        clientOrderId: '125',
        initialBaseAmount: '0.02',
        filledBaseAmount: '0.02',
        filledQuoteAmount: '2.42',
      };
      const result = observe(
        [{ ...parent, filledQuoteAmount: '6.01' }, first, second],
        [
          {
            ...trade,
            tradeId: 1,
            size: '0.01',
            price: '119',
            usdAmount: '1.19',
          },
          { ...trade, tradeId: 2, size: '0.02', usdAmount: '2.4' },
          {
            ...trade,
            tradeId: 3,
            bidId: 1002,
            size: '0.02',
            price: '121',
            usdAmount: '2.42',
          },
        ],
      );
      expect(result.order.executedSize).toBe('0.05');
      expect(result.order.executedNotional).toBe('6.01');
      expect(result.order.averagePrice).toBe('120.2');
      expect(result.order.fills).toHaveLength(3);
    });
  });
});
