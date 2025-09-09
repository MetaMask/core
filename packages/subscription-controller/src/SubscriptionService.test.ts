import { handleFetch } from '@metamask/controller-utils';

import {
  Env,
  getEnvUrls,
  SubscriptionControllerErrorMessage,
} from './constants';
import { SubscriptionServiceError } from './errors';
import { SubscriptionService } from './SubscriptionService';
import type {
  StartSubscriptionRequest,
  StartCryptoSubscriptionRequest,
  Subscription,
  PricingResponse,
} from './types';
import {
  PaymentType,
  ProductType,
  RecurringInterval,
  SubscriptionStatus,
} from './types';

// Mock the handleFetch function
jest.mock('@metamask/controller-utils', () => ({
  handleFetch: jest.fn(),
}));

const handleFetchMock = handleFetch as jest.Mock;

// Mock data
const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub_123456789',
  products: [
    {
      name: ProductType.SHIELD,
      id: 'prod_shield_basic',
      currency: 'usd',
      amount: 9.99,
    },
  ],
  currentPeriodStart: '2024-01-01T00:00:00Z',
  currentPeriodEnd: '2024-02-01T00:00:00Z',
  status: SubscriptionStatus.active,
  interval: RecurringInterval.month,
  paymentMethod: {
    type: PaymentType.byCard,
  },
};

const MOCK_ACCESS_TOKEN = 'mock-access-token-12345';

const MOCK_START_SUBSCRIPTION_REQUEST: StartSubscriptionRequest = {
  products: [ProductType.SHIELD],
  isTrialRequested: true,
  recurringInterval: RecurringInterval.month,
};

const MOCK_START_SUBSCRIPTION_RESPONSE = {
  checkoutSessionUrl: 'https://checkout.example.com/session/123',
};

/**
 * Creates a mock subscription service config for testing
 *
 * @param params - The parameters object
 * @param [params.env] - The environment to use for the config
 * @returns The mock configuration object
 */
function createMockConfig({ env = Env.DEV }: { env?: Env } = {}) {
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
) {
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
        handleFetchMock.mockResolvedValue({
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

    it('should throw SubscriptionServiceError for error responses', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        handleFetchMock.mockRejectedValue(new Error('Network error'));

        await expect(service.getSubscriptions()).rejects.toThrow(
          SubscriptionServiceError,
        );
      });
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        handleFetchMock.mockRejectedValue(new Error('Network error'));

        await expect(service.getSubscriptions()).rejects.toThrow(
          SubscriptionServiceError,
        );
      });
    });

    it('should handle get access token error', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        // Simulate a non-Error thrown from the auth.getAccessToken mock
        config.auth.getAccessToken.mockRejectedValue('string error');

        await expect(service.getSubscriptions()).rejects.toThrow(
          SubscriptionServiceError,
        );
      });
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      await withMockSubscriptionService(async ({ service, config }) => {
        handleFetchMock.mockResolvedValue({});

        await service.cancelSubscription({ subscriptionId: 'sub_123456789' });

        expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
      });
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        handleFetchMock.mockRejectedValue(new Error('Network error'));

        await expect(
          service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
        ).rejects.toThrow(SubscriptionServiceError);
      });
    });
  });

  describe('startSubscription', () => {
    it('should start subscription successfully', async () => {
      await withMockSubscriptionService(async ({ service }) => {
        handleFetchMock.mockResolvedValue(MOCK_START_SUBSCRIPTION_RESPONSE);

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
        products: [ProductType.SHIELD],
        isTrialRequested: false,
        recurringInterval: RecurringInterval.month,
      };

      handleFetchMock.mockResolvedValue(MOCK_START_SUBSCRIPTION_RESPONSE);

      const result = await service.startSubscriptionWithCard(request);

      expect(result).toStrictEqual(MOCK_START_SUBSCRIPTION_RESPONSE);
    });

    it('throws when products array is empty', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const request: StartSubscriptionRequest = {
        products: [],
        isTrialRequested: true,
        recurringInterval: RecurringInterval.month,
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
          products: [ProductType.SHIELD],
          isTrialRequested: false,
          recurringInterval: RecurringInterval.month,
          billingCycles: 3,
          chainId: '0x1',
          payerAddress: '0x0000000000000000000000000000000000000001',
          tokenSymbol: 'USDC',
          rawTransaction: '0xdeadbeef',
        };

        const response = {
          subscriptionId: 'sub_crypto_123',
          status: SubscriptionStatus.active,
        };

        handleFetchMock.mockResolvedValue(response);

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

      handleFetchMock.mockResolvedValue(mockPricingResponse);

      const result = await service.getPricing();

      expect(result).toStrictEqual(mockPricingResponse);
    });
  });
});
