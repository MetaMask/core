import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
  type MessengerActions,
  type MessengerEvents,
} from '@metamask/messenger';
import nock from 'nock';
import { type SinonFakeTimers, useFakeTimers } from 'sinon';

import {
  UserProfileService,
  type UserProfileUpdateRequest,
  type UserProfileServiceMessenger,
  Env,
  getEnvUrl,
} from '.';
import { HttpError } from '../../controller-utils/src/util';

const defaultBaseEndpoint = getEnvUrl(Env.DEV);

/**
 * Creates a mock request object for testing purposes.
 *
 * @param override - Optional properties to override in the mock request.
 * @returns A mock request object.
 */
function createMockRequest(
  override?: Partial<UserProfileUpdateRequest>,
): UserProfileUpdateRequest {
  return {
    metametricsId: 'mock-meta-metrics-id',
    entropySourceId: 'mock-entropy-source-id',
    accounts: [{ address: 'eip155:_:0xMockAccountAddress1' }],
    ...override,
  };
}

describe('UserProfileService', () => {
  let clock: SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  describe('constructor', () => {
    it('throws when an invalid env is selected', () => {
      expect(
        () =>
          new UserProfileService({
            fetch,
            messenger: getMessenger(getRootMessenger()),
            // @ts-expect-error Testing invalid env
            env: 'invalid-env',
          }),
      ).toThrow('invalid environment configuration');
    });
  });

  describe('UserProfileService:updateProfile', () => {
    it('resolves when there is a successful response from the API and the accounts have an entropy source id', async () => {
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .reply(200, {
          data: {
            success: true,
          },
        });
      const { rootMessenger } = getService();

      const updateProfileResponse = await rootMessenger.call(
        'UserProfileService:updateProfile',
        createMockRequest(),
      );

      expect(updateProfileResponse).toBeUndefined();
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

      const updateProfileResponse = await rootMessenger.call(
        'UserProfileService:updateProfile',
        request,
      );

      expect(updateProfileResponse).toBeUndefined();
    });

    it('calls onDegraded listeners if the request takes longer than 5 seconds to resolve', async () => {
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .reply(200, () => {
          clock.tick(6000);
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
        'UserProfileService:updateProfile',
        createMockRequest(),
      );

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('allows the degradedThreshold to be changed', async () => {
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .reply(200, () => {
          clock.tick(1000);
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
        'UserProfileService:updateProfile',
        createMockRequest(),
      );

      expect(onDegradedListener).toHaveBeenCalled();
    });

    it('attempts a request that responds with non-200 up to 4 times, throwing if it never succeeds', async () => {
      nock(defaultBaseEndpoint).put('/profile/accounts').times(4).reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(clock.next);

      await expect(
        rootMessenger.call(
          'UserProfileService:updateProfile',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
    });

    it('calls onDegraded listeners when the maximum number of retries is exceeded', async () => {
      nock(defaultBaseEndpoint).put('/profile/accounts').times(4).reply(500);
      const { service, rootMessenger } = getService();
      service.onRetry(clock.next);
      const onDegradedListener = jest.fn();
      service.onDegraded(onDegradedListener);

      await expect(
        rootMessenger.call(
          'UserProfileService:updateProfile',
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
      service.onRetry(clock.next);
      const onBreakListener = jest.fn();
      service.onBreak(onBreakListener);

      // Should make 4 requests
      await expect(
        rootMessenger.call(
          'UserProfileService:updateProfile',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      // Should make 4 requests
      await expect(
        rootMessenger.call(
          'UserProfileService:updateProfile',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      // Should make 4 requests
      await expect(
        rootMessenger.call(
          'UserProfileService:updateProfile',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      // Should not make an additional request (we only mocked 12 requests
      // above)
      await expect(
        rootMessenger.call(
          'UserProfileService:updateProfile',
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
      service.onRetry(clock.next);

      await expect(
        rootMessenger.call(
          'UserProfileService:updateProfile',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      await expect(
        rootMessenger.call(
          'UserProfileService:updateProfile',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      await expect(
        rootMessenger.call(
          'UserProfileService:updateProfile',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        `Fetching '${defaultBaseEndpoint}/profile/accounts' failed with status '500'`,
      );
      await expect(
        rootMessenger.call(
          'UserProfileService:updateProfile',
          createMockRequest(),
        ),
      ).rejects.toThrow(
        'Execution prevented because the circuit breaker is open',
      );
      await clock.tickAsync(circuitBreakDuration);
      const updateProfileResponse =
        await service.updateProfile(createMockRequest());
      expect(updateProfileResponse).toBeUndefined();
    });
  });

  describe('fetchGasPrices', () => {
    it('does the same thing as the messenger action', async () => {
      nock(defaultBaseEndpoint)
        .put('/profile/accounts')
        .reply(200, {
          data: {
            success: true,
          },
        });
      const { service } = getService();

      const updateProfileResponse =
        await service.updateProfile(createMockRequest());

      expect(updateProfileResponse).toBeUndefined();
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<UserProfileServiceMessenger>,
  MessengerEvents<UserProfileServiceMessenger>
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
): UserProfileServiceMessenger {
  const serviceMessenger: UserProfileServiceMessenger = new Messenger({
    namespace: 'UserProfileService',
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
  options?: Partial<ConstructorParameters<typeof UserProfileService>[0]>;
} = {}): {
  service: UserProfileService;
  rootMessenger: RootMessenger;
  messenger: UserProfileServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    async () => 'mock-bearer-token',
  );

  const messenger = getMessenger(rootMessenger);
  const service = new UserProfileService({
    fetch,
    messenger,
    ...options,
  });

  return { service, rootMessenger, messenger };
}
