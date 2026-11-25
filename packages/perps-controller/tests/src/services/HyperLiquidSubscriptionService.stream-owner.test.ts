/**
 * The shared stream layer over the real HyperLiquid subscription service, with
 * only the SDK faked: account switches, price deltas, order books of different
 * precision, market changes and TWAP slice fills.
 */

import type { Hex } from '@metamask/utils';
import { SubscriptionClient, WebSocketTransport } from '@nktkas/hyperliquid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import type { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import { StreamChannelManager } from '../../../src/services/StreamChannelManager.js';
import type { StreamChannelKey } from '../../../src/services/StreamChannelManager.js';
import type {
  AccountState,
  Order,
  OrderBookData,
  Position,
  PriceUpdate,
  TwapOrder,
} from '../../../src/types/index.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

type Frame = Record<string, unknown>;

type FakeSubscription = {
  type: string;
  params: Frame;
  listener: (frame: Frame) => void;
  options?: { onError?: (error: Error) => void };
  isOpen: boolean;
};

/**
 * One socket as the SDK sees it: frames of a channel reach every listener of
 * the channel, and `l2Book` listeners filter by coin only.
 */
type FakeSocket = {
  subscriptions: FakeSubscription[];
  terminationSignal: { aborted: boolean };
  isClosed: boolean;
};

const sdk = vi.hoisted(() => ({ sockets: [] as unknown[] }));

vi.mock('@nktkas/hyperliquid', () => {
  class FakeTransport {
    socket = {
      subscriptions: [],
      terminationSignal: { aborted: false },
      isClosed: false,
    };

    constructor() {
      sdk.sockets.push(this.socket);
    }

    close(): void {
      this.socket.isClosed = true;
    }
  }

  type Subscribe = (
    ...args: unknown[]
  ) => Promise<{ unsubscribe: () => Promise<void> }>;

  /**
   * A subscription client whose every method opens the channel of its name.
   *
   * @param options - Client options.
   * @param options.transport - The client's transport.
   * @returns The client.
   */
  function FakeClient({
    transport,
  }: {
    transport: FakeTransport;
  }): Record<string, Subscribe> {
    const subscriptions: unknown[] = transport.socket.subscriptions;
    const get = (_target: object, type: string): Subscribe => {
      return async (...args) => {
        const listenerIndex = args.findIndex(
          (arg) => typeof arg === 'function',
        );
        const subscription = {
          type,
          params: listenerIndex === 0 ? {} : args[0],
          listener: args[listenerIndex],
          options: args[listenerIndex + 1],
          isOpen: true,
        };
        subscriptions.push(subscription);
        return {
          unsubscribe: async (): Promise<void> => {
            subscription.isOpen = false;
          },
        };
      };
    };
    return new Proxy<Record<string, Subscribe>>({}, { get });
  }
  return {
    SubscriptionClient: FakeClient,
    WebSocketTransport: FakeTransport,
  };
});

const WALLET_A: Hex = '0x00000000000000000000000000000000000000aa';
const WALLET_B: Hex = '0x00000000000000000000000000000000000000bb';

const settle = async (): Promise<void> =>
  await new Promise((resolve) => setImmediate(resolve));

const sockets = (): FakeSocket[] => sdk.sockets as FakeSocket[];

/**
 * Deliver a frame to a socket's listeners as the SDK does.
 *
 * @param socket - The socket.
 * @param type - Channel.
 * @param frame - Event.
 */
const deliver = (socket: FakeSocket, type: string, frame: Frame): void => {
  for (const subscription of [...socket.subscriptions]) {
    const { params, isOpen } = subscription;
    if (
      !isOpen ||
      subscription.type !== type ||
      (type === 'l2Book' && params.coin !== frame.coin) ||
      ('user' in params && params.user !== frame.user) ||
      ('dex' in params && (params.dex ?? '') !== (frame.dex ?? ''))
    ) {
      continue;
    }
    subscription.listener(frame);
  }
};

describe('shared streams over the HyperLiquid subscription service', () => {
  let service: HyperLiquidSubscriptionService;
  let manager: StreamChannelManager;
  let selected: Hex;
  let main: FakeSocket;
  let meta: Mock;

  const open = (type: string): FakeSubscription[] =>
    main.subscriptions.filter((item) => item.type === type && item.isOpen);

  beforeEach(() => {
    sdk.sockets.length = 0;
    selected = WALLET_A;
    const client = new SubscriptionClient({
      transport: new WebSocketTransport(),
    });
    [main] = sockets();
    meta = vi.fn().mockResolvedValue({
      universe: [
        { name: 'BTC', szDecimals: 5, maxLeverage: 40 },
        { name: 'ETH', szDecimals: 4, maxLeverage: 25 },
      ],
    });
    const clientService: Partial<HyperLiquidClientService> = {
      ensureSubscriptionClient: async () => undefined,
      getSubscriptionClient: () => client,
      isTestnetMode: () => true,
      getConnectionEpoch: () => 1,
      ensureTransportReady: async () => undefined,
      getInfoClient: vi.fn().mockReturnValue({
        meta,
        userAbstraction: async () => 'standard',
        spotClearinghouseState: async () => ({ balances: [] }),
      }),
    };
    const walletService: Partial<HyperLiquidWalletService> = {
      createWalletAdapter: vi.fn().mockReturnValue({}),
      getUserAddressWithDefault: async () => selected,
      getAccountStreamAddress: (accountId) =>
        accountId ? (accountId.split(':')[2] as Hex) : selected,
    };
    service = new HyperLiquidSubscriptionService(
      clientService as HyperLiquidClientService,
      walletService as HyperLiquidWalletService,
      createMockInfrastructure(),
    );
    manager = new StreamChannelManager();
  });

  afterEach(() => {
    manager.clear();
    vi.useRealTimers();
  });

  describe('account switch', () => {
    const clearinghouse = (user: Hex, size: string): Frame => ({
      user,
      dex: '',
      clearinghouseState: {
        assetPositions: [
          {
            type: 'oneWay',
            position: {
              coin: 'BTC',
              szi: size,
              entryPx: '100',
              positionValue: '100',
              unrealizedPnl: '0',
              returnOnEquity: '0',
              liquidationPx: null,
              leverage: { type: 'cross', value: 5 },
              marginUsed: '20',
              maxLeverage: 40,
              cumFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
            },
          },
        ],
        marginSummary: {
          accountValue: '1000',
          totalMarginUsed: '20',
          totalNtlPos: '100',
          totalRawUsd: '1000',
        },
        crossMarginSummary: {
          accountValue: '1000',
          totalMarginUsed: '20',
          totalNtlPos: '100',
          totalRawUsd: '1000',
        },
        crossMaintenanceMarginUsed: '1',
        withdrawable: size,
        time: 1,
      },
    });

    const openOrders = (user: Hex, oid: number): Frame => ({
      user,
      dex: '',
      orders: [
        {
          oid,
          coin: 'BTC',
          side: 'B',
          sz: '1',
          origSz: '1',
          limitPx: '90',
          orderType: 'Limit',
          timestamp: 1,
          isTrigger: false,
          reduceOnly: false,
          triggerCondition: '',
          triggerPx: '0',
          children: [],
          isPositionTpsl: false,
          tif: 'Gtc',
          cloid: null,
        },
      ],
    });

    const key = (stream: string, accountId?: string): StreamChannelKey => ({
      stream,
      accountId: accountId ?? `selected:${selected}`,
      options: accountId ? { accountId } : {},
    });

    const switchAccount = (wallet: Hex): void => {
      selected = wallet;
      manager.rebind(
        (current) =>
          typeof current.options?.accountId === 'string' ||
          current.accountId === `selected:${wallet}`,
        (current) => ({ ...current, accountId: `selected:${wallet}` }),
        {
          restart: (current) => typeof current.options?.accountId === 'string',
        },
      );
    };

    const readers = (): {
      positions: Mock<(positions: Position[]) => void>;
      orders: Mock<(orders: Order[]) => void>;
      account: Mock<(account: AccountState | null) => void>;
      errors: Mock<(error: Error) => void>;
    } => {
      const result = {
        positions: vi.fn<(positions: Position[]) => void>(),
        orders: vi.fn<(orders: Order[]) => void>(),
        account: vi.fn<(account: AccountState | null) => void>(),
        errors: vi.fn<(error: Error) => void>(),
      };
      manager.subscribe<[Position[]]>(
        key('positions'),
        {
          open: (callback, onError) =>
            service.subscribeToPositions({ callback, onError }),
        },
        { callback: result.positions, onError: result.errors },
      );
      manager.subscribe<[Order[]]>(
        key('orders'),
        {
          open: (callback, onError) =>
            service.subscribeToOrders({ callback, onError }),
        },
        { callback: result.orders, onError: result.errors },
      );
      manager.subscribe<[AccountState | null]>(
        key('account'),
        {
          open: (callback, onError) =>
            service.subscribeToAccount({ callback, onError }),
        },
        { callback: result.account, onError: result.errors },
      );
      return result;
    };

    it('drops the old wallet everywhere before any stream of the new one opens', async () => {
      const { positions, orders, account, errors } = readers();
      await settle();
      deliver(main, 'clearinghouseState', clearinghouse(WALLET_A, '1'));
      deliver(main, 'openOrders', openOrders(WALLET_A, 1));
      await settle();
      expect(positions).toHaveBeenLastCalledWith([
        expect.objectContaining({ size: '1' }),
      ]);
      const oldPositions = open('clearinghouseState')[0].listener;
      const oldOrders = open('openOrders')[0].listener;
      positions.mockClear();
      orders.mockClear();
      account.mockClear();

      switchAccount(WALLET_B);
      await settle();
      // Frames of the old wallet still in flight.
      oldPositions(clearinghouse(WALLET_A, '1'));
      oldOrders(openOrders(WALLET_A, 1));

      expect(positions).not.toHaveBeenCalled();
      expect(orders).not.toHaveBeenCalled();
      expect(account).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      expect(
        open('clearinghouseState').map(({ params }) => params.user),
      ).toStrictEqual([WALLET_B]);
      expect(open('openOrders').map(({ params }) => params.user)).toStrictEqual(
        [WALLET_B],
      );

      deliver(main, 'clearinghouseState', clearinghouse(WALLET_B, '2'));
      deliver(main, 'openOrders', openOrders(WALLET_B, 2));
      await settle();
      expect(positions).toHaveBeenLastCalledWith([
        expect.objectContaining({ size: '2' }),
      ]);
      expect(orders).toHaveBeenLastCalledWith([
        expect.objectContaining({ orderId: '2' }),
      ]);
      expect(account).toHaveBeenLastCalledWith(
        expect.objectContaining({ totalBalance: '1000' }),
      );
    });

    it('gives the selected account the streams when a named account holds one, and tells that reader', async () => {
      const named = vi.fn();
      const namedErrors = vi.fn();
      const accountId = `eip155:999:${WALLET_A}` as const;
      manager.subscribe<[Position[]]>(
        key('positions', accountId),
        {
          open: (callback, onError) =>
            service.subscribeToPositions({ accountId, callback, onError }),
        },
        { callback: named, onError: namedErrors },
      );
      const { positions, errors } = readers();
      await settle();
      deliver(main, 'clearinghouseState', clearinghouse(WALLET_A, '1'));
      deliver(main, 'openOrders', openOrders(WALLET_A, 1));
      await settle();
      named.mockClear();
      positions.mockClear();

      switchAccount(WALLET_B);
      await settle();
      deliver(main, 'clearinghouseState', clearinghouse(WALLET_B, '2'));
      deliver(main, 'openOrders', openOrders(WALLET_B, 2));
      await settle();

      expect(positions).toHaveBeenLastCalledWith([
        expect.objectContaining({ size: '2' }),
      ]);
      expect(errors).not.toHaveBeenCalled();
      // One wallet's streams at a time: the named reader hears that, and never
      // another wallet's data.
      expect(named).not.toHaveBeenCalled();
      expect(namedErrors).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'PROVIDER_NOT_AVAILABLE' }),
      );
    });
  });

  describe('prices', () => {
    const reduce = (
      held: [PriceUpdate[]] | undefined,
      [next]: [PriceUpdate[]],
    ): [PriceUpdate[]] => {
      const merged = new Map(held?.[0].map((item) => [item.symbol, item]));
      next.forEach((item) => merged.set(item.symbol, item));
      return [[...merged.values()]];
    };

    it('keeps every symbol of separate frames for throttle, replay and snapshot', async () => {
      const source = {
        open: (callback: (prices: PriceUpdate[]) => void): (() => void) => {
          const opened = service.subscribeToPrices({
            symbols: ['BTC', 'ETH', 'SOL'],
            callback,
          });
          return () => {
            opened.then((stop) => stop()).catch(() => undefined);
          };
        },
        reduce,
        delivery: 'merge' as const,
      };
      const throttled = vi.fn<(prices: PriceUpdate[]) => void>();
      manager.subscribe<[PriceUpdate[]]>({ stream: 'prices' }, source, {
        callback: throttled,
        throttleMs: 20,
      });
      await settle();

      deliver(main, 'allMids', { mids: { BTC: '1' } });
      deliver(main, 'allMids', { mids: { ETH: '2' } });
      deliver(main, 'allMids', { mids: { SOL: '3' } });
      await new Promise((resolve) => setTimeout(resolve, 40));
      const late = vi.fn<(prices: PriceUpdate[]) => void>();
      manager.subscribe<[PriceUpdate[]]>({ stream: 'prices' }, source, {
        callback: late,
      });
      await settle();

      const symbols = (prices: PriceUpdate[]): string[] =>
        prices.map(({ symbol }) => symbol).sort();
      expect(
        [
          ...new Set(
            throttled.mock.calls.flatMap(([prices]) => symbols(prices)),
          ),
        ].sort(),
      ).toStrictEqual(['BTC', 'ETH', 'SOL']);
      expect(symbols(late.mock.calls[0][0])).toStrictEqual([
        'BTC',
        'ETH',
        'SOL',
      ]);
      const snapshot = manager.getLast({ stream: 'prices' })?.[0];
      expect(snapshot).toHaveLength(3);
    });
  });

  describe('order books', () => {
    const book = (levels: number, time: number): Frame => {
      const side = (base: number): Frame[] =>
        Array.from({ length: levels }, (_, index) => ({
          px: String(base + index),
          sz: '1',
          n: 1,
        }));
      return { coin: 'BTC', time, levels: [side(100), side(200)] };
    };

    const depth = (callback: Mock<(data: OrderBookData) => void>): number[] =>
      callback.mock.calls.map(([data]) => data.bids.length);

    it('keeps one coin at two precisions and fast on sockets of their own', async () => {
      const full = vi.fn<(data: OrderBookData) => void>();
      const grouped = vi.fn<(data: OrderBookData) => void>();
      const fast = vi.fn<(data: OrderBookData) => void>();
      const second = vi.fn<(data: OrderBookData) => void>();
      const common = { symbol: 'BTC', levels: 20 };
      const stops = [
        service.subscribeToOrderBook({
          ...common,
          nSigFigs: 5,
          callback: full,
        }),
        service.subscribeToOrderBook({
          ...common,
          nSigFigs: 3,
          callback: grouped,
        }),
        service.subscribeToOrderBook({
          ...common,
          nSigFigs: 5,
          fast: true,
          callback: fast,
        }),
        // The same book as `full` shares its socket.
        service.subscribeToOrderBook({
          ...common,
          nSigFigs: 5,
          callback: second,
        }),
      ];
      await settle();

      expect(sockets()).toHaveLength(3);
      expect(
        sockets().map(({ subscriptions }) =>
          subscriptions.map(({ params }) => [params.nSigFigs, params.fast]),
        ),
      ).toStrictEqual([
        [
          [5, undefined],
          [5, undefined],
        ],
        [[3, undefined]],
        [[5, true]],
      ]);
      deliver(sockets()[0], 'l2Book', book(20, 1));
      deliver(sockets()[1], 'l2Book', book(12, 2));
      deliver(sockets()[2], 'l2Book', book(5, 3));

      expect(depth(full)).toStrictEqual([20]);
      expect(depth(second)).toStrictEqual([20]);
      expect(depth(grouped)).toStrictEqual([12]);
      expect(depth(fast)).toStrictEqual([5]);

      stops.forEach((stop) => stop());
      await settle();
      const [, ...owned] = sockets();
      expect(main.isClosed).toBe(false);
      expect(owned.every(({ isClosed }) => isClosed)).toBe(true);
    });

    it('opens no extra socket for one book per coin', async () => {
      for (const symbol of ['BTC', 'ETH', 'SOL']) {
        service.subscribeToOrderBook({ symbol, callback: vi.fn() });
      }
      await settle();

      expect(sockets()).toHaveLength(1);
    });

    it('shares an owned socket between coins', async () => {
      for (const symbol of ['BTC', 'ETH']) {
        service.subscribeToOrderBook({
          symbol,
          nSigFigs: 5,
          callback: vi.fn(),
        });
        service.subscribeToOrderBook({
          symbol,
          nSigFigs: 3,
          callback: vi.fn(),
        });
      }
      await settle();

      expect(sockets()).toHaveLength(2);
    });

    it('does not reuse a socket that still has an unsubscribe in flight', async () => {
      const coarse = vi.fn<(data: OrderBookData) => void>();
      const stop = service.subscribeToOrderBook({
        symbol: 'BTC',
        levels: 20,
        nSigFigs: 5,
        callback: vi.fn(),
      });
      await settle();

      stop();
      service.subscribeToOrderBook({
        symbol: 'BTC',
        levels: 20,
        nSigFigs: 3,
        callback: coarse,
      });
      await settle();
      deliver(main, 'l2Book', book(20, 1));

      expect(coarse).not.toHaveBeenCalled();
    });

    it('drops a frame older than the last one', async () => {
      const callback = vi.fn<(data: OrderBookData) => void>();
      service.subscribeToOrderBook({ symbol: 'BTC', levels: 20, callback });
      await settle();

      deliver(main, 'l2Book', book(4, 10));
      deliver(main, 'l2Book', book(3, 9));

      expect(depth(callback)).toStrictEqual([4]);
    });

    it('reports a subscription that fails after it opened', async () => {
      const onError = vi.fn();
      service.subscribeToOrderBook({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await settle();

      open('l2Book')[0].options?.onError?.(new Error('rejected'));

      expect(onError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ message: 'rejected' }),
      );
    });

    it('says nothing after it was closed', async () => {
      const onError = vi.fn();
      const stop = service.subscribeToOrderBook({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await settle();
      const [{ options }] = open('l2Book');

      stop();
      options?.onError?.(new Error('late'));

      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('market changes', () => {
    const ctx = (overrides: Frame = {}): Frame => ({
      funding: '0',
      openInterest: '10',
      prevDayPx: '1',
      dayNtlVlm: '1',
      premium: '0',
      oraclePx: '1',
      markPx: '1',
      midPx: '1',
      impactPxs: ['1', '1'],
      dayBaseVlm: '1',
      ...overrides,
    });

    it('reports a listing and a delisting from the push, and nothing for an ordinary frame', async () => {
      const callback = vi.fn();
      const stop = service.subscribeToMarketChanges({ callback });
      await settle();

      deliver(main, 'assetCtxs', { ctxs: [ctx(), ctx()] });
      deliver(main, 'assetCtxs', { ctxs: [ctx({ midPx: '2' }), ctx()] });
      // A market with open interest and an empty book is not delisted.
      deliver(main, 'assetCtxs', { ctxs: [ctx({ midPx: null }), ctx()] });
      expect(callback).not.toHaveBeenCalled();

      deliver(main, 'assetCtxs', { ctxs: [ctx(), ctx(), ctx()] });
      expect(callback).toHaveBeenCalledTimes(1);

      deliver(main, 'assetCtxs', {
        ctxs: [ctx(), ctx({ midPx: null, openInterest: '0.0' }), ctx()],
      });
      expect(callback).toHaveBeenCalledTimes(2);

      stop();
      await settle();
      expect(open('assetCtxs')).toStrictEqual([]);
    });

    it('reports a market delisted before the feed opened', async () => {
      const callback = vi.fn();
      service.subscribeToMarketChanges({ callback });
      await settle();

      deliver(main, 'assetCtxs', {
        ctxs: [ctx(), ctx({ midPx: null, openInterest: '0' })],
      });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('reports nothing when the first frame matches the metadata held', async () => {
      meta.mockResolvedValue({
        universe: [
          { name: 'BTC', szDecimals: 5, maxLeverage: 40 },
          { name: 'OLD', szDecimals: 4, maxLeverage: 25, isDelisted: true },
        ],
      });
      const callback = vi.fn();
      service.subscribeToMarketChanges({ callback });
      await settle();

      deliver(main, 'assetCtxs', {
        ctxs: [ctx(), ctx({ midPx: null, openInterest: '0' })],
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('reports markets listed before the feed opened', async () => {
      const callback = vi.fn();
      service.subscribeToMarketChanges({ callback });
      await settle();

      deliver(main, 'assetCtxs', { ctxs: [ctx(), ctx(), ctx()] });

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('tells a reader of a change it was not there for', async () => {
      await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: vi.fn(),
        includeMarketData: true,
      });
      await settle();
      deliver(main, 'assetCtxs', { ctxs: [ctx(), ctx()] });
      deliver(main, 'assetCtxs', { ctxs: [ctx(), ctx(), ctx()] });

      const first = vi.fn();
      service.subscribeToMarketChanges({ callback: first });
      const second = vi.fn();
      service.subscribeToMarketChanges({ callback: second });

      expect(first).toHaveBeenCalledTimes(1);
      expect(second).not.toHaveBeenCalled();
    });

    it('shares the feed price readers use and leaves it to them', async () => {
      const stopPrices = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: vi.fn(),
        includeMarketData: true,
      });
      const stop = service.subscribeToMarketChanges({ callback: vi.fn() });
      await settle();
      expect(open('assetCtxs')).toHaveLength(1);

      stop();
      await settle();
      expect(open('assetCtxs')).toHaveLength(1);
      stopPrices();
      await settle();
      expect(open('assetCtxs')).toStrictEqual([]);
    });

    it('reports a feed that cannot open', async () => {
      meta.mockRejectedValue(new Error('offline'));
      const onError = vi.fn();
      service.subscribeToMarketChanges({ callback: vi.fn(), onError });
      await settle();

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'offline' }),
      );
    });
  });

  describe('TWAP slice fills', () => {
    const schedule = (): TwapOrder => ({
      orderId: '7',
      symbol: 'BTC',
      side: 'buy',
      size: '1',
      executedSize: '0',
      remainingSize: '1',
      executedNotional: '0',
      fillProgressBps: 0,
      timeProgressBps: 0,
      elapsedTimeMilliseconds: 0,
      durationMinutes: 30,
      randomize: false,
      reduceOnly: false,
      status: 'active',
      startedAt: 1,
      lastUpdated: 1,
      fills: [],
    });

    const sliceFill = (tid: number, size: string): Frame => ({
      twapId: 7,
      fill: { tid, sz: size },
    });

    it('raises a running schedule from the push, with no read', async () => {
      const callback = vi.fn<(orders: TwapOrder[]) => void>();
      const stop = service.subscribeToTwapOrders({
        callback,
        adapt: {
          history: () => [schedule()],
          sliceFills: (entries) =>
            entries.map(({ twapId, fill }) => ({
              orderId: String(twapId),
              fill: {
                fillId: String(fill.tid),
                orderId: '1',
                side: 'buy',
                price: '100',
                size: fill.sz,
                fee: '0',
                feeToken: 'USDC',
                timestamp: fill.tid,
                transactionHash: '0x0',
              },
            })),
        },
      });
      await settle();

      // Slice fills may arrive before the schedule they belong to.
      deliver(main, 'userTwapSliceFills', {
        user: WALLET_A,
        isSnapshot: true,
        twapSliceFills: [sliceFill(1, '0.1')],
      });
      expect(callback).not.toHaveBeenCalled();
      deliver(main, 'userTwapHistory', {
        user: WALLET_A,
        isSnapshot: true,
        history: [{}],
      });
      expect(callback).toHaveBeenLastCalledWith(
        [expect.objectContaining({ executedSize: '0.1' })],
        true,
      );

      deliver(main, 'userTwapSliceFills', {
        user: WALLET_A,
        twapSliceFills: [sliceFill(2, '0.2')],
      });
      expect(callback).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            executedSize: '0.3',
            executedNotional: '30',
            fillProgressBps: 3000,
          }),
        ],
        undefined,
      );
      // A schedule frame does not lower what the fills proved.
      deliver(main, 'userTwapHistory', { user: WALLET_A, history: [{}] });
      expect(callback).toHaveBeenLastCalledWith(
        [expect.objectContaining({ executedSize: '0.3' })],
        undefined,
      );

      stop();
      await settle();
      expect(open('userTwapHistory')).toStrictEqual([]);
      expect(open('userTwapSliceFills')).toStrictEqual([]);
    });
  });
});
