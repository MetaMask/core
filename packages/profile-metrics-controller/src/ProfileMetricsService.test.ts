import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';
import { SDK } from '@metamask/profile-sync-controller';
import nock from 'nock';
import { isDeepStrictEqual } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProfileMetricsService } from './index.js';
import type {
  ProfileMetricsSubmitMetricsRequest,
  ProfileMetricsServiceMessenger,
} from './index.js';
import { getAuthUrl } from './ProfileMetricsService.js';

const defaultBaseEndpoint = getAuthUrl(SDK.Env.DEV);

/** Opt-in retries for tests that exercise the service policy retry path. */
const RETRY_POLICY = { maxRetries: 3 } as const;

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
    vi.useFakeTimers({
      toNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'],
    });
  });

  afterEach(() => {
    nock.cleanAll();
    vi.useRealTimers();
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

    it('does not expose the policy event listeners of the previous implementation', () => {
      const { service } = getService();

      expect(service).not.toHaveProperty('onRetry');
      expect(service).not.toHaveProperty('onBreak');
      expect(service).not.toHaveProperty('onDegraded');
    });
  });

  describe('BaseDataService integration', () => {
    it('registers the invalidateQueries action', async () => {
      const { rootMessenger } = getService();

      expect(
        await rootMessenger.call('ProfileMetricsService:invalidateQueries'),
      ).toBeUndefined();
    });

    it('publishes cacheUpdated after fetching nonces', async () => {
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .reply(200, [
          { expires_in: 300, identifier: '0xAddressOne', nonce: 'nonce-one' },
        ]);
      const { service, messenger } = getService();
      const publishSpy = vi.spyOn(messenger, 'publish');

      await service.fetchNonces({ identifiers: ['0xAddressOne'] });

      expect(publishSpy).toHaveBeenCalledWith(
        'ProfileMetricsService:cacheUpdated',
        expect.objectContaining({ objectType: 'query' }),
      );
    });

    it('publishes cacheUpdated after submitting metrics', async () => {
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .reply(200, { data: { success: true } });
      const { service, messenger } = getService();
      const publishSpy = vi.spyOn(messenger, 'publish');

      await service.submitMetrics(createMockRequest());

      expect(publishSpy).toHaveBeenCalledWith(
        'ProfileMetricsService:cacheUpdated',
        expect.objectContaining({ objectType: 'mutation' }),
      );
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
      const mockFetch = vi.fn().mockResolvedValue(
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

    it('does not retry a failed request, even when retries are enabled', async () => {
      const scope = nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .once()
        .reply(500);
      const { rootMessenger } = getService({
        options: { policyOptions: RETRY_POLICY },
      });

      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      expect(scope.isDone()).toBe(true);
    });

    it('opens the circuit breaker after the configured number of consecutive failures', async () => {
      nock(defaultBaseEndpoint).put('/profile/accounts').times(2).reply(500);
      const { rootMessenger } = getService({
        options: { policyOptions: { maxConsecutiveFailures: 2 } },
      });

      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(
          rootMessenger.call(
            'ProfileMetricsService:submitMetrics',
            createMockRequest(),
          ),
        ).rejects.toThrow(/failed with status '500'/u);
      }
      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
    });

    it('shares one circuit breaker with fetchNonces', async () => {
      nock(defaultBaseEndpoint).put('/profile/accounts').times(2).reply(500);
      const { rootMessenger } = getService({
        options: {
          policyOptions: { maxRetries: 0, maxConsecutiveFailures: 2 },
        },
      });

      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(
          rootMessenger.call(
            'ProfileMetricsService:submitMetrics',
            createMockRequest(),
          ),
        ).rejects.toThrow(/failed with status '500'/u);
      }
      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers: ['0xAddressOne'],
        }),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
    });

    it('resumes requests after the circuit break duration passes', async () => {
      const circuitBreakDuration = 5_000;
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .times(2)
        .reply(500)
        .put('/profile/accounts')
        .reply(200, { data: { success: true } });
      const { service, rootMessenger } = getService({
        options: {
          policyOptions: { maxConsecutiveFailures: 2, circuitBreakDuration },
        },
      });

      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(
          rootMessenger.call(
            'ProfileMetricsService:submitMetrics',
            createMockRequest(),
          ),
        ).rejects.toThrow(/failed with status '500'/u);
      }
      await expect(
        rootMessenger.call(
          'ProfileMetricsService:submitMetrics',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
      vi.advanceTimersByTime(circuitBreakDuration);

      expect(await service.submitMetrics(createMockRequest())).toBeUndefined();
    });

    it('does not put the metametrics ID or entropy source ID in the published cache events', async () => {
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .reply(200, { data: { success: true } });
      const { service, messenger } = getService();
      const publishSpy = vi.spyOn(messenger, 'publish');

      await service.submitMetrics(createMockRequest());

      const published = publishSpy.mock.calls.filter(([eventType]) =>
        String(eventType).startsWith('ProfileMetricsService:cacheUpdated'),
      );
      expect(published.length).toBeGreaterThan(0);
      const serialized = JSON.stringify(published);
      expect(serialized).toContain('"objectType":"mutation"');
      expect(serialized).not.toContain('mock-meta-metrics-id');
      expect(serialized).not.toContain('mock-entropy-source-id');
      expect(serialized).not.toContain('0xMockAccountAddress1');
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

    it('serializes the optional proof and account source for each account that has them and omits them for those that do not', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
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
            {
              address: '0xMnemonicAccount',
              scopes: ['eip155:1'],
              accountSource: 'mnemonic',
              proof,
            },
            {
              address: '0xImportedAccount',
              scopes: ['eip155:1'],
              accountSource: 'imported',
            },
            { address: '0xUnknownAccount', scopes: ['eip155:1'] },
          ],
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.accounts).toStrictEqual([
        {
          address: '0xMnemonicAccount',
          scopes: ['eip155:1'],
          account_source: 'mnemonic',
          proof,
        },
        {
          address: '0xImportedAccount',
          scopes: ['eip155:1'],
          account_source: 'imported',
        },
        { address: '0xUnknownAccount', scopes: ['eip155:1'] },
      ]);
      for (const account of body.accounts) {
        expect(account).not.toHaveProperty('accountSource');
      }
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
      const mockFetch = vi.fn().mockResolvedValue(
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
      const bearerTokenHandler = vi
        .fn<(entropySourceId: string | undefined) => Promise<string>>()
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
      const bearerTokenHandler = vi
        .fn<(entropySourceId: string | undefined) => Promise<string>>()
        .mockResolvedValue('mock-bearer-token');
      const mockFetch = vi.fn().mockResolvedValue(
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
      [
        identifiers.slice(0, 50),
        identifiers.slice(50, 100),
        identifiers.slice(100),
      ].forEach((chunk) => {
        scope
          .post('/nonce/batch', (body: { identifiers: string[] }) =>
            isDeepStrictEqual(body.identifiers, chunk),
          )
          .reply(
            200,
            chunk.map((identifier) => ({
              expires_in: 300,
              identifier,
              nonce: `nonce-for-${identifier}`,
            })),
          );
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

    it('throws without retrying when the response is short of identifiers', async () => {
      const identifiers = ['0xAddressOne', '0xAddressTwo'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .once()
        .reply(200, [
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 'nonce-for-one',
          },
        ]);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/nonce/batch' returned a response whose identifier set does not match the request`,
      );
    });

    it('throws without retrying when the response returns identifiers we did not request', async () => {
      const identifiers = ['0xAddressOne', '0xAddressTwo'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .once()
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
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/nonce/batch' returned a response whose identifier set does not match the request`,
      );
    });

    it('throws without retrying when the response duplicates one identifier in place of another', async () => {
      const identifiers = ['0xAddressOne', '0xAddressTwo'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .once()
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
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/nonce/batch' returned a response whose identifier set does not match the request`,
      );
    });

    it('throws without retrying when the response duplicates an identifier alongside a full set (preventing silent overwrite)', async () => {
      const identifiers = ['0xAddressOne', '0xAddressTwo'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .once()
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
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/nonce/batch' returned a response whose identifier set does not match the request`,
      );
    });

    it('throws without retrying when the response body is not an array', async () => {
      const identifiers = ['0xAddressOne'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .once()
        .reply(200, { error: 'oops' });
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        /Query function for "ProfileMetricsService:fetchNonces" returned an unexpected response/u,
      );
    });

    it('throws without retrying when a response entry is missing the `nonce` field', async () => {
      const identifiers = ['0xAddressOne'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .once()
        .reply(200, [{ expires_in: 300, identifier: '0xAddressOne' }]);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        /Query function for "ProfileMetricsService:fetchNonces" returned an unexpected response/u,
      );
    });

    it('throws without retrying when a response entry has a non-string `nonce`', async () => {
      const identifiers = ['0xAddressOne'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .once()
        .reply(200, [
          {
            expires_in: 300,
            identifier: '0xAddressOne',
            nonce: 12345,
          },
        ]);
      const { rootMessenger } = getService();

      await expect(
        rootMessenger.call('ProfileMetricsService:fetchNonces', {
          identifiers,
        }),
      ).rejects.toThrow(
        /Query function for "ProfileMetricsService:fetchNonces" returned an unexpected response/u,
      );
    });

    it.each([500, 400])(
      'attempts a request that responds with %i up to 4 times, throwing if it never succeeds',
      async (status) => {
        const scope = nock(defaultBaseEndpoint)
          .post('/nonce/batch')
          .times(4)
          .reply(status);
        const { rootMessenger } = getService();

        await Promise.all([
          expect(
            rootMessenger.call('ProfileMetricsService:fetchNonces', {
              identifiers: ['0xAddressOne'],
            }),
          ).rejects.toThrow(
            `Fetching '${defaultBaseEndpoint}/nonce/batch' failed with status '${status}'`,
          ),
          vi.runAllTimersAsync(),
        ]);

        expect(scope.isDone()).toBe(true);
      },
    );

    it('does not share nonces between concurrent calls with identical arguments', async () => {
      const identifiers = ['0xAddressOne'];
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .reply(200, [
          { expires_in: 300, identifier: '0xAddressOne', nonce: 'nonce-1' },
        ])
        .post('/nonce/batch')
        .reply(200, [
          { expires_in: 300, identifier: '0xAddressOne', nonce: 'nonce-2' },
        ]);
      const { service } = getService();

      const results = await Promise.all([
        service.fetchNonces({ identifiers, entropySourceId: 'source' }),
        service.fetchNonces({ identifiers, entropySourceId: 'source' }),
      ]);

      expect(
        results.map((nonces) => nonces['0xAddressOne']).sort(),
      ).toStrictEqual(['nonce-1', 'nonce-2']);
    });

    it('always requests fresh nonces on sequential calls', async () => {
      const scope = nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .times(2)
        .reply(200, [
          { expires_in: 300, identifier: '0xAddressOne', nonce: 'nonce' },
        ]);
      const { service } = getService();

      await service.fetchNonces({ identifiers: ['0xAddressOne'] });
      await service.fetchNonces({ identifiers: ['0xAddressOne'] });

      expect(scope.isDone()).toBe(true);
    });

    it('does not put identifiers or the entropy source ID in the published cache event hashes', async () => {
      nock(defaultBaseEndpoint)
        .post('/nonce/batch')
        .reply(200, [
          { expires_in: 300, identifier: '0xAddressOne', nonce: 'nonce-one' },
        ]);
      const { service, messenger } = getService();
      const publishSpy = vi.spyOn(messenger, 'publish');

      await service.fetchNonces({
        identifiers: ['0xAddressOne'],
        entropySourceId: 'mock-entropy-source-id',
      });

      const eventTypes = publishSpy.mock.calls.map(([eventType]) =>
        String(eventType),
      );
      expect(eventTypes.length).toBeGreaterThan(0);
      const serializedKeys = JSON.stringify(
        publishSpy.mock.calls.map(([eventType, payload]) => [
          eventType,
          (payload as { hash?: string } | undefined)?.hash,
        ]),
      );
      expect(serializedKeys).not.toContain('0xAddressOne');
      expect(serializedKeys).not.toContain('mock-entropy-source-id');
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
