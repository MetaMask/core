import {
  BrokenCircuitError,
  ConstantBackoff,
} from '@metamask/base-data-service';
import type {
  CreateServicePolicyOptions,
  DataServiceQueryState,
} from '@metamask/base-data-service';
import { ApiPlatformClient } from '@metamask/core-backend';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountsApiBalancesService } from './accounts-api-balances-service.js';
import type { AccountsApiBalancesServiceMessenger } from './accounts-api-balances-service.js';

const BASE_URL = 'https://accounts.api.cx.metamask.io';

const ACCOUNT_A = 'eip155:0:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ACCOUNT_B = 'eip155:0:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const V6_RESPONSE = {
  unprocessedNetworks: ['eip155:999'],
  unprocessedIncludeAssetIds: [],
  balances: [
    {
      accountId: ACCOUNT_A,
      object: 'token',
      type: 'native',
      assetId: 'eip155:1/slip44:60',
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
      balance: '1.5',
    },
  ],
};

const V5_RESPONSE = {
  count: 1,
  unprocessedNetworks: [],
  balances: [
    {
      object: 'token',
      symbol: 'ETH',
      name: 'Ether',
      type: 'native',
      decimals: 18,
      assetId: 'eip155:1/slip44:60',
      balance: '2',
      accountId: ACCOUNT_A,
    },
  ],
};

const FAST_POLICY: CreateServicePolicyOptions = {
  backoff: new ConstantBackoff(0),
};

describe('AccountsApiBalancesService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('AccountsApiBalancesService:fetchBalances', () => {
    it('fetches v6 balances and validates the response', async () => {
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query({ accountIds: ACCOUNT_A })
        .reply(200, V6_RESPONSE);
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'AccountsApiBalancesService:fetchBalances',
        { version: 'v6', accountIds: [ACCOUNT_A] },
      );

      expect(result).toStrictEqual(V6_RESPONSE);
    });

    it('fetches v5 balances', async () => {
      nock(BASE_URL)
        .get('/v5/multiaccount/balances')
        .query({ accountIds: ACCOUNT_A })
        .reply(200, V5_RESPONSE);
      const { rootMessenger } = createService();

      const result = await rootMessenger.call(
        'AccountsApiBalancesService:fetchBalances',
        { version: 'v5', accountIds: [ACCOUNT_A] },
      );

      expect(result).toStrictEqual(V5_RESPONSE);
    });

    it('returns an empty response without a request when there are no accounts', async () => {
      const { service } = createService();

      expect(
        await service.fetchBalances({ version: 'v5', accountIds: [] }),
      ).toStrictEqual({ count: 0, unprocessedNetworks: [], balances: [] });
      expect(
        await service.fetchBalances({ version: 'v6', accountIds: [] }),
      ).toStrictEqual({
        unprocessedNetworks: [],
        unprocessedIncludeAssetIds: [],
        balances: [],
      });
    });

    it('throws on an invalid response', async () => {
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(200, { unprocessedNetworks: [], balances: 'nope' });
      const { service } = createService();

      await expect(
        service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] }),
      ).rejects.toThrow(
        'Query function for "AccountsApiBalancesService:fetchBalances" returned an unexpected response',
      );
    });

    it('serves a fresh cache entry without a request', async () => {
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .once()
        .reply(200, V6_RESPONSE);
      const { service } = createService();

      await service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] });
      const second = await service.fetchBalances({
        version: 'v6',
        accountIds: [ACCOUNT_A],
      });

      expect(second).toStrictEqual(V6_RESPONSE);
    });

    it('forceUpdate refetches despite a fresh cache entry', async () => {
      const updated = {
        ...V6_RESPONSE,
        balances: [{ ...V6_RESPONSE.balances[0], balance: '9' }],
      };
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(200, V6_RESPONSE)
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(200, updated);
      const { service } = createService();

      await service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] });
      const result = await service.fetchBalances({
        version: 'v6',
        accountIds: [ACCOUNT_A],
        forceUpdate: true,
      });

      expect(result).toStrictEqual(updated);
      expect(nock.isDone()).toBe(true);
    });

    it('forceUpdate while a fetch is in flight joins it', async () => {
      let requests = 0;
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .times(2)
        .delay(30)
        .reply(200, () => {
          requests += 1;
          return V6_RESPONSE;
        });
      const { service } = createService();

      const results = await Promise.all([
        service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] }),
        service.fetchBalances({
          version: 'v6',
          accountIds: [ACCOUNT_A],
          forceUpdate: true,
        }),
      ]);

      expect(results).toStrictEqual([V6_RESPONSE, V6_RESPONSE]);
      expect(requests).toBe(1);
    });

    it('forceUpdate invalidates only the requested key', async () => {
      let shortRequests = 0;
      let longRequests = 0;
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query((query) => query.accountIds === ACCOUNT_A)
        .times(3)
        .reply(200, () => {
          shortRequests += 1;
          return V6_RESPONSE;
        })
        .get('/v6/multiaccount/balances')
        .query((query) => query.accountIds === `${ACCOUNT_A},${ACCOUNT_B}`)
        .times(3)
        .reply(200, () => {
          longRequests += 1;
          return V6_RESPONSE;
        });
      const { service } = createService();

      await service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] });
      await service.fetchBalances({
        version: 'v6',
        accountIds: [ACCOUNT_A, ACCOUNT_B],
      });
      await service.fetchBalances({
        version: 'v6',
        accountIds: [ACCOUNT_A],
        forceUpdate: true,
      });
      await service.fetchBalances({
        version: 'v6',
        accountIds: [ACCOUNT_A, ACCOUNT_B],
      });

      expect(shortRequests).toBe(2);
      expect(longRequests).toBe(1);
    });

    it('v5 ignores includeAssetIds and excludeAssetIds in the cache key, as it never sends them', async () => {
      let requests = 0;
      nock(BASE_URL)
        .get('/v5/multiaccount/balances')
        .query(true)
        .times(2)
        .reply(200, () => {
          requests += 1;
          return V5_RESPONSE;
        });
      const { service } = createService();

      await service.fetchBalances({
        version: 'v5',
        accountIds: [ACCOUNT_A],
        includeAssetIds: ['eip155:1/slip44:60'],
        excludeAssetIds: ['eip155:1/erc20:0x0'],
      });
      await service.fetchBalances({ version: 'v5', accountIds: [ACCOUNT_A] });

      expect(requests).toBe(1);
    });

    it('bypass fetch does not join an in flight non bypass fetch', async () => {
      const bypassed = {
        ...V6_RESPONSE,
        balances: [{ ...V6_RESPONSE.balances[0], balance: '7' }],
      };
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query((query) => query.bypassServerCache === undefined)
        .delay(50)
        .reply(200, V6_RESPONSE)
        .get('/v6/multiaccount/balances')
        .query((query) =>
          /^[a-z0-9]{8}$/u.test(String(query.bypassServerCache)),
        )
        .reply(200, bypassed);
      const { service } = createService();

      const [plain, bypass] = await Promise.all([
        service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] }),
        service.fetchBalances({
          version: 'v6',
          accountIds: [ACCOUNT_A],
          bypassServerCache: true,
        }),
      ]);

      expect(plain).toStrictEqual(V6_RESPONSE);
      expect(bypass).toStrictEqual(bypassed);
      expect(nock.isDone()).toBe(true);
    });

    it('never serves a bypass fetch from the cache', async () => {
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query((query) => query.bypassServerCache !== undefined)
        .twice()
        .reply(200, V6_RESPONSE);
      const { service } = createService();
      const options = {
        version: 'v6' as const,
        accountIds: [ACCOUNT_A],
        bypassServerCache: true,
      };

      await service.fetchBalances(options);
      await service.fetchBalances(options);

      expect(nock.isDone()).toBe(true);
    });

    it('shares one fetch between concurrent identical requests', async () => {
      let requests = 0;
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .times(2)
        .delay(20)
        .reply(200, () => {
          requests += 1;
          return V6_RESPONSE;
        });
      const { service } = createService();

      const results = await Promise.all([
        service.fetchBalances({
          version: 'v6',
          accountIds: [ACCOUNT_A, ACCOUNT_B],
          networks: ['eip155:1', 'eip155:56'],
        }),
        service.fetchBalances({
          version: 'v6',
          accountIds: [ACCOUNT_B, ACCOUNT_A],
          networks: ['eip155:56', 'eip155:1'],
        }),
      ]);

      expect(results).toStrictEqual([V6_RESPONSE, V6_RESPONSE]);
      expect(requests).toBe(1);
    });

    it('reports fetching then idle through onQueryStateChange', async () => {
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(200, V6_RESPONSE);
      const { service } = createService();
      const states: DataServiceQueryState[] = [];

      await service.fetchBalances({
        version: 'v6',
        accountIds: [ACCOUNT_A],
        onQueryStateChange: (state) => states.push(state),
      });

      const statuses = states.map((state) => state.fetchStatus);
      expect(statuses).toContain('fetching');
      expect(statuses.indexOf('fetching')).toBeLessThan(
        statuses.lastIndexOf('idle'),
      );
      expect(states.at(-1)).toMatchObject({
        fetchStatus: 'idle',
        status: 'success',
        data: V6_RESPONSE,
      });
    });

    it('does not retry a 4xx', async () => {
      let requests = 0;
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .times(4)
        .reply(() => {
          requests += 1;
          return [400, { error: 'bad' }];
        });
      const { service } = createService({ policyOptions: FAST_POLICY });

      await expect(
        service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] }),
      ).rejects.toMatchObject({ httpStatus: 400 });
      expect(requests).toBe(1);
    });

    it('does not retry a 4xx carried as status by a fetch rejection', async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }));
      const { service } = createService({
        fetch: fetchMock,
        policyOptions: FAST_POLICY,
      });

      await expect(
        service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] }),
      ).rejects.toThrow('nope');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([408, 429])('retries a %i', async (status) => {
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(status)
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(200, V6_RESPONSE);
      const { service } = createService({ policyOptions: FAST_POLICY });

      expect(
        await service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] }),
      ).toStrictEqual(V6_RESPONSE);
    });

    it('retries a 500 up to 3 times', async () => {
      let requests = 0;
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .times(5)
        .reply(() => {
          requests += 1;
          return [500];
        });
      const { service } = createService({ policyOptions: FAST_POLICY });

      await expect(
        service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] }),
      ).rejects.toMatchObject({ httpStatus: 500 });
      expect(requests).toBe(4);
    });

    it('retries a network error', async () => {
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .replyWithError('socket hang up')
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(200, V6_RESPONSE);
      const { service } = createService({ policyOptions: FAST_POLICY });

      expect(
        await service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] }),
      ).toStrictEqual(V6_RESPONSE);
    });

    it('opens the breaker after consecutive 5xx failures and fails fast with BrokenCircuitError without retrying it', async () => {
      let requests = 0;
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .times(4)
        .reply(() => {
          requests += 1;
          return [503];
        })
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(200, V6_RESPONSE);
      const { service } = createService({
        policyOptions: {
          ...FAST_POLICY,
          maxConsecutiveFailures: 4,
          circuitBreakDuration: 200,
        },
      });
      const options = { version: 'v6' as const, accountIds: [ACCOUNT_A] };

      await expect(service.fetchBalances(options)).rejects.toMatchObject({
        httpStatus: 503,
      });
      expect(requests).toBe(4);

      await expect(service.fetchBalances(options)).rejects.toBeInstanceOf(
        BrokenCircuitError,
      );
      expect(requests).toBe(4);

      // Wait well past the break duration so the breaker is half open.
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(await service.fetchBalances(options)).toStrictEqual(V6_RESPONSE);
    });

    it('a 4xx never counts toward the breaker', async () => {
      nock(BASE_URL)
        .get('/v6/multiaccount/balances')
        .query(true)
        .times(3)
        .reply(404)
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(200, V6_RESPONSE);
      const { service } = createService({
        policyOptions: {
          ...FAST_POLICY,
          maxConsecutiveFailures: 2,
          circuitBreakDuration: 60_000,
        },
      });
      const options = { version: 'v6' as const, accountIds: [ACCOUNT_A] };

      for (let attempt = 0; attempt < 3; attempt++) {
        await expect(service.fetchBalances(options)).rejects.toMatchObject({
          httpStatus: 404,
        });
      }

      expect(await service.fetchBalances(options)).toStrictEqual(V6_RESPONSE);
    });

    it('sends the request without a token when getBearerToken fails', async () => {
      nock(BASE_URL, { badheaders: ['authorization'] })
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(200, V6_RESPONSE);
      const { service } = createService({
        getBearerToken: async () => {
          throw new Error('locked');
        },
      });

      expect(
        await service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] }),
      ).toStrictEqual(V6_RESPONSE);
    });

    it('sends the request without a token when getBearerToken is too slow', async () => {
      nock(BASE_URL, { badheaders: ['authorization'] })
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(200, V6_RESPONSE);
      const { service } = createService({
        getBearerToken: async () => new Promise<string>(() => undefined),
        authTokenTimeout: 10,
      });

      expect(
        await service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] }),
      ).toStrictEqual(V6_RESPONSE);
    });

    it('waits for the token without a timeout when authTokenTimeout is 0', async () => {
      nock(BASE_URL, { reqheaders: { authorization: 'Bearer slow-token' } })
        .get('/v6/multiaccount/balances')
        .query(true)
        .reply(200, V6_RESPONSE);
      const { service } = createService({
        getBearerToken: async () =>
          new Promise<string>((resolve) =>
            setTimeout(() => resolve('slow-token'), 20),
          ),
        authTokenTimeout: 0,
      });

      expect(
        await service.fetchBalances({ version: 'v6', accountIds: [ACCOUNT_A] }),
      ).toStrictEqual(V6_RESPONSE);
    });

    it('uses a custom base URL and omits the version header when unset', async () => {
      nock('https://accounts.dev-api.cx.metamask.io', {
        badheaders: ['x-metamask-clientversion'],
      })
        .get('/v5/multiaccount/balances')
        .query(true)
        .reply(200, V5_RESPONSE);
      const { service } = createService({
        baseUrl: 'https://accounts.dev-api.cx.metamask.io',
        clientVersion: null,
      });

      expect(
        await service.fetchBalances({ version: 'v5', accountIds: [ACCOUNT_A] }),
      ).toStrictEqual(V5_RESPONSE);
    });
  });

  describe('sends the same request as ApiPlatformClient (URL and headers) for v5 and v6', () => {
    it('matches path, query and headers with nock for v6', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
      nock(BASE_URL, {
        reqheaders: {
          'content-type': 'application/json',
          'x-metamask-clientproduct': 'metamask-extension',
          'x-metamask-clientversion': '13.0.0',
          authorization: 'Bearer test-token',
        },
      })
        .get('/v6/multiaccount/balances')
        .query({
          accountIds: `${ACCOUNT_A},${ACCOUNT_B}`,
          networks: 'eip155:1,eip155:56',
          includeAssetIds: 'eip155:1/erc20:0x1,eip155:1/erc20:0x2',
          excludeAssetIds: 'eip155:1/erc20:0x3',
          bypassServerCache: (0.123456789).toString(36).slice(2, 10),
        })
        .reply(200, V6_RESPONSE);
      const { service } = createService();

      await service.fetchBalances({
        version: 'v6',
        accountIds: [ACCOUNT_A, ACCOUNT_B],
        networks: ['eip155:1', 'eip155:56'],
        includeAssetIds: ['eip155:1/erc20:0x1', 'eip155:1/erc20:0x2'],
        excludeAssetIds: ['eip155:1/erc20:0x3'],
        bypassServerCache: true,
      });

      expect(nock.isDone()).toBe(true);
    });

    it('matches path, query and headers with nock for v5, which ignores includeAssetIds and excludeAssetIds', async () => {
      nock(BASE_URL, {
        reqheaders: {
          'content-type': 'application/json',
          'x-metamask-clientproduct': 'metamask-extension',
          'x-metamask-clientversion': '13.0.0',
          authorization: 'Bearer test-token',
        },
      })
        .get('/v5/multiaccount/balances')
        .query({
          accountIds: `${ACCOUNT_A},${ACCOUNT_B}`,
          networks: 'eip155:1',
        })
        .reply(200, V5_RESPONSE);
      const { service } = createService();

      await service.fetchBalances({
        version: 'v5',
        accountIds: [ACCOUNT_A, ACCOUNT_B],
        networks: ['eip155:1'],
        includeAssetIds: ['eip155:1/erc20:0x1'],
        excludeAssetIds: ['eip155:1/erc20:0x3'],
      });

      expect(nock.isDone()).toBe(true);
    });

    const parityAccountIds = [ACCOUNT_A, ACCOUNT_B];
    const parityNetworks = ['eip155:1', 'eip155:56'];
    const parityIncludeAssetIds = ['eip155:1/erc20:0x1'];
    const parityExcludeAssetIds = ['eip155:1/erc20:0x3'];

    it.each([
      {
        version: 'v5' as const,
        body: V5_RESPONSE,
        callClient: async (client: ApiPlatformClient): Promise<unknown> =>
          client.accounts.fetchV5MultiAccountBalances(
            parityAccountIds,
            { networks: parityNetworks },
            { bypassServerCache: true },
          ),
      },
      {
        version: 'v6' as const,
        body: V6_RESPONSE,
        callClient: async (client: ApiPlatformClient): Promise<unknown> =>
          client.accounts.fetchV6MultiAccountBalances(
            parityAccountIds,
            {
              networks: parityNetworks,
              includeAssetIds: parityIncludeAssetIds,
              excludeAssetIds: parityExcludeAssetIds,
            },
            { bypassServerCache: true },
          ),
      },
    ])(
      'builds the exact URL, method and headers that ApiPlatformClient builds for $version',
      async ({ version, body, callClient }) => {
        vi.spyOn(Math, 'random').mockReturnValue(0.987654321);
        const fetchMock = vi.fn<typeof fetch>(
          async () => new Response(JSON.stringify(body), { status: 200 }),
        );
        vi.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
        const client = new ApiPlatformClient({
          clientProduct: 'metamask-extension',
          clientVersion: '13.0.0',
          getBearerToken: async (): Promise<string> => 'test-token',
        });
        await callClient(client);

        const { service } = createService({ fetch: fetchMock });
        await service.fetchBalances({
          version,
          accountIds: parityAccountIds,
          networks: parityNetworks,
          includeAssetIds: parityIncludeAssetIds,
          excludeAssetIds: parityExcludeAssetIds,
          bypassServerCache: true,
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [clientUrl, clientInit] = fetchMock.mock.calls[0];
        const [serviceUrl, serviceInit] = fetchMock.mock.calls[1];
        expect(serviceUrl).toBe(clientUrl);
        expect(serviceInit?.method).toBe(clientInit?.method);
        expect(serviceInit?.headers).toStrictEqual(clientInit?.headers);
      },
    );
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<AccountsApiBalancesServiceMessenger>,
  MessengerEvents<AccountsApiBalancesServiceMessenger>
>;

/**
 * Constructs the service under test with its messengers.
 *
 * @param args - Optional overrides.
 * @param args.getBearerToken - The handler for
 * `AuthenticationController:getBearerToken`.
 * @param args.fetch - The fetch function.
 * @param args.policyOptions - Policy option overrides.
 * @param args.authTokenTimeout - How long to wait for the bearer token.
 * @param args.baseUrl - The Accounts API base URL.
 * @param args.clientVersion - The client version header value, or `null` to
 * leave it unset.
 * @returns The service and the root messenger.
 */
function createService({
  getBearerToken = async (): Promise<string> => 'test-token',
  fetch: fetchFunction = globalThis.fetch,
  policyOptions,
  authTokenTimeout,
  baseUrl,
  clientVersion = '13.0.0',
}: {
  getBearerToken?: () => Promise<string>;
  fetch?: typeof globalThis.fetch;
  policyOptions?: CreateServicePolicyOptions;
  authTokenTimeout?: number;
  baseUrl?: string;
  clientVersion?: string | null;
} = {}): {
  service: AccountsApiBalancesService;
  rootMessenger: RootMessenger;
} {
  const rootMessenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    getBearerToken,
  );
  const messenger: AccountsApiBalancesServiceMessenger = new Messenger({
    namespace: 'AccountsApiBalancesService',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: ['AuthenticationController:getBearerToken'],
    messenger,
  });
  const service = new AccountsApiBalancesService({
    messenger,
    fetch: fetchFunction,
    clientProduct: 'metamask-extension',
    clientVersion: clientVersion ?? undefined,
    policyOptions,
    authTokenTimeout,
    baseUrl,
  });
  return { service, rootMessenger };
}
