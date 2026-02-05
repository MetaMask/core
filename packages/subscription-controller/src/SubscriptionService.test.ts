import {
  Env,
  getEnvUrls,
  SubscriptionControllerErrorMessage,
  SubscriptionServiceErrorMessage,
} from './constants';
import { SubscriptionServiceError } from './errors';
import {
  SUBSCRIPTION_URL,
  SubscriptionService,
  SubscriptionServiceConfig,
} from './SubscriptionService';
import type {
  StartSubscriptionRequest,
  StartCryptoSubscriptionRequest,
  Subscription,
  PricingResponse,
  UpdatePaymentMethodCardRequest,
  UpdatePaymentMethodCryptoRequest,
  SubscriptionEligibility,
} from './types';
import {
  CANCEL_TYPES,
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  RECURRING_INTERVALS,
  SUBSCRIPTION_STATUSES,
  SubscriptionUserEvent,
} from './types';

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

type MockConfig = SubscriptionServiceConfig & {
  fetchMock: jest.Mock;
  captureExceptionMock: jest.Mock;
};

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
 * Creates a mock subscription service config for testing
 *
 * @param params - The parameters object
 * @param [params.env] - The environment to use for the config
 * @returns The mock configuration object
 */
function createMockConfig({ env = Env.DEV }: { env?: Env } = {}): MockConfig {
  const fetchMock = jest.fn();
  const captureExceptionMock = jest.fn();

  return {
    env,
    auth: {
      getAccessToken: jest.fn().mockResolvedValue(MOCK_ACCESS_TOKEN),
    },
    fetchFunction: fetchMock,
    captureException: captureExceptionMock,
    fetchMock,
    captureExceptionMock,
  } as MockConfig;
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

/**
 * Helper function to create a mock subscription service and call a function with it
 *
 * @param fn - The function to call with the mock subscription service
 * @returns The result of the function call
 */
function withMockSubscriptionService(
  fn: (params: {
    service: SubscriptionService;
    config: ReturnType<typeof createMockConfig>;
    testUrl: string;
  }) => Promise<void>,
): Promise<void> {
  const config = createMockConfig();
  const service = new SubscriptionService(config);
  const testUrl = getTestUrl(config.env);
  return fn({ service, config, testUrl });
}

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);

      expect(service).toBeInstanceOf(SubscriptionService);
    });

    it('should create instance with different environments', () => {
      const devConfig = createMockConfig({ env: Env.DEV });
      const uatConfig = createMockConfig({ env: Env.UAT });
      const prdConfig = createMockConfig({ env: Env.PRD });

      expect(() => new SubscriptionService(devConfig)).not.toThrow();
      expect(() => new SubscriptionService(uatConfig)).not.toThrow();
      expect(() => new SubscriptionService(prdConfig)).not.toThrow();
    });
  });

  describe('getSubscriptions', () => {
    it('should fetch subscriptions successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
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
        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        const networkError = new Error('Network error');
        config.fetchMock.mockRejectedValue(networkError);

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
        expect(config.captureExceptionMock).toHaveBeenCalledTimes(1);
      });

      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockRejectedValue('string error');

        const requestPromise = service.getSubscriptions();

        await expect(requestPromise).rejects.toThrow(SubscriptionServiceError);
        await expect(requestPromise).rejects.toThrow(
          `Failed to make request. ${SubscriptionServiceErrorMessage.FailedToGetSubscriptions} (url: ${getTestUrl(Env.DEV)}/v1/subscriptions)`,
        );
        expect(config.captureExceptionMock).toHaveBeenCalledTimes(1);
      });
    });

    it('should throw SubscriptionServiceError for non-ok responses', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
          createMockResponse({
            ok: false,
            status: 500,
            jsonData: { error: 'Internal Server Error' },
          }),
        );

        const requestPromise = service.getSubscriptions();

        await expect(requestPromise).rejects.toThrow(SubscriptionServiceError);
        await expect(requestPromise).rejects.toThrow(
          `Failed to make request. ${SubscriptionServiceErrorMessage.FailedToGetSubscriptions} (url: ${getTestUrl(Env.DEV)}/v1/subscriptions)`,
        );
        expect(config.captureExceptionMock).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle get access token error', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        // Simulate a non-Error thrown from the auth.getAccessToken mock
        (config.auth.getAccessToken as jest.Mock).mockRejectedValue(
          'string error',
        );

        const requestPromise = service.getSubscriptions();

        await expect(requestPromise).rejects.toThrow(SubscriptionServiceError);
        await expect(requestPromise).rejects.toThrow(
          `Failed to make request. ${SubscriptionServiceErrorMessage.FailedToGetSubscriptions} (url: ${getTestUrl(Env.DEV)}/v1/subscriptions)`,
        );
      });

      await withMockSubscriptionService(async ({ service, config }) => {
        // Simulate a non-Error thrown from the auth.getAccessToken mock
        (config.auth.getAccessToken as jest.Mock).mockRejectedValue(
          new Error('Wallet is locked'),
        );

        const requestPromise = service.getSubscriptions();

        await expect(requestPromise).rejects.toThrow(SubscriptionServiceError);
        await expect(requestPromise).rejects.toThrow(
          `Failed to make request. ${SubscriptionServiceErrorMessage.FailedToGetSubscriptions} (url: ${getTestUrl(Env.DEV)}/v1/subscriptions)`,
        );
      });
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: {} }),
        );

        await service.cancelSubscription({ subscriptionId: 'sub_123456789' });

        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockRejectedValue(new Error('Network error'));

        await expect(
          service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('uncancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: {} }),
        );

        await service.unCancelSubscription({ subscriptionId: 'sub_123456789' });

        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockRejectedValue(new Error('Network error'));

        await expect(
          service.unCancelSubscription({ subscriptionId: 'sub_123456789' }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('startSubscription', () => {
    it('should start subscription successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: MOCK_START_SUBSCRIPTION_RESPONSE }),
        );

        const result = await service.startSubscriptionWithCard(
          MOCK_START_SUBSCRIPTION_REQUEST,
        );

        expect(result).toStrictEqual(MOCK_START_SUBSCRIPTION_RESPONSE);
      });
    });

    it('should start subscription without trial', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const request: StartSubscriptionRequest = {
        products: [PRODUCT_TYPES.SHIELD],
        isTrialRequested: false,
        recurringInterval: RECURRING_INTERVALS.month,
      };

      config.fetchMock.mockResolvedValue(
        createMockResponse({ jsonData: MOCK_START_SUBSCRIPTION_RESPONSE }),
      );

      const result = await service.startSubscriptionWithCard(request);

      expect(result).toStrictEqual(MOCK_START_SUBSCRIPTION_RESPONSE);
    });

    it('throws when products array is empty', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const request: StartSubscriptionRequest = {
        products: [],
        isTrialRequested: true,
        recurringInterval: RECURRING_INTERVALS.month,
      };

      await expect(service.startSubscriptionWithCard(request)).rejects.toThrow(
        SubscriptionControllerErrorMessage.SubscriptionProductsEmpty,
      );
    });
  });

  describe('startCryptoSubscription', () => {
    it('should start crypto subscription successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        const request: StartCryptoSubscriptionRequest = {
          products: [PRODUCT_TYPES.SHIELD],
          isTrialRequested: false,
          recurringInterval: RECURRING_INTERVALS.month,
          billingCycles: 3,
          chainId: '0x1',
          payerAddress: '0x0000000000000000000000000000000000000001',
          tokenSymbol: 'USDC',
          rawTransaction: '0xdeadbeef',
        };

        const response = {
          subscriptionId: 'sub_crypto_123',
          status: SUBSCRIPTION_STATUSES.active,
        };

        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: response }),
        );

        const result = await service.startSubscriptionWithCrypto(request);

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
      const config = createMockConfig();
      const service = new SubscriptionService(config);

      config.fetchMock.mockResolvedValue(
        createMockResponse({ jsonData: mockPricingResponse }),
      );

      const result = await service.getPricing();

      expect(result).toStrictEqual(mockPricingResponse);
    });
  });

  describe('updatePaymentMethodCard', () => {
    it('should update card payment method successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        const request: UpdatePaymentMethodCardRequest = {
          subscriptionId: 'sub_123456789',
          recurringInterval: RECURRING_INTERVALS.month,
        };

        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: {} }),
        );

        await service.updatePaymentMethodCard(request);

        expect(config.fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(
            config.env,
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
      await withMockSubscriptionService(async ({ service, config }) => {
        const request: UpdatePaymentMethodCryptoRequest = {
          subscriptionId: 'sub_123456789',
          chainId: '0x1',
          payerAddress: '0x0000000000000000000000000000000000000001',
          tokenSymbol: 'USDC',
          rawTransaction: '0xdeadbeef',
          recurringInterval: RECURRING_INTERVALS.month,
          billingCycles: 3,
        };

        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: {} }),
        );

        await service.updatePaymentMethodCrypto(request);

        expect(config.fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(
            config.env,
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
  });

  describe('getBillingPortalUrl', () => {
    it('should get billing portal url successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
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
      await withMockSubscriptionService(async ({ service, config }) => {
        const mockResponse = createMockEligibilityResponse();
        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: [mockResponse] }),
        );

        const results = await service.getSubscriptionsEligibilities();

        expect(results).toStrictEqual([mockResponse]);
      });
    });

    it('should get shield subscription eligibility with cohort information', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        const mockResponse = createMockEligibilityResponse({
          cohorts: MOCK_COHORTS,
          assignedCohort: 'post_tx',
          assignedAt: '2024-01-01T00:00:00Z',
        });

        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: [mockResponse] }),
        );

        const results = await service.getSubscriptionsEligibilities({
          balanceCategory: '1k-9.9k',
        });

        expect(results).toStrictEqual([mockResponse]);
      });
    });

    it('should get shield subscription eligibility with default values', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
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
      await withMockSubscriptionService(async ({ service, config }) => {
        const mockResponse = createMockEligibilityResponse();
        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: [mockResponse] }),
        );

        await service.getSubscriptionsEligibilities({
          balanceCategory: '100-999',
        });

        expect(config.fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('balanceCategory=100-999'),
          expect.objectContaining({
            method: 'GET',
            headers: MOCK_HEADERS,
          }),
        );
        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });

    it('should not pass balanceCategory query parameter when not provided', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        const mockResponse = createMockEligibilityResponse();
        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: [mockResponse] }),
        );

        await service.getSubscriptionsEligibilities();

        expect(config.fetchMock).toHaveBeenCalledWith(
          expect.not.stringMatching(/balanceCategory/u),
          expect.objectContaining({
            method: 'GET',
            headers: MOCK_HEADERS,
          }),
        );
        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('submitUserEvent', () => {
    it('should submit user event successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: {} }),
        );

        await service.submitUserEvent({
          event: SubscriptionUserEvent.ShieldEntryModalViewed,
        });

        expect(config.fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(config.env, 'user-events'),
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
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: {} }),
        );

        await service.submitUserEvent({
          event: SubscriptionUserEvent.ShieldEntryModalViewed,
          cohort: 'post_tx',
        });

        expect(config.fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(config.env, 'user-events'),
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
  });

  describe('assignUserToCohort', () => {
    it('should assign user to cohort successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: {} }),
        );

        await service.assignUserToCohort({ cohort: 'post_tx' });

        expect(config.fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(config.env, 'cohorts/assign'),
          {
            method: 'POST',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              cohort: 'post_tx',
            }),
          },
        );
        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle cohort assignment errors', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockRejectedValue(new Error('Network error'));

        await expect(
          service.assignUserToCohort({ cohort: 'wallet_home' }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('submitSponsorshipIntents', () => {
    it('should submit sponsorship intents successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: {} }),
        );

        await service.submitSponsorshipIntents({
          chainId: '0x1',
          address: '0x1234567890123456789012345678901234567890',
          products: [PRODUCT_TYPES.SHIELD],
          recurringInterval: RECURRING_INTERVALS.month,
          billingCycles: 12,
          paymentTokenSymbol: 'USDT',
        });

        expect(config.fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(config.env, 'transaction-sponsorship/intents'),
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
  });

  describe('linkRewards', () => {
    it('should link rewards successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        config.fetchMock.mockResolvedValue(
          createMockResponse({ jsonData: {} }),
        );

        await service.linkRewards({
          rewardAccountId:
            'eip155:1:0x1234567890123456789012345678901234567890',
        });

        expect(config.fetchMock).toHaveBeenCalledWith(
          SUBSCRIPTION_URL(config.env, 'rewards/link'),
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
  });
});
