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

const sdk = vi.hoisted(() => ({
  sockets: [] as unknown[],
  /** Channels the venue refuses to open. */
  refused: new Set<string>(),
}));

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
        if (sdk.refused.has(type)) {
          throw new Error(`${type} refused`);
        }
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
  let isTerminated: boolean;
  let ensureTransportReady: Mock<() => Promise<void>>;

  const open = (type: string): FakeSubscription[] =>
    main.subscriptions.filter((item) => item.type === type && item.isOpen);

  beforeEach(() => {
    sdk.sockets.length = 0;
    sdk.refused.clear();
    selected = WALLET_A;
    isTerminated = false;
    const client = new SubscriptionClient({
      transport: new WebSocketTransport(),
    });
    [main] = sockets();
    ensureTransportReady = vi.fn().mockResolvedValue(undefined);
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
      isConnectionTerminated: () => isTerminated,
      ensureTransportReady,
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

    it('opens a DEX stream that failed once its readers are retried, with the others open', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      sdk.refused.add('clearinghouseState');
      const { positions, errors } = readers();
      await settle();
      expect(errors).toHaveBeenCalledTimes(3);
      expect(open('webData3')).toHaveLength(1);
      expect(open('clearinghouseState')).toStrictEqual([]);

      sdk.refused.clear();
      await vi.advanceTimersByTimeAsync(1_000);
      await settle();

      expect(open('clearinghouseState')).toHaveLength(1);
      expect(open('openOrders')).toHaveLength(1);
      expect(open('webData3')).toHaveLength(1);
      deliver(main, 'clearinghouseState', clearinghouse(WALLET_A, '1'));
      deliver(main, 'openOrders', openOrders(WALLET_A, 1));
      expect(positions).toHaveBeenLastCalledWith([
        expect.objectContaining({ size: '1' }),
      ]);
    });

    it.each(['webData3', 'spotState'])(
      'tells user data readers when %s cannot be restored, and still restores the rest',
      async (channel) => {
        const { errors } = readers();
        await service.subscribeToPrices({
          symbols: ['BTC'],
          callback: vi.fn(),
          includeOrderBook: true,
        });
        await settle();
        expect(errors).not.toHaveBeenCalled();
        const books = open('bbo').length;

        sdk.refused.add(channel);
        await service.restoreSubscriptions();

        expect(errors).toHaveBeenCalledWith(
          expect.objectContaining({ message: `${channel} refused` }),
        );
        expect(open('bbo')).toHaveLength(books + 1);
      },
    );

    it('restores spot balances after a reconnect', async () => {
      readers();
      await settle();
      const before = open('spotState').length;

      await service.restoreSubscriptions();

      expect(open('spotState')).toHaveLength(before + 1);
    });

    it('tells a fills reader when its stream cannot be restored', async () => {
      const onError = vi.fn();
      const stop = service.subscribeToOrderFills({
        callback: vi.fn(),
        onError,
      });
      await settle();

      sdk.refused.add('userFills');
      await service.restoreSubscriptions();
      expect(onError).toHaveBeenCalledTimes(1);

      const other = vi.fn();
      service.subscribeToOrderFills({ callback: vi.fn(), onError: other });
      await settle();
      other.mockClear();
      stop();
      await service.restoreSubscriptions();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(other).toHaveBeenCalledTimes(1);
    });

    it('tells every reader when the transport is not ready to restore them', async () => {
      const { errors } = readers();
      await settle();
      ensureTransportReady.mockRejectedValueOnce(new Error('not ready'));

      await service.restoreSubscriptions();

      expect(errors).toHaveBeenCalledTimes(3);
    });

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

  describe('a confirmed subscription the venue did not take back', () => {
    const refuse = (type: string): void => {
      const [failed] = open(type);
      failed.isOpen = false;
      failed.options?.onError?.(new Error(`${type} refused`));
    };

    it.each(['allMids', 'fastAssetCtxs', 'assetCtxs', 'activeAssetCtx', 'bbo'])(
      'reports %s to price readers, who open it again',
      async (type) => {
        const onError = vi.fn();
        const subscribe = async (): Promise<() => void> =>
          await service.subscribeToPrices({
            symbols: ['BTC'],
            callback: vi.fn(),
            includeMarketData: true,
            includeOrderBook: true,
            onError,
          });
        const stop = await subscribe();
        await settle();
        expect(open(type)).toHaveLength(1);

        refuse(type);
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({ message: `${type} refused` }),
        );

        stop();
        await subscribe();
        await settle();
        expect(open(type)).toHaveLength(1);
      },
    );

    it.each(['webData3', 'clearinghouseState', 'openOrders', 'spotState'])(
      'reports %s to user data readers, who open it again beside the others',
      async (type) => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const onError = vi.fn();
        const sources: Record<
          string,
          (
            callback: (value: unknown) => void,
            fail: (error: Error) => void,
          ) => () => void
        > = {
          positions: (callback, fail) =>
            service.subscribeToPositions({ callback, onError: fail }),
          orders: (callback, fail) =>
            service.subscribeToOrders({ callback, onError: fail }),
          account: (callback, fail) =>
            service.subscribeToAccount({ callback, onError: fail }),
        };
        for (const [stream, source] of Object.entries(sources)) {
          manager.subscribe<[unknown]>(
            { stream, options: {} },
            { open: source },
            { callback: vi.fn(), onError },
          );
        }
        await settle();
        expect(open(type)).toHaveLength(1);

        refuse(type);
        expect(onError).toHaveBeenCalledTimes(3);
        await vi.advanceTimersByTimeAsync(1_000);
        await settle();

        expect(open(type)).toHaveLength(1);
      },
    );

    it('reports a fills stream and opens it again', async () => {
      const onError = vi.fn();
      const stop = service.subscribeToOrderFills({
        callback: vi.fn(),
        onError,
      });
      await settle();

      refuse('userFills');
      expect(onError).toHaveBeenCalledTimes(1);
      stop();
      service.subscribeToOrderFills({ callback: vi.fn(), onError });
      await settle();
      expect(open('userFills')).toHaveLength(1);
    });

    it('opens both TWAP channels again when one is refused', async () => {
      const onError = vi.fn();
      const subscribe = (): (() => void) =>
        service.subscribeToTwapOrders({
          callback: vi.fn(),
          adapt: { history: () => [], sliceFills: () => [] },
          onError,
        });
      const stop = subscribe();
      await settle();

      refuse('userTwapSliceFills');
      await settle();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(open('userTwapHistory')).toStrictEqual([]);
      stop();
      subscribe();
      await settle();
      expect(open('userTwapHistory')).toHaveLength(1);
      expect(open('userTwapSliceFills')).toHaveLength(1);
    });

    it('reports a market feed to market change readers and holds it again', async () => {
      const onError = vi.fn();
      const other = service.subscribeToMarketChanges({ callback: vi.fn() });
      const stop = service.subscribeToMarketChanges({
        callback: vi.fn(),
        onError,
      });
      await settle();

      refuse('assetCtxs');
      expect(onError).toHaveBeenCalledTimes(1);
      stop();
      const stopAgain = service.subscribeToMarketChanges({
        callback: vi.fn(),
      });
      await settle();
      expect(open('assetCtxs')).toHaveLength(1);
      other();
      stopAgain();
      await settle();
      expect(open('assetCtxs')).toStrictEqual([]);
    });

    it('says nothing of a connection that ended for good', async () => {
      const onError = vi.fn();
      service.subscribeToOrderFills({ callback: vi.fn(), onError });
      await settle();

      isTerminated = true;
      refuse('userFills');

      expect(onError).not.toHaveBeenCalled();
    });

    it('opens everything again after a restore that could not start', async () => {
      const onError = vi.fn();
      const stop = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: vi.fn(),
        includeMarketData: true,
        includeOrderBook: true,
        onError,
      });
      await settle();
      const before = open('allMids').length;
      ensureTransportReady.mockRejectedValueOnce(new Error('not ready'));
      await service.restoreSubscriptions();

      stop();
      await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: vi.fn(),
        includeMarketData: true,
        includeOrderBook: true,
      });
      await settle();
      for (const type of ['allMids', 'assetCtxs', 'activeAssetCtx', 'bbo']) {
        expect(open(type)).toHaveLength(before + 1);
      }
    });
  });

  describe('price feed failures', () => {
    it('keeps the market feed for the other holder when one could not open it', async () => {
      sdk.refused.add('assetCtxs');
      const stop = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: vi.fn(),
        includeMarketData: true,
      });
      await settle();
      sdk.refused.clear();
      service.subscribeToMarketChanges({ callback: vi.fn() });
      await settle();
      expect(open('assetCtxs')).toHaveLength(1);

      stop();
      await settle();

      expect(open('assetCtxs')).toHaveLength(1);
    });

    it.each(['allMids', 'activeAssetCtx', 'bbo', 'assetCtxs'])(
      'reports a %s feed that cannot open to its readers',
      async (channel) => {
        sdk.refused.add(channel);
        const onError = vi.fn();

        await service.subscribeToPrices({
          symbols: ['BTC'],
          callback: vi.fn(),
          includeMarketData: true,
          includeOrderBook: true,
          onError,
        });
        await settle();

        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining(`${channel} refused`),
          }),
        );
      },
    );

    it('opens the feed again for a channel that heard the failure', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      sdk.refused.add('allMids');
      const callback = vi.fn<(prices: PriceUpdate[]) => void>();
      manager.subscribe<[PriceUpdate[]]>(
        { stream: 'prices', options: {} },
        {
          open: (emit, fail) => {
            let stop: (() => void) | undefined;
            service
              .subscribeToPrices({
                symbols: ['BTC'],
                callback: emit,
                onError: fail,
              })
              .then((unsubscribe) => {
                stop = unsubscribe;
                return unsubscribe;
              })
              .catch(fail);
            return (): void => stop?.();
          },
        },
        { callback, onError: vi.fn() },
      );
      await settle();
      expect(open('allMids')).toStrictEqual([]);

      sdk.refused.clear();
      await vi.advanceTimersByTimeAsync(1_000);
      await settle();
      deliver(main, 'allMids', { mids: { BTC: '100' } });

      expect(callback).toHaveBeenLastCalledWith([
        expect.objectContaining({ symbol: 'BTC', price: '100' }),
      ]);
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

    const retired = ctx({ midPx: null, openInterest: '0.0' });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: 1_000_000 });
    });

    it('reports a listing at once and a delisting once it lasts, and nothing for an ordinary frame', async () => {
      const callback = vi.fn();
      const stop = service.subscribeToMarketChanges({ callback });
      await settle();

      deliver(main, 'assetCtxs', { ctxs: [ctx(), ctx()] });
      deliver(main, 'assetCtxs', { ctxs: [ctx({ midPx: '2' }), ctx()] });
      // A market with open interest and an empty book is not delisted.
      deliver(main, 'assetCtxs', { ctxs: [ctx({ midPx: null }), ctx()] });
      vi.advanceTimersByTime(60_000);
      deliver(main, 'assetCtxs', { ctxs: [ctx({ midPx: null }), ctx()] });
      expect(callback).not.toHaveBeenCalled();

      deliver(main, 'assetCtxs', { ctxs: [ctx(), ctx(), ctx()] });
      expect(callback).toHaveBeenCalledTimes(1);

      deliver(main, 'assetCtxs', { ctxs: [ctx(), retired, ctx()] });
      vi.advanceTimersByTime(59_999);
      deliver(main, 'assetCtxs', { ctxs: [ctx(), retired, ctx()] });
      expect(callback).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      deliver(main, 'assetCtxs', { ctxs: [ctx(), retired, ctx()] });
      deliver(main, 'assetCtxs', { ctxs: [ctx(), retired, ctx()] });
      expect(callback).toHaveBeenCalledTimes(2);

      stop();
      await settle();
      expect(open('assetCtxs')).toStrictEqual([]);
    });

    it('reports nothing while the book of an idle market empties and refills', async () => {
      const callback = vi.fn();
      service.subscribeToMarketChanges({ callback });
      await settle();
      deliver(main, 'assetCtxs', { ctxs: [ctx(), ctx()] });

      for (let index = 0; index < 20; index += 1) {
        deliver(main, 'assetCtxs', { ctxs: [ctx(), retired] });
        vi.advanceTimersByTime(30_000);
        deliver(main, 'assetCtxs', { ctxs: [ctx(), ctx()] });
        vi.advanceTimersByTime(30_000);
      }

      expect(callback).not.toHaveBeenCalled();
    });

    it('reports a market delisted before the feed opened', async () => {
      const callback = vi.fn();
      service.subscribeToMarketChanges({ callback });
      await settle();

      deliver(main, 'assetCtxs', { ctxs: [ctx(), retired] });
      expect(callback).toHaveBeenCalledTimes(1);

      // A market that stays so, only idle or not, is not reported again.
      vi.advanceTimersByTime(60_000);
      deliver(main, 'assetCtxs', { ctxs: [ctx(), retired] });
      vi.advanceTimersByTime(60_000);
      deliver(main, 'assetCtxs', { ctxs: [ctx(), retired] });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['retired', retired],
      ['still held', ctx({ midPx: null })],
    ])(
      'reports nothing for a market the metadata has as delisted and the push as %s',
      async (_state, delisted) => {
        meta.mockResolvedValue({
          universe: [
            { name: 'BTC', szDecimals: 5, maxLeverage: 40 },
            { name: 'OLD', szDecimals: 4, maxLeverage: 25, isDelisted: true },
          ],
        });
        const callback = vi.fn();
        service.subscribeToMarketChanges({ callback });
        await settle();

        deliver(main, 'assetCtxs', { ctxs: [ctx(), delisted] });
        vi.advanceTimersByTime(60_000);
        deliver(main, 'assetCtxs', { ctxs: [ctx(), delisted] });

        expect(callback).not.toHaveBeenCalled();
      },
    );

    it('reports a listed market without trading once, not each time the feed opens', async () => {
      const callback = vi.fn();
      const idle = { ctxs: [ctx(), retired] };
      const stop = service.subscribeToMarketChanges({ callback });
      await settle();
      deliver(main, 'assetCtxs', idle);
      expect(callback).toHaveBeenCalledTimes(1);
      stop();
      await settle();

      service.subscribeToMarketChanges({ callback });
      await settle();
      deliver(main, 'assetCtxs', idle);
      vi.advanceTimersByTime(60_000);
      deliver(main, 'assetCtxs', idle);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('lets go of the market feed of a DEX the configuration no longer has', async () => {
      service.subscribeToMarketChanges({ callback: vi.fn() });
      await service.updateFeatureFlags(true, ['xyz'], [], []);
      await settle();
      const dexs = (): unknown[] =>
        open('assetCtxs').map(({ params }) => (params as { dex?: string }).dex);
      expect(dexs()).toContain('xyz');

      await service.updateFeatureFlags(true, [], [], []);
      await settle();

      expect(dexs()).not.toContain('xyz');
      expect(open('assetCtxs')).toHaveLength(1);
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

    it('drops the slice fills of a schedule it no longer keeps', async () => {
      // One more ended schedule than are kept; '1' is the oldest.
      const ended = Array.from({ length: 101 }, (_, index) => ({
        ...schedule(),
        orderId: String(index + 1),
        status: 'finished' as const,
        startedAt: index + 1,
        lastUpdated: index + 1,
      }));
      let history: TwapOrder[] = ended;
      const callback = vi.fn<(orders: TwapOrder[]) => void>();
      service.subscribeToTwapOrders({
        callback,
        adapt: {
          history: () => history,
          sliceFills: () => [
            {
              orderId: '1',
              fill: {
                fillId: '1',
                orderId: '1',
                side: 'buy',
                price: '100',
                size: '0.1',
                fee: '0',
                feeToken: 'USDC',
                timestamp: 1,
                transactionHash: '0x0',
              },
            },
          ],
        },
      });
      await settle();
      deliver(main, 'userTwapSliceFills', {
        user: WALLET_A,
        isSnapshot: true,
        twapSliceFills: [{}],
      });
      deliver(main, 'userTwapHistory', {
        user: WALLET_A,
        isSnapshot: true,
        history: [{}],
      });
      expect(callback.mock.lastCall?.[0]).toHaveLength(100);

      // Listed again, it carries none of the fills held before its eviction.
      history = [{ ...ended[0], status: 'active', lastUpdated: 200 }];
      deliver(main, 'userTwapHistory', { user: WALLET_A, history: [{}] });

      expect(
        callback.mock.lastCall?.[0].find(({ orderId }) => orderId === '1'),
      ).toMatchObject({ executedSize: '0', fills: [] });
    });
  });
});
