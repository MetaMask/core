import { fetchWithErrorHandling, HttpError } from '@metamask/controller-utils';

import {
  Env,
  getEnvUrls,
  SubscriptionControllerErrorMessage,
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

// Mock the handleFetch function
jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  fetchWithErrorHandling: jest.fn(),
}));

const fetchWithErrorHandlingMock = fetchWithErrorHandling as jest.Mock;

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

/**
 * Creates a mock subscription service config for testing
 *
 * @param params - The parameters object
 * @param [params.env] - The environment to use for the config
 * @returns The mock configuration object
 */
function createMockConfig({
  env = Env.DEV,
}: { env?: Env } = {}): SubscriptionServiceConfig {
  return {
    env,
    auth: {
      getAccessToken: jest.fn().mockResolvedValue(MOCK_ACCESS_TOKEN),
    },
  };
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
        fetchWithErrorHandlingMock.mockResolvedValue({
          customerId: 'cus_1',
          subscriptions: [MOCK_SUBSCRIPTION],
          trialedProducts: [],
        });

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
      await withMockSubscriptionService(async ({ service }) => {
        fetchWithErrorHandlingMock.mockRejectedValue(
          new Error('Network error'),
        );

        const error = await service.getSubscriptions().then(
          () => {
            throw new Error('Expected getSubscriptions to throw');
          },
          (rejection) => rejection,
        );

        expect(error).toBeInstanceOf(SubscriptionServiceError);
        const serviceError = error as SubscriptionServiceError;
        expect(serviceError.details).toMatchObject({
          request: {
            method: 'GET',
            url: `${getTestUrl(Env.DEV)}/v1/subscriptions`,
          },
        });
      });

      await withMockSubscriptionService(async ({ service }) => {
        fetchWithErrorHandlingMock.mockRejectedValue('string error');

        await expect(service.getSubscriptions()).rejects.toThrow(
          SubscriptionServiceError,
        );
      });
    });

    it('should include httpStatus details for HttpError responses', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        fetchWithErrorHandlingMock.mockRejectedValue(
          new HttpError(503, 'Service unavailable'),
        );

        const error = await service.getSubscriptions().then(
          () => {
            throw new Error('Expected getSubscriptions to throw');
          },
          (rejection) => rejection,
        );

        expect(error).toBeInstanceOf(SubscriptionServiceError);
        const serviceError = error as SubscriptionServiceError;
        expect(serviceError.message).toContain('status=503');
        expect(serviceError.details).toMatchObject({
          request: {
            method: 'GET',
            url: `${getTestUrl(Env.DEV)}/v1/subscriptions`,
          },
          error: {
            httpStatus: 503,
            message: 'Service unavailable',
            name: 'HttpError',
          },
        });
      });
    });

    it('should handle get access token error', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        // Simulate a non-Error thrown from the auth.getAccessToken mock
        (config.auth.getAccessToken as jest.Mock).mockRejectedValue(
          'string error',
        );

        await expect(service.getSubscriptions()).rejects.toThrow(
          SubscriptionServiceError,
        );
      });

      await withMockSubscriptionService(async ({ service, config }) => {
        // Simulate a non-Error thrown from the auth.getAccessToken mock
        (config.auth.getAccessToken as jest.Mock).mockRejectedValue(
          new Error('Wallet is locked'),
        );

        await expect(service.getSubscriptions()).rejects.toThrow(
          SubscriptionServiceError,
        );
      });
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        fetchWithErrorHandlingMock.mockResolvedValue({});

        await service.cancelSubscription({ subscriptionId: 'sub_123456789' });

        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        fetchWithErrorHandlingMock.mockRejectedValue(
          new Error('Network error'),
        );

        await expect(
          service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('uncancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        fetchWithErrorHandlingMock.mockResolvedValue({});

        await service.unCancelSubscription({ subscriptionId: 'sub_123456789' });

        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        fetchWithErrorHandlingMock.mockRejectedValue(
          new Error('Network error'),
        );

        await expect(
          service.unCancelSubscription({ subscriptionId: 'sub_123456789' }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('startSubscription', () => {
    it('should start subscription successfully', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        fetchWithErrorHandlingMock.mockResolvedValue(
          MOCK_START_SUBSCRIPTION_RESPONSE,
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

      fetchWithErrorHandlingMock.mockResolvedValue(
        MOCK_START_SUBSCRIPTION_RESPONSE,
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
      await withMockSubscriptionService(async ({ service }) => {
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

        fetchWithErrorHandlingMock.mockResolvedValue(response);

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

      fetchWithErrorHandlingMock.mockResolvedValue(mockPricingResponse);

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

        fetchWithErrorHandlingMock.mockResolvedValue({});

        await service.updatePaymentMethodCard(request);

        expect(fetchWithErrorHandlingMock).toHaveBeenCalledWith({
          url: SUBSCRIPTION_URL(
            config.env,
            'subscriptions/sub_123456789/payment-method/card',
          ),
          options: {
            method: 'PATCH',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              ...request,
              subscriptionId: undefined,
            }),
          },
        });
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

        fetchWithErrorHandlingMock.mockResolvedValue({});

        await service.updatePaymentMethodCrypto(request);

        expect(fetchWithErrorHandlingMock).toHaveBeenCalledWith({
          url: SUBSCRIPTION_URL(
            config.env,
            'subscriptions/sub_123456789/payment-method/crypto',
          ),
          options: {
            method: 'PATCH',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              ...request,
              subscriptionId: undefined,
            }),
          },
        });
      });
    });
  });

  describe('getBillingPortalUrl', () => {
    it('should get billing portal url successfully', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        fetchWithErrorHandlingMock.mockResolvedValue({
          url: 'https://billing-portal.com',
        });

        const result = await service.getBillingPortalUrl();

        expect(result).toStrictEqual({ url: 'https://billing-portal.com' });
      });
    });
  });

  describe('getShieldSubscriptionEligibility', () => {
    it('should get shield subscription eligibility successfully', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        const mockResponse = createMockEligibilityResponse();
        fetchWithErrorHandlingMock.mockResolvedValue([mockResponse]);

        const results = await service.getSubscriptionsEligibilities();

        expect(results).toStrictEqual([mockResponse]);
      });
    });

    it('should get shield subscription eligibility with cohort information', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        const mockResponse = createMockEligibilityResponse({
          cohorts: MOCK_COHORTS,
          assignedCohort: 'post_tx',
          assignedAt: '2024-01-01T00:00:00Z',
        });

        fetchWithErrorHandlingMock.mockResolvedValue([mockResponse]);

        const results = await service.getSubscriptionsEligibilities({
          balanceCategory: '1k-9.9k',
        });

        expect(results).toStrictEqual([mockResponse]);
      });
    });

    it('should get shield subscription eligibility with default values', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        fetchWithErrorHandlingMock.mockResolvedValue([
          {
            product: PRODUCT_TYPES.SHIELD,
          },
        ]);

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
        fetchWithErrorHandlingMock.mockResolvedValue([mockResponse]);

        await service.getSubscriptionsEligibilities({
          balanceCategory: '100-999',
        });

        expect(fetchWithErrorHandlingMock).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.stringContaining('balanceCategory=100-999'),
            options: expect.objectContaining({
              method: 'GET',
              headers: MOCK_HEADERS,
            }),
          }),
        );
        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });

    it('should not pass balanceCategory query parameter when not provided', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        const mockResponse = createMockEligibilityResponse();
        fetchWithErrorHandlingMock.mockResolvedValue([mockResponse]);

        await service.getSubscriptionsEligibilities();

        expect(fetchWithErrorHandlingMock).toHaveBeenCalledWith(
          expect.objectContaining({
            url: expect.not.stringMatching(/balanceCategory/u),
            options: expect.objectContaining({
              method: 'GET',
              headers: MOCK_HEADERS,
            }),
          }),
        );
        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('submitUserEvent', () => {
    it('should submit user event successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        fetchWithErrorHandlingMock.mockResolvedValue({});

        await service.submitUserEvent({
          event: SubscriptionUserEvent.ShieldEntryModalViewed,
        });

        expect(fetchWithErrorHandlingMock).toHaveBeenCalledWith({
          url: SUBSCRIPTION_URL(config.env, 'user-events'),
          options: {
            method: 'POST',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              event: SubscriptionUserEvent.ShieldEntryModalViewed,
            }),
          },
        });
      });
    });

    it('should submit user event with cohort successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        fetchWithErrorHandlingMock.mockResolvedValue({});

        await service.submitUserEvent({
          event: SubscriptionUserEvent.ShieldEntryModalViewed,
          cohort: 'post_tx',
        });

        expect(fetchWithErrorHandlingMock).toHaveBeenCalledWith({
          url: SUBSCRIPTION_URL(config.env, 'user-events'),
          options: {
            method: 'POST',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              event: SubscriptionUserEvent.ShieldEntryModalViewed,
              cohort: 'post_tx',
            }),
          },
        });
      });
    });
  });

  describe('assignUserToCohort', () => {
    it('should assign user to cohort successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        fetchWithErrorHandlingMock.mockResolvedValue({});

        await service.assignUserToCohort({ cohort: 'post_tx' });

        expect(fetchWithErrorHandlingMock).toHaveBeenCalledWith({
          url: SUBSCRIPTION_URL(config.env, 'cohorts/assign'),
          options: {
            method: 'POST',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              cohort: 'post_tx',
            }),
          },
        });
        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle cohort assignment errors', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        fetchWithErrorHandlingMock.mockRejectedValue(
          new Error('Network error'),
        );

        await expect(
          service.assignUserToCohort({ cohort: 'wallet_home' }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('submitSponsorshipIntents', () => {
    it('should submit sponsorship intents successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        fetchWithErrorHandlingMock.mockResolvedValue({});

        await service.submitSponsorshipIntents({
          chainId: '0x1',
          address: '0x1234567890123456789012345678901234567890',
          products: [PRODUCT_TYPES.SHIELD],
          recurringInterval: RECURRING_INTERVALS.month,
          billingCycles: 12,
          paymentTokenSymbol: 'USDT',
        });

        expect(fetchWithErrorHandlingMock).toHaveBeenCalledWith({
          url: SUBSCRIPTION_URL(config.env, 'transaction-sponsorship/intents'),
          options: {
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
        });
      });
    });
  });

  describe('linkRewards', () => {
    it('should link rewards successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        fetchWithErrorHandlingMock.mockResolvedValue({});

        await service.linkRewards({
          rewardAccountId:
            'eip155:1:0x1234567890123456789012345678901234567890',
        });

        expect(fetchWithErrorHandlingMock).toHaveBeenCalledWith({
          url: SUBSCRIPTION_URL(config.env, 'rewards/link'),
          options: {
            method: 'POST',
            headers: MOCK_HEADERS,
            body: JSON.stringify({
              rewardAccountId:
                'eip155:1:0x1234567890123456789012345678901234567890',
            }),
          },
        });
      });
    });
  });
});
