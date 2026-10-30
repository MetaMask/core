import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';
import { describe, expect, it, vi } from 'vitest';

import type { ComplianceServiceMessenger } from './ComplianceService.js';
import { ComplianceService } from './ComplianceService.js';

const MOCK_API_URL = 'https://compliance.dev-api.cx.metamask.io';
const MOCK_PRODUCTION_API_URL = 'https://compliance.api.cx.metamask.io';
const MOCK_CONFIGURED_API_URL = 'https://configured-compliance.example.com';

describe('ComplianceService', () => {
  describe('ComplianceService:checkWalletCompliance', () => {
    it('returns the compliance status for a single wallet address', async () => {
      nock(MOCK_API_URL).get('/v1/wallet/0xABC123').reply(200, {
        address: '0xABC123',
        blocked: false,
      });
      const { rootMessenger } = getService();

      const result = await rootMessenger.call(
        'ComplianceService:checkWalletCompliance',
        '0xABC123',
      );

      expect(result).toStrictEqual({
        address: '0xABC123',
        blocked: false,
      });
    });

    it('returns blocked status for a sanctioned wallet', async () => {
      nock(MOCK_API_URL).get('/v1/wallet/0xSANCTIONED').reply(200, {
        address: '0xSANCTIONED',
        blocked: true,
      });
      const { rootMessenger } = getService();

      const result = await rootMessenger.call(
        'ComplianceService:checkWalletCompliance',
        '0xSANCTIONED',
      );

      expect(result).toStrictEqual({
        address: '0xSANCTIONED',
        blocked: true,
      });
    });

    it.each([
      'not an object',
      { missing: 'address' },
      { address: 123, blocked: true },
      { address: '0xABC', blocked: 'not a boolean' },
      { address: '0xABC' },
      { blocked: true },
    ])(
      'throws if the API returns a malformed response %o',
      async (response) => {
        nock(MOCK_API_URL)
          .get('/v1/wallet/0xABC123')
          .reply(200, JSON.stringify(response));
        const { rootMessenger } = getService();

        await expect(
          rootMessenger.call(
            'ComplianceService:checkWalletCompliance',
            '0xABC123',
          ),
        ).rejects.toThrow(
          /Query function for "ComplianceService:checkWalletCompliance" returned an unexpected response/u,
        );
      },
    );

    it('throws an HttpError when the API returns a non-200 status', async () => {
      nock(MOCK_API_URL).get('/v1/wallet/0xABC123').times(4).reply(404);
      const { service } = getService();

      const promise = service.checkWalletCompliance('0xABC123');
      await expect(promise).rejects.toThrow(/failed with status '404'/u);
    });

    it('attempts a request that responds with non-200 up to 4 times, throwing if it never succeeds', async () => {
      const scope = nock(MOCK_API_URL)
        .get('/v1/wallet/0xABC123')
        .times(4)
        .reply(500);
      const { rootMessenger } = getService();

      const promise = rootMessenger.call(
        'ComplianceService:checkWalletCompliance',
        '0xABC123',
      );
      await expect(promise).rejects.toThrow(/failed with status '500'/u);
      expect(scope.isDone()).toBe(true);
    });

    it('intercepts requests and throws a circuit break error after the 4th failed attempt', async () => {
      nock(MOCK_API_URL).get('/v1/wallet/0xABC123').times(12).reply(500);
      const { rootMessenger } = getService();

      // Each call attempts 4 requests before failing
      for (let i = 0; i < 3; i++) {
        const promise = rootMessenger.call(
          'ComplianceService:checkWalletCompliance',
          '0xABC123',
        );
        await expect(promise).rejects.toThrow(/failed with status '500'/u);
      }
      // Circuit breaker opens
      const promise = rootMessenger.call(
        'ComplianceService:checkWalletCompliance',
        '0xABC123',
      );
      await expect(promise).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
    });

    it('uses the configured API URL when provided', async () => {
      nock(MOCK_CONFIGURED_API_URL).get('/v1/wallet/0xABC123').reply(200, {
        address: '0xABC123',
        blocked: false,
      });
      const { rootMessenger } = getService({
        options: { apiUrl: MOCK_CONFIGURED_API_URL, env: 'development' },
      });

      const result = await rootMessenger.call(
        'ComplianceService:checkWalletCompliance',
        '0xABC123',
      );

      expect(result).toStrictEqual({
        address: '0xABC123',
        blocked: false,
      });
    });

    it('preserves path components in the configured API URL', async () => {
      nock(MOCK_CONFIGURED_API_URL)
        .get('/compliance/v1/wallet/0xABC123')
        .reply(200, {
          address: '0xABC123',
          blocked: false,
        });
      const { rootMessenger } = getService({
        options: { apiUrl: `${MOCK_CONFIGURED_API_URL}/compliance` },
      });

      const result = await rootMessenger.call(
        'ComplianceService:checkWalletCompliance',
        '0xABC123',
      );

      expect(result).toStrictEqual({
        address: '0xABC123',
        blocked: false,
      });
    });

    it('defaults to the production API URL when no API URL or environment is provided', async () => {
      nock(MOCK_PRODUCTION_API_URL).get('/v1/wallet/0xABC123').reply(200, {
        address: '0xABC123',
        blocked: false,
      });
      const { rootMessenger } = getService({ useDefaultEnvironment: true });

      const result = await rootMessenger.call(
        'ComplianceService:checkWalletCompliance',
        '0xABC123',
      );

      expect(result).toStrictEqual({
        address: '0xABC123',
        blocked: false,
      });
    });

    it('throws if the configured API URL is invalid', () => {
      expect(() =>
        getService({ options: { apiUrl: 'not-a-valid-url' } }),
      ).toThrow('Invalid Compliance API URL: not-a-valid-url');
    });

    it('throws if the configured API URL includes a query string or fragment', () => {
      expect(() =>
        getService({
          options: { apiUrl: `${MOCK_CONFIGURED_API_URL}?foo=bar` },
        }),
      ).toThrow(
        `Invalid Compliance API URL: ${MOCK_CONFIGURED_API_URL}?foo=bar. Query strings and fragments are not supported.`,
      );
      expect(() =>
        getService({
          options: { apiUrl: `${MOCK_CONFIGURED_API_URL}#anchor` },
        }),
      ).toThrow(
        `Invalid Compliance API URL: ${MOCK_CONFIGURED_API_URL}#anchor. Query strings and fragments are not supported.`,
      );
    });
  });

  describe('ComplianceService:checkWalletsCompliance', () => {
    it('returns compliance statuses for multiple addresses', async () => {
      const addresses = ['0xABC', '0xDEF'];
      nock(MOCK_API_URL)
        .post('/v1/wallet/batch', JSON.stringify(addresses))
        .reply(200, [
          { address: '0xABC', blocked: false },
          { address: '0xDEF', blocked: true },
        ]);
      const { rootMessenger } = getService();

      const result = await rootMessenger.call(
        'ComplianceService:checkWalletsCompliance',
        addresses,
      );

      expect(result).toStrictEqual([
        { address: '0xABC', blocked: false },
        { address: '0xDEF', blocked: true },
      ]);
    });

    it.each([
      'not an array',
      [{ missing: 'address', blocked: true }],
      [{ address: '0xABC', blocked: 'not boolean' }],
      [{ address: 123, blocked: true }],
    ])(
      'throws if the API returns a malformed response %o',
      async (response) => {
        nock(MOCK_API_URL)
          .post('/v1/wallet/batch')
          .reply(200, JSON.stringify(response));
        const { rootMessenger } = getService();

        await expect(
          rootMessenger.call('ComplianceService:checkWalletsCompliance', [
            '0xABC',
          ]),
        ).rejects.toThrow(
          /Query function for "ComplianceService:checkWalletsCompliance" returned an unexpected response/u,
        );
      },
    );

    it('throws an HttpError when the API returns a non-200 status', async () => {
      nock(MOCK_API_URL).post('/v1/wallet/batch').times(4).reply(500);
      const { service } = getService();

      const promise = service.checkWalletsCompliance(['0xABC']);
      await expect(promise).rejects.toThrow(/failed with status '500'/u);
    });
  });

  describe('checkWalletCompliance', () => {
    it('does the same thing as the messenger action', async () => {
      nock(MOCK_API_URL).get('/v1/wallet/0xABC123').reply(200, {
        address: '0xABC123',
        blocked: false,
      });
      const { service } = getService();

      const result = await service.checkWalletCompliance('0xABC123');

      expect(result).toStrictEqual({
        address: '0xABC123',
        blocked: false,
      });
    });
  });

  describe('checkWalletsCompliance', () => {
    it('does the same thing as the messenger action', async () => {
      const addresses = ['0xABC'];
      nock(MOCK_API_URL)
        .post('/v1/wallet/batch', JSON.stringify(addresses))
        .reply(200, [{ address: '0xABC', blocked: true }]);
      const { service } = getService();

      const result = await service.checkWalletsCompliance(addresses);

      expect(result).toStrictEqual([{ address: '0xABC', blocked: true }]);
    });
  });

  describe('BaseDataService integration', () => {
    it('registers the invalidateQueries action', async () => {
      const { rootMessenger } = getService();

      expect(
        await rootMessenger.call('ComplianceService:invalidateQueries'),
      ).toBeUndefined();
    });

    it('publishes cacheUpdated after a wallet check', async () => {
      nock(MOCK_API_URL)
        .get('/v1/wallet/0xABC123')
        .reply(200, { address: '0xABC123', blocked: false });
      const { service, messenger } = getService();
      const publishSpy = vi.spyOn(messenger, 'publish');

      await service.checkWalletCompliance('0xABC123');

      expect(publishSpy).toHaveBeenCalledWith(
        'ComplianceService:cacheUpdated',
        expect.objectContaining({ objectType: 'query' }),
      );
    });

    it('deduplicates concurrent checks for the same address', async () => {
      nock(MOCK_API_URL)
        .get('/v1/wallet/0xABC123')
        .reply(200, { address: '0xABC123', blocked: true });
      const secondRequest = nock(MOCK_API_URL)
        .get('/v1/wallet/0xABC123')
        .reply(200, { address: '0xABC123', blocked: false });
      const { service } = getService();

      const results = await Promise.all([
        service.checkWalletCompliance('0xABC123'),
        service.checkWalletCompliance('0xABC123'),
      ]);

      expect(results).toStrictEqual([
        { address: '0xABC123', blocked: true },
        { address: '0xABC123', blocked: true },
      ]);
      expect(secondRequest.isDone()).toBe(false);
    });

    it('never serves a sequential re-check from cache', async () => {
      nock(MOCK_API_URL)
        .get('/v1/wallet/0xABC123')
        .reply(200, { address: '0xABC123', blocked: false });
      nock(MOCK_API_URL)
        .get('/v1/wallet/0xABC123')
        .reply(200, { address: '0xABC123', blocked: true });
      const { service } = getService();

      expect(await service.checkWalletCompliance('0xABC123')).toStrictEqual({
        address: '0xABC123',
        blocked: false,
      });
      expect(await service.checkWalletCompliance('0xABC123')).toStrictEqual({
        address: '0xABC123',
        blocked: true,
      });
    });

    it('deduplicates concurrent batch checks for the same addresses', async () => {
      const body = [{ address: '0xA', blocked: false }];
      nock(MOCK_API_URL).post('/v1/wallet/batch', ['0xA']).reply(200, body);
      const secondRequest = nock(MOCK_API_URL)
        .post('/v1/wallet/batch', ['0xA'])
        .reply(200, body);
      const { service } = getService();

      await Promise.all([
        service.checkWalletsCompliance(['0xA']),
        service.checkWalletsCompliance(['0xA']),
      ]);

      expect(secondRequest.isDone()).toBe(false);
    });

    it('rejects a malformed response without retrying', async () => {
      nock(MOCK_API_URL).get('/v1/wallet/0xABC123').reply(200, { nope: true });
      const retry = nock(MOCK_API_URL)
        .get('/v1/wallet/0xABC123')
        .reply(200, { address: '0xABC123', blocked: false });
      const { service } = getService();

      await expect(service.checkWalletCompliance('0xABC123')).rejects.toThrow(
        /Query function for "ComplianceService:checkWalletCompliance" returned an unexpected response/u,
      );
      expect(retry.isDone()).toBe(false);
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ComplianceServiceMessenger>,
  MessengerEvents<ComplianceServiceMessenger>
>;

/**
 * Constructs the messenger populated with all external actions and events
 * required by the service under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the service's messenger.
 * @returns The service-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): ComplianceServiceMessenger {
  return new Messenger({
    namespace: 'ComplianceService',
    parent: rootMessenger,
  });
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All are
 * optional and will be filled in with defaults as needed (including
 * `messenger`).
 * @param args.useDefaultEnvironment - Whether to omit the default test
 * environment and use the service constructor default.
 * @returns The new service, root messenger, and service messenger.
 */
function getService({
  options = {},
  useDefaultEnvironment = false,
}: {
  options?: Partial<ConstructorParameters<typeof ComplianceService>[0]>;
  useDefaultEnvironment?: boolean;
} = {}): {
  service: ComplianceService;
  rootMessenger: RootMessenger;
  messenger: ComplianceServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const service = new ComplianceService({
    fetch,
    messenger,
    ...(useDefaultEnvironment ? {} : { env: 'development' as const }),
    ...options,
  });

  return { service, rootMessenger, messenger };
}
