import { DEFAULT_MAX_RETRIES, HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

import { Env, MONEY_ACCOUNT_API_URL_MAP } from './constants.js';
import {
  MoneyAccountApiHttpError,
  MoneyAccountApiResponseValidationError,
  REDACTED_ADDRESS,
} from './errors.js';
import type {
  MoneyAccountApiDataServiceMessenger,
  MoneyAccountApiDataServiceTraceCallback,
  MoneyAccountApiDataServiceTraceRequest,
} from './money-account-api-data-service.js';
import {
  MoneyAccountApiDataService,
  serviceName,
  TRACES,
} from './money-account-api-data-service.js';

// ============================================================
// Fixtures
// ============================================================

const MOCK_ADDRESS = '0x1111111111111111111111111111111111111111';
const MOCK_VAULT_ADDRESS = '0x2222222222222222222222222222222222222222';

const MOCK_POSITION_BALANCE = {
  musd_balance: '2',
  vmusd_value_in_musd: '1513527',
  total_balance: '1513529',
  by_asset: [
    {
      asset_contract_address: '0xaca92e438df0b2401ff60da7e4337b687a2435da',
      asset_symbol: 'mUSD',
      asset_decimals: 6,
      wallet_balance: '2',
      vault_value: '1513527',
      total: '1513529',
      total_usd: '1.51',
    },
  ],
  total_balance_usd: '1.51',
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
      chain_id: 143,
      vault_key: 'standard',
      name: 'Money Account mUSD Vault',
      asset_symbol: 'mUSD',
      asset_decimals: 6,
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

const MOCK_VAULT_RATE_RESPONSE = {
  vault_address: MOCK_VAULT_ADDRESS,
  chain_id: 143,
  rate: '1.052340000000000000',
  timestamp: '2026-05-10T12:34:56Z',
  as_of_block: 21455123,
  as_of_timestamp: '2026-05-10T12:34:56Z',
  data_freshness: 'live' as const,
  indexer_lag_seconds: 4,
};

const MOCK_SIWE_NONCE = 'a'.repeat(64);
const MOCK_SIWE_OTHER_ADDRESS = '0x3333333333333333333333333333333333333333';
const MOCK_SIWE_ISSUED_AT = Date.parse('2026-10-22T12:00:00.000Z');
const MOCK_SIWE_DOMAIN = new URL(MONEY_ACCOUNT_API_URL_MAP[Env.DEV]).host;
const MOCK_SIWE_CHALLENGE_TTL_MS = 300_000;

// Hand-written copy of the Money Account API's SIWE template.
//
// Deliberately independent of the production builder so these tests catch a
// divergence in the service's validation.
function createMockSiweMessage({
  address = MOCK_ADDRESS,
  nonce = MOCK_SIWE_NONCE,
  domain = MOCK_SIWE_DOMAIN,
  uri = `https://${MOCK_SIWE_DOMAIN}`,
  statement = 'Sign in to view your VBA transfers.',
  version = '1',
  chainId = '143',
  issuedAt = Date.now(),
  expirationTime = issuedAt + MOCK_SIWE_CHALLENGE_TTL_MS,
  extraLines = [],
}: {
  address?: string;
  nonce?: string;
  domain?: string;
  uri?: string;
  statement?: string;
  version?: string;
  chainId?: string;
  issuedAt?: number;
  expirationTime?: number;
  extraLines?: string[];
} = {}): string {
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    statement,
    '',
    `URI: ${uri}`,
    `Version: ${version}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(issuedAt).toISOString()}`,
    `Expiration Time: ${new Date(expirationTime).toISOString()}`,
    ...extraLines,
  ].join('\n');
}

function createMockSiweChallenge(
  overrides: Parameters<typeof createMockSiweMessage>[0] = {},
): { nonce: string; message: string } {
  return {
    nonce: overrides.nonce ?? MOCK_SIWE_NONCE,
    message: createMockSiweMessage(overrides),
  };
}

const MOCK_SIWE_SESSION = {
  token_type: 'bearer' as const,
  access_token: 'siwe-session-token',
  expires_in: 900,
};
const MOCK_VBA_TRANSFERS_RESPONSE = {
  transfers: [
    {
      event_id: 'f22ba628-4ab6-4a01-8d08-ff5de0ca2334',
      transfer_id: 'e4f31eb4-da3a-4776-b70e-856a88492a17',
      status: 'processing' as const,
      event_timestamp: '2026-10-21T14:59:26.769Z',
      updated_at: '2026-10-22T12:00:00.000Z',
      transfer: {
        sender_address: null,
        recipient_address: MOCK_ADDRESS,
        network: 'Ethereum',
        amount: '1000.000000',
        asset: 'USDC',
        transaction_hash: null,
      },
    },
  ],
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
    getBearerToken,
    signPersonalMessage,
  }: {
    trace?: MoneyAccountApiDataServiceTraceCallback;
    getBearerToken?: () => Promise<string>;
    signPersonalMessage?: (messageParams: {
      data: string;
      from: string;
    }) => Promise<string>;
  } = {},
): {
  service: MoneyAccountApiDataService;
  rootMessenger: RootMessenger;
  messenger: MoneyAccountApiDataServiceMessenger;
} {
  const rootMessenger = createRootMessenger();
  const messenger = createServiceMessenger(rootMessenger);
  if (getBearerToken) {
    rootMessenger.registerActionHandler(
      'AuthenticationController:getBearerToken',
      getBearerToken,
    );
  }
  if (signPersonalMessage) {
    rootMessenger.registerActionHandler(
      'KeyringController:signPersonalMessage',
      signPersonalMessage,
    );
  }
  rootMessenger.delegate({
    messenger,
    actions: [
      'AuthenticationController:getBearerToken',
      'KeyringController:signPersonalMessage',
    ],
    events: [],
  });
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
    nock.cleanAll();
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

  describe('authentication headers', () => {
    it('attaches the profile bearer token to every API request', async () => {
      const getBearerToken = vi.fn().mockResolvedValue('jwt-token');
      const { service } = createService(Env.DEV, { getBearerToken });
      const requestHeaders = {
        reqheaders: { authorization: 'Bearer jwt-token' },
      };

      const positionsScope = nock(
        MONEY_ACCOUNT_API_URL_MAP[Env.DEV],
        requestHeaders,
      )
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, MOCK_POSITION_RESPONSE);
      const interestScope = nock(
        MONEY_ACCOUNT_API_URL_MAP[Env.DEV],
        requestHeaders,
      )
        .get(`/v1/positions/${MOCK_ADDRESS}/interest`)
        .query({
          vault_address: MOCK_VAULT_ADDRESS,
          window: '7d',
        })
        .reply(200, MOCK_INTEREST_RESPONSE);
      const historyScope = nock(
        MONEY_ACCOUNT_API_URL_MAP[Env.DEV],
        requestHeaders,
      )
        .get(`/v1/positions/${MOCK_ADDRESS}/history`)
        .reply(200, MOCK_HISTORY_RESPONSE);
      const rateHistoryScope = nock(
        MONEY_ACCOUNT_API_URL_MAP[Env.DEV],
        requestHeaders,
      )
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate-history`)
        .reply(200, MOCK_RATE_HISTORY_RESPONSE);
      const vaultRateScope = nock(
        MONEY_ACCOUNT_API_URL_MAP[Env.DEV],
        requestHeaders,
      )
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate`)
        .reply(200, MOCK_VAULT_RATE_RESPONSE);

      await service.fetchPositions(MOCK_ADDRESS);
      await service.fetchInterest(MOCK_ADDRESS, {
        vaultAddress: MOCK_VAULT_ADDRESS,
        window: '7d',
      });
      await service.fetchHistory(MOCK_ADDRESS);
      await service.fetchRateHistory(MOCK_VAULT_ADDRESS);
      await service.fetchVaultRate(MOCK_VAULT_ADDRESS);

      expect(getBearerToken).toHaveBeenCalledTimes(5);
      positionsScope.done();
      interestScope.done();
      historyScope.done();
      rateHistoryScope.done();
      vaultRateScope.done();
      service.destroy();
    });

    it('proceeds unauthenticated when token retrieval fails', async () => {
      const { service } = createService(Env.DEV, {
        getBearerToken: async () => {
          throw new Error('wallet is locked');
        },
      });
      const scope = nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        badheaders: ['authorization'],
      })
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, MOCK_POSITION_RESPONSE);

      const result = await service.fetchPositions(MOCK_ADDRESS);

      expect(result).toStrictEqual(MOCK_POSITION_RESPONSE);
      scope.done();
      service.destroy();
    });

    it('omits the authorization header when the token is empty', async () => {
      const { service } = createService(Env.DEV, {
        getBearerToken: async () => '',
      });
      const scope = nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        badheaders: ['authorization'],
      })
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, MOCK_POSITION_RESPONSE);

      const result = await service.fetchPositions(MOCK_ADDRESS);

      expect(result).toStrictEqual(MOCK_POSITION_RESPONSE);
      scope.done();
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

    it('sends Cache-Control: no-cache and invalidates the cached result when fresh', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, MOCK_POSITION_RESPONSE);

      await service.fetchPositions(MOCK_ADDRESS);

      const refreshed = {
        ...MOCK_POSITION_RESPONSE,
        as_of_block: 99999,
        balance: {
          ...MOCK_POSITION_BALANCE,
          musd_balance: '99',
          total_balance: '1513626',
        },
      };

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .matchHeader('cache-control', 'no-cache')
        .reply(200, refreshed);

      const freshResult = await service.fetchPositions(MOCK_ADDRESS, {
        fresh: true,
      });
      expect(freshResult.as_of_block).toBe(99999);
      expect(freshResult.balance?.musd_balance).toBe('99');

      // The fresh result is invalidated after it is returned, so the next
      // steady-state read must hit the network again rather than serve a
      // pre-transaction body.
      const afterFresh = {
        ...MOCK_POSITION_RESPONSE,
        as_of_block: 100000,
      };
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, afterFresh);

      const steadyState = await service.fetchPositions(MOCK_ADDRESS);
      expect(steadyState.as_of_block).toBe(100000);
      service.destroy();
    });

    it('retries a fresh fetchPositions request using the service policy', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .matchHeader('cache-control', 'no-cache')
        .reply(500);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .matchHeader('cache-control', 'no-cache')
        .reply(200, MOCK_POSITION_RESPONSE);

      const result = await service.fetchPositions(MOCK_ADDRESS, {
        fresh: true,
      });

      expect(result).toStrictEqual(MOCK_POSITION_RESPONSE);
      service.destroy();
    });

    it('throws HttpError after exhausting retries on a fresh fetchPositions request', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .matchHeader('cache-control', 'no-cache')
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(500);

      await expect(
        service.fetchPositions(MOCK_ADDRESS, { fresh: true }),
      ).rejects.toThrow(HttpError);
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

    it('does not retry an authorization failure', async () => {
      const { service } = createService(Env.DEV);
      const scope = nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .once()
        .reply(403);

      await expect(service.fetchPositions(MOCK_ADDRESS)).rejects.toThrow(
        HttpError,
      );

      scope.done();
      service.destroy();
    });

    it('retries a rate-limit response', async () => {
      const { service } = createService(Env.DEV);
      const scope = nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(429);

      await expect(service.fetchPositions(MOCK_ADDRESS)).rejects.toThrow(
        HttpError,
      );

      scope.done();
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

    it('accepts a null effective_apy when invested history is too short', async () => {
      const { service } = createService(Env.DEV);
      const response = {
        ...MOCK_POSITION_RESPONSE,
        positions: [
          {
            ...MOCK_POSITION_RESPONSE.positions[0],
            effective_apy: null,
          },
        ],
      };

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, response);

      const result = await service.fetchPositions(MOCK_ADDRESS);
      expect(result.positions[0]?.effective_apy).toBeNull();
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

    it('includes the redacted response body and diagnostic headers on non-2xx responses', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/interest`)
        .query({
          vault_address: MOCK_VAULT_ADDRESS,
          window: 'since_inception',
        })
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(
          400,
          {
            message: `'${MOCK_ADDRESS}' is an invalid address`,
            error: 'Bad Request',
            statusCode: 400,
          },
          { 'X-Amzn-Trace-Id': 'Root=1-abc' },
        );

      const error = await service
        .fetchInterest(MOCK_ADDRESS, {
          vaultAddress: MOCK_VAULT_ADDRESS,
          window: 'since_inception',
        })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(MoneyAccountApiHttpError);
      expect(error).toMatchObject({
        httpStatus: 400,
        responseBody: JSON.stringify({
          message: `'${REDACTED_ADDRESS}' is an invalid address`,
          error: 'Bad Request',
          statusCode: 400,
        }),
        responseHeaders: {
          'content-type': 'application/json',
          'x-amzn-trace-id': 'Root=1-abc',
        },
      });
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

  describe('fetchVaultRate', () => {
    const mixedCaseVaultAddress = '0xAbCd222222222222222222222222222222222222';

    it('returns the current rate and lowercases the vault address', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${mixedCaseVaultAddress.toLowerCase()}/rate`)
        .query({})
        .reply(200, {
          ...MOCK_VAULT_RATE_RESPONSE,
          vault_address: mixedCaseVaultAddress.toLowerCase(),
        });

      const result = await service.fetchVaultRate(mixedCaseVaultAddress);
      expect(result).toStrictEqual({
        ...MOCK_VAULT_RATE_RESPONSE,
        vault_address: mixedCaseVaultAddress.toLowerCase(),
      });
      service.destroy();
    });

    it('sends chain_id only when provided', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate`)
        .query({ chain_id: '143' })
        .reply(200, MOCK_VAULT_RATE_RESPONSE);

      const result = await service.fetchVaultRate(MOCK_VAULT_ADDRESS, {
        chainId: 143,
      });
      expect(result).toStrictEqual(MOCK_VAULT_RATE_RESPONSE);
      service.destroy();
    });

    it('attaches the profile bearer token', async () => {
      const getBearerToken = vi.fn().mockResolvedValue('jwt-token');
      const { service } = createService(Env.DEV, { getBearerToken });
      const scope = nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer jwt-token' },
      })
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate`)
        .reply(200, MOCK_VAULT_RATE_RESPONSE);

      const result = await service.fetchVaultRate(MOCK_VAULT_ADDRESS);

      expect(result).toStrictEqual(MOCK_VAULT_RATE_RESPONSE);
      expect(getBearerToken).toHaveBeenCalledTimes(1);
      scope.done();
      service.destroy();
    });

    it('omits the authorization header when token retrieval fails', async () => {
      const { service } = createService(Env.DEV, {
        getBearerToken: async () => {
          throw new Error('wallet is locked');
        },
      });
      const scope = nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        badheaders: ['authorization'],
      })
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate`)
        .reply(200, MOCK_VAULT_RATE_RESPONSE);

      const result = await service.fetchVaultRate(MOCK_VAULT_ADDRESS);

      expect(result).toStrictEqual(MOCK_VAULT_RATE_RESPONSE);
      scope.done();
      service.destroy();
    });

    it('caches and deduplicates requests within the stale time, keyed by chain id', async () => {
      const { service } = createService(Env.DEV);
      const otherChainResponse = {
        ...MOCK_VAULT_RATE_RESPONSE,
        chain_id: 1,
      };

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate`)
        .query({})
        .once()
        .reply(200, MOCK_VAULT_RATE_RESPONSE);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate`)
        .query({ chain_id: '1' })
        .once()
        .reply(200, otherChainResponse);

      const [first, second] = await Promise.all([
        service.fetchVaultRate(MOCK_VAULT_ADDRESS),
        service.fetchVaultRate(MOCK_VAULT_ADDRESS),
      ]);
      const cached = await service.fetchVaultRate(MOCK_VAULT_ADDRESS);
      const otherChain = await service.fetchVaultRate(MOCK_VAULT_ADDRESS, {
        chainId: 1,
      });
      const cachedOtherChain = await service.fetchVaultRate(
        MOCK_VAULT_ADDRESS,
        { chainId: 1 },
      );

      expect(first).toStrictEqual(MOCK_VAULT_RATE_RESPONSE);
      expect(second).toStrictEqual(MOCK_VAULT_RATE_RESPONSE);
      expect(cached).toStrictEqual(MOCK_VAULT_RATE_RESPONSE);
      expect(otherChain).toStrictEqual(otherChainResponse);
      expect(cachedOtherChain).toStrictEqual(otherChainResponse);
      expect(nock.isDone()).toBe(true);
      service.destroy();
    });

    it('throws HttpError on a 404 response', async () => {
      const { service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate`)
        .times(DEFAULT_MAX_RETRIES + 1)
        .reply(404);

      const error: unknown = await service
        .fetchVaultRate(MOCK_VAULT_ADDRESS)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(HttpError);
      expect(error).toMatchObject({ httpStatus: 404 });
      service.destroy();
    });

    it('throws MoneyAccountApiResponseValidationError on a malformed response without retrying', async () => {
      const { service } = createService(Env.DEV);
      const scope = nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate`)
        .once()
        .reply(200, { not: 'valid' });

      await expect(service.fetchVaultRate(MOCK_VAULT_ADDRESS)).rejects.toThrow(
        MoneyAccountApiResponseValidationError,
      );
      scope.done();
      service.destroy();
    });

    it('is callable via messenger action', async () => {
      const { rootMessenger, service } = createService(Env.DEV);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate`)
        .query({ chain_id: '143' })
        .reply(200, MOCK_VAULT_RATE_RESPONSE);

      const result = await rootMessenger.call(
        'MoneyAccountApiDataService:fetchVaultRate',
        MOCK_VAULT_ADDRESS,
        { chainId: 143 },
      );
      expect(result).toStrictEqual(MOCK_VAULT_RATE_RESPONSE);
      service.destroy();
    });
  });

  describe('tracing', () => {
    let mockTrace: Mock<MoneyAccountApiDataServiceTraceCallback>;

    beforeEach(() => {
      mockTrace = vi.fn().mockResolvedValue(undefined);
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

    it('emits a trace for fetchVaultRate on cache miss', async () => {
      const { service } = createService(Env.DEV, { trace: mockTrace });

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate`)
        .reply(200, MOCK_VAULT_RATE_RESPONSE);

      await service.fetchVaultRate(MOCK_VAULT_ADDRESS);

      expect(mockTrace).toHaveBeenCalledTimes(1);
      const [request] = mockTrace.mock.calls[0] as [
        MoneyAccountApiDataServiceTraceRequest,
        unknown,
      ];
      expect(request.name).toBe(TRACES.VAULT_RATE_API);
      expect(request.name).toBe('Money Account API Fetch Vault Rate');
      expect(request.data).toStrictEqual(
        expect.objectContaining({
          operation: 'fetchVaultRate',
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
      vi.spyOn(globalThis, 'fetch').mockRejectedValue('network down');

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
      vi.restoreAllMocks();
      service.destroy();
    });

    it('does not break the request when trace callback throws synchronously', async () => {
      const throwingTrace = vi.fn().mockImplementation(() => {
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
      const rejectingTrace = vi
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

  describe('additive API fields', () => {
    it('accepts unknown fields on positions responses without stripping them', async () => {
      const { service } = createService(Env.DEV);
      const responseWithExtras = {
        ...MOCK_POSITION_RESPONSE,
        future_top_level: 'ok',
        balance: {
          ...MOCK_POSITION_RESPONSE.balance,
          future_balance_field: 1,
          by_asset: [
            {
              ...MOCK_POSITION_RESPONSE.balance.by_asset[0],
              future_asset_field: true,
            },
          ],
        },
        positions: [
          {
            ...MOCK_POSITION_RESPONSE.positions[0],
            future_position_field: 'premium',
          },
        ],
      };

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}`)
        .reply(200, responseWithExtras);

      const result = await service.fetchPositions(MOCK_ADDRESS);
      expect(result).toStrictEqual(responseWithExtras);
      service.destroy();
    });

    it('accepts unknown fields on interest responses without stripping them', async () => {
      const { service } = createService(Env.DEV);
      const responseWithExtras = {
        ...MOCK_INTEREST_RESPONSE,
        future_interest_field: 'ok',
      };

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/interest`)
        .query({
          vault_address: MOCK_VAULT_ADDRESS,
          window: '7d',
        })
        .reply(200, responseWithExtras);

      const result = await service.fetchInterest(MOCK_ADDRESS, {
        vaultAddress: MOCK_VAULT_ADDRESS,
        window: '7d',
      });
      expect(result).toStrictEqual(responseWithExtras);
      service.destroy();
    });

    it('accepts unknown fields on history responses without stripping them', async () => {
      const { service } = createService(Env.DEV);
      const responseWithExtras = {
        ...MOCK_HISTORY_RESPONSE,
        future_history_field: 'ok',
        cash_flows: [
          {
            ...MOCK_HISTORY_RESPONSE.cash_flows[0],
            future_cash_flow_field: 42,
          },
        ],
      };

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/positions/${MOCK_ADDRESS}/history`)
        .reply(200, responseWithExtras);

      const result = await service.fetchHistory(MOCK_ADDRESS);
      expect(result).toStrictEqual(responseWithExtras);
      service.destroy();
    });

    it('accepts unknown fields on rate-history responses without stripping them', async () => {
      const { service } = createService(Env.DEV);
      const responseWithExtras = {
        ...MOCK_RATE_HISTORY_RESPONSE,
        future_rate_history_field: 'ok',
        rates: [
          {
            ...MOCK_RATE_HISTORY_RESPONSE.rates[0],
            future_rate_entry_field: true,
          },
          MOCK_RATE_HISTORY_RESPONSE.rates[1],
        ],
      };

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate-history`)
        .reply(200, responseWithExtras);

      const result = await service.fetchRateHistory(MOCK_VAULT_ADDRESS);
      expect(result).toStrictEqual(responseWithExtras);
      service.destroy();
    });

    it('accepts unknown fields on vault-rate responses without stripping them', async () => {
      const { service } = createService(Env.DEV);
      const responseWithExtras = {
        ...MOCK_VAULT_RATE_RESPONSE,
        future_vault_rate_field: 'ok',
      };

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get(`/v1/vaults/${MOCK_VAULT_ADDRESS}/rate`)
        .reply(200, responseWithExtras);

      const result = await service.fetchVaultRate(MOCK_VAULT_ADDRESS);
      expect(result).toStrictEqual(responseWithExtras);
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

  describe('fetchVbaTransfers', () => {
    beforeEach(() => {
      vi.spyOn(Date, 'now').mockReturnValue(MOCK_SIWE_ISSUED_AT);
    });

    function mockSiweAuthentication(
      address: string,
      token: string,
      signPersonalMessage: ReturnType<typeof vi.fn>,
      issuedAt: number = Date.now(),
    ): string {
      const challenge = createMockSiweChallenge({ address, issuedAt });
      const { message } = challenge;
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/challenge', { address })
        .reply(200, challenge);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/verify', {
          message,
          signature: '0xsignature',
        })
        .reply(200, { ...MOCK_SIWE_SESSION, access_token: token });
      signPersonalMessage.mockResolvedValue('0xsignature');
      return message;
    }

    // Registers a challenge that fails the client-side SIWE validation.
    function mockInvalidSiweChallenge(
      overrides: Parameters<typeof createMockSiweMessage>[0],
    ): ReturnType<typeof nock> {
      return nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/challenge', { address: MOCK_ADDRESS })
        .reply(200, createMockSiweChallenge(overrides));
    }

    it('authenticates with the exact SIWE challenge and returns current transfers', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      const message = mockSiweAuthentication(
        MOCK_ADDRESS,
        'token-1',
        signPersonalMessage,
      );
      const transfersScope = nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer token-1' },
      })
        .get('/v1/vba/transfers')
        .reply(200, MOCK_VBA_TRANSFERS_RESPONSE);

      expect(
        await service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).toStrictEqual(MOCK_VBA_TRANSFERS_RESPONSE);
      expect(signPersonalMessage).toHaveBeenCalledWith({
        data: message,
        from: MOCK_ADDRESS,
      });
      transfersScope.done();
      service.destroy();
    });

    const templateMismatchCases: [
      string,
      Parameters<typeof createMockSiweMessage>[0],
    ][] = [
      ['a wrong address', { address: MOCK_SIWE_OTHER_ADDRESS }],
      ['a wrong domain', { domain: 'evil.example' }],
      ['a wrong URI', { uri: 'https://evil.example' }],
      ['a wrong statement', { statement: 'Sign in to move your money.' }],
      ['a wrong chain ID', { chainId: '1' }],
      ['a wrong version', { version: '2' }],
    ];

    it.each(templateMismatchCases)(
      'rejects a challenge with %s before signing',
      async (_label, overrides) => {
        const signPersonalMessage = vi.fn();
        const { service } = createService(Env.DEV, { signPersonalMessage });
        const challengeScope = mockInvalidSiweChallenge(overrides);

        await expect(
          service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
        ).rejects.toBeInstanceOf(MoneyAccountApiResponseValidationError);
        expect(signPersonalMessage).not.toHaveBeenCalled();
        challengeScope.done();
        expect(nock.pendingMocks()).toHaveLength(0);
        service.destroy();
      },
    );

    const malformedFieldCases: [
      string,
      Parameters<typeof createMockSiweMessage>[0],
    ][] = [
      ['an extra field', { extraLines: ['Resources: https://evil.example'] }],
      [
        'a shifted expiration time',
        {
          expirationTime:
            MOCK_SIWE_ISSUED_AT + MOCK_SIWE_CHALLENGE_TTL_MS + 1000,
        },
      ],
    ];

    it.each(malformedFieldCases)(
      'rejects a challenge with %s before signing',
      async (_label, overrides) => {
        const signPersonalMessage = vi.fn();
        const { service } = createService(Env.DEV, { signPersonalMessage });
        const challengeScope = mockInvalidSiweChallenge(overrides);

        await expect(
          service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
        ).rejects.toBeInstanceOf(MoneyAccountApiResponseValidationError);
        expect(signPersonalMessage).not.toHaveBeenCalled();
        challengeScope.done();
        service.destroy();
      },
    );

    it('rejects a challenge whose message nonce differs from the challenge nonce', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      const challengeScope = nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/challenge', { address: MOCK_ADDRESS })
        .reply(200, {
          nonce: 'b'.repeat(64),
          message: createMockSiweMessage(),
        });

      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toBeInstanceOf(MoneyAccountApiResponseValidationError);
      expect(signPersonalMessage).not.toHaveBeenCalled();
      challengeScope.done();
      service.destroy();
    });

    it('rejects a challenge with a nonce that is not 64 lowercase hex characters', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      const challengeScope = mockInvalidSiweChallenge({
        nonce: 'a'.repeat(63),
      });

      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toBeInstanceOf(MoneyAccountApiResponseValidationError);
      expect(signPersonalMessage).not.toHaveBeenCalled();
      challengeScope.done();
      service.destroy();
    });

    it('rejects an expired challenge before signing', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      const challengeScope = mockInvalidSiweChallenge({
        issuedAt: MOCK_SIWE_ISSUED_AT - MOCK_SIWE_CHALLENGE_TTL_MS,
      });

      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toBeInstanceOf(MoneyAccountApiResponseValidationError);
      expect(signPersonalMessage).not.toHaveBeenCalled();
      challengeScope.done();
      service.destroy();
    });

    it('rejects a challenge issued beyond the clock-skew allowance', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      const challengeScope = mockInvalidSiweChallenge({
        issuedAt: MOCK_SIWE_ISSUED_AT + 60_001,
      });

      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toBeInstanceOf(MoneyAccountApiResponseValidationError);
      expect(signPersonalMessage).not.toHaveBeenCalled();
      challengeScope.done();
      service.destroy();
    });

    it('accepts a challenge issued within the clock-skew allowance', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      mockSiweAuthentication(
        MOCK_ADDRESS,
        'skew-token',
        signPersonalMessage,
        MOCK_SIWE_ISSUED_AT + 60_000,
      );
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer skew-token' },
      })
        .get('/v1/vba/transfers')
        .reply(200, { transfers: [] });

      expect(
        await service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).toStrictEqual({ transfers: [] });
      expect(signPersonalMessage).toHaveBeenCalledTimes(1);
      service.destroy();
    });

    it('does not retry an invalid challenge through the service policy', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      const challengeScope = mockInvalidSiweChallenge({
        statement: 'Sign in to move your money.',
      });

      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toBeInstanceOf(MoneyAccountApiResponseValidationError);
      expect(signPersonalMessage).not.toHaveBeenCalled();
      challengeScope.done();
      expect(nock.pendingMocks()).toHaveLength(0);
      service.destroy();
    });

    it('does not retry a rejected SIWE signature through the service policy', async () => {
      const signPersonalMessage = vi
        .fn()
        .mockRejectedValue(new Error('user rejected signature'));
      const { service } = createService(Env.DEV, { signPersonalMessage });
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/challenge')
        .reply(200, createMockSiweChallenge());

      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toMatchObject({
        name: 'SiweSigningError',
        cause: new Error('user rejected signature'),
      });
      expect(signPersonalMessage).toHaveBeenCalledTimes(1);
      service.destroy();
    });

    it('throws an HTTP error when the SIWE challenge request fails', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/challenge')
        .reply(401, 'challenge unavailable');

      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toMatchObject({ httpStatus: 401 });
      expect(signPersonalMessage).not.toHaveBeenCalled();
      service.destroy();
    });

    it('throws an HTTP error when SIWE verification fails', async () => {
      const signPersonalMessage = vi.fn().mockResolvedValue('0xsignature');
      const { service } = createService(Env.DEV, { signPersonalMessage });
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/challenge')
        .reply(200, createMockSiweChallenge());
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/verify')
        .reply(401, 'invalid signature');

      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toMatchObject({ httpStatus: 401 });
      service.destroy();
    });

    it('returns an empty list when the wallet has no transfers', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      mockSiweAuthentication(MOCK_ADDRESS, 'token-empty', signPersonalMessage);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer token-empty' },
      })
        .get('/v1/vba/transfers')
        .reply(200, { transfers: [] });

      expect(
        await service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).toStrictEqual({ transfers: [] });
      service.destroy();
    });

    it('reuses an unexpired session for the same wallet and lowercases its address', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      const mixedCaseAddress = MOCK_ADDRESS.toUpperCase().replace('0X', '0x');
      mockSiweAuthentication(MOCK_ADDRESS, 'token-1', signPersonalMessage);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer token-1' },
      })
        .get('/v1/vba/transfers')
        .twice()
        .reply(200, { transfers: [] });

      await service.fetchVbaTransfers({ address: mixedCaseAddress });
      await service.fetchVbaTransfers({ address: MOCK_ADDRESS });
      expect(signPersonalMessage).toHaveBeenCalledTimes(1);
      service.destroy();
    });

    it('renews an expired SIWE session', async () => {
      let now = MOCK_SIWE_ISSUED_AT;
      const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      mockSiweAuthentication(MOCK_ADDRESS, 'first-token', signPersonalMessage);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer first-token' },
      })
        .get('/v1/vba/transfers')
        .reply(200, { transfers: [] });

      await service.fetchVbaTransfers({ address: MOCK_ADDRESS });
      now += MOCK_SIWE_SESSION.expires_in * 1000 + 1;

      // The renewed challenge must be issued at the advanced clock, otherwise
      // the service rejects it as expired before signing.
      mockSiweAuthentication(MOCK_ADDRESS, 'second-token', signPersonalMessage);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer second-token' },
      })
        .get('/v1/vba/transfers')
        .reply(200, { transfers: [] });

      await service.fetchVbaTransfers({ address: MOCK_ADDRESS });

      expect(signPersonalMessage).toHaveBeenCalledTimes(2);
      expect(nock.pendingMocks()).toHaveLength(0);
      dateNowSpy.mockRestore();
      service.destroy();
    });

    it('keeps sessions scoped to each wallet', async () => {
      const otherAddress = '0x2222222222222222222222222222222222222222';
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      mockSiweAuthentication(MOCK_ADDRESS, 'token-a', signPersonalMessage);
      mockSiweAuthentication(otherAddress, 'token-b', signPersonalMessage);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer token-a' },
      })
        .get('/v1/vba/transfers')
        .reply(200, { transfers: [] });
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer token-b' },
      })
        .get('/v1/vba/transfers')
        .reply(200, { transfers: [] });

      await service.fetchVbaTransfers({ address: MOCK_ADDRESS });
      await service.fetchVbaTransfers({ address: otherAddress });
      expect(signPersonalMessage).toHaveBeenCalledTimes(2);
      service.destroy();
    });

    it('shares an in-flight SIWE challenge and signature for the same wallet', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/challenge')
        .delay(10)
        .reply(200, createMockSiweChallenge());
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/verify')
        .reply(200, MOCK_SIWE_SESSION);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer siwe-session-token' },
      })
        .get('/v1/vba/transfers')
        .twice()
        .reply(200, { transfers: [] });
      signPersonalMessage.mockImplementation(async () => {
        await Promise.resolve();
        return '0xsignature';
      });

      const first = service.fetchVbaTransfers({ address: MOCK_ADDRESS });
      const second = service.fetchVbaTransfers({ address: MOCK_ADDRESS });
      await vi.waitFor(() => {
        expect(signPersonalMessage).toHaveBeenCalledTimes(1);
      });
      const results = await Promise.all([first, second]);
      expect(results).toHaveLength(2);
      expect(signPersonalMessage).toHaveBeenCalledTimes(1);
      service.destroy();
    });

    it('settles the in-flight SIWE request before reusing the session', async () => {
      const signPersonalMessage = vi.fn().mockResolvedValue('0xsignature');
      const { service } = createService(Env.DEV, { signPersonalMessage });
      const message = mockSiweAuthentication(
        MOCK_ADDRESS,
        'first-token',
        signPersonalMessage,
      );
      const transfersScope = nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer first-token' },
      })
        .get('/v1/vba/transfers')
        .reply(200, { transfers: [] });

      const result = await service.fetchVbaTransfers({ address: MOCK_ADDRESS });

      expect(result).toStrictEqual({ transfers: [] });
      expect(signPersonalMessage).toHaveBeenCalledWith({
        data: message,
        from: MOCK_ADDRESS,
      });
      transfersScope.done();
      expect(nock.pendingMocks()).toHaveLength(0);
      service.destroy();
    });

    it('uses the cached session when another call starts after authentication completes', async () => {
      const signPersonalMessage = vi.fn().mockResolvedValue('0xsignature');
      const { service } = createService(Env.DEV, { signPersonalMessage });
      mockSiweAuthentication(MOCK_ADDRESS, 'cached-token', signPersonalMessage);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer cached-token' },
      })
        .get('/v1/vba/transfers')
        .thrice()
        .reply(200, { transfers: [] });

      await service.fetchVbaTransfers({ address: MOCK_ADDRESS });
      await service.fetchVbaTransfers({ address: MOCK_ADDRESS });
      expect(signPersonalMessage).toHaveBeenCalledTimes(1);
      await service.fetchVbaTransfers({ address: MOCK_ADDRESS });
      expect(nock.pendingMocks()).toHaveLength(0);
      service.destroy();
    });

    it('re-authenticates once and retries the read after a 401', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      mockSiweAuthentication(
        MOCK_ADDRESS,
        'expired-token',
        signPersonalMessage,
      );
      mockSiweAuthentication(
        MOCK_ADDRESS,
        'renewed-token',
        signPersonalMessage,
      );
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer expired-token' },
      })
        .get('/v1/vba/transfers')
        .reply(401);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer renewed-token' },
      })
        .get('/v1/vba/transfers')
        .reply(200, { transfers: [] });

      expect(
        await service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).toStrictEqual({ transfers: [] });
      expect(signPersonalMessage).toHaveBeenCalledTimes(2);
      service.destroy();
    });

    it('does not retry when the renewed session is rejected', async () => {
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      mockSiweAuthentication(
        MOCK_ADDRESS,
        'expired-token',
        signPersonalMessage,
      );
      mockSiweAuthentication(
        MOCK_ADDRESS,
        'renewed-token',
        signPersonalMessage,
      );
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get('/v1/vba/transfers')
        .reply(401);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .get('/v1/vba/transfers')
        .reply(401);

      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toMatchObject({ httpStatus: 401 });
      expect(signPersonalMessage).toHaveBeenCalledTimes(2);
      service.destroy();
    });

    it('rejects malformed challenge, session, and transfer responses', async () => {
      const signPersonalMessage = vi.fn().mockResolvedValue('0xsignature');
      const { service } = createService(Env.DEV, { signPersonalMessage });
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/challenge')
        .reply(200, { nonce: 'bad' });
      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toBeInstanceOf(MoneyAccountApiResponseValidationError);

      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/challenge')
        .reply(200, createMockSiweChallenge());
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV])
        .post('/v1/vba/auth/verify')
        .reply(200, { token_type: 'basic' });
      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toBeInstanceOf(MoneyAccountApiResponseValidationError);

      mockSiweAuthentication(
        MOCK_ADDRESS,
        'bad-response-token',
        signPersonalMessage,
      );
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer bad-response-token' },
      })
        .get('/v1/vba/transfers')
        .reply(200, { transfers: [{ status: 'invalid' }] });
      await expect(
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ).rejects.toBeInstanceOf(MoneyAccountApiResponseValidationError);
      service.destroy();
    });

    it('reuses an unexpired in-flight SIWE session for concurrent reads', async () => {
      const signPersonalMessage = vi.fn().mockResolvedValue('0xsignature');
      const { service } = createService(Env.DEV, { signPersonalMessage });
      mockSiweAuthentication(
        MOCK_ADDRESS,
        'concurrent-token',
        signPersonalMessage,
      );
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer concurrent-token' },
      })
        .get('/v1/vba/transfers')
        .twice()
        .reply(200, { transfers: [] });

      await Promise.all([
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
        service.fetchVbaTransfers({ address: MOCK_ADDRESS }),
      ]);
      expect(signPersonalMessage).toHaveBeenCalledTimes(1);
      service.destroy();
    });

    it('does not reuse cached transfer data across wallets', async () => {
      const otherAddress = '0x2222222222222222222222222222222222222222';
      const signPersonalMessage = vi.fn();
      const { service } = createService(Env.DEV, { signPersonalMessage });
      mockSiweAuthentication(MOCK_ADDRESS, 'token-a', signPersonalMessage);
      mockSiweAuthentication(otherAddress, 'token-b', signPersonalMessage);
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer token-a' },
      })
        .get('/v1/vba/transfers')
        .reply(200, {
          transfers: [
            {
              ...MOCK_VBA_TRANSFERS_RESPONSE.transfers[0],
              transfer: {
                ...MOCK_VBA_TRANSFERS_RESPONSE.transfers[0].transfer,
                recipient_address: MOCK_ADDRESS,
              },
            },
          ],
        });
      nock(MONEY_ACCOUNT_API_URL_MAP[Env.DEV], {
        reqheaders: { authorization: 'Bearer token-b' },
      })
        .get('/v1/vba/transfers')
        .reply(200, { transfers: [] });

      const first = await service.fetchVbaTransfers({ address: MOCK_ADDRESS });
      const second = await service.fetchVbaTransfers({ address: otherAddress });
      expect(first.transfers).toHaveLength(1);
      expect(second.transfers).toHaveLength(0);
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
