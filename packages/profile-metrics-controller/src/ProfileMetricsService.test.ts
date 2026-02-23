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
 * @returns The new service, root messenger, and service messenger.
 */
function getService({
  options = {},
}: {
  options?: Partial<ConstructorParameters<typeof ProfileMetricsService>[0]>;
} = {}): {
  service: ProfileMetricsService;
  rootMessenger: RootMessenger;
  messenger: ProfileMetricsServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    async () => 'mock-bearer-token',
  );

  const messenger = getMessenger(rootMessenger);
  const service = new ProfileMetricsService({
    fetch,
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
