import { HttpError } from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { SDK } from '@metamask/profile-sync-controller';
import nock from 'nock';

import { ProfileMetricsService } from '.';
import type {
  ProfileMetricsSubmitMetricsRequest,
  ProfileMetricsServiceMessenger,
} from '.';
import { getAuthUrl } from './ProfileMetricsService';

const defaultBaseEndpoint = getAuthUrl(SDK.Env.DEV);

/**
 * Creates a mock request object for testing purposes.
 *
 * @param override - Optional properties to override in the mock request.
 * @returns A mock request object.
 */
function createMockRequest(
  override?: Partial<ProfileMetricsSubmitMetricsRequest>,
): ProfileMetricsSubmitMetricsRequest {
  return {
    metametricsId: 'mock-meta-metrics-id',
    entropySourceId: 'mock-entropy-source-id',
    accounts: [{ address: '0xMockAccountAddress1', scopes: ['eip155:1'] }],
    ...override,
  };
}

describe('ProfileMetricsService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('throws when an invalid env is selected', () => {
      expect(
        () =>
          new ProfileMetricsService({
            fetch,
            messenger: getMessenger(getRootMessenger()),
            // @ts-expect-error Testing invalid env
            env: 'invalid-env',
          }),
      ).toThrow('invalid environment configuration');
    });
  });

  describe('ProfileMetricsService:submitMetrics', () => {
    it('resolves when there is a successful response from the API and the accounts have an entropy source id', async () => {
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .reply(200, {
          data: {
            success: true,
          },
        });
      const { rootMessenger } = getService();

      const submitMetricsResponse = await rootMessenger.call(
        'ProfileMetricsService:submitMetrics',
        createMockRequest(),
      );

      expect(submitMetricsResponse).toBeUndefined();
    });

    it('sends fetch requests with credentials omitted', async () => {
      const mockFetch = jest.fn().mockResolvedValue(
        // eslint-disable-next-line no-restricted-globals
        new Response(JSON.stringify({ data: { success: true } }), {
          status: 200,
        }),
      );
      const { rootMessenger } = getService({
        options: { fetch: mockFetch },
      });

      await rootMessenger.call(
        'ProfileMetricsService:submitMetrics',
        createMockRequest(),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({ credentials: 'omit' }),
      );
    });

    it('resolves when there is a successful response from the API and the accounts do not have an entropy source id', async () => {
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .reply(200, {
          data: {
            success: true,
          },
        });
      const { rootMessenger } = getService();

      const request = createMockRequest({ entropySourceId: null });

      const submitMetricsResponse = await rootMessenger.call(
        'ProfileMetricsService:submitMetrics',
        request,
      );

      expect(submitMetricsResponse).toBeUndefined();
    });

    it('calls onDegraded listeners if the request takes longer than 5 seconds to resolve', async () => {
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .reply(200, () => {
          jest.advanceTimersByTime(6000);
          return {
            data: {
              success: true,
            },
          };
        });
      const { service, rootMessenger } = getService();
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await rootMessenger.call(
        'ProfileMetricsService:submitMetrics',
        createMockRequest(),
      );

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('allows the degradedThreshold to be changed', async () => {
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .reply(200, () => {
          jest.advanceTimersByTime(1000);
          return {
            data: {
              success: true,
            },
          };
        });
      const { service, rootMessenger } = getService({
        options: {
          policyOptions: { degradedThreshold: 500 },
        },
      });
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await rootMessenger.call(
        'ProfileMetricsService:submitMetrics',
        createMockRequest(),
      );

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('attempts a request that responds with non-200 up to 4 times, throwing if it never succeeds', async () => {
      nock(defaultBaseEndpoint).put('/profile/accounts').times(4).reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });

      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
    });

    it('calls onDegraded listeners when the maximum number of retries is exceeded', async () => {
      nock(defaultBaseEndpoint).put('/profile/accounts').times(4).reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('intercepts requests and throws a circuit break error after the 4th failed attempt, running onBreak listeners', async () => {
      nock(defaultBaseEndpoint).put('/profile/accounts').times(12).reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });
      const onBreakListener = jest.fn();
      service.onBreak(onBreakListener);

      // Should make 4 requests
      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      // Should make 4 requests
      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      // Should make 4 requests
      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      // Should not make an additional request (we only mocked 12 requests
      // above)
      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
      expect(onBreakListener).toHaveBeenCalledWith({
        error: new HttpError(
          500,
          `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
        ),
      });
    });

    it('resumes requests after the circuit break duration passes, returning the API response if the request ultimately succeeds', async () => {
      const circuitBreakDuration = 5_000;
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .times(12)
        .reply(500)
        .put('/profile/accounts')
        .reply(200, {
          data: {
            success: true,
          },
        });
      const { service, rootMessenger } = getService({
        options: {
          policyOptions: { circuitBreakDuration },
        },
      });
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });

      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
      jest.advanceTimersByTime(circuitBreakDuration);
      const submitMetricsResponse =
        await service.submitMetrics(createMockRequest());
      expect(submitMetricsResponse).toBeUndefined();
    });
  });

  describe('submitMetrics', () => {
    it('does the same thing as the messenger action', async () => {
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .reply(200, {
          data: {
            success: true,
          },
        });
      const { service } = getService();

      const submitMetricsResponse =
        await service.submitMetrics(createMockRequest());

      expect(submitMetricsResponse).toBeUndefined();
    });

    it('serializes the optional proof field for each account that has one and omits it for those that do not', async () => {
      const mockFetch = jest.fn().mockResolvedValue(
        // eslint-disable-next-line no-restricted-globals
        new Response(JSON.stringify({ data: { success: true } }), {
          status: 200,
        }),
      );
      const { rootMessenger } = getService({
        options: { fetch: mockFetch },
      });
      const proof = {
        nonce: 'mock-nonce',
        signature: '0xdeadbeef',
      };

      await rootMessenger.call(
        'ProfileMetricsService:submitMetrics',
        createMockRequest({
          accounts: [
            { address: '0xAccountWithProof', scopes: ['eip155:1'], proof },
            { address: '0xAccountWithoutProof', scopes: ['eip155:1'] },
          ],
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.accounts).toStrictEqual([
        { address: '0xAccountWithProof', scopes: ['eip155:1'], proof },
        { address: '0xAccountWithoutProof', scopes: ['eip155:1'] },
      ]);
      expect(body.accounts[1]).not.toHaveProperty('proof');
    });
  });

  describe('ProfileMetricsService:fetchNonces', () => {
    it('returns a map keyed by the echoed identifier field of the response', async () => {
      const identifiers = ['0xAddressOne', '0xAddressTwo'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch', { identifiers })
        .reply(200, [
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 'nonce-for-one',
          },
          {
            expires_in: 300,
            identifier: '0xAddressTwo',
            nonce: 'nonce-for-two',
          },
        ]);
      const { rootMessenger } = getService();

      const nonces = await rootMessenger.call(
        'ProfileMetricsService:fetchNonces',
        { identifiers, entropySourceId: 'mock-entropy-source-id' },
      );

      expect(nonces).toStrictEqual({
        '0xAddressOne': 'nonce-for-one',
        '0xAddressTwo': 'nonce-for-two',
      });
    });

    it('tolerates unknown additive fields in the response (forward-compatible schema)', async () => {
      const identifiers = ['0xAddressOne'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch', { identifiers })
        .reply(200, [
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 'nonce-for-one',
            created_at: '2026-06-01T00:00:00Z',
            schema_version: 2,
          },
        ]);
      const { rootMessenger } = getService();

      const nonces = await rootMessenger.call(
        'ProfileMetricsService:fetchNonces',
        { identifiers },
      );

      expect(nonces).toStrictEqual({ '0xAddressOne': 'nonce-for-one' });
    });

    it('tolerates the response being out of order relative to the request', async () => {
      const identifiers = ['0xAddressOne', '0xAddressTwo'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch', { identifiers })
        .reply(200, [
          {
            expires_in: 300,
            identifier: '0xAddressTwo',
            nonce: 'nonce-for-two',
          },
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 'nonce-for-one',
          },
        ]);
      const { rootMessenger } = getService();

      const nonces = await rootMessenger.call(
        'ProfileMetricsService:fetchNonces',
        { identifiers },
      );

      expect(nonces).toStrictEqual({
        '0xAddressOne': 'nonce-for-one',
        '0xAddressTwo': 'nonce-for-two',
      });
    });

    it('forwards the entropy source ID to the bearer token resolver and omits credentials', async () => {
      const mockFetch = jest.fn().mockResolvedValue(
        // eslint-disable-next-line no-restricted-globals
        new Response(
          JSON.stringify([
            {
              expires_in: 300,
              identifier: '0xAddress',
              nonce: 'nonce-value',
            },
          ]),
          { status: 200 },
        ),
      );
      const bearerTokenHandler = jest
        .fn<Promise<string>, [string | undefined]>()
        .mockResolvedValue('mock-bearer-token');
      const { rootMessenger } = getService({
        options: { fetch: mockFetch },
        bearerTokenHandler,
      });

      await rootMessenger.call('ProfileMetricsService:fetchNonces', {
        identifiers: ['0xAddress'],
        entropySourceId: 'mock-entropy-source-id',
      });

      expect(bearerTokenHandler).toHaveBeenCalledWith('mock-entropy-source-id');
      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl.toString()).toBe(`${defaultBaseEndpoint}/nonce/batch`);
      expect(calledInit).toMatchObject({
        method: 'POST',
        credentials: 'omit',
        headers: {
          Authorization: 'Bearer mock-bearer-token',
          'Content-Type': 'application/json',
        },
      });
    });

    it('omits the entropy source ID when none is provided', async () => {
      const bearerTokenHandler = jest
        .fn<Promise<string>, [string | undefined]>()
        .mockResolvedValue('mock-bearer-token');
      const mockFetch = jest.fn().mockResolvedValue(
        // eslint-disable-next-line no-restricted-globals
        new Response(
          JSON.stringify([
            {
              expires_in: 300,
              identifier: '0xAddress',
              nonce: 'nonce-value',
            },
          ]),
          { status: 200 },
        ),
      );
      const { rootMessenger } = getService({
        options: { fetch: mockFetch },
        bearerTokenHandler,
      });

      await rootMessenger.call('ProfileMetricsService:fetchNonces', {
        identifiers: ['0xAddress'],
      });

      expect(bearerTokenHandler).toHaveBeenCalledWith(undefined);
    });

    it('throws a RangeError when no identifiers are provided', async () => {
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers: [],
        }),
      ).rejects.toThrow(
        'ProfileMetricsService.fetchNonces requires at least 1 identifier.',
      );
    });

    it('chunks requests larger than MAX_NONCE_BATCH_SIZE into multiple HTTP calls and merges the results', async () => {
      const identifiers = Array.from(
        { length: 120 },
        (_, i) => `0xAddress${i}`,
      );
      const scope = nock(defaultBaseEndpoint);
      // The chunker slices into 50 + 50 + 20. Order of completion across
      // chunks is not guaranteed (Promise.all), so we match every chunk by
      // its request body and respond with a one-to-one nonce per identifier.
      scope
        .post('/nonce/batch')
        .times(3)
        .reply(200, (_uri, requestBody) => {
          const { identifiers: chunkIdentifiers } = requestBody as {
            identifiers: string[];
          };
          return chunkIdentifiers.map((identifier) => ({
            expires_in: 300,
            identifier,
            nonce: `nonce-for-${identifier}`,
          }));
        });
      const { rootMessenger } = getService();

      const nonces = await rootMessenger.call(
        'ProfileMetricsService:fetchNonces',
        { identifiers },
      );

      expect(Object.keys(nonces)).toHaveLength(120);
      identifiers.forEach((identifier) => {
        expect(nonces[identifier]).toBe(`nonce-for-${identifier}`);
      });
      expect(scope.pendingMocks()).toHaveLength(0);
    });

    it('throws after exhausting retries when the response is short of identifiers', async () => {
      const identifiers = ['0xAddressOne', '0xAddressTwo'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .times(4)
        .reply(200, [
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 'nonce-for-one',
          },
        ]);
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/nonce/batch' returned a response whose identifier set does not match the request`,
      );
    });

    it('throws after exhausting retries when the response returns identifiers we did not request', async () => {
      const identifiers = ['0xAddressOne', '0xAddressTwo'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .times(4)
        .reply(200, [
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 'nonce-for-one',
          },
          {
            expires_in: 300,
            identifier: '0xUnexpectedAddress',
            nonce: 'nonce-for-impostor',
          },
        ]);
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/nonce/batch' returned a response whose identifier set does not match the request`,
      );
    });

    it('throws after exhausting retries when the response duplicates one identifier in place of another', async () => {
      const identifiers = ['0xAddressOne', '0xAddressTwo'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .times(4)
        .reply(200, [
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 'nonce-for-one-a',
          },
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 'nonce-for-one-b',
          },
        ]);
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/nonce/batch' returned a response whose identifier set does not match the request`,
      );
    });

    it('throws after exhausting retries when the response duplicates an identifier alongside a full set (preventing silent overwrite)', async () => {
      const identifiers = ['0xAddressOne', '0xAddressTwo'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .times(4)
        .reply(200, [
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 'nonce-for-one-a',
          },
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 'nonce-for-one-b',
          },
          {
            expires_in: 300,
            identifier: '0xAddressTwo',
            nonce: 'nonce-for-two',
          },
        ]);
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/nonce/batch' returned a response whose identifier set does not match the request`,
      );
    });

    it('throws after exhausting retries when the response body is not an array', async () => {
      const identifiers = ['0xAddressOne'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .times(4)
        .reply(200, { error: 'oops' });
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        `Malformed response received from '${defaultBaseEndpoint}/nonce/batch'`,
      );
    });

    it('throws after exhausting retries when a response entry is missing the `nonce` field', async () => {
      const identifiers = ['0xAddressOne'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .times(4)
        .reply(200, [{ expires_in: 300, identifier: '0xAddressOne' }]);
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        `Malformed response received from '${defaultBaseEndpoint}/nonce/batch'`,
      );
    });

    it('throws after exhausting retries when a response entry has a non-string `nonce`', async () => {
      const identifiers = ['0xAddressOne'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .times(4)
        .reply(200, [
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 12345,
          },
        ]);
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        `Malformed response received from '${defaultBaseEndpoint}/nonce/batch'`,
      );
    });

    it('attempts a request that responds with non-200 up to 4 times, throwing if it never succeeds', async () => {
      nock(defaultBaseEndpoint).post('/nonce/batch').times(4).reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers: ['0xAddressOne'],
        }),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/nonce/batch' failed with status '500'`,
      );
    });

    it('attempts a request that responds with 4xx up to 4 times, throwing if it never succeeds', async () => {
      nock(defaultBaseEndpoint).post('/nonce/batch').times(4).reply(400);
      const { service, rootMessenger } = getService();
      service.onRetry(({ delay }: { delay: number }) => {
        jest.advanceTimersByTime(delay);
      });

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers: ['0xAddressOne'],
        }),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/nonce/batch' failed with status '400'`,
      );
    });
  });

  describe('fetchNonces', () => {
    it('does the same thing as the messenger action', async () => {
      const identifiers = ['0xAddressOne'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch', { identifiers })
        .reply(200, [
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 'nonce-value',
          },
        ]);
      const { service } = getService();

      const nonces = await service.fetchNonces({ identifiers });

      expect(nonces).toStrictEqual({ '0xAddressOne': 'nonce-value' });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ProfileMetricsServiceMessenger>,
  MessengerEvents<ProfileMetricsServiceMessenger>
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
 * events required by the controller's messenger.
 * @returns The service-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): ProfileMetricsServiceMessenger {
  const serviceMessenger: ProfileMetricsServiceMessenger = new Messenger({
    namespace: 'ProfileMetricsService',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger: serviceMessenger,
    actions: ['AuthenticationController:getBearerToken'],
  });
  return serviceMessenger;
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.options - The options that the service constructor takes. All are
 * optional and will be filled in with defaults in as needed (including
 * `messenger`).
 * @param args.bearerTokenHandler - Optional override for the
 * `AuthenticationController:getBearerToken` handler. Defaults to a stub that
 * always resolves to `'mock-bearer-token'`.
 * @returns The new service, root messenger, and service messenger.
 */
function getService({
  options = {},
  bearerTokenHandler,
}: {
  options?: Partial<ConstructorParameters<typeof ProfileMetricsService>[0]>;
  bearerTokenHandler?: (entropySourceId: string | undefined) => Promise<string>;
} = {}): {
  service: ProfileMetricsService;
  rootMessenger: RootMessenger;
  messenger: ProfileMetricsServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    bearerTokenHandler ?? (async (): Promise<string> => 'mock-bearer-token'),
  );

  const messenger = getMessenger(rootMessenger);
  const service = new ProfileMetricsService({
    fetch,
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
