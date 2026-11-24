import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { LIGHTER_CHANNEL_RELEASE_DELAY_MS } from '../../../src/constants/lighterConfig.js';
import type { PublicTrade } from '../../../src/types/index.js';
import {
  ACCOUNT,
  BTC_MARKET,
  buildProvider,
  fakeStreamCtor,
  finishPendingTimersAfterEach,
  StreamFakeWebSocket,
} from '../../helpers/lighterProvider.js';
import type { BuiltProvider } from '../../helpers/lighterProvider.js';

vi.mock(
  import('../../../src/services/LighterClientService'),
  async (importOriginal) => ({
    ...(await importOriginal()),
    // Only the service class is doubled; convertKeysToCamelCase stays real so
    // the WebSocket message router operates on faithfully camelized payloads.
    LighterClientService: vi.fn(),
  }),
);
vi.mock('../../../src/services/LighterWalletService');

const ETH_MARKET = { ...BTC_MARKET, symbol: 'ETH', marketId: 0 };

/**
 * A venue trade on the wire (snake_case), as REST and WS send it.
 *
 * @param tradeId - Venue trade id.
 * @param timestamp - Execution time.
 * @param overrides - Field overrides.
 * @returns The wire trade.
 */
const wireTrade = (
  tradeId: number,
  timestamp: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  trade_id: tradeId,
  trade_id_str: String(tradeId),
  tx_hash: `hash-${tradeId}`,
  type: 'trade',
  market_id: 1,
  size: '0.5',
  price: '90000.5',
  is_maker_ask: true,
  timestamp,
  ask_account_id: 1,
  bid_account_id: 2,
  ...overrides,
});

/**
 * A camelized venue trade, as LighterClientService returns it.
 *
 * @param tradeId - Venue trade id.
 * @param timestamp - Execution time.
 * @param overrides - Field overrides.
 * @returns The camelized trade.
 */
const restTrade = (
  tradeId: number,
  timestamp: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  tradeId,
  tradeIdStr: String(tradeId),
  txHash: `hash-${tradeId}`,
  marketId: 1,
  size: '0.5',
  price: '90000.5',
  isMakerAsk: true,
  timestamp,
  ...overrides,
});

const expectedTrade = (
  id: number,
  timestamp: number,
  side: PublicTrade['side'],
  symbol = 'BTC',
): PublicTrade => ({
  id: String(id),
  symbol,
  price: '90000.5',
  size: '0.5',
  side,
  timestamp,
  txHash: `hash-${id}`,
  providerId: 'lighter',
});

/**
 * Build a WebSocket provider with BTC and ETH markets and a recent trades
 * endpoint.
 *
 * @param options - buildProvider overrides.
 * @returns The provider, its client double and the recent trades mock.
 */
function buildTradesProvider(
  options: Parameters<typeof buildProvider>[0] = {},
): BuiltProvider & { getRecentTrades: Mock } {
  StreamFakeWebSocket.instances = [];
  const built = buildProvider({ ...options, webSocketCtor: fakeStreamCtor });
  built.clientInstance.getOrderBooks.mockResolvedValue([
    BTC_MARKET,
    ETH_MARKET,
  ]);
  const getRecentTrades = vi.fn();
  Object.assign(built.clientInstance, { getRecentTrades });
  return { ...built, getRecentTrades };
}

/**
 * Wait for the provider's socket, open it, and return it.
 *
 * @returns The open socket.
 */
async function openSocket(): Promise<StreamFakeWebSocket> {
  await vi.waitFor(() =>
    expect(StreamFakeWebSocket.instances.length).toBeGreaterThan(0),
  );
  const socket =
    StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
  socket.open();
  return socket;
}

const receive = (socket: StreamFakeWebSocket, message: unknown): void =>
  socket.onmessage?.({ data: JSON.stringify(message) });

describe('LighterProvider public trades', () => {
  finishPendingTimersAfterEach();

  describe('getPublicTrades', () => {
    it('reads the market and returns its trades newest first, with the aggressor side', async () => {
      const { provider, getRecentTrades } = buildTradesProvider();
      getRecentTrades.mockResolvedValue({
        code: 200,
        trades: [
          restTrade(1, 1000),
          restTrade(2, 3000, { isMakerAsk: false }),
          restTrade(3, 2000, { marketId: 0 }),
        ],
      });

      const trades = await provider.getPublicTrades({
        symbol: 'BTC',
        limit: 20,
      });

      expect(getRecentTrades).toHaveBeenCalledWith(1, 20);
      expect(trades).toStrictEqual([
        expectedTrade(2, 3000, 'sell'),
        expectedTrade(1, 1000, 'buy'),
      ]);
    });

    it.each([
      [undefined, 100],
      [500, 100],
      [0, 1],
      [2.7, 2],
    ])('asks the venue for limit %s as %s', async (limit, sent) => {
      const { provider, getRecentTrades } = buildTradesProvider();
      getRecentTrades.mockResolvedValue({ code: 200, trades: [] });

      await provider.getPublicTrades({ symbol: 'BTC', limit });

      expect(getRecentTrades).toHaveBeenCalledWith(1, sent);
    });

    it('returns no trades for a symbol the venue does not list, without a request', async () => {
      const { provider, getRecentTrades } = buildTradesProvider();

      const trades = await provider.getPublicTrades({ symbol: 'DOGE' });

      expect(trades).toStrictEqual([]);
      expect(getRecentTrades).not.toHaveBeenCalled();
    });
  });

  describe('subscribeToPublicTrades', () => {
    it('subscribes to the market trade channel and forwards its batches until cleanup', async () => {
      const { provider } = buildTradesProvider();
      const callback = vi.fn();

      const unsubscribe = provider.subscribeToPublicTrades({
        symbol: 'BTC',
        callback,
      });
      const socket = await openSocket();
      receive(socket, {
        type: 'subscribed/trade',
        channel: 'trade:1',
        trades: [wireTrade(1, 1000), wireTrade(2, 2000)],
      });
      receive(socket, {
        type: 'update/trade',
        channel: 'trade:1',
        trades: [wireTrade(3, 3000, { is_maker_ask: false })],
      });
      unsubscribe();
      receive(socket, {
        type: 'update/trade',
        channel: 'trade:1',
        trades: [wireTrade(4, 4000)],
      });

      expect(socket.sent).toContain(
        JSON.stringify({ type: 'subscribe', channel: 'trade/1' }),
      );
      expect(callback.mock.calls).toStrictEqual([
        [[expectedTrade(2, 2000, 'buy'), expectedTrade(1, 1000, 'buy')]],
        [[expectedTrade(3, 3000, 'sell')]],
      ]);
    });

    it('keeps each market to its own subscribers and ignores account trade frames', async () => {
      const { provider } = buildTradesProvider();
      const btc = vi.fn();
      const eth = vi.fn();

      provider.subscribeToPublicTrades({ symbol: 'BTC', callback: btc });
      provider.subscribeToPublicTrades({ symbol: 'ETH', callback: eth });
      const socket = await openSocket();
      await vi.waitFor(() =>
        expect(socket.sent).toContain(
          JSON.stringify({ type: 'subscribe', channel: 'trade/0' }),
        ),
      );
      receive(socket, {
        type: 'update/trade',
        channel: 'trade:0',
        trades: [wireTrade(5, 5000, { market_id: 0 })],
      });
      receive(socket, {
        type: 'update/account_all_trades',
        channel: 'account_all_trades:28',
        trades: { 1: [wireTrade(6, 6000)] },
      });

      expect(btc).not.toHaveBeenCalled();
      expect(eth.mock.calls).toStrictEqual([
        [[expectedTrade(5, 5000, 'buy', 'ETH')]],
      ]);
      await provider.disconnect();
    });

    it('keeps a market channel open while it still has a subscriber', async () => {
      const { provider } = buildTradesProvider();
      const stays = vi.fn();

      provider.subscribeToPublicTrades({ symbol: 'BTC', callback: stays });
      const leaves = provider.subscribeToPublicTrades({
        symbol: 'BTC',
        callback: vi.fn(),
      });
      const socket = await openSocket();
      await vi.advanceTimersByTimeAsync(0);
      leaves();
      receive(socket, {
        type: 'update/trade',
        channel: 'trade:1',
        trades: [wireTrade(9, 9000)],
      });

      expect(socket.sent).not.toContain(
        JSON.stringify({ type: 'unsubscribe', channel: 'trade/1' }),
      );
      expect(stays.mock.calls).toStrictEqual([
        [[expectedTrade(9, 9000, 'buy')]],
      ]);
      await provider.disconnect();
    });

    it('keeps a market channel through a quick return and releases it after the wait while another stream keeps the socket open', async () => {
      const { provider } = buildTradesProvider();
      const btcSubscribe = JSON.stringify({
        type: 'subscribe',
        channel: 'trade/1',
      });
      const btcUnsubscribe = JSON.stringify({
        type: 'unsubscribe',
        channel: 'trade/1',
      });
      const left = vi.fn();
      const returning = vi.fn();

      // ETH keeps the shared socket open across the BTC round trip.
      provider.subscribeToPublicTrades({ symbol: 'ETH', callback: vi.fn() });
      const leaveBtc = provider.subscribeToPublicTrades({
        symbol: 'BTC',
        callback: left,
      });
      const socket = await openSocket();
      await vi.waitFor(() => expect(socket.sent).toContain(btcSubscribe));
      leaveBtc();
      receive(socket, {
        type: 'update/trade',
        channel: 'trade:1',
        trades: [wireTrade(8, 8000)],
      });
      const leaveReturning = provider.subscribeToPublicTrades({
        symbol: 'BTC',
        callback: returning,
      });
      await vi.advanceTimersByTimeAsync(0);
      receive(socket, {
        type: 'update/trade',
        channel: 'trade:1',
        trades: [wireTrade(9, 9000)],
      });

      // A return inside the wait keeps the channel without frame churn.
      expect(socket.sent).not.toContain(btcUnsubscribe);
      expect(
        socket.sent.filter((frame) => frame === btcSubscribe),
      ).toHaveLength(1);
      expect(left).not.toHaveBeenCalled();
      expect(returning.mock.calls).toStrictEqual([
        [[expectedTrade(9, 9000, 'buy')]],
      ]);

      leaveReturning();
      await vi.advanceTimersByTimeAsync(LIGHTER_CHANNEL_RELEASE_DELAY_MS - 1);
      expect(socket.sent).not.toContain(btcUnsubscribe);
      await vi.advanceTimersByTimeAsync(1);
      expect(socket.sent).toContain(btcUnsubscribe);
      expect(socket.readyState).toBe(1);
      await provider.disconnect();
    });

    it('drops malformed trades and batches with nothing left', async () => {
      const { provider } = buildTradesProvider();
      const callback = vi.fn();

      provider.subscribeToPublicTrades({ symbol: 'BTC', callback });
      const socket = await openSocket();
      receive(socket, {
        type: 'update/trade',
        channel: 'trade:1',
        trades: [wireTrade(7, 7000, { price: 'NaN' })],
      });
      receive(socket, {
        type: 'update/trade',
        channel: 'trade:1',
        trades: 'not-a-list',
      });

      expect(callback).not.toHaveBeenCalled();
      await provider.disconnect();
    });

    it('stops delivering after disconnect and refuses new streams', async () => {
      const { provider } = buildTradesProvider();
      const callback = vi.fn();

      provider.subscribeToPublicTrades({ symbol: 'BTC', callback });
      const socket = await openSocket();
      await provider.disconnect();
      receive(socket, {
        type: 'update/trade',
        channel: 'trade:1',
        trades: [wireTrade(8, 8000)],
      });
      const socketsBefore = StreamFakeWebSocket.instances.length;
      provider.subscribeToPublicTrades({ symbol: 'BTC', callback });

      expect(callback).not.toHaveBeenCalled();
      expect(StreamFakeWebSocket.instances).toHaveLength(socketsBefore);
    });

    it('subscribes the trade channel again on the stream rebuilt for a new wallet account', async () => {
      const { provider, clientInstance, getUserAddressMock } =
        buildTradesProvider({ configuredAccountIndex: null });
      const accountB = { ...ACCOUNT, index: 900, l1Address: '0xbbbb' };
      const accountsByAddress: Record<string, unknown> = {
        [ACCOUNT.l1Address.toLowerCase()]: {
          code: 200,
          l1Address: ACCOUNT.l1Address,
          subAccounts: [ACCOUNT],
        },
        '0xbbbb': { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] },
      };
      clientInstance.getAccountsByL1Address.mockImplementation(
        async (address: string) => accountsByAddress[address.toLowerCase()],
      );
      const callback = vi.fn();

      provider.subscribeToPublicTrades({ symbol: 'BTC', callback });
      const first = await openSocket();
      await provider.getAccountState();
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      await vi.waitFor(() =>
        expect(StreamFakeWebSocket.instances.length).toBeGreaterThan(1),
      );
      const replacement = await openSocket();
      receive(replacement, {
        type: 'update/trade',
        channel: 'trade:1',
        trades: [wireTrade(9, 9000)],
      });

      expect(replacement).not.toBe(first);
      expect(replacement.sent).toContain(
        JSON.stringify({ type: 'subscribe', channel: 'trade/1' }),
      );
      expect(callback.mock.calls).toStrictEqual([
        [[expectedTrade(9, 9000, 'buy')]],
      ]);
      await provider.disconnect();
    });

    it('does not resubscribe a released market on the stream rebuilt for a new wallet account', async () => {
      const { provider, clientInstance, getUserAddressMock } =
        buildTradesProvider({ configuredAccountIndex: null });
      const accountB = { ...ACCOUNT, index: 900, l1Address: '0xbbbb' };
      const accountsByAddress: Record<string, unknown> = {
        [ACCOUNT.l1Address.toLowerCase()]: {
          code: 200,
          l1Address: ACCOUNT.l1Address,
          subAccounts: [ACCOUNT],
        },
        '0xbbbb': { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] },
      };
      clientInstance.getAccountsByL1Address.mockImplementation(
        async (address: string) => accountsByAddress[address.toLowerCase()],
      );

      // ETH outlives the account switch; BTC leaves before it.
      provider.subscribeToPublicTrades({ symbol: 'ETH', callback: vi.fn() });
      const leaveBtc = provider.subscribeToPublicTrades({
        symbol: 'BTC',
        callback: vi.fn(),
      });
      const first = await openSocket();
      await vi.waitFor(() =>
        expect(first.sent).toContain(
          JSON.stringify({ type: 'subscribe', channel: 'trade/1' }),
        ),
      );
      leaveBtc();
      await provider.getAccountState();
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      await vi.waitFor(() =>
        expect(StreamFakeWebSocket.instances.length).toBeGreaterThan(1),
      );
      const replacement = await openSocket();

      expect(replacement).not.toBe(first);
      expect(
        replacement.sent.filter((frame) => frame.includes('"trade/')),
      ).toStrictEqual([
        JSON.stringify({ type: 'subscribe', channel: 'trade/0' }),
      ]);
      await provider.disconnect();
    });

    it('never subscribes a symbol the venue does not list', async () => {
      const { provider, clientInstance } = buildTradesProvider();

      provider.subscribeToPublicTrades({ symbol: 'DOGE', callback: vi.fn() });
      await vi.waitFor(() =>
        expect(clientInstance.getOrderBooks).toHaveBeenCalled(),
      );
      provider.subscribeToPublicTrades({ symbol: 'BTC', callback: vi.fn() });
      const socket = await openSocket();

      expect(
        socket.sent.filter((frame) => frame.includes('"trade/')),
      ).toStrictEqual([
        JSON.stringify({ type: 'subscribe', channel: 'trade/1' }),
      ]);
      await provider.disconnect();
    });
  });
});
