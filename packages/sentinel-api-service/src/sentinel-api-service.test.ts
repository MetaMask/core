import { HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import type { Hex } from '@metamask/utils';
import nock, { cleanAll as nockCleanAll } from 'nock';

import {
  BASE_URL_TEMPLATE,
  ENVIRONMENT_DOMAIN,
  NETWORKS_SUBDOMAIN,
  RPC_METHOD_SEND_RELAY,
  RPC_METHOD_SIMULATE,
  SentinelEnvironment,
  serviceName,
} from './constants';
import {
  SentinelApiResponseValidationError,
  SentinelChainNotSupportedError,
  SentinelJsonRpcError,
} from './errors';
import { SentinelApiService } from './sentinel-api-service';
import {
  SentinelFeature,
  SentinelKind,
  SentinelSmartTransactionStatus,
} from './types';
import type {
  SentinelApiServiceMessenger,
  SentinelRelaySubmitRequest,
  SentinelSimulationRequest,
} from './types';

// ============================================================
// Fixtures
// ============================================================

const CHAIN_ID_MAINNET = '0x1' as Hex;
const CHAIN_ID_UNKNOWN = '0x539' as Hex; // 1337
const MAINNET_SUBDOMAIN = 'ethereum-mainnet';
const UUID = '11111111-1111-1111-1111-111111111111';

/**
 * Builds the base URL for a subdomain in a given environment, mirroring the
 * service's internal `#buildUrl`.
 *
 * @param subdomain - The network subdomain.
 * @param environment - The Sentinel environment. Defaults to `Prod`.
 * @returns The full base URL.
 */
function buildUrl(
  subdomain: string,
  environment: SentinelEnvironment = SentinelEnvironment.Prod,
): string {
  return BASE_URL_TEMPLATE.replace('{0}', subdomain).replace(
    '{1}',
    ENVIRONMENT_DOMAIN[environment],
  );
}

const NETWORKS_URL = buildUrl(NETWORKS_SUBDOMAIN);
const MAINNET_URL = buildUrl(MAINNET_SUBDOMAIN);

const MOCK_NETWORKS = {
  '1': {
    network: MAINNET_SUBDOMAIN,
    confirmations: true,
    relayTransactions: true,
    smartTransactions: true,
    sendBundle: true,
    chainID: 1,
  },
  '10': {
    network: 'optimism-mainnet',
    confirmations: true,
    relayTransactions: false,
  },
  '137': {
    network: 'polygon-mainnet',
  },
};

const MOCK_SIMULATION_RESPONSE = {
  transactions: [{}],
  sponsorship: { isSponsored: true },
};

const MOCK_SIMULATION_REQUEST: SentinelSimulationRequest = {
  transactions: [
    {
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      value: '0x0',
    },
  ],
};

const MOCK_RELAY_REQUEST: SentinelRelaySubmitRequest = {
  chainId: CHAIN_ID_MAINNET,
  data: '0xdeadbeef',
  to: '0x2222222222222222222222222222222222222222',
};

// ============================================================
// Messenger helpers
// ============================================================

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SentinelApiServiceMessenger>,
  MessengerEvents<SentinelApiServiceMessenger>
>;

/**
 * Creates a root messenger for tests.
 *
 * @returns A new root messenger.
 */
function createRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Creates a service-scoped messenger parented to the root.
 *
 * @param rootMessenger - The root messenger.
 * @returns A new service messenger.
 */
function createServiceMessenger(
  rootMessenger: RootMessenger,
): SentinelApiServiceMessenger {
  return new Messenger({
    namespace: serviceName,
    parent: rootMessenger,
  });
}

/**
 * Constructs a service under test with its messengers.
 *
 * @param options - Constructor options forwarded to the service (minus the
 * messenger, which is created here).
 * @param options.clientId - The client identifier sent as `X-Client-Id`.
 * @param options.clientVersion - The client version sent as `X-Client-Version`.
 * @param options.fetch - A custom `fetch` implementation.
 * @param options.environment - The Sentinel environment to target.
 * @param options.policyOptions - Options forwarded to `createServicePolicy`.
 * @returns The service and its messengers.
 */
function createService(
  options: {
    clientId?: string;
    clientVersion?: string;
    fetch?: typeof fetch;
    environment?: SentinelEnvironment;
    policyOptions?: ConstructorParameters<
      typeof SentinelApiService
    >[0]['policyOptions'];
  } = {},
): {
  service: SentinelApiService;
  rootMessenger: RootMessenger;
  messenger: SentinelApiServiceMessenger;
} {
  const rootMessenger = createRootMessenger();
  const messenger = createServiceMessenger(rootMessenger);
  rootMessenger.delegate({
    messenger,
    actions: ['AuthenticationController:getBearerToken'],
    events: [],
  });
  const service = new SentinelApiService({ messenger, ...options });
  return { service, rootMessenger, messenger };
}

/**
 * Registers a `AuthenticationController:getBearerToken` handler on the root
 * messenger.
 *
 * @param rootMessenger - The root messenger.
 * @param handler - The handler to register.
 */
function registerBearerToken(
  rootMessenger: RootMessenger,
  handler: () => Promise<string>,
): void {
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    handler,
  );
}

/**
 * Mocks the `/networks` registry response.
 *
 * @param times - How many times to allow the request. Defaults to 1.
 * @returns The nock scope.
 */
function mockNetworks(times = 1): nock.Scope {
  return nock(NETWORKS_URL)
    .get('/networks')
    .times(times)
    .reply(200, MOCK_NETWORKS);
}

// ============================================================
// Tests
// ============================================================

describe('SentinelApiService', () => {
  afterEach(() => {
    nockCleanAll();
  });

  describe('errors', () => {
    it('builds a chain-not-supported message with a capability', () => {
      const error = new SentinelChainNotSupportedError('0x1', 'confirmations');
      expect(error.message).toBe(
        "Sentinel API: Does not support 'confirmations' for chain 0x1",
      );
    });

    it('builds a chain-not-supported message without a capability', () => {
      const error = new SentinelChainNotSupportedError('0x1');
      expect(error.message).toBe('Sentinel API: Does not support chain 0x1');
    });

    it('uses a default validation-error message', () => {
      const error = new SentinelApiResponseValidationError();
      expect(error.message).toBe('Sentinel API: Malformed response received');
    });

    it('captures a JSON-RPC error code', () => {
      const error = new SentinelJsonRpcError('boom', -32000);
      expect(error.code).toBe(-32000);
    });
  });

  describe('enums', () => {
    it('exposes smart-transaction status values', () => {
      expect(SentinelSmartTransactionStatus.Pending).toBe('PENDING');
      expect(SentinelSmartTransactionStatus.Validated).toBe('VALIDATED');
      expect(SentinelSmartTransactionStatus.Failed).toBe('FAILED');
    });

    it('exposes feature and kind values', () => {
      expect(SentinelFeature.Sponsored).toBe('sponsored');
      expect(SentinelKind.GaslessEIP7702).toBe('gaslessEIP7702');
    });
  });

  describe('constructor', () => {
    it('initializes with the expected service name', () => {
      const { service } = createService();
      expect(service.name).toBe(serviceName);
      service.destroy();
    });

    it('accepts a custom fetch implementation', async () => {
      const customFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => MOCK_NETWORKS,
      });
      const { service } = createService({
        fetch: customFetch as unknown as typeof fetch,
      });

      const result = await service.getNetworks();
      expect(result).toStrictEqual(MOCK_NETWORKS);
      expect(customFetch).toHaveBeenCalledWith(`${NETWORKS_URL}networks`, {
        headers: {},
      });
      service.destroy();
    });
  });

  describe('authentication headers', () => {
    it('sends client identity headers when configured', async () => {
      const { service } = createService({
        clientId: 'extension',
        clientVersion: '12.5.0',
      });
      const scope = nock(NETWORKS_URL, {
        reqheaders: {
          'x-client-id': 'extension',
          'x-client-version': '12.5.0',
        },
      })
        .get('/networks')
        .reply(200, MOCK_NETWORKS);

      const result = await service.getNetworks();
      expect(result).toStrictEqual(MOCK_NETWORKS);
      scope.done();
      service.destroy();
    });

    it('attaches a bearer token from the AuthenticationController', async () => {
      const { service, rootMessenger } = createService({ clientId: 'mobile' });
      registerBearerToken(rootMessenger, async () => 'jwt-token');
      const scope = nock(NETWORKS_URL, {
        reqheaders: {
          'x-client-id': 'mobile',
          authorization: 'Bearer jwt-token',
        },
      })
        .get('/networks')
        .reply(200, MOCK_NETWORKS);

      const result = await service.getNetworks();
      expect(result).toStrictEqual(MOCK_NETWORKS);
      scope.done();
      service.destroy();
    });

    it('proceeds unauthenticated when token retrieval fails', async () => {
      const { service, rootMessenger } = createService();
      registerBearerToken(rootMessenger, async () => {
        throw new Error('locked');
      });
      const scope = nock(NETWORKS_URL, {
        badheaders: ['authorization'],
      })
        .get('/networks')
        .reply(200, MOCK_NETWORKS);

      const result = await service.getNetworks();
      expect(result).toStrictEqual(MOCK_NETWORKS);
      scope.done();
      service.destroy();
    });

    it('omits the bearer header when the token is empty', async () => {
      const { service, rootMessenger } = createService();
      registerBearerToken(rootMessenger, async () => '');
      const scope = nock(NETWORKS_URL, {
        badheaders: ['authorization'],
      })
        .get('/networks')
        .reply(200, MOCK_NETWORKS);

      const result = await service.getNetworks();
      expect(result).toStrictEqual(MOCK_NETWORKS);
      scope.done();
      service.destroy();
    });

    it('sends auth headers on JSON-RPC (relay) requests', async () => {
      const { service, rootMessenger } = createService({
        clientId: 'extension',
      });
      registerBearerToken(rootMessenger, async () => 'jwt-token');
      mockNetworks();
      const scope = nock(MAINNET_URL, {
        reqheaders: {
          'x-client-id': 'extension',
          authorization: 'Bearer jwt-token',
          'content-type': 'application/json',
        },
      })
        .post('/')
        .reply(200, { jsonrpc: '2.0', id: '1', result: { uuid: UUID } });

      const result = await service.submitRelayTransaction(MOCK_RELAY_REQUEST);
      expect(result).toStrictEqual({ uuid: UUID });
      scope.done();
      service.destroy();
    });
  });

  describe('getNetworks', () => {
    it('returns the network registry', async () => {
      const { service } = createService();
      mockNetworks();

      const result = await service.getNetworks();
      expect(result).toStrictEqual(MOCK_NETWORKS);
      service.destroy();
    });

    it('caches the registry across calls', async () => {
      const { service } = createService();
      mockNetworks(1);

      const first = await service.getNetworks();
      const second = await service.getNetworks();
      expect(first).toStrictEqual(second);
      service.destroy();
    });

    it('throws HttpError on non-2xx response', async () => {
      const { service } = createService();
      nock(NETWORKS_URL).get('/networks').once().reply(500);

      await expect(service.getNetworks()).rejects.toThrow(HttpError);
      service.destroy();
    });

    it('throws a validation error on a malformed response', async () => {
      const { service } = createService();
      nock(NETWORKS_URL)
        .get('/networks')
        .once()
        .reply(200, { '1': { confirmations: true } });

      await expect(service.getNetworks()).rejects.toThrow(
        SentinelApiResponseValidationError,
      );
      service.destroy();
    });

    it('is callable via messenger action', async () => {
      const { service, rootMessenger } = createService();
      mockNetworks();

      const result = await rootMessenger.call('SentinelApiService:getNetworks');
      expect(result).toStrictEqual(MOCK_NETWORKS);
      service.destroy();
    });
  });

  describe('simulateTransactions', () => {
    it('returns the simulation response', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .post('/', (body) => body.method === RPC_METHOD_SIMULATE)
        .reply(200, {
          jsonrpc: '2.0',
          id: '1',
          result: MOCK_SIMULATION_RESPONSE,
        });

      const result = await service.simulateTransactions(
        CHAIN_ID_MAINNET,
        MOCK_SIMULATION_REQUEST,
      );
      expect(result).toStrictEqual(MOCK_SIMULATION_RESPONSE);
      service.destroy();
    });

    it('routes the request through the URL returned by the getUrl callback', async () => {
      const { service } = createService();
      mockNetworks();
      const proxyUrl = 'https://proxy.example.com/proxy';
      nock('https://proxy.example.com')
        .post('/proxy', (body) => body.method === RPC_METHOD_SIMULATE)
        .reply(200, {
          jsonrpc: '2.0',
          id: '1',
          result: MOCK_SIMULATION_RESPONSE,
        });

      const getUrl = jest.fn().mockReturnValue(proxyUrl);
      const result = await service.simulateTransactions(
        CHAIN_ID_MAINNET,
        MOCK_SIMULATION_REQUEST,
        { getUrl },
      );

      expect(getUrl).toHaveBeenCalledWith(MAINNET_URL);
      expect(result).toStrictEqual(MOCK_SIMULATION_RESPONSE);
      service.destroy();
    });

    it('throws when simulation is not supported for the chain', async () => {
      const { service } = createService();
      mockNetworks();

      await expect(
        service.simulateTransactions(CHAIN_ID_UNKNOWN, MOCK_SIMULATION_REQUEST),
      ).rejects.toThrow(SentinelChainNotSupportedError);
      service.destroy();
    });

    it('throws SentinelJsonRpcError on a JSON-RPC error', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .post('/')
        .reply(200, {
          jsonrpc: '2.0',
          id: '1',
          error: { code: -32000, message: 'boom' },
        });

      await expect(
        service.simulateTransactions(CHAIN_ID_MAINNET, MOCK_SIMULATION_REQUEST),
      ).rejects.toThrow(SentinelJsonRpcError);
      service.destroy();
    });

    it('throws HttpError on a non-2xx response', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL).post('/').once().reply(500);

      await expect(
        service.simulateTransactions(CHAIN_ID_MAINNET, MOCK_SIMULATION_REQUEST),
      ).rejects.toThrow(HttpError);
      service.destroy();
    });

    it('throws a validation error on a malformed result', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .post('/')
        .once()
        .reply(200, { jsonrpc: '2.0', id: '1', result: { unexpected: true } });

      await expect(
        service.simulateTransactions(CHAIN_ID_MAINNET, MOCK_SIMULATION_REQUEST),
      ).rejects.toThrow(SentinelApiResponseValidationError);
      service.destroy();
    });

    it('throws when JSON-RPC response is missing result', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .post('/')
        .once()
        .reply(200, { jsonrpc: '2.0', id: '1' });

      await expect(
        service.simulateTransactions(CHAIN_ID_MAINNET, MOCK_SIMULATION_REQUEST),
      ).rejects.toThrow(SentinelJsonRpcError);
      service.destroy();
    });

    it('is callable via messenger action', async () => {
      const { service, rootMessenger } = createService();
      mockNetworks();
      nock(MAINNET_URL).post('/').reply(200, {
        jsonrpc: '2.0',
        id: '1',
        result: MOCK_SIMULATION_RESPONSE,
      });

      const result = await rootMessenger.call(
        'SentinelApiService:simulateTransactions',
        CHAIN_ID_MAINNET,
        MOCK_SIMULATION_REQUEST,
      );
      expect(result).toStrictEqual(MOCK_SIMULATION_RESPONSE);
      service.destroy();
    });

    it('does not dedupe concurrent simulations for different requests on the same chain', async () => {
      const { service } = createService();
      mockNetworks();

      const requestA: SentinelSimulationRequest = {
        transactions: [
          {
            from: '0x1111111111111111111111111111111111111111',
            to: '0x2222222222222222222222222222222222222222',
            value: '0x0',
          },
        ],
      };
      const requestB: SentinelSimulationRequest = {
        transactions: [
          {
            from: '0x3333333333333333333333333333333333333333',
            to: '0x4444444444444444444444444444444444444444',
            value: '0x1',
          },
        ],
      };
      const responseA = { transactions: [{ return: '0xa' }] };
      const responseB = { transactions: [{ return: '0xb' }] };

      nock(MAINNET_URL)
        .post(
          '/',
          (body) =>
            body.method === RPC_METHOD_SIMULATE &&
            body.params[0].transactions[0].from ===
              '0x1111111111111111111111111111111111111111',
        )
        .reply(200, { jsonrpc: '2.0', id: '1', result: responseA });
      nock(MAINNET_URL)
        .post(
          '/',
          (body) =>
            body.method === RPC_METHOD_SIMULATE &&
            body.params[0].transactions[0].from ===
              '0x3333333333333333333333333333333333333333',
        )
        .reply(200, { jsonrpc: '2.0', id: '1', result: responseB });

      const [resultA, resultB] = await Promise.all([
        service.simulateTransactions(CHAIN_ID_MAINNET, requestA),
        service.simulateTransactions(CHAIN_ID_MAINNET, requestB),
      ]);
      expect(resultA).toStrictEqual(responseA);
      expect(resultB).toStrictEqual(responseB);
      service.destroy();
    });
  });

  describe('submitRelayTransaction', () => {
    it('returns the relay submit response', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .post('/', (body) => body.method === RPC_METHOD_SEND_RELAY)
        .reply(200, { jsonrpc: '2.0', id: '1', result: { uuid: UUID } });

      const result = await service.submitRelayTransaction(MOCK_RELAY_REQUEST);
      expect(result).toStrictEqual({ uuid: UUID });
      service.destroy();
    });

    it('throws when relay is not supported for the chain', async () => {
      const { service } = createService();
      mockNetworks();

      await expect(
        service.submitRelayTransaction({
          ...MOCK_RELAY_REQUEST,
          chainId: '0xa' as Hex,
        }),
      ).rejects.toThrow(SentinelChainNotSupportedError);
      service.destroy();
    });

    it('throws a validation error on a malformed result', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .post('/')
        .once()
        .reply(200, { jsonrpc: '2.0', id: '1', result: {} });

      await expect(
        service.submitRelayTransaction(MOCK_RELAY_REQUEST),
      ).rejects.toThrow(SentinelApiResponseValidationError);
      service.destroy();
    });

    it('is callable via messenger action', async () => {
      const { service, rootMessenger } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .post('/')
        .reply(200, { jsonrpc: '2.0', id: '1', result: { uuid: UUID } });

      const result = await rootMessenger.call(
        'SentinelApiService:submitRelayTransaction',
        MOCK_RELAY_REQUEST,
      );
      expect(result).toStrictEqual({ uuid: UUID });
      service.destroy();
    });

    it('does not dedupe concurrent relay submissions for different requests on the same chain', async () => {
      const { service } = createService();
      mockNetworks();

      const requestA: SentinelRelaySubmitRequest = {
        chainId: CHAIN_ID_MAINNET,
        data: '0xaaaaaaaa',
        to: '0x2222222222222222222222222222222222222222',
      };
      const requestB: SentinelRelaySubmitRequest = {
        chainId: CHAIN_ID_MAINNET,
        data: '0xbbbbbbbb',
        to: '0x2222222222222222222222222222222222222222',
      };
      const uuidA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
      const uuidB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

      nock(MAINNET_URL)
        .post(
          '/',
          (body) =>
            body.method === RPC_METHOD_SEND_RELAY &&
            body.params[0].data === '0xaaaaaaaa',
        )
        .reply(200, { jsonrpc: '2.0', id: '1', result: { uuid: uuidA } });
      nock(MAINNET_URL)
        .post(
          '/',
          (body) =>
            body.method === RPC_METHOD_SEND_RELAY &&
            body.params[0].data === '0xbbbbbbbb',
        )
        .reply(200, { jsonrpc: '2.0', id: '1', result: { uuid: uuidB } });

      const [resultA, resultB] = await Promise.all([
        service.submitRelayTransaction(requestA),
        service.submitRelayTransaction(requestB),
      ]);
      expect(resultA).toStrictEqual({ uuid: uuidA });
      expect(resultB).toStrictEqual({ uuid: uuidB });
      service.destroy();
    });
  });

  describe('getSmartTransaction', () => {
    it('returns a successful status with a hash', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .get(`/smart-transactions/${UUID}`)
        .reply(200, {
          transactions: [{ status: 'VALIDATED', hash: '0xhash' }],
        });

      const result = await service.getSmartTransaction({
        chainId: CHAIN_ID_MAINNET,
        uuid: UUID,
      });
      expect(result).toStrictEqual({
        transactions: [{ status: 'VALIDATED', hash: '0xhash' }],
      });
      service.destroy();
    });

    it('includes an errorReason when present', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .get(`/smart-transactions/${UUID}`)
        .reply(200, {
          transactions: [{ status: 'FAILED', errorReason: 'reverted' }],
        });

      const result = await service.getSmartTransaction({
        chainId: CHAIN_ID_MAINNET,
        uuid: UUID,
      });
      expect(result).toStrictEqual({
        transactions: [{ status: 'FAILED', errorReason: 'reverted' }],
      });
      service.destroy();
    });

    it('surfaces a null errorReason when the API reports one explicitly', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .get(`/smart-transactions/${UUID}`)
        .reply(200, {
          transactions: [{ status: 'PENDING', errorReason: null }],
        });

      const result = await service.getSmartTransaction({
        chainId: CHAIN_ID_MAINNET,
        uuid: UUID,
      });
      expect(result).toStrictEqual({
        transactions: [{ status: 'PENDING', errorReason: null }],
      });
      service.destroy();
    });

    it('returns an empty transactions array when the API reports none', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .get(`/smart-transactions/${UUID}`)
        .reply(200, { transactions: [] });

      const result = await service.getSmartTransaction({
        chainId: CHAIN_ID_MAINNET,
        uuid: UUID,
      });
      expect(result).toStrictEqual({ transactions: [] });
      service.destroy();
    });

    it('throws when relay is not supported for the chain', async () => {
      const { service } = createService();
      mockNetworks();

      await expect(
        service.getSmartTransaction({ chainId: '0xa' as Hex, uuid: UUID }),
      ).rejects.toThrow(SentinelChainNotSupportedError);
      service.destroy();
    });

    it('throws HttpError on a non-2xx response', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL).get(`/smart-transactions/${UUID}`).once().reply(500);

      await expect(
        service.getSmartTransaction({ chainId: CHAIN_ID_MAINNET, uuid: UUID }),
      ).rejects.toThrow(HttpError);
      service.destroy();
    });

    it('throws a validation error on a malformed response', async () => {
      const { service } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .get(`/smart-transactions/${UUID}`)
        .once()
        .reply(200, { unexpected: true });

      await expect(
        service.getSmartTransaction({ chainId: CHAIN_ID_MAINNET, uuid: UUID }),
      ).rejects.toThrow(SentinelApiResponseValidationError);
      service.destroy();
    });

    it('is callable via messenger action', async () => {
      const { service, rootMessenger } = createService();
      mockNetworks();
      nock(MAINNET_URL)
        .get(`/smart-transactions/${UUID}`)
        .reply(200, {
          transactions: [{ status: 'VALIDATED', hash: '0xhash' }],
        });

      const result = await rootMessenger.call(
        'SentinelApiService:getSmartTransaction',
        { chainId: CHAIN_ID_MAINNET, uuid: UUID },
      );
      expect(result).toStrictEqual({
        transactions: [{ status: 'VALIDATED', hash: '0xhash' }],
      });
      service.destroy();
    });
  });

  describe('retry policy', () => {
    it('does not retry by default (single request on failure)', async () => {
      const { service } = createService();
      // Only a single attempt is mocked; a retry would trigger a nock
      // "no match" error, proving retries are disabled by default.
      const scope = nock(NETWORKS_URL).get('/networks').once().reply(500);

      await expect(service.getNetworks()).rejects.toThrow(HttpError);
      expect(scope.isDone()).toBe(true);
      service.destroy();
    });

    it('retries when maxRetries is opted into via policyOptions', async () => {
      const { service } = createService({ policyOptions: { maxRetries: 3 } });
      const scope = nock(NETWORKS_URL).get('/networks').times(4).reply(500);

      await expect(service.getNetworks()).rejects.toThrow(HttpError);
      expect(scope.isDone()).toBe(true);
      service.destroy();
    });
  });

  describe('environment', () => {
    it('targets the prod API domain by default', async () => {
      const { service } = createService();
      const scope = nock(buildUrl(NETWORKS_SUBDOMAIN, SentinelEnvironment.Prod))
        .get('/networks')
        .reply(200, MOCK_NETWORKS);

      const result = await service.getNetworks();
      expect(result).toStrictEqual(MOCK_NETWORKS);
      expect(scope.isDone()).toBe(true);
      service.destroy();
    });

    it('targets the dev API domain', async () => {
      const { service } = createService({
        environment: SentinelEnvironment.Dev,
      });
      const scope = nock(buildUrl(NETWORKS_SUBDOMAIN, SentinelEnvironment.Dev))
        .get('/networks')
        .reply(200, MOCK_NETWORKS);

      const result = await service.getNetworks();
      expect(result).toStrictEqual(MOCK_NETWORKS);
      expect(scope.isDone()).toBe(true);
      service.destroy();
    });

    it('targets the uat API domain, including per-chain subdomains', async () => {
      const { service } = createService({
        environment: SentinelEnvironment.Uat,
      });
      nock(buildUrl(NETWORKS_SUBDOMAIN, SentinelEnvironment.Uat))
        .get('/networks')
        .reply(200, MOCK_NETWORKS);
      const scope = nock(buildUrl(MAINNET_SUBDOMAIN, SentinelEnvironment.Uat))
        .post('/', (body) => body.method === RPC_METHOD_SIMULATE)
        .reply(200, {
          jsonrpc: '2.0',
          id: '1',
          result: MOCK_SIMULATION_RESPONSE,
        });

      const result = await service.simulateTransactions(
        CHAIN_ID_MAINNET,
        MOCK_SIMULATION_REQUEST,
      );
      expect(result).toStrictEqual(MOCK_SIMULATION_RESPONSE);
      expect(scope.isDone()).toBe(true);
      service.destroy();
    });
  });
});
