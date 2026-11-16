import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHASE_ORDER_STATUS } from '../../../src/constants/perpsConfig.js';
import type { HyperLiquidProvider } from '../../../src/providers/HyperLiquidProvider.js';
import {
  baseOrder,
  setUpStrategyProvider,
  useStrategyClients,
} from '../../helpers/hyperLiquidStrategyOrders.js';

vi.mock('../../../src/services/HyperLiquidClientService');
vi.mock('../../../src/services/HyperLiquidWalletService');
vi.mock('../../../src/services/HyperLiquidSubscriptionService');

vi.mock('../../../src/utils/hyperLiquidValidation', () => ({
  validateOrderParams: vi.fn(),
  validateWithdrawalParams: vi.fn(),
  validateDepositParams: vi.fn(),
  validateCoinExists: vi.fn(),
  validateAssetSupport: vi.fn(),
  validateBalance: vi.fn(),
  getSupportedPaths: vi.fn().mockReturnValue([]),
  getBridgeInfo: vi.fn().mockReturnValue({
    chainId: 'eip155:42161',
    contractAddress: '0x1234567890123456789012345678901234567890',
  }),
  createErrorResult: vi.fn(
    (error: unknown, defaultResponse: Record<string, unknown>) => ({
      ...defaultResponse,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  ),
}));

// `setUpStrategyProvider` installs an implementation on this adapter mock.
vi.mock('../../../src/utils/hyperLiquidAdapter', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../src/utils/hyperLiquidAdapter.js')
  >()),
  adaptHyperLiquidLedgerUpdateToUserHistoryItem: vi.fn(),
}));

vi.mock('../../../src/services/TradingReadinessCache');

/**
 * A successful single-order response resting the given exchange ID.
 *
 * @param oid - Exchange order ID to report as resting.
 * @returns The exchange response.
 */
const restedAs = (oid: number): Record<string, unknown> => ({
  status: 'ok',
  response: { data: { statuses: [{ resting: { oid } }] } },
});

/**
 * An ETH book with one bid level per entry and a fixed ask.
 *
 * @param bids - Bid levels, best-first.
 * @returns The l2Book response.
 */
const ethBook = (
  bids: { px: string; sz: string }[],
): Record<string, unknown> => ({
  coin: 'ETH',
  levels: [
    bids.map((bid) => ({ ...bid, n: 1 })),
    [{ px: '3001', sz: '10', n: 1 }],
  ],
});

/**
 * An orderStatus response for the chase's first child (oid 55).
 *
 * @param status - Venue status of the order.
 * @param sz - Size the order has left unfilled.
 * @returns The orderStatus response.
 */
const childStatus = (status: string, sz: string): Record<string, unknown> => ({
  status: 'order',
  order: {
    status,
    order: {
      coin: 'ETH',
      side: 'B',
      limitPx: '2999.1',
      sz,
      origSz: '1',
      oid: 55,
      timestamp: 1_700_000_000_000,
      isTrigger: false,
      triggerCondition: 'N/A',
      triggerPx: '0',
      children: [],
      isPositionTpsl: false,
      reduceOnly: false,
      orderType: 'Limit',
    },
  },
});

describe('HyperLiquidProvider - Chase re-pricing edge cases', () => {
  let provider: HyperLiquidProvider;

  beforeEach(() => {
    ({ provider } = setUpStrategyProvider());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('nets its own order off a whole-number level the book prints with a decimal', async () => {
    const order = vi.fn().mockResolvedValue(restedAs(55));
    const l2Book = vi
      .fn()
      .mockResolvedValueOnce(ethBook([{ px: '2998.9', sz: '10' }]))
      // The chase now holds the touch alone. The venue prints the whole-number
      // price it rests at as "2999.0", not the "2999" it was submitted at.
      .mockResolvedValue(
        ethBook([
          { px: '2999.0', sz: '1' },
          { px: '2998.9', sz: '10' },
        ]),
      );
    const { exchangeClient } = useStrategyClients({
      exchange: { order },
      info: { l2Book },
    });

    await provider.placeOrder({
      ...baseOrder,
      orderType: 'chase',
      chaseIntervalMs: 1000,
    });
    expect(order).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        orders: [expect.objectContaining({ p: '2999' })],
      }),
    );

    await vi.advanceTimersByTimeAsync(3000);

    // The external touch never moved, so the chase must not improve on itself.
    expect(exchangeClient.cancel).not.toHaveBeenCalled();
    expect(order).toHaveBeenCalledTimes(1);
    expect(await provider.getChaseOrders()).toStrictEqual([
      expect.objectContaining({
        restingOrderId: '55',
        restingPrice: '2999',
        repricings: 0,
        status: CHASE_ORDER_STATUS.Active,
      }),
    ]);
  });

  it('retries a refused post-only replacement on the next tick', async () => {
    const order = vi
      .fn()
      .mockResolvedValueOnce(restedAs(55))
      .mockRejectedValueOnce(
        new Error('Post only order would have immediately matched'),
      )
      .mockResolvedValue(restedAs(77));
    const l2Book = vi
      .fn()
      .mockResolvedValueOnce(ethBook([{ px: '2999', sz: '10' }]))
      .mockResolvedValueOnce(ethBook([{ px: '2998', sz: '10' }]))
      .mockResolvedValue(ethBook([{ px: '2997', sz: '10' }]));
    const { exchangeClient } = useStrategyClients({
      exchange: { order },
      info: { l2Book },
    });

    const placed = await provider.placeOrder({
      ...baseOrder,
      orderType: 'chase',
      chaseIntervalMs: 1000,
    });

    // First tick: the child is cancelled, then the venue refuses its
    // replacement. Nothing rests, but the chase is still running.
    await vi.advanceTimersByTimeAsync(1000);
    expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
    expect(order).toHaveBeenCalledTimes(2);
    expect(await provider.getChaseOrders()).toStrictEqual([
      expect.objectContaining({
        handle: placed.orderId,
        restingOrderId: null,
        status: CHASE_ORDER_STATUS.Active,
      }),
    ]);

    // Next tick: the remainder rests at the fresh touch, with nothing to cancel.
    await vi.advanceTimersByTimeAsync(1000);
    expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
    expect(order).toHaveBeenCalledTimes(3);
    expect(order).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        orders: [
          expect.objectContaining({
            p: '2997.1',
            s: '1',
            t: { limit: { tif: 'Alo' } },
          }),
        ],
      }),
    );
    expect(await provider.getChaseOrders()).toStrictEqual([
      expect.objectContaining({
        handle: placed.orderId,
        restingOrderId: '77',
        restingPrice: '2997.1',
        repricings: 1,
        status: CHASE_ORDER_STATUS.Active,
      }),
    ]);

    // Once 77 rests, cancelling the old child 55 no longer reaches the chase.
    await provider.cancelOrder({ orderId: '55', symbol: 'ETH' });
    expect(exchangeClient.cancel).toHaveBeenLastCalledWith({
      cancels: [{ a: 1, o: 55 }],
    });
    expect(await provider.getChaseOrders()).toStrictEqual([
      expect.objectContaining({
        restingOrderId: '77',
        status: CHASE_ORDER_STATUS.Active,
      }),
    ]);
  });

  it('ends filled when a partial fill leaves less than the venue minimum', async () => {
    const order = vi
      .fn()
      .mockResolvedValueOnce(restedAs(55))
      .mockRejectedValue(new Error('Order must have minimum value of $10'));
    const l2Book = vi
      .fn()
      .mockResolvedValueOnce(ethBook([{ px: '2999', sz: '10' }]))
      .mockResolvedValue(ethBook([{ px: '2998', sz: '10' }]));
    const { exchangeClient, infoClient } = useStrategyClients({
      exchange: { order },
      info: { l2Book },
    });

    const placed = await provider.placeOrder({
      ...baseOrder,
      orderType: 'chase',
      chaseIntervalMs: 1000,
    });
    // The child fills down to 0.003 ETH, about $9 at the next touch, before the
    // tick cancels it.
    infoClient.orderStatus
      .mockResolvedValueOnce(childStatus('open', '0.003'))
      .mockResolvedValue(childStatus('canceled', '0.003'));

    await vi.advanceTimersByTimeAsync(3000);

    expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
    // The remainder is never submitted: the venue would refuse it.
    expect(order).toHaveBeenCalledTimes(1);
    expect(await provider.getChaseOrders()).toStrictEqual([
      expect.objectContaining({
        handle: placed.orderId,
        restingOrderId: null,
        remainingSize: '0.003',
        status: CHASE_ORDER_STATUS.Filled,
      }),
    ]);
  });
  it('ends failed when an unfilled chase drops under the venue minimum', async () => {
    const order = vi.fn().mockResolvedValue(restedAs(55));
    const l2Book = vi
      .fn()
      .mockResolvedValueOnce(ethBook([{ px: '2999', sz: '10' }]))
      // The bid falls, so the full 0.0034 ETH is worth $9.996 at the new touch.
      .mockResolvedValue(ethBook([{ px: '2940', sz: '10' }]));
    const { exchangeClient, infoClient } = useStrategyClients({
      exchange: { order },
      info: { l2Book },
    });

    const placed = await provider.placeOrder({
      ...baseOrder,
      size: '0.0034',
      usdAmount: '10.2',
      orderType: 'chase',
      chaseIntervalMs: 1000,
    });
    infoClient.orderStatus
      .mockResolvedValueOnce(childStatus('open', '0.0034'))
      .mockResolvedValue(childStatus('canceled', '0.0034'));

    await vi.advanceTimersByTimeAsync(3000);

    expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
    expect(order).toHaveBeenCalledTimes(1);
    expect(await provider.getChaseOrders()).toStrictEqual([
      expect.objectContaining({
        handle: placed.orderId,
        restingOrderId: null,
        originalSize: '0.0034',
        remainingSize: '0.0034',
        status: CHASE_ORDER_STATUS.Failed,
      }),
    ]);
  });

  it('ends failed once the venue keeps refusing the replacement', async () => {
    const order = vi
      .fn()
      .mockResolvedValueOnce(restedAs(55))
      .mockRejectedValue(
        new Error('Post only order would have immediately matched'),
      );
    const l2Book = vi
      .fn()
      .mockResolvedValueOnce(ethBook([{ px: '2999', sz: '10' }]))
      .mockResolvedValue(ethBook([{ px: '2998', sz: '10' }]));
    useStrategyClients({ exchange: { order }, info: { l2Book } });

    const placed = await provider.placeOrder({
      ...baseOrder,
      orderType: 'chase',
      chaseIntervalMs: 1000,
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(order).toHaveBeenCalledTimes(3);
    expect(await provider.getChaseOrders()).toStrictEqual([
      expect.objectContaining({ status: CHASE_ORDER_STATUS.Active }),
    ]);

    // The third refusal in a row ends the chase; nothing more is submitted.
    await vi.advanceTimersByTimeAsync(5000);
    expect(order).toHaveBeenCalledTimes(4);
    expect(await provider.getChaseOrders()).toStrictEqual([
      expect.objectContaining({
        handle: placed.orderId,
        restingOrderId: null,
        status: CHASE_ORDER_STATUS.Failed,
      }),
    ]);
  });

  it('keeps a refused replacement retrying when the next book read fails', async () => {
    const order = vi
      .fn()
      .mockResolvedValueOnce(restedAs(55))
      .mockRejectedValueOnce(
        new Error('Post only order would have immediately matched'),
      )
      .mockResolvedValue(restedAs(77));
    const l2Book = vi
      .fn()
      .mockResolvedValueOnce(ethBook([{ px: '2999', sz: '10' }]))
      .mockResolvedValueOnce(ethBook([{ px: '2998', sz: '10' }]))
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValue(ethBook([{ px: '2997', sz: '10' }]));
    const { exchangeClient } = useStrategyClients({
      exchange: { order },
      info: { l2Book },
    });

    const placed = await provider.placeOrder({
      ...baseOrder,
      orderType: 'chase',
      chaseIntervalMs: 1000,
    });

    // The replacement is refused, then the retry tick cannot read the book.
    await vi.advanceTimersByTimeAsync(2000);
    expect(order).toHaveBeenCalledTimes(2);
    expect(await provider.getChaseOrders()).toStrictEqual([
      expect.objectContaining({
        handle: placed.orderId,
        restingOrderId: null,
        status: CHASE_ORDER_STATUS.Active,
      }),
    ]);

    // The following tick rests the remainder at the touch it reads.
    await vi.advanceTimersByTimeAsync(1000);
    expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
    expect(order).toHaveBeenCalledTimes(3);
    expect(await provider.getChaseOrders()).toStrictEqual([
      expect.objectContaining({
        handle: placed.orderId,
        restingOrderId: '77',
        restingPrice: '2997.1',
        status: CHASE_ORDER_STATUS.Active,
      }),
    ]);
  });

  it.each([
    {
      path: 'cancelOrder',
      cancelChild: async (
        target: HyperLiquidProvider,
      ): Promise<boolean | undefined> =>
        (await target.cancelOrder({ orderId: '55', symbol: 'ETH' })).success,
    },
    {
      path: 'cancelOrders',
      cancelChild: async (
        target: HyperLiquidProvider,
      ): Promise<boolean | undefined> =>
        (await target.cancelOrders([{ orderId: '55', symbol: 'ETH' }]))
          .results[0]?.success,
    },
  ])(
    'stops the chase when $path cancels its last child while a refused replacement waits',
    async ({ cancelChild }) => {
      const order = vi
        .fn()
        .mockResolvedValueOnce(restedAs(55))
        .mockRejectedValueOnce(
          new Error('Post only order would have immediately matched'),
        )
        .mockResolvedValue(restedAs(77));
      const l2Book = vi
        .fn()
        .mockResolvedValueOnce(ethBook([{ px: '2999', sz: '10' }]))
        .mockResolvedValue(ethBook([{ px: '2998', sz: '10' }]));
      const { exchangeClient } = useStrategyClients({
        exchange: { order },
        info: { l2Book },
      });

      await provider.placeOrder({
        ...baseOrder,
        orderType: 'chase',
        chaseIntervalMs: 1000,
      });
      // Child 55 is cancelled for a replacement the venue refuses, so 55 is the
      // last child the caller saw.
      await vi.advanceTimersByTimeAsync(1000);
      expect(order).toHaveBeenCalledTimes(2);

      expect(await cancelChild(provider)).toBe(true);
      await vi.advanceTimersByTimeAsync(3000);

      // The cancel reached the chase: no second cancel of the dead child, no
      // replacement, and the handle is released.
      expect(exchangeClient.cancel).toHaveBeenCalledTimes(1);
      expect(order).toHaveBeenCalledTimes(2);
      expect(await provider.getChaseOrders()).toStrictEqual([]);
    },
  );

  it('ends a chase failed rather than backgrounded when nothing rests', async () => {
    const order = vi
      .fn()
      .mockResolvedValueOnce(restedAs(55))
      .mockRejectedValueOnce(
        new Error('Post only order would have immediately matched'),
      )
      .mockResolvedValue(restedAs(77));
    const l2Book = vi
      .fn()
      .mockResolvedValueOnce(ethBook([{ px: '2999', sz: '10' }]))
      .mockResolvedValue(ethBook([{ px: '2998', sz: '10' }]));
    useStrategyClients({ exchange: { order }, info: { l2Book } });

    const placed = await provider.placeOrder({
      ...baseOrder,
      orderType: 'chase',
      chaseIntervalMs: 1000,
    });
    // The replacement is refused, so the client backgrounds a chase with no
    // child on the book.
    await vi.advanceTimersByTimeAsync(1000);

    expect(await provider.suspendChaseOrders()).toStrictEqual([
      expect.objectContaining({
        handle: placed.orderId,
        restingOrderId: null,
        status: CHASE_ORDER_STATUS.Failed,
      }),
    ]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(order).toHaveBeenCalledTimes(2);
  });

  it('ends a chase failed rather than duration-reached when nothing rests', async () => {
    const order = vi
      .fn()
      .mockResolvedValueOnce(restedAs(55))
      .mockRejectedValueOnce(
        new Error('Post only order would have immediately matched'),
      )
      .mockResolvedValue(restedAs(77));
    const l2Book = vi
      .fn()
      .mockResolvedValueOnce(ethBook([{ px: '2999', sz: '10' }]))
      .mockResolvedValue(ethBook([{ px: '2998', sz: '10' }]));
    useStrategyClients({ exchange: { order }, info: { l2Book } });

    const placed = await provider.placeOrder({
      ...baseOrder,
      orderType: 'chase',
      chaseIntervalMs: 1000,
      chaseMaxDurationMs: 1500,
    });
    // The replacement is refused, and the window closes before the retry.
    await vi.advanceTimersByTimeAsync(2000);

    expect(order).toHaveBeenCalledTimes(2);
    expect(await provider.getChaseOrders()).toStrictEqual([
      expect.objectContaining({
        handle: placed.orderId,
        restingOrderId: null,
        status: CHASE_ORDER_STATUS.Failed,
      }),
    ]);
  });
});
