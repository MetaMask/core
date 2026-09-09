import {
  LighterApiError,
  LighterClientService,
} from '../../../src/services/LighterClientService.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

const ORDER_BOOK = {
  symbol: 'BTC',
  marketId: 1,
  marketType: 'perp',
  status: 'active',
  takerFee: '0.0000',
  makerFee: '0.0000',
  minBaseAmount: '0.00020',
  minQuoteAmount: '10.000000',
  supportedSizeDecimals: 5,
  supportedPriceDecimals: 1,
  supportedQuoteDecimals: 6,
};

const ORDER_BOOK_DETAIL = {
  ...ORDER_BOOK,
  lastTradePrice: 100000,
  defaultInitialMarginFraction: 100,
  minInitialMarginFraction: 100,
  maintenanceMarginFraction: 50,
  dailyTradesCount: 1,
  dailyBaseTokenVolume: 1,
  dailyQuoteTokenVolume: 1,
  dailyPriceLow: 1,
  dailyPriceHigh: 1,
  dailyPriceChange: 0,
  openInterest: 1,
  dailyChart: {},
};

const VALID_TRADE_WIRE = {
  trade_id: 1,
  tx_hash: '0xabc',
  type: 'trade',
  market_id: 1,
  size: '0.1',
  price: '90000',
  usd_amount: '9000',
  ask_id: 10,
  bid_id: 11,
  ask_account_id: 28,
  bid_account_id: 99,
  is_maker_ask: false,
  timestamp: 1700000000000,
  ask_account_pnl: '0',
  bid_account_pnl: '0',
  taker_position_size_before: '0.1',
  maker_position_size_before: '0',
  taker_position_sign_changed: true,
  maker_position_sign_changed: true,
};

describe('LighterClientService', () => {
  let fetchMock: jest.Mock;

  const buildService = (isTestnet = true): LighterClientService =>
    new LighterClientService(createMockInfrastructure(), { isTestnet });

  const mockJsonResponse = (
    payload: unknown,
    ok = true,
    status = 200,
  ): { ok: boolean; status: number; json: jest.Mock } => ({
    ok,
    status,
    json: jest.fn().mockResolvedValue(payload),
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe('network resolution', () => {
    it('uses the testnet base URL in testnet mode', () => {
      expect(buildService(true).baseUrl).toBe(
        'https://testnet.zklighter.elliot.ai',
      );
      expect(buildService(true).network).toBe('testnet');
    });

    it('uses the mainnet base URL in mainnet mode', () => {
      expect(buildService(false).baseUrl).toBe(
        'https://mainnet.zklighter.elliot.ai',
      );
      expect(buildService(false).network).toBe('mainnet');
    });
  });

  describe('getOrderBooks', () => {
    it('fetches and caches market metadata', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 200, orderBooks: [ORDER_BOOK] }),
      );
      const service = buildService();

      const first = await service.getOrderBooks();
      const second = await service.getOrderBooks();

      expect(first).toStrictEqual([ORDER_BOOK]);
      expect(second).toStrictEqual([ORDER_BOOK]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://testnet.zklighter.elliot.ai/api/v1/orderBooks',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('refetches when forceRefresh is set', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 200, orderBooks: [ORDER_BOOK] }),
      );
      const service = buildService();
      await service.getOrderBooks();
      await service.getOrderBooks(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('accepts zero minimum amounts reported for inactive markets', async () => {
      const inactiveMarket = {
        ...ORDER_BOOK,
        status: 'inactive',
        minBaseAmount: '0.0000',
        minQuoteAmount: '0.000000',
      };
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 200, orderBooks: [inactiveMarket] }),
      );

      const markets = await buildService(false).getOrderBooks();

      expect(markets).toStrictEqual([inactiveMarket]);
    });

    it.each(['minBaseAmount', 'minQuoteAmount'] as const)(
      'rejects a zero %s for an active market',
      async (field) => {
        fetchMock.mockResolvedValue(
          mockJsonResponse({
            code: 200,
            orderBooks: [{ ...ORDER_BOOK, [field]: '0.0000' }],
          }),
        );

        await expect(buildService().getOrderBooks()).rejects.toThrow(
          'Invalid Lighter venue data',
        );
      },
    );

    it('rejects negative minimum amounts for inactive markets', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({
          code: 200,
          orderBooks: [
            { ...ORDER_BOOK, status: 'inactive', minBaseAmount: '-0.0001' },
          ],
        }),
      );

      await expect(buildService().getOrderBooks()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });
  });

  describe('getOrderBookDetails', () => {
    it('accepts zero margin fractions reported for inactive markets', async () => {
      const inactiveMarket = {
        ...ORDER_BOOK_DETAIL,
        status: 'inactive',
        minBaseAmount: '0.0000',
        minQuoteAmount: '0.000000',
        defaultInitialMarginFraction: 0,
        minInitialMarginFraction: 0,
        maintenanceMarginFraction: 0,
      };
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 200, orderBookDetails: [inactiveMarket] }),
      );

      const response = await buildService(false).getOrderBookDetails();

      expect(response).toStrictEqual({
        code: 200,
        orderBookDetails: [inactiveMarket],
      });
    });

    it.each([
      'defaultInitialMarginFraction',
      'minInitialMarginFraction',
      'maintenanceMarginFraction',
    ] as const)('rejects a zero %s for an active market', async (field) => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({
          code: 200,
          orderBookDetails: [{ ...ORDER_BOOK_DETAIL, [field]: 0 }],
        }),
      );

      await expect(buildService().getOrderBookDetails()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });
  });

  describe('getTx', () => {
    it('returns the transaction payload on 200', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({
          code: 200,
          hash: 'aabbccdd',
          account_index: 28,
          api_key_index: 7,
          nonce: 42,
          status: 2,
        }),
      );
      const service = buildService();
      const tx = await service.getTx('aabbccdd');
      expect(tx).toMatchObject({
        code: 200,
        hash: 'aabbccdd',
        accountIndex: 28,
        apiKeyIndex: 7,
        nonce: 42,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://testnet.zklighter.elliot.ai/api/v1/tx?by=hash&value=aabbccdd',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('resolves NULL only for the venue-confirmed not-found code 21500', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse(
          { code: 21500, message: 'transaction not found' },
          false,
          400,
        ),
      );
      const service = buildService();
      expect(await service.getTx('aabbccdd')).toBeNull();
    });

    it('rethrows other API errors and transport failures (ambiguity, not non-acceptance)', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 21999, message: 'rate limited' }, false, 429),
      );
      const service = buildService();
      await expect(service.getTx('aabbccdd')).rejects.toThrow('rate limited');
      fetchMock.mockRejectedValue(new Error('socket hang up'));
      await expect(service.getTx('aabbccdd')).rejects.toThrow('socket hang up');
    });

    it('rejects malformed successful transaction payloads', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({
          code: 200,
          hash: 'aabbccdd',
          account_index: 28,
          api_key_index: 7,
          nonce: '42',
          status: 2,
        }),
      );

      await expect(buildService().getTx('aabbccdd')).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });
  });

  describe('getInactiveOrders pagination', () => {
    it('encodes limit, cursor and market_id query params', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse({ code: 200, orders: [] }));
      const service = buildService();
      await service.getInactiveOrders(28, 'auth-token', 100, 'abc/def', 2);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://testnet.zklighter.elliot.ai/api/v1/accountInactiveOrders?account_index=28&limit=100&cursor=abc%2Fdef&market_id=2',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('getTrades', () => {
    it('encodes cursor, from, and market filters', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 200, next_cursor: 'next', trades: [] }),
      );
      const service = buildService();
      await service.getTrades(28, 'auth-token', {
        limit: 100,
        cursor: 'abc/def',
        from: 42,
        marketId: 3,
      });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          'limit=100&account_index=28&market_type=perp&cursor=abc%2Fdef&from=42&market_id=3',
        ),
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('rejects malformed financial fields in a successful trade payload', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({
          code: 200,
          trades: [
            {
              trade_id: 1,
              type: 'trade',
              market_id: 1,
              size: '1oops',
              price: '90000',
              ask_id: 10,
              bid_id: 11,
              ask_account_id: 28,
              bid_account_id: 99,
              timestamp: 1700000000000,
              ask_account_pnl: '0',
              bid_account_pnl: '0',
            },
          ],
        }),
      );

      await expect(
        buildService().getTrades(28, 'auth-token', { limit: 50 }),
      ).rejects.toThrow('Invalid Lighter venue data');
    });

    it.each([
      ['negative size', { size: '-0.1' }],
      ['zero price', { price: '0' }],
      ['negative position magnitude', { taker_position_size_before: '-0.1' }],
      ['missing maker role', { is_maker_ask: undefined }],
      [
        'missing position sign context',
        { taker_position_sign_changed: undefined },
      ],
    ])('rejects %s in a trade payload', async (_label, override) => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({
          code: 200,
          trades: [{ ...VALID_TRADE_WIRE, ...override }],
        }),
      );

      await expect(
        buildService().getTrades(28, 'auth-token', { limit: 50 }),
      ).rejects.toThrow('Invalid Lighter venue data');
    });

    it('accepts omitted account pnl fields for later participant-side validation', async () => {
      const {
        ask_account_pnl: _askPnl,
        bid_account_pnl: _bidPnl,
        ...trade
      } = VALID_TRADE_WIRE;
      fetchMock.mockResolvedValue(
        mockJsonResponse({
          code: 200,
          trades: [trade],
        }),
      );

      const response = await buildService().getTrades(28, 'auth-token', {
        limit: 50,
      });

      expect(response.trades).toHaveLength(1);
      expect(response.trades[0]).not.toHaveProperty('askAccountPnl');
      expect(response.trades[0]).not.toHaveProperty('bidAccountPnl');
    });
  });

  describe('financial history decoders', () => {
    it('rejects malformed funding, deposit, withdrawal, and transfer amounts', async () => {
      const service = buildService();
      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          code: 200,
          position_fundings: [
            {
              timestamp: 1,
              market_id: 1,
              funding_id: 1,
              change: '0.1',
              rate: '0.001',
              position_size: '-1',
              position_side: 'long',
            },
          ],
        }),
      );
      await expect(
        service.getPositionFundings(28, 'auth-token'),
      ).rejects.toThrow('Invalid Lighter venue data');

      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          code: 200,
          deposits: [
            {
              id: '1',
              asset_id: 3,
              amount: '-1',
              timestamp: 1,
              status: 'completed',
              l1_tx_hash: '0xdep',
            },
          ],
        }),
      );
      await expect(
        service.getDepositHistory(28, '0xabc', 'auth-token'),
      ).rejects.toThrow('Invalid Lighter venue data');

      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          code: 200,
          withdraws: [
            {
              id: '2',
              asset_id: 3,
              amount: '-1',
              timestamp: 1,
              status: 'completed',
              type: 'secure',
              l1_tx_hash: '0xwit',
            },
          ],
        }),
      );
      await expect(
        service.getWithdrawHistory(28, 'auth-token'),
      ).rejects.toThrow('Invalid Lighter venue data');

      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          code: 200,
          transfers: [
            {
              id: '3',
              asset_id: 3,
              amount: '1',
              fee: '-0.1',
              timestamp: 1,
              type: 'L2TransferOutflow',
              from_l1_address: '0xabc',
              to_l1_address: '0xdef',
              from_account_index: 28,
              to_account_index: 29,
              tx_hash: '0xtransfer',
            },
          ],
        }),
      );
      await expect(
        service.getTransferHistory(28, 'auth-token'),
      ).rejects.toThrow('Invalid Lighter venue data');

      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          code: 200,
          transfers: [
            {
              id: '4',
              asset_id: 3,
              amount: '1',
              fee: '0',
              timestamp: 1,
              type: 'L2TransferRebate',
              from_l1_address: '0xabc',
              to_l1_address: '0xdef',
              from_account_index: 28,
              to_account_index: 29,
              tx_hash: '0xunknown',
            },
          ],
        }),
      );
      await expect(
        service.getTransferHistory(28, 'auth-token'),
      ).rejects.toThrow('Invalid Lighter venue data');
    });

    it('rejects margin fractions above 10000', async () => {
      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          code: 200,
          order_book_details: [
            {
              ...ORDER_BOOK,
              last_trade_price: 100000,
              default_initial_margin_fraction: 10001,
              min_initial_margin_fraction: 10001,
              maintenance_margin_fraction: 10001,
              daily_trades_count: 1,
              daily_base_token_volume: 1,
              daily_quote_token_volume: 1,
              daily_price_low: 1,
              daily_price_high: 1,
              daily_price_change: 0,
              open_interest: 1,
              daily_chart: {},
            },
          ],
        }),
      );
      const service = buildService();
      await expect(service.getOrderBookDetails()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it.each([Number.MIN_VALUE, 1.5])(
      'rejects non-integer margin fraction %p',
      async (marginFraction) => {
        fetchMock.mockResolvedValueOnce(
          mockJsonResponse({
            code: 200,
            order_book_details: [
              {
                ...ORDER_BOOK,
                last_trade_price: 100000,
                default_initial_margin_fraction: marginFraction,
                min_initial_margin_fraction: marginFraction,
                maintenance_margin_fraction: marginFraction,
                daily_trades_count: 1,
                daily_base_token_volume: 1,
                daily_quote_token_volume: 1,
                daily_price_low: 1,
                daily_price_high: 1,
                daily_price_change: 0,
                open_interest: 1,
                daily_chart: {},
              },
            ],
          }),
        );
        await expect(buildService().getOrderBookDetails()).rejects.toThrow(
          'Invalid Lighter venue data',
        );
      },
    );
  });

  describe('error handling', () => {
    it('throws LighterApiError on application-level error codes', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 21100, message: 'account not found' }),
      );
      const service = buildService();
      await expect(service.getAccountByIndex(999999)).rejects.toThrow(
        LighterApiError,
      );
      await expect(service.getAccountByIndex(999999)).rejects.toThrow(
        'account not found',
      );
    });

    it('throws LighterApiError on non-2xx HTTP responses', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 500, message: 'boom' }, false, 500),
      );
      const service = buildService();
      await expect(service.getOrderBookDetails()).rejects.toThrow('boom');
    });

    it('wraps network failures in LighterApiError', async () => {
      fetchMock.mockRejectedValue(new Error('socket hang up'));
      const service = buildService();
      await expect(service.getOrderBooks()).rejects.toThrow('socket hang up');
    });
  });

  describe('account endpoints', () => {
    it('queries accounts by L1 address', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 200, l1Address: '0xabc', subAccounts: [] }),
      );
      const service = buildService();
      await service.getAccountsByL1Address('0xabc');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/accountsByL1Address?l1_address=0xabc'),
        expect.anything(),
      );
    });

    it('accepts sparse account-discovery balances without weakening full account reads', async () => {
      const discoveryAccount = {
        code: 0,
        account_type: 0,
        index: 629696,
        l1_address: '0xabc',
        cancel_all_time: 0,
        total_order_count: 0,
        pending_order_count: 0,
        status: 0,
        collateral: '5.000000',
        available_balance: '',
      };
      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          code: 200,
          l1_address: '0xabc',
          sub_accounts: [discoveryAccount],
        }),
      );
      const service = buildService(false);

      const discovered = await service.getAccountsByL1Address('0xabc');
      expect(discovered).toStrictEqual(
        expect.objectContaining({
          subAccounts: [
            expect.objectContaining({
              accountType: 0,
              index: 629696,
              l1Address: '0xabc',
            }),
          ],
        }),
      );

      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({ code: 200, accounts: [discoveryAccount] }),
      );
      await expect(service.getAccountByIndex(629696)).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('queries the account by index', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 200, accounts: [] }),
      );
      const service = buildService();
      await service.getAccountByIndex(28);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/account?by=index&value=28'),
        expect.anything(),
      );
    });

    it('queries api keys and next nonce', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 200, apiKeys: [], nonce: 5 }),
      );
      const service = buildService();
      await service.getApiKeys(28, 7);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          '/api/v1/apikeys?account_index=28&api_key_index=7',
        ),
        expect.anything(),
      );
      await service.getNextNonce(28, 7);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          '/api/v1/nextNonce?account_index=28&api_key_index=7',
        ),
        expect.anything(),
      );
    });

    it('rejects malformed successful nonce, account, market, and order payloads', async () => {
      const service = buildService();

      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({ code: 200, nonce: '5' }),
      );
      await expect(service.getNextNonce(28, 7)).rejects.toThrow(
        'Invalid Lighter venue data',
      );

      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({ code: 200, accounts: [{}] }),
      );
      await expect(service.getAccountByIndex(28)).rejects.toThrow(
        'Invalid Lighter venue data',
      );

      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({ code: 200, order_books: [{}] }),
      );
      await expect(service.getOrderBooks(true)).rejects.toThrow(
        'Invalid Lighter venue data',
      );

      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({ code: 200, orders: [{}] }),
      );
      await expect(
        service.getActiveOrders(28, 'auth-token-value'),
      ).rejects.toThrow('Invalid Lighter venue data');
    });

    it('rejects financial values outside their endpoint domains', async () => {
      const service = buildService();
      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          code: 200,
          accounts: [
            {
              code: 200,
              account_type: 0,
              index: 28,
              l1_address: '0xabc',
              cancel_all_time: 0,
              total_order_count: 0,
              pending_order_count: 0,
              status: 1,
              collateral: '-1',
              available_balance: '0',
            },
          ],
        }),
      );
      await expect(service.getAccountByIndex(28)).rejects.toThrow(
        'Invalid Lighter venue data',
      );

      fetchMock.mockResolvedValueOnce(
        mockJsonResponse({
          code: 200,
          order_books: [{ ...ORDER_BOOK, min_base_amount: '-0.0002' }],
        }),
      );
      await expect(service.getOrderBooks(true)).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('passes the auth token as authorization header for active orders', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse({ code: 200, orders: [] }));
      const service = buildService();
      await service.getActiveOrders(28, 'auth-token-value');
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(
          '/api/v1/accountActiveOrders?account_index=28&market_id=255',
        ),
        expect.objectContaining({
          headers: { authorization: 'auth-token-value' },
        }),
      );
    });
  });

  describe('wire-format conversion', () => {
    it('converts snake_case wire keys to camelCase at the fetch boundary', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({
          code: 200,
          // Raw zkLighter wire format (snake_case).
          order_books: [
            {
              symbol: 'BTC',
              market_id: 1,
              market_type: 'perp',
              status: 'active',
              taker_fee: '0.0000',
              maker_fee: '0.0000',
              min_base_amount: '0.00020',
              min_quote_amount: '10.000000',
              supported_size_decimals: 5,
              supported_price_decimals: 1,
              supported_quote_decimals: 6,
            },
          ],
        }),
      );
      const service = buildService();
      const markets = await service.getOrderBooks();
      expect(markets[0]).toMatchObject({
        symbol: 'BTC',
        marketId: 1,
        minBaseAmount: '0.00020',
        supportedSizeDecimals: 5,
      });
    });
  });

  describe('sendTx', () => {
    it('posts form-encoded tx_type and tx_info', async () => {
      fetchMock.mockResolvedValue(
        mockJsonResponse({ code: 200, txHash: '0xhash' }),
      );
      const service = buildService();
      const result = await service.sendTx(14, '{"foo":1}');

      expect(result.txHash).toBe('0xhash');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://testnet.zklighter.elliot.ai/api/v1/sendTx');
      expect(init.method).toBe('POST');
      expect(init.headers).toStrictEqual({
        'content-type': 'application/x-www-form-urlencoded',
      });
      expect(init.body).toBe(
        `tx_type=14&tx_info=${encodeURIComponent('{"foo":1}').replace(/%20/gu, '+')}`,
      );
    });
  });
});
