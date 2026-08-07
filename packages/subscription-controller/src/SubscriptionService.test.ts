import { DEFAULT_MAX_RETRIES } from '@metamask/base-data-service';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';

import {
  Env,
  getEnvUrls,
  SubscriptionControllerErrorMessage,
  SubscriptionServiceErrorMessage,
} from './constants.js';
import * as constants from './constants.js';
import { SubscriptionServiceError } from './errors.js';
import {
  serviceName,
  SUBSCRIPTION_URL,
  SubscriptionService,
} from './SubscriptionService.js';
import type { SubscriptionServiceMessenger } from './SubscriptionService.js';
import type {
  StartSubscriptionRequest,
  StartCryptoSubscriptionRequest,
  Subscription,
  PricingResponse,
  UpdatePaymentMethodCardRequest,
  UpdatePaymentMethodCryptoRequest,
  SubscriptionEligibility,
} from './types.js';
import {
  CANCEL_TYPES,
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  RECURRING_INTERVALS,
  SUBSCRIPTION_STATUSES,
  SubscriptionUserEvent,
} from './types.js';

// Mock data
const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub_123456789',
  products: [
    {
      name: PRODUCT_TYPES.SHIELD,
      currency: 'usd',
      unitAmount: 900,
      unitDecimals: 2,
    },
  ],
  currentPeriodStart: '2024-01-01T00:00:00Z',
  currentPeriodEnd: '2024-02-01T00:00:00Z',
  status: SUBSCRIPTION_STATUSES.active,
  interval: RECURRING_INTERVALS.month,
  paymentMethod: {
    type: PAYMENT_TYPES.byCard,
    card: {
      brand: 'visa',
      displayBrand: 'visa',
      last4: '1234',
    },
  },
  isEligibleForSupport: true,
  cancelType: CANCEL_TYPES.ALLOWED_AT_PERIOD_END,
};

const MOCK_ACCESS_TOKEN = 'mock-access-token-12345';

const MOCK_SESSION_PROFILE = {
  profileId: 'profile-1',
  canonicalProfileId: 'canonical-profile-1',
  metaMetricsId: 'metametrics-1',
};

const MOCK_START_SUBSCRIPTION_REQUEST: StartSubscriptionRequest = {
  products: [PRODUCT_TYPES.SHIELD],
  isTrialRequested: true,
  recurringInterval: RECURRING_INTERVALS.month,
};

const MOCK_START_SUBSCRIPTION_RESPONSE = {
  checkoutSessionUrl: 'https://checkout.example.com/session/123',
};

const MOCK_HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${MOCK_ACCESS_TOKEN}`,
};

const MOCK_COHORTS = [
  {
    cohort: 'post_tx',
    eligibilityRate: 0.8,
    priority: 1,
    eligible: true,
  },
  {
    cohort: 'wallet_home',
    eligibilityRate: 0.2,
    priority: 2,
    eligible: true,
  },
];

/**
 * Creates a mock subscription eligibility response
 *
 * @param overrides - Optional overrides for the response
 * @returns Mock eligibility response
 */
function createMockEligibilityResponse(
  overrides = {},
): SubscriptionEligibility {
  return {
    product: PRODUCT_TYPES.SHIELD,
    canSubscribe: true,
    canViewEntryModal: true,
    cohorts: [],
    assignedCohort: null,
    hasAssignedCohortExpired: false,
    ...overrides,
  };
}

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<SubscriptionServiceMessenger>,
  MessengerEvents<SubscriptionServiceMessenger>
>;

type MockServiceContext = {
  service: SubscriptionService;
  fetchMock: jest.Mock;
  captureExceptionMock: jest.Mock;
  env: Env;
  testUrl: string;
  rootMessenger: RootMessenger;
  messenger: SubscriptionServiceMessenger;
  getBearerToken: jest.Mock;
  getSessionProfile: jest.Mock;
};

function createRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

function createService({
  env = Env.DEV,
  fetchMock,
  captureExceptionMock = jest.fn(),
  getBearerToken = jest.fn().mockResolvedValue(MOCK_ACCESS_TOKEN),
  getSessionProfile = jest.fn().mockResolvedValue(MOCK_SESSION_PROFILE),
}: {
  env?: Env;
  fetchMock: jest.Mock;
  captureExceptionMock?: jest.Mock;
  getBearerToken?: jest.Mock;
  getSessionProfile?: jest.Mock;
}): MockServiceContext {
  const rootMessenger = createRootMessenger();
  rootMessenger.registerActionHandler(
    'AuthenticationController:getBearerToken',
    getBearerToken,
  );
  rootMessenger.registerActionHandler(
    'AuthenticationController:getSessionProfile',
    getSessionProfile,
  );
  const messenger: SubscriptionServiceMessenger = new Messenger({
    namespace: serviceName,
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    messenger,
    actions: [
      'AuthenticationController:getBearerToken',
      'AuthenticationController:getSessionProfile',
    ],
    events: [],
  });
  const service = new SubscriptionService({
    messenger,
    env,
    fetchFunction: fetchMock,
    captureException: captureExceptionMock,
  });

  return {
    service,
    fetchMock,
    captureExceptionMock,
    env,
    testUrl: ((): string => {
      try {
        return getTestUrl(env);
      } catch {
        return '';
      }
    })(),
    rootMessenger,
    messenger,
    getBearerToken,
    getSessionProfile,
  };
}

function withMockSubscriptionService(
  fn: (params: MockServiceContext) => Promise<void>,
  options: {
    env?: Env;
    getBearerToken?: jest.Mock;
    getSessionProfile?: jest.Mock;
  } = {},
): Promise<void> {
  const fetchMock = jest.fn();
  const captureExceptionMock = jest.fn();
  const context = createService({
    env: options.env ?? Env.DEV,
    fetchMock,
    captureExceptionMock,
    getBearerToken: options.getBearerToken,
    getSessionProfile: options.getSessionProfile,
  });
  return fn(context);
}

type MockResponseOptions = {
  ok?: boolean;
  status?: number;
  jsonData?: unknown;
  textData?: string;
  contentType?: string | null;
};

function createMockResponse({
  ok = true,
  status = 200,
  jsonData,
  textData = '',
  contentType = 'application/json',
}: MockResponseOptions): Response {
  return {
    ok,
    status,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === 'content-type' ? contentType : null,
    },
    json: jest.fn().mockResolvedValue(jsonData),
    text: jest.fn().mockResolvedValue(textData),
  } as unknown as Response;
}

/**
 * Gets the test URL for the given environment
 *
 * @param env - The environment to get the URL for
 * @returns The test URL for the environment
 */
function getTestUrl(env: Env): string {
  return getEnvUrls(env).subscriptionApiUrl;
}

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      const { service } = createService({ fetchMock: jest.fn() });

      expect(service).toBeInstanceOf(SubscriptionService);
    });

    it('should create instance with different environments', () => {
      expect(
        () => createService({ env: Env.DEV, fetchMock: jest.fn() }).service,
      ).not.toThrow();
      expect(
        () => createService({ env: Env.UAT, fetchMock: jest.fn() }).service,
      ).not.toThrow();
      expect(
        () => createService({ env: Env.PRD, fetchMock: jest.fn() }).service,
      ).not.toThrow();
    });

    it('defaults fetchFunction to globalThis.fetch when omitted', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        createMockResponse({
          jsonData: {
            customerId: 'cus_1',
            subscriptions: [],
            trialedProducts: [],
          },
        }),
      );

      try {
        const rootMessenger = createRootMessenger();
        rootMessenger.registerActionHandler(
          'AuthenticationController:getBearerToken',
          async () => MOCK_ACCESS_TOKEN,
        );
        rootMessenger.registerActionHandler(
          'AuthenticationController:getSessionProfile',
          async () => MOCK_SESSION_PROFILE,
        );
        const messenger: SubscriptionServiceMessenger = new Messenger({
          namespace: serviceName,
          parent: rootMessenger,
        });
        rootMessenger.delegate({
          messenger,
          actions: [
            'AuthenticationController:getBearerToken',
            'AuthenticationController:getSessionProfile',
          ],
          events: [],
        });
        const service = new SubscriptionService({
          messenger,
        });

        await service.getSubscriptions();

        expect(fetchSpy).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(Env.PRD, 'subscriptions'),
          expect.anything(),
        );
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('defaults env to PRD when omitted', async () => {
      const fetchMock = jest.fn();
      const rootMessenger = createRootMessenger();
      rootMessenger.registerActionHandler(
        'AuthenticationController:getBearerToken',
        async () => MOCK_ACCESS_TOKEN,
      );
      rootMessenger.registerActionHandler(
        'AuthenticationController:getSessionProfile',
        async () => MOCK_SESSION_PROFILE,
      );
      const messenger: SubscriptionServiceMessenger = new Messenger({
        namespace: serviceName,
        parent: rootMessenger,
      });
      rootMessenger.delegate({
        messenger,
        actions: [
          'AuthenticationController:getBearerToken',
          'AuthenticationController:getSessionProfile',
        ],
        events: [],
      });
      const service = new SubscriptionService({
        messenger,
        fetchFunction: fetchMock,
      });

      fetchMock.mockResolvedValue(
        createMockResponse({
          jsonData: {
            customerId: 'cus_1',
            subscriptions: [],
            trialedProducts: [],
          },
        }),
      );

      await service.getSubscriptions();

      expect(fetchMock).toHaveBeenCalledWith(
        SUBSCRIPTION_URL(Env.PRD, 'subscriptions'),
        expect.anything(),
      );
    });
  });

  describe('getSubscriptions', () => {
    it('should fetch subscriptions successfully', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, getBearerToken, getSessionProfile }) => {
          fetchMock.mockResolvedValue(
            createMockResponse({
              jsonData: {
                customerId: 'cus_1',
                subscriptions: [MOCK_SUBSCRIPTION],
                trialedProducts: [],
              },
            }),
          );

          const result = await service.getSubscriptions();

          expect(result).toStrictEqual({
            customerId: 'cus_1',
            subscriptions: [MOCK_SUBSCRIPTION],
            trialedProducts: [],
          });
          expect(getBearerToken).toHaveBeenCalledTimes(1);
          expect(getSessionProfile).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should send correct URL and headers', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock, env }) => {
        fetchMock.mockResolvedValue(
          createMockResponse({
            jsonData: {
              customerId: 'cus_1',
              subscriptions: [],
              trialedProducts: [],
            },
          }),
        );

        await service.getSubscriptions();

        expect(fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(env, 'subscriptions'),
          {
            method: 'GET',
            headers: MOCK_HEADERS,
            body: undefined,
          },
        );
      });
    });

    it('should throw when URL construction fails', async () => {
      const fetchMock = jest.fn();
      const captureExceptionMock = jest.fn();
      const { service } = createService({
        env: 'invalid' as Env,
        fetchMock,
        captureExceptionMock,
      });

      await expect(service.getSubscriptions()).rejects.toThrow(
        'invalid environment configuration',
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      const capturedError = captureExceptionMock.mock.calls[0][0] as Error & {
        cause?: Error;
      };
      expect(capturedError.message).toBe(
        'Failed to get subscription API URL. invalid environment configuration',
      );
    });

    it('should capture non-Error URL construction failures', async () => {
      const fetchMock = jest.fn();
      const captureExceptionMock = jest.fn();
      const { service } = createService({ fetchMock, captureExceptionMock });
      const getEnvUrlsSpy = jest
        .spyOn(constants, 'getEnvUrls')
        .mockImplementation(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'string error';
        });

      try {
        const error = await service
          .getSubscriptions()
          .catch((rejection) => rejection);
        expect(error).toBe('string error');
      } finally {
        getEnvUrlsSpy.mockRestore();
      }

      expect(fetchMock).not.toHaveBeenCalled();
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      const capturedError = captureExceptionMock.mock.calls[0][0] as Error & {
        cause?: Error;
      };
      expect(capturedError.message).toBe(
        'Failed to get subscription API URL. Unknown error when getting subscription API URL',
      );
      expect(capturedError.cause).toBeInstanceOf(Error);
      expect(capturedError.cause?.message).toBe(
        'Unknown error when getting subscription API URL',
      );
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, captureExceptionMock }) => {
          const networkError = new Error('Network error');
          fetchMock.mockRejectedValue(networkError);

          const error = await service.getSubscriptions().then(
            () => {
              throw new Error('Expected getSubscriptions to throw');
            },
            (rejection) => rejection,
          );

          expect(error).toBeInstanceOf(SubscriptionServiceError);
          const serviceError = error as SubscriptionServiceError;
          expect(serviceError.message).toBe(
            `Failed to make request. ${SubscriptionServiceErrorMessage.FailedToGetSubscriptions} (url: ${getTestUrl(Env.DEV)}/v1/subscriptions)`,
          );
          expect(serviceError.cause).toBe(networkError);
          expect(captureExceptionMock).toHaveBeenCalledTimes(1);
        },
      );

      await withMockSubscriptionService(
        async ({ service, fetchMock, captureExceptionMock }) => {
          fetchMock.mockRejectedValue('string error');

          const requestPromise = service.getSubscriptions();

          await expect(requestPromise).rejects.toThrow(
            SubscriptionServiceError,
          );
          await expect(requestPromise).rejects.toThrow(
            `Failed to make request. ${SubscriptionServiceErrorMessage.FailedToGetSubscriptions} (url: ${getTestUrl(Env.DEV)}/v1/subscriptions)`,
          );
          const error = await requestPromise.catch((rejection) => rejection);
          expect(error).toBeInstanceOf(SubscriptionServiceError);
          const serviceError = error as SubscriptionServiceError;
          expect(serviceError.cause).toBeInstanceOf(Error);
          expect(serviceError.cause?.message).toBe(
            SubscriptionServiceErrorMessage.FailedToGetSubscriptions,
          );
          expect(captureExceptionMock).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should throw SubscriptionServiceError for non-ok responses', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, captureExceptionMock }) => {
          fetchMock.mockResolvedValue(
            createMockResponse({
              ok: false,
              status: 500,
              jsonData: { error: 'Internal Server Error' },
            }),
          );

          const requestPromise = service.getSubscriptions();

          await expect(requestPromise).rejects.toThrow(
            SubscriptionServiceError,
          );
          await expect(requestPromise).rejects.toThrow(
            `Failed to make request. ${SubscriptionServiceErrorMessage.FailedToGetSubscriptions} (url: ${getTestUrl(Env.DEV)}/v1/subscriptions)`,
          );
          expect(captureExceptionMock).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should handle get access token error', async () => {
      await withMockSubscriptionService(
        async ({ service }) => {
          const requestPromise = service.getSubscriptions();

          await expect(requestPromise).rejects.toThrow(
            SubscriptionServiceError,
          );
          await expect(requestPromise).rejects.toThrow(
            'Failed to get authorization header. Unknown error when getting authorization header',
          );
        },
        {
          getBearerToken: jest.fn().mockRejectedValue('string error'),
        },
      );

      await withMockSubscriptionService(
        async ({ service }) => {
          const requestPromise = service.getSubscriptions();

          await expect(requestPromise).rejects.toThrow(
            SubscriptionServiceError,
          );
          await expect(requestPromise).rejects.toThrow(
            'Failed to get authorization header. Wallet is locked',
          );
        },
        {
          getBearerToken: jest
            .fn()
            .mockRejectedValue(new Error('Wallet is locked')),
        },
      );
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, getBearerToken }) => {
          fetchMock.mockResolvedValue(
            createMockResponse({ jsonData: MOCK_SUBSCRIPTION }),
          );

          const result = await service.cancelSubscription({
            subscriptionId: 'sub_123456789',
          });

          expect(result).toStrictEqual(MOCK_SUBSCRIPTION);
          expect(getBearerToken).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock }) => {
        fetchMock.mockRejectedValue(new Error('Network error'));

        await expect(
          service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });

    it('should throw SubscriptionServiceError for non-ok responses', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, captureExceptionMock }) => {
          fetchMock.mockResolvedValue(
            createMockResponse({
              ok: false,
              status: 404,
              jsonData: { message: 'Subscription not found' },
            }),
          );

          await expect(
            service.cancelSubscription({ subscriptionId: 'sub_invalid' }),
          ).rejects.toThrow(SubscriptionServiceError);
          expect(captureExceptionMock).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('uncancelSubscription', () => {
    it('should uncancel subscription successfully', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, getBearerToken }) => {
          fetchMock.mockResolvedValue(
            createMockResponse({ jsonData: MOCK_SUBSCRIPTION }),
          );

          await service.unCancelSubscription({
            subscriptionId: 'sub_123456789',
          });

          expect(getBearerToken).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock }) => {
        fetchMock.mockRejectedValue(new Error('Network error'));

        await expect(
          service.unCancelSubscription({ subscriptionId: 'sub_123456789' }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('startSubscription', () => {
    it('should start subscription successfully', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock }) => {
        fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: MOCK_START_SUBSCRIPTION_RESPONSE }),
        );

        const result = await service.startSubscriptionWithCard(
          MOCK_START_SUBSCRIPTION_REQUEST,
        );

        expect(result).toStrictEqual(MOCK_START_SUBSCRIPTION_RESPONSE);
      });
    });

    it('should start subscription without trial', async () => {
      const fetchMock = jest.fn();
      const { service } = createService({ fetchMock });
      const request: StartSubscriptionRequest = {
        products: [PRODUCT_TYPES.SHIELD],
        isTrialRequested: false,
        recurringInterval: RECURRING_INTERVALS.month,
      };

      fetchMock.mockResolvedValue(
        createMockResponse({ jsonData: MOCK_START_SUBSCRIPTION_RESPONSE }),
      );

      const result = await service.startSubscriptionWithCard(request);

      expect(result).toStrictEqual(MOCK_START_SUBSCRIPTION_RESPONSE);
    });

    it('throws when products array is empty', async () => {
      const { service } = createService({ fetchMock: jest.fn() });
      const request: StartSubscriptionRequest = {
        products: [],
        isTrialRequested: true,
        recurringInterval: RECURRING_INTERVALS.month,
      };

      await expect(service.startSubscriptionWithCard(request)).rejects.toThrow(
        SubscriptionControllerErrorMessage.SubscriptionProductsEmpty,
      );
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock }) => {
        fetchMock.mockRejectedValue(new Error('Network error'));

        await expect(
          service.startSubscriptionWithCard(MOCK_START_SUBSCRIPTION_REQUEST),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('startCryptoSubscription', () => {
    const MOCK_CRYPTO_REQUEST: StartCryptoSubscriptionRequest = {
      products: [PRODUCT_TYPES.SHIELD],
      isTrialRequested: false,
      recurringInterval: RECURRING_INTERVALS.month,
      billingCycles: 3,
      chainId: '0x1',
      payerAddress: '0x0000000000000000000000000000000000000001',
      tokenSymbol: 'USDC',
      rawTransaction: '0xdeadbeef',
    };

    it('should start crypto subscription successfully', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock }) => {
        const response = {
          subscriptionId: 'sub_crypto_123',
          status: SUBSCRIPTION_STATUSES.active,
        };

        fetchMock.mockResolvedValue(createMockResponse({ jsonData: response }));

        const result =
          await service.startSubscriptionWithCrypto(MOCK_CRYPTO_REQUEST);

        expect(result).toStrictEqual(response);
      });
    });
  });

  describe('getPricing', () => {
    const mockPricingResponse: PricingResponse = {
      products: [],
      paymentMethods: [],
    };

    it('should fetch pricing successfully', async () => {
      const fetchMock = jest.fn();
      const { service } = createService({ fetchMock });

      fetchMock.mockResolvedValue(
        createMockResponse({ jsonData: mockPricingResponse }),
      );

      const result = await service.getPricing();

      expect(result).toStrictEqual(mockPricingResponse);
    });
  });

  describe('updatePaymentMethodCard', () => {
    it('should update card payment method successfully', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock, env }) => {
        const request: UpdatePaymentMethodCardRequest = {
          subscriptionId: 'sub_123456789',
          recurringInterval: RECURRING_INTERVALS.month,
        };

        fetchMock.mockResolvedValue(
          createMockResponse({
            jsonData: { redirectUrl: 'https://example.com' },
          }),
        );

        await service.updatePaymentMethodCard(request);

        expect(fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(
            env,
            'subscriptions/sub_123456789/payment-method/card',
          ),
          {
            method: 'PATCH',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              ...request,
              subscriptionId: undefined,
            }),
          },
        );
      });
    });

    it('should update crypto payment method successfully', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock, env }) => {
        const request: UpdatePaymentMethodCryptoRequest = {
          subscriptionId: 'sub_123456789',
          chainId: '0x1',
          payerAddress: '0x0000000000000000000000000000000000000001',
          tokenSymbol: 'USDC',
          rawTransaction: '0xdeadbeef',
          recurringInterval: RECURRING_INTERVALS.month,
          billingCycles: 3,
        };

        fetchMock.mockResolvedValue(createMockResponse({ jsonData: {} }));

        await service.updatePaymentMethodCrypto(request);

        expect(fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(
            env,
            'subscriptions/sub_123456789/payment-method/crypto',
          ),
          {
            method: 'PATCH',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              ...request,
              subscriptionId: undefined,
            }),
          },
        );
      });
    });

    it('should throw SubscriptionServiceError for crypto payment method errors', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, captureExceptionMock }) => {
          fetchMock.mockRejectedValue(new Error('Network error'));

          await expect(
            service.updatePaymentMethodCrypto({
              subscriptionId: 'sub_123456789',
              chainId: '0x1',
              payerAddress: '0x0000000000000000000000000000000000000001',
              tokenSymbol: 'USDC',
              rawTransaction: '0xdeadbeef',
              recurringInterval: RECURRING_INTERVALS.month,
              billingCycles: 3,
            }),
          ).rejects.toThrow(SubscriptionServiceError);
          expect(captureExceptionMock).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('getBillingPortalUrl', () => {
    it('should get billing portal url successfully', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock }) => {
        fetchMock.mockResolvedValue(
          createMockResponse({
            jsonData: {
              url: 'https://billing-portal.com',
            },
          }),
        );

        const result = await service.getBillingPortalUrl();

        expect(result).toStrictEqual({ url: 'https://billing-portal.com' });
      });
    });
  });

  describe('getShieldSubscriptionEligibility', () => {
    it('should get shield subscription eligibility successfully', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock }) => {
        const mockResponse = createMockEligibilityResponse();
        fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: [mockResponse] }),
        );

        const results = await service.getSubscriptionsEligibilities();

        expect(results).toStrictEqual([mockResponse]);
      });
    });

    it('should get shield subscription eligibility with cohort information', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock }) => {
        const mockResponse = createMockEligibilityResponse({
          cohorts: MOCK_COHORTS,
          assignedCohort: 'post_tx',
          assignedAt: '2024-01-01T00:00:00Z',
        });

        fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: [mockResponse] }),
        );

        const results = await service.getSubscriptionsEligibilities({
          balanceCategory: '1k-9.9k',
        });

        expect(results).toStrictEqual([mockResponse]);
      });
    });

    it('should get shield subscription eligibility with default values', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock }) => {
        fetchMock.mockResolvedValue(
          createMockResponse({
            jsonData: [
              {
                product: PRODUCT_TYPES.SHIELD,
              },
            ],
          }),
        );

        const results = await service.getSubscriptionsEligibilities();

        expect(results).toHaveLength(1);
        expect(results).toStrictEqual([
          createMockEligibilityResponse({
            canSubscribe: false,
            canViewEntryModal: false,
          }),
        ]);
      });
    });

    it('should pass balanceCategory as query parameter when provided', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, getBearerToken }) => {
          const mockResponse = createMockEligibilityResponse();
          fetchMock.mockResolvedValue(
            createMockResponse({ jsonData: [mockResponse] }),
          );

          await service.getSubscriptionsEligibilities({
            balanceCategory: '100-999',
          });

          expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('balanceCategory=100-999'),
            expect.objectContaining({
              method: 'GET',
              headers: MOCK_HEADERS,
            }),
          );
          expect(getBearerToken).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should not pass balanceCategory query parameter when not provided', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, getBearerToken }) => {
          const mockResponse = createMockEligibilityResponse();
          fetchMock.mockResolvedValue(
            createMockResponse({ jsonData: [mockResponse] }),
          );

          await service.getSubscriptionsEligibilities();

          expect(fetchMock).toHaveBeenCalledWith(
            expect.not.stringMatching(/balanceCategory/u),
            expect.objectContaining({
              method: 'GET',
              headers: MOCK_HEADERS,
            }),
          );
          expect(getBearerToken).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, captureExceptionMock }) => {
          fetchMock.mockRejectedValue(new Error('Network error'));

          await expect(service.getSubscriptionsEligibilities()).rejects.toThrow(
            SubscriptionServiceError,
          );
          expect(captureExceptionMock).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('submitUserEvent', () => {
    it('should submit user event successfully', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock, env }) => {
        fetchMock.mockResolvedValue(createMockResponse({ jsonData: {} }));

        await service.submitUserEvent({
          event: SubscriptionUserEvent.ShieldEntryModalViewed,
        });

        expect(fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(env, 'user-events'),
          {
            method: 'POST',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              event: SubscriptionUserEvent.ShieldEntryModalViewed,
            }),
          },
        );
      });
    });

    it('should submit user event with cohort successfully', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock, env }) => {
        fetchMock.mockResolvedValue(createMockResponse({ jsonData: {} }));

        await service.submitUserEvent({
          event: SubscriptionUserEvent.ShieldEntryModalViewed,
          cohort: 'post_tx',
        });

        expect(fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(env, 'user-events'),
          {
            method: 'POST',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              event: SubscriptionUserEvent.ShieldEntryModalViewed,
              cohort: 'post_tx',
            }),
          },
        );
      });
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, captureExceptionMock }) => {
          fetchMock.mockRejectedValue(new Error('Network error'));

          await expect(
            service.submitUserEvent({
              event: SubscriptionUserEvent.ShieldEntryModalViewed,
            }),
          ).rejects.toThrow(SubscriptionServiceError);
          expect(captureExceptionMock).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('assignUserToCohort', () => {
    it('should assign user to cohort successfully', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, env, getBearerToken }) => {
          fetchMock.mockResolvedValue(createMockResponse({ jsonData: {} }));

          await service.assignUserToCohort({ cohort: 'post_tx' });

          expect(fetchMock).toHaveBeenCalledWith(
            SUBSCRIPTION_URL(env, 'cohorts/assign'),
            {
              method: 'POST',
              headers: MOCK_HEADERS,
              body: JSON.stringify({
                cohort: 'post_tx',
              }),
            },
          );
          expect(getBearerToken).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should handle cohort assignment errors', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock }) => {
        fetchMock.mockRejectedValue(new Error('Network error'));

        await expect(
          service.assignUserToCohort({ cohort: 'wallet_home' }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('submitSponsorshipIntents', () => {
    it('should submit sponsorship intents successfully', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock, env }) => {
        fetchMock.mockResolvedValue(createMockResponse({ jsonData: {} }));

        await service.submitSponsorshipIntents({
          chainId: '0x1',
          address: '0x1234567890123456789012345678901234567890',
          products: [PRODUCT_TYPES.SHIELD],
          recurringInterval: RECURRING_INTERVALS.month,
          billingCycles: 12,
          paymentTokenSymbol: 'USDT',
        });

        expect(fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(env, 'transaction-sponsorship/intents'),
          {
            method: 'POST',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              chainId: '0x1',
              address: '0x1234567890123456789012345678901234567890',
              products: [PRODUCT_TYPES.SHIELD],
              recurringInterval: RECURRING_INTERVALS.month,
              billingCycles: 12,
              paymentTokenSymbol: 'USDT',
            }),
          },
        );
      });
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, captureExceptionMock }) => {
          fetchMock.mockRejectedValue(new Error('Network error'));

          await expect(
            service.submitSponsorshipIntents({
              chainId: '0x1',
              address: '0x1234567890123456789012345678901234567890',
              products: [PRODUCT_TYPES.SHIELD],
              recurringInterval: RECURRING_INTERVALS.month,
              billingCycles: 12,
              paymentTokenSymbol: 'USDT',
            }),
          ).rejects.toThrow(SubscriptionServiceError);
          expect(captureExceptionMock).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('linkRewards', () => {
    it('should link rewards successfully', async () => {
      await withMockSubscriptionService(async ({ service, fetchMock, env }) => {
        fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: { success: true } }),
        );

        await service.linkRewards({
          rewardAccountId:
            'eip155:1:0x1234567890123456789012345678901234567890',
        });

        expect(fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(env, 'rewards/link'),
          {
            method: 'POST',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              rewardAccountId:
                'eip155:1:0x1234567890123456789012345678901234567890',
            }),
          },
        );
      });
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, captureExceptionMock }) => {
          fetchMock.mockRejectedValue(new Error('Network error'));

          await expect(
            service.linkRewards({
              rewardAccountId:
                'eip155:1:0x1234567890123456789012345678901234567890',
            }),
          ).rejects.toThrow(SubscriptionServiceError);
          expect(captureExceptionMock).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('should throw SubscriptionServiceError for non-ok responses', async () => {
      await withMockSubscriptionService(
        async ({ service, fetchMock, captureExceptionMock }) => {
          fetchMock.mockResolvedValue(
            createMockResponse({
              ok: false,
              status: 400,
              jsonData: { message: 'Bad request' },
            }),
          );

          await expect(
            service.linkRewards({
              rewardAccountId:
                'eip155:1:0x1234567890123456789012345678901234567890',
            }),
          ).rejects.toThrow(SubscriptionServiceError);
          expect(captureExceptionMock).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('retry policy', () => {
    it('retries 429 responses up to the default retry limit', async () => {
      const fetchMock = jest.fn();
      let attempts = 0;
      fetchMock.mockImplementation(async () => {
        attempts += 1;
        return createMockResponse({
          ok: false,
          status: 429,
          jsonData: { error: 'rate limited' },
        });
      });
      const { service } = createService({ fetchMock });

      await expect(service.getSubscriptions()).rejects.toThrow(
        SubscriptionServiceError,
      );
      expect(attempts).toBe(DEFAULT_MAX_RETRIES + 1);
    });

    it('does not duplicate query parameters on retry', async () => {
      const fetchMock = jest.fn();
      let attempts = 0;
      fetchMock.mockImplementation(async () => {
        attempts += 1;
        if (attempts < DEFAULT_MAX_RETRIES + 1) {
          return createMockResponse({
            ok: false,
            status: 429,
            jsonData: { error: 'rate limited' },
          });
        }
        return createMockResponse({
          jsonData: [createMockEligibilityResponse()],
        });
      });
      const { service } = createService({ fetchMock });

      await service.getSubscriptionsEligibilities({
        balanceCategory: '100-999',
      });

      expect(attempts).toBe(DEFAULT_MAX_RETRIES + 1);
      for (const [url] of fetchMock.mock.calls) {
        expect(url).toContain('balanceCategory=100-999');
        expect(url).not.toMatch(/balanceCategory=100-999&balanceCategory=/u);
      }
    });
  });

  describe('error handling', () => {
    it('rethrows SubscriptionServiceError thrown by fetchQuery without wrapping', async () => {
      const fetchMock = jest.fn();
      const { service } = createService({ fetchMock });
      const authError = new SubscriptionServiceError('auth failed');
      jest
        .spyOn(
          service as unknown as {
            fetchQuery: SubscriptionService['fetchQuery'];
          },
          'fetchQuery',
        )
        .mockRejectedValue(authError);

      await expect(service.getSubscriptions()).rejects.toBe(authError);
    });
  });
});
