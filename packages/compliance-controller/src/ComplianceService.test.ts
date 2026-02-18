import { HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';

import type { ComplianceServiceMessenger } from './ComplianceService';
import { ComplianceService } from './ComplianceService';

const MOCK_API_URL = 'https://compliance.dev-api.cx.metamask.io';

describe('ComplianceService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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
          'Malformed response received from compliance wallet check API',
        );
      },
    );

    it('throws an HttpError when the API returns a non-200 status', async () => {
      nock(MOCK_API_URL).get('/v1/wallet/0xABC123').times(4).reply(404);
      const { service } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(console.error);
      });

      await expect(service.checkWalletCompliance('0xABC123')).rejects.toThrow(
        /failed with status '404'/u,
      );
    });

    it('calls onDegraded listeners if the request takes longer than 5 seconds', async () => {
      nock(MOCK_API_URL)
        .get('/v1/wallet/0xABC123')
        .reply(200, () => {
          jest.advanceTimersByTime(6000);
          return { address: '0xABC123', blocked: false };
        });
      const { service, rootMessenger } = getService();
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await rootMessenger.call(
        'ComplianceService:checkWalletCompliance',
        '0xABC123',
      );

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('attempts a request that responds with non-200 up to 4 times, throwing if it never succeeds', async () => {
      nock(MOCK_API_URL).get('/v1/wallet/0xABC123').times(4).reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(console.error);
      });

      await expect(
        rootMessenger.call(
          'ComplianceService:checkWalletCompliance',
          '0xABC123',
        ),
      ).rejects.toThrow(/failed with status '500'/u);
    });

    it('intercepts requests and throws a circuit break error after the 4th failed attempt', async () => {
      nock(MOCK_API_URL).get('/v1/wallet/0xABC123').times(12).reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(console.error);
      });
      const onBreakListener = jest.fn();
      service.onBreak(onBreakListener);

      // Each call attempts 4 requests before failing
      await expect(
        rootMessenger.call(
          'ComplianceService:checkWalletCompliance',
          '0xABC123',
        ),
      ).rejects.toThrow(/failed with status '500'/u);
      await expect(
        rootMessenger.call(
          'ComplianceService:checkWalletCompliance',
          '0xABC123',
        ),
      ).rejects.toThrow(/failed with status '500'/u);
      await expect(
        rootMessenger.call(
          'ComplianceService:checkWalletCompliance',
          '0xABC123',
        ),
      ).rejects.toThrow(/failed with status '500'/u);
      // Circuit breaker opens
      await expect(
        rootMessenger.call(
          'ComplianceService:checkWalletCompliance',
          '0xABC123',
        ),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
      expect(onBreakListener).toHaveBeenCalledWith({
        error: expect.any(HttpError),
      });
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
          'Malformed response received from compliance batch check API',
        );
      },
    );

    it('throws an HttpError when the API returns a non-200 status', async () => {
      nock(MOCK_API_URL).post('/v1/wallet/batch').times(4).reply(500);
      const { service } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(console.error);
      });

      await expect(service.checkWalletsCompliance(['0xABC'])).rejects.toThrow(
        /failed with status '500'/u,
      );
    });
  });

  describe('ComplianceService:updateBlockedWallets', () => {
    it('returns the blocked wallets data', async () => {
      nock(MOCK_API_URL)
        .get('/v1/blocked-wallets')
        .reply(200, {
          addresses: ['0xABC', '0xDEF'],
          sources: { ofac: 100, remote: 5 },
          lastUpdated: '2026-01-01T00:00:00.000Z',
        });
      const { rootMessenger } = getService();

      const result = await rootMessenger.call(
        'ComplianceService:updateBlockedWallets',
      );

      expect(result).toStrictEqual({
        addresses: ['0xABC', '0xDEF'],
        sources: { ofac: 100, remote: 5 },
        lastUpdated: '2026-01-01T00:00:00.000Z',
      });
    });

    it.each([
      'not an object',
      {
        addresses: 'not an array',
        sources: { ofac: 1, remote: 1 },
        lastUpdated: '2026-01-01',
      },
      {
        addresses: ['0xABC'],
        sources: 'not an object',
        lastUpdated: '2026-01-01',
      },
      {
        addresses: ['0xABC'],
        sources: { ofac: 'nan', remote: 1 },
        lastUpdated: '2026-01-01',
      },
      {
        addresses: ['0xABC'],
        sources: { ofac: 1, remote: 'nan' },
        lastUpdated: '2026-01-01',
      },
      {
        addresses: ['0xABC'],
        sources: { ofac: 1, remote: 1 },
        lastUpdated: 123,
      },
      { addresses: ['0xABC'], sources: { ofac: 1, remote: 1 } },
      {
        addresses: [123],
        sources: { ofac: 1, remote: 1 },
        lastUpdated: '2026-01-01',
      },
    ])(
      'throws if the API returns a malformed response %o',
      async (response) => {
        nock(MOCK_API_URL)
          .get('/v1/blocked-wallets')
          .reply(200, JSON.stringify(response));
        const { rootMessenger } = getService();

        await expect(
          rootMessenger.call('ComplianceService:updateBlockedWallets'),
        ).rejects.toThrow(
          'Malformed response received from compliance blocked wallets API',
        );
      },
    );

    it('throws an HttpError when the API returns a non-200 status', async () => {
      nock(MOCK_API_URL).get('/v1/blocked-wallets').times(4).reply(503);
      const { service } = getService();
      service.onRetry(() => {
        jest.advanceTimersToNextTimerAsync().catch(console.error);
      });

      await expect(service.updateBlockedWallets()).rejects.toThrow(
        /failed with status '503'/u,
      );
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

  describe('updateBlockedWallets', () => {
    it('does the same thing as the messenger action', async () => {
      nock(MOCK_API_URL)
        .get('/v1/blocked-wallets')
        .reply(200, {
          addresses: ['0xABC'],
          sources: { ofac: 50, remote: 2 },
          lastUpdated: '2026-02-01T00:00:00.000Z',
        });
      const { service } = getService();

      const result = await service.updateBlockedWallets();

      expect(result).toStrictEqual({
        addresses: ['0xABC'],
        sources: { ofac: 50, remote: 2 },
        lastUpdated: '2026-02-01T00:00:00.000Z',
      });
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
 * @returns The new service, root messenger, and service messenger.
 */
function getService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof ComplianceService>[0]>;
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
    env: 'development',
    ...options,
  });

  return { service, rootMessenger, messenger };
}
