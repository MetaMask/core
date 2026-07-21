import { DEFAULT_MAX_RETRIES, HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock, { cleanAll as nockCleanAll } from 'nock';

import { Env, MONEY_ACCOUNT_API_URL_MAP } from './constants';
import { MoneyAccountApiResponseValidationError } from './errors';
import type {
  MoneyAccountApiDataServiceMessenger,
  MoneyAccountApiDataServiceTraceCallback,
  MoneyAccountApiDataServiceTraceRequest,
} from './money-account-api-data-service';
import {
  MoneyAccountApiDataService,
  serviceName,
  TRACES,
} from './money-account-api-data-service';

// ============================================================
// Fixtures
// ============================================================

const MOCK_ADDRESS = '0x1111111111111111111111111111111111111111';
const MOCK_VAULT_ADDRESS = '0x2222222222222222222222222222222222222222';

const MOCK_POSITION_BALANCE = {
  musd_balance: '2',
  vmusd_value_in_musd: '1513527',
  total_balance: '1513529',
};

const MOCK_POSITION_RESPONSE = {
  address: MOCK_ADDRESS,
  as_of_block: 12345,
  as_of_timestamp: '2026-06-01T12:00:00Z',
  data_freshness: 'live' as const,
  indexer_lag_seconds: 5,
  balance: MOCK_POSITION_BALANCE,
  positions: [
    {
      vault_address: MOCK_VAULT_ADDRESS,
      shares_held: '1000000000000000000',
      current_rate: '1052340000000000000',
      current_value_assets: '1052340000000000000',
      current_value_usd: '1052.34',
      cost_basis_assets: '1000000000000000000',
      cost_basis_usd: '1000.00',
      realized_interest_usd: '10.00',
      unrealised_interest_usd: '42.34',
      lifetime_interest_usd: '52.34',
      current_apy: '0.0412',
      effective_apy: '0.0395',
    },
  ],
};

const MOCK_INTEREST_RESPONSE = {
  address: MOCK_ADDRESS,
  vault_address: MOCK_VAULT_ADDRESS,
  window: '7d',
  window_start: '2026-05-25T00:00:00Z',
  window_end: '2026-06-01T00:00:00Z',
  interest_earned_assets: '5000000000000000',
  interest_earned_usd: '5.00',
  method: 'nav_difference',
  as_of_block: 12345,
  as_of_timestamp: '2026-06-01T12:00:00Z',
  data_freshness: 'live' as const,
  indexer_lag_seconds: 5,
};

const MOCK_HISTORY_RESPONSE = {
  address: MOCK_ADDRESS,
  cash_flows: [
    {
      type: 'deposit' as const,
      chain_id: 143,
      vault_address: MOCK_VAULT_ADDRESS,
      timestamp: '2026-05-01T10:00:00Z',
      block_number: 10000,
      log_index: 0,
      tx_hash: '0xabc123',
      assets_usd: '1000.00',
      assets_wei: '1000000000000000000',
      shares_wei: '950000000000000000',
      rate: '1.052340',
      source: 'teller' as const,
    },
  ],
  next_cursor: 'eyJiIjoxMDAwMH0=',
  has_more: true,
  as_of_block: 12345,
  as_of_timestamp: '2026-06-01T12:00:00Z',
  data_freshness: 'live' as const,
  indexer_lag_seconds: 5,
};

const MOCK_RATE_HISTORY_RESPONSE = {
  vault_address: MOCK_VAULT_ADDRESS,
  chain_id: 143,
  range_start: '2026-05-01T00:00:00Z',
  range_end: '2026-06-01T00:00:00Z',
  rates: [
    {
      timestamp: '2026-05-01T00:00:00Z',
      block_number: 10000,
      rate: '1.000000000000000000',
      tx_hash: '0xdef456',
    },
    {
      timestamp: '2026-06-01T00:00:00Z',
      block_number: 12345,
      rate: '1.052340000000000000',
      tx_hash: '0xghi789',
    },
  ],
  as_of_block: 12345,
  as_of_timestamp: '2026-06-01T12:00:00Z',
  data_freshness: 'live' as const,
  indexer_lag_seconds: 5,
};

// ============================================================
// Messenger helpers
// ============================================================

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<MoneyAccountApiDataServiceMessenger>,
  MessengerEvents<MoneyAccountApiDataServiceMessenger>
>;

function createRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function createServiceMessenger(
  rootMessenger: RootMessenger,
): MoneyAccountApiDataServiceMessenger {
  return new Messenger({
    namespace: serviceName,
    parent: rootMessenger,
  });
}

// ============================================================
// Factory
// ============================================================

function createService(
  env: Env = Env.DEV,
  {
    trace,
  }: { trace?: MoneyAccountApiDataServiceTraceCallback } = {},
): {
  service: MoneyAccountApiDataService;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountApiDataServiceMessenger;
} {
  const rootMessenger = createRootMessenger();
  const messenger = createServiceMessenger(rootMessenger);
  const service = new MoneyAccountApiDataService({
    messenger,
    env,
    trace,
  });
  return { service, rootMessenger, messenger };
}

// ============================================================
// Tests
// ============================================================

describe('MoneyAccountApiDataService', () => {
  afterEach(() => {
    nockCleanAll();
  });

  describe('constructor', () => {
    it('initializes with default PRD environment', () => {
      const rootMessenger = createRootMessenger();
      const messenger = createServiceMessenger(rootMessenger);
      const service = new MoneyAccountApiDataService({ messenger });
      expect(service.name).toBe(serviceName);
      service.destroy();
    });

    it('initializes with specified environment', () => {
      const { service } = createService(Env.UAT);
      expect(service.name).toBe(serviceName);
      service.destroy();
    });
  });

  describe('fetchPositions', () => {
    it('returns position data for a valid address', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, MOCK_POSITION_RESPONSE);

      const result = await service.fetchPositions(MOCK_ADDRESS);
      expect(result).toStrictEqual(MOCK_POSITION_RESPONSE);
      service.destroy();
    });

    it('lowercases the address in the request', async () => {
      const { service } = createService(Env.DEV);
      const upperAddress = MOCK_ADDRESS.toUpperCase().replace('0X', '0x');

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, MOCK_POSITION_RESPONSE);

      const result = await service.fetchPositions(upperAddress);
      expect(result).toStrictEqual(MOCK_POSITION_RESPONSE);
      service.destroy();
    });

    it('throws HttpError on non-2xx response', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);

      await expect(service.fetchPositions(MOCK_ADDRESS)).rejects.toThrow(
        HttpError,
      );
      service.destroy();
    });

    it('throws MoneyAccountApiResponseValidationError on malformed response', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .once()
        .reply(200, { invalid: true });

      await expect(service.fetchPositions(MOCK_ADDRESS)).rejects.toThrow(
        MoneyAccountApiResponseValidationError,
      );
      service.destroy();
    });

    it('accepts a null balance when the API balance path is unavailable', async () => {
      const { service } = createService(Env.DEV);
      const responseWithNullBalance = {
        ...MOCK_POSITION_RESPONSE,
        balance: null,
      };

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, responseWithNullBalance);

      const result = await service.fetchPositions(MOCK_ADDRESS);
      expect(result).toStrictEqual(responseWithNullBalance);
      service.destroy();
    });

    it('accepts a response that omits the balance field', async () => {
      const { service } = createService(Env.DEV);
      const { balance: _balance, ...responseWithoutBalance } =
        MOCK_POSITION_RESPONSE;

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, responseWithoutBalance);

      const result = await service.fetchPositions(MOCK_ADDRESS);
      expect(result).toStrictEqual(responseWithoutBalance);
      service.destroy();
    });

    it('throws MoneyAccountApiResponseValidationError on malformed balance', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, {
          ...MOCK_POSITION_RESPONSE,
          balance: { musd_balance: '1' },
        });

      await expect(service.fetchPositions(MOCK_ADDRESS)).rejects.toThrow(
        MoneyAccountApiResponseValidationError,
      );
      service.destroy();
    });

    it('caches responses via TanStack Query', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .once()
        .reply(200, MOCK_POSITION_RESPONSE);

      const result1 = await service.fetchPositions(MOCK_ADDRESS);
      const result2 = await service.fetchPositions(MOCK_ADDRESS);
      expect(result1).toStrictEqual(result2);
      service.destroy();
    });

    it('is callable via messenger action', async () => {
      const { rootMessenger, service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, MOCK_POSITION_RESPONSE);

      const result = await rootMessenger.call(
        'MoneyAccountApiDataService:fetchPositions',
        MOCK_ADDRESS,
      );
      expect(result).toStrictEqual(MOCK_POSITION_RESPONSE);
      service.destroy();
    });
  });

  describe('fetchInterest', () => {
    it('returns interest data for valid params', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/interest`)
        .query({
          vault_address: MOCK_VAULT_ADDRESS,
          window: '7d',
        })
        .reply(200, MOCK_INTEREST_RESPONSE);

      const result = await service.fetchInterest(MOCK_ADDRESS, {
        vaultAddress: MOCK_VAULT_ADDRESS,
        window: '7d',
      });
      expect(result).toStrictEqual(MOCK_INTEREST_RESPONSE);
      service.destroy();
    });

    it('includes chain_id query param when specified', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/interest`)
        .query({
          vault_address: MOCK_VAULT_ADDRESS,
          window: '30d',
          chain_id: '143',
        })
        .reply(200, MOCK_INTEREST_RESPONSE);

      const result = await service.fetchInterest(MOCK_ADDRESS, {
        vaultAddress: MOCK_VAULT_ADDRESS,
        window: '30d',
        chainId: 143,
      });
      expect(result).toStrictEqual(MOCK_INTEREST_RESPONSE);
      service.destroy();
    });

    it('throws HttpError on non-2xx response', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/interest`)
        .query({
          vault_address: MOCK_VAULT_ADDRESS,
          window: '7d',
        })
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(400);

      await expect(
        service.fetchInterest(MOCK_ADDRESS, {
          vaultAddress: MOCK_VAULT_ADDRESS,
          window: '7d',
        }),
      ).rejects.toThrow(HttpError);
      service.destroy();
    });

    it('throws MoneyAccountApiResponseValidationError on malformed response', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/interest`)
        .query({
          vault_address: MOCK_VAULT_ADDRESS,
          window: '7d',
        })
        .once()
        .reply(200, { bad: 'data' });

      await expect(
        service.fetchInterest(MOCK_ADDRESS, {
          vaultAddress: MOCK_VAULT_ADDRESS,
          window: '7d',
        }),
      ).rejects.toThrow(MoneyAccountApiResponseValidationError);
      service.destroy();
    });

    it('is callable via messenger action', async () => {
      const { rootMessenger, service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/interest`)
        .query({
          vault_address: MOCK_VAULT_ADDRESS,
          window: '7d',
        })
        .reply(200, MOCK_INTEREST_RESPONSE);

      const result = await rootMessenger.call(
        'MoneyAccountApiDataService:fetchInterest',
        MOCK_ADDRESS,
        { vaultAddress: MOCK_VAULT_ADDRESS, window: '7d' },
      );
      expect(result).toStrictEqual(MOCK_INTEREST_RESPONSE);
      service.destroy();
    });
  });

  describe('fetchHistory', () => {
    it('returns history data with no options', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/history`)
        .reply(200, MOCK_HISTORY_RESPONSE);

      const result = await service.fetchHistory(MOCK_ADDRESS);
      expect(result).toStrictEqual(MOCK_HISTORY_RESPONSE);
      service.destroy();
    });

    it('includes vault_address query param when specified', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/history`)
        .query({ vault_address: MOCK_VAULT_ADDRESS })
        .reply(200, MOCK_HISTORY_RESPONSE);

      const result = await service.fetchHistory(MOCK_ADDRESS, {
        vaultAddress: MOCK_VAULT_ADDRESS,
      });
      expect(result).toStrictEqual(MOCK_HISTORY_RESPONSE);
      service.destroy();
    });

    it('includes all optional query params', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/history`)
        .query({
          vault_address: MOCK_VAULT_ADDRESS,
          chain_id: '143',
          cursor: 'abc123',
          limit: '10',
        })
        .reply(200, MOCK_HISTORY_RESPONSE);

      const result = await service.fetchHistory(MOCK_ADDRESS, {
        vaultAddress: MOCK_VAULT_ADDRESS,
        chainId: 143,
        cursor: 'abc123',
        limit: 10,
      });
      expect(result).toStrictEqual(MOCK_HISTORY_RESPONSE);
      service.destroy();
    });

    it('supports paginated fetching via cursor', async () => {
      const { service } = createService(Env.DEV);

      const page2Response = {
        ...MOCK_HISTORY_RESPONSE,
        next_cursor: null,
        has_more: false,
      };

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/history`)
        .reply(200, MOCK_HISTORY_RESPONSE);

      const firstPage = await service.fetchHistory(MOCK_ADDRESS);
      expect(firstPage.next_cursor).toBe('eyJiIjoxMDAwMH0=');

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/history`)
        .query({ cursor: 'eyJiIjoxMDAwMH0=' })
        .reply(200, page2Response);

      const secondPage = await service.fetchHistory(MOCK_ADDRESS, {
        cursor: 'eyJiIjoxMDAwMH0=',
      });
      expect(secondPage.next_cursor).toBeNull();
      expect(secondPage.has_more).toBe(false);
      service.destroy();
    });

    it('throws HttpError on non-2xx response', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/history`)
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);

      await expect(service.fetchHistory(MOCK_ADDRESS)).rejects.toThrow(
        HttpError,
      );
      service.destroy();
    });

    it('throws MoneyAccountApiResponseValidationError on malformed response', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/history`)
        .once()
        .reply(200, { wrong: 'shape' });

      await expect(service.fetchHistory(MOCK_ADDRESS)).rejects.toThrow(
        MoneyAccountApiResponseValidationError,
      );
      service.destroy();
    });

    it('is callable via messenger action', async () => {
      const { rootMessenger, service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/history`)
        .reply(200, MOCK_HISTORY_RESPONSE);

      const result = await rootMessenger.call(
        'MoneyAccountApiDataService:fetchHistory',
        MOCK_ADDRESS,
      );
      expect(result).toStrictEqual(MOCK_HISTORY_RESPONSE);
      service.destroy();
    });
  });

  describe('fetchRateHistory', () => {
    it('returns rate history data with no options', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate-history`)
        .reply(200, MOCK_RATE_HISTORY_RESPONSE);

      const result = await service.fetchRateHistory(MOCK_VAULT_ADDRESS);
      expect(result).toStrictEqual(MOCK_RATE_HISTORY_RESPONSE);
      service.destroy();
    });

    it('includes optional query params', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate-history`)
        .query({
          chain_id: '143',
          from: '2026-05-01T00:00:00Z',
          to: '2026-06-01T00:00:00Z',
        })
        .reply(200, MOCK_RATE_HISTORY_RESPONSE);

      const result = await service.fetchRateHistory(MOCK_VAULT_ADDRESS, {
        chainId: 143,
        from: '2026-05-01T00:00:00Z',
        to: '2026-06-01T00:00:00Z',
      });
      expect(result).toStrictEqual(MOCK_RATE_HISTORY_RESPONSE);
      service.destroy();
    });

    it('throws HttpError on non-2xx response', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate-history`)
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(404);

      await expect(
        service.fetchRateHistory(MOCK_VAULT_ADDRESS),
      ).rejects.toThrow(HttpError);
      service.destroy();
    });

    it('throws MoneyAccountApiResponseValidationError on malformed response', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate-history`)
        .once()
        .reply(200, { not: 'valid' });

      await expect(
        service.fetchRateHistory(MOCK_VAULT_ADDRESS),
      ).rejects.toThrow(MoneyAccountApiResponseValidationError);
      service.destroy();
    });

    it('is callable via messenger action', async () => {
      const { rootMessenger, service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate-history`)
        .reply(200, MOCK_RATE_HISTORY_RESPONSE);

      const result = await rootMessenger.call(
        'MoneyAccountApiDataService:fetchRateHistory',
        MOCK_VAULT_ADDRESS,
      );
      expect(result).toStrictEqual(MOCK_RATE_HISTORY_RESPONSE);
      service.destroy();
    });
  });

  describe('tracing', () => {
    let mockTrace: jest.Mock<MoneyAccountApiDataServiceTraceCallback>;

    beforeEach(() => {
      mockTrace = jest.fn().mockResolvedValue(undefined);
    });

    it('emits a trace for fetchPositions on cache miss', async () => {
      const { service } = createService(Env.DEV, { trace: mockTrace });

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, MOCK_POSITION_RESPONSE);

      await service.fetchPositions(MOCK_ADDRESS);

      expect(mockTrace).toHaveBeenCalledTimes(1);
      const [request] = mockTrace.mock.calls[0] as [
        MoneyAccountApiDataServiceTraceRequest,
        unknown,
      ];
      expect(request.name).toBe(TRACES.POSITIONS_API);
      expect(request.data).toStrictEqual(
        expect.objectContaining({
          operation: 'fetchPositions',
          success: true,
        }),
      );
      expect(request.startTime).toStrictEqual(expect.any(Number));
      service.destroy();
    });

    it('emits a trace for fetchInterest on cache miss', async () => {
      const { service } = createService(Env.DEV, { trace: mockTrace });

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/interest`)
        .query({ vault_address: MOCK_VAULT_ADDRESS, window: '7d' })
        .reply(200, MOCK_INTEREST_RESPONSE);

      await service.fetchInterest(MOCK_ADDRESS, {
        vaultAddress: MOCK_VAULT_ADDRESS,
        window: '7d',
      });

      expect(mockTrace).toHaveBeenCalledTimes(1);
      const [request] = mockTrace.mock.calls[0] as [
        MoneyAccountApiDataServiceTraceRequest,
        unknown,
      ];
      expect(request.name).toBe(TRACES.INTEREST_API);
      expect(request.data).toStrictEqual(
        expect.objectContaining({
          operation: 'fetchInterest',
          success: true,
        }),
      );
      service.destroy();
    });

    it('emits a trace for fetchHistory on cache miss', async () => {
      const { service } = createService(Env.DEV, { trace: mockTrace });

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/history`)
        .reply(200, MOCK_HISTORY_RESPONSE);

      await service.fetchHistory(MOCK_ADDRESS);

      expect(mockTrace).toHaveBeenCalledTimes(1);
      const [request] = mockTrace.mock.calls[0] as [
        MoneyAccountApiDataServiceTraceRequest,
        unknown,
      ];
      expect(request.name).toBe(TRACES.HISTORY_API);
      expect(request.data).toStrictEqual(
        expect.objectContaining({
          operation: 'fetchHistory',
          success: true,
        }),
      );
      service.destroy();
    });

    it('emits a trace for fetchRateHistory on cache miss', async () => {
      const { service } = createService(Env.DEV, { trace: mockTrace });

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate-history`)
        .reply(200, MOCK_RATE_HISTORY_RESPONSE);

      await service.fetchRateHistory(MOCK_VAULT_ADDRESS);

      expect(mockTrace).toHaveBeenCalledTimes(1);
      const [request] = mockTrace.mock.calls[0] as [
        MoneyAccountApiDataServiceTraceRequest,
        unknown,
      ];
      expect(request.name).toBe(TRACES.RATE_HISTORY_API);
      expect(request.data).toStrictEqual(
        expect.objectContaining({
          operation: 'fetchRateHistory',
          success: true,
        }),
      );
      service.destroy();
    });

    it('does not emit a trace on cache hit', async () => {
      const { service } = createService(Env.DEV, { trace: mockTrace });

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .once()
        .reply(200, MOCK_POSITION_RESPONSE);

      await service.fetchPositions(MOCK_ADDRESS);
      mockTrace.mockClear();

      await service.fetchPositions(MOCK_ADDRESS);
      expect(mockTrace).not.toHaveBeenCalled();
      service.destroy();
    });

    it('records success: false and errorName on failed request', async () => {
      const { service } = createService(Env.DEV, { trace: mockTrace });

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);

      await expect(service.fetchPositions(MOCK_ADDRESS)).rejects.toThrow(
        HttpError,
      );

      expect(mockTrace).toHaveBeenCalled();
      const lastCall = mockTrace.mock.calls[
        mockTrace.mock.calls.length - 1
      ] as [MoneyAccountApiDataServiceTraceRequest, unknown];
      expect(lastCall[0].data).toStrictEqual(
        expect.objectContaining({
          success: false,
          errorName: expect.any(String),
        }),
      );
      service.destroy();
    });

    it('traces non-Error rejections with the thrown value type', async () => {
      const { service } = createService(Env.DEV, { trace: mockTrace });
      jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue('network down' as never);

      await expect(service.fetchPositions(MOCK_ADDRESS)).rejects.toBe(
        'network down',
      );

      expect(mockTrace).toHaveBeenCalled();
      const lastCall = mockTrace.mock.calls[
        mockTrace.mock.calls.length - 1
      ] as [MoneyAccountApiDataServiceTraceRequest, unknown];
      expect(lastCall[0].data).toStrictEqual(
        expect.objectContaining({
          success: false,
          errorName: 'string',
        }),
      );
      jest.restoreAllMocks();
      service.destroy();
    });

    it('does not break the request when trace callback throws synchronously', async () => {
      const throwingTrace = jest.fn().mockImplementation(() => {
        throw new Error('trace sync failure');
      }) as unknown as MoneyAccountApiDataServiceTraceCallback;

      const { service } = createService(Env.DEV, { trace: throwingTrace });

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, MOCK_POSITION_RESPONSE);

      const result = await service.fetchPositions(MOCK_ADDRESS);
      expect(result).toStrictEqual(MOCK_POSITION_RESPONSE);
      service.destroy();
    });

    it('does not break the request when trace callback rejects', async () => {
      const rejectingTrace = jest
        .fn()
        .mockRejectedValue(
          new Error('trace async failure'),
        ) as unknown as MoneyAccountApiDataServiceTraceCallback;

      const { service } = createService(Env.DEV, { trace: rejectingTrace });

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, MOCK_POSITION_RESPONSE);

      const result = await service.fetchPositions(MOCK_ADDRESS);
      expect(result).toStrictEqual(MOCK_POSITION_RESPONSE);
      service.destroy();
    });
  });

  describe('invalidateQueries', () => {
    it('invalidates cached queries', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .twice()
        .reply(200, MOCK_POSITION_RESPONSE);

      await service.fetchPositions(MOCK_ADDRESS);
      await service.invalidateQueries();
      const result = await service.fetchPositions(MOCK_ADDRESS);
      expect(result).toStrictEqual(MOCK_POSITION_RESPONSE);
      service.destroy();
    });

    it('is callable via messenger action', async () => {
      const { rootMessenger, service } = createService(Env.DEV);

      const result = await rootMessenger.call(
        'MoneyAccountApiDataService:invalidateQueries',
      );
      expect(result).toBeUndefined();
      service.destroy();
    });
  });

  describe('destroy', () => {
    it('cleans up messenger subscriptions', () => {
      const { service } = createService(Env.DEV);
      expect(() => service.destroy()).not.toThrow();
    });
  });
});

describe('MoneyAccountApiResponseValidationError', () => {
  it('uses default message when none provided', () => {
    const error = new MoneyAccountApiResponseValidationError();
    expect(error.message).toBe(
      'MoneyAccountApiDataService: malformed response received from Money Account API',
    );
    expect(error.name).toBe('MoneyAccountApiResponseValidationError');
  });

  it('uses custom message when provided', () => {
    const error = new MoneyAccountApiResponseValidationError('custom message');
    expect(error.message).toBe('custom message');
    expect(error.name).toBe('MoneyAccountApiResponseValidationError');
  });
});
