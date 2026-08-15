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
              min_base_amount: '0.00020',
              supported_size_decimals: 5,
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
