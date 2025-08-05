import nock, { cleanAll, isDone } from 'nock';

import { Env, getEnvUrls } from './constants';
import { SubscriptionServiceError } from './errors';
import { SUBSCRIPTION_URL, SubscriptionService } from './SubscriptionService';
import type { Subscription } from './types';

// Mock data
const MOCK_SUBSCRIPTION: Subscription = {
  id: 'sub_123456789',
  createdDate: '2024-01-01T00:00:00Z',
  status: 'active',
  paymentStatus: 'completed',
  paymentMethod: 'card',
  paymentType: 'monthly',
  paymentAmount: 9.99,
  paymentCurrency: 'USD',
  paymentDate: '2024-01-01T00:00:00Z',
  paymentId: 'pay_123456789',
};

const MOCK_ACCESS_TOKEN = 'mock-access-token-12345';

const MOCK_ERROR_RESPONSE = {
  message: 'Subscription not found',
  error: 'NOT_FOUND',
};

/**
 * Creates a mock subscription service config for testing
 *
 * @param env - The environment to use for the config
 * @returns The mock configuration object
 */
function createMockConfig(env: Env = Env.DEV) {
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

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanAll();
  });

  describe('constructor', () => {
    it('should create instance with valid config', () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);

      expect(service).toBeInstanceOf(SubscriptionService);
    });

    it('should create instance with different environments', () => {
      const devConfig = createMockConfig(Env.DEV);
      const uatConfig = createMockConfig(Env.UAT);
      const prdConfig = createMockConfig(Env.PRD);

      expect(() => new SubscriptionService(devConfig)).not.toThrow();
      expect(() => new SubscriptionService(uatConfig)).not.toThrow();
      expect(() => new SubscriptionService(prdConfig)).not.toThrow();
    });
  });

  describe('SUBSCRIPTION_URL', () => {
    it('should construct correct URL for dev environment', () => {
      const url = SUBSCRIPTION_URL(Env.DEV, 'subscription');
      expect(url).toBe(
        'https://subscription-service.dev-api.cx.metamask.io/api/v1/subscription',
      );
    });

    it('should construct correct URL for uat environment', () => {
      const url = SUBSCRIPTION_URL(Env.UAT, 'subscription');
      expect(url).toBe(
        'https://subscription-service.uat-api.cx.metamask.io/api/v1/subscription',
      );
    });

    it('should construct correct URL for prd environment', () => {
      const url = SUBSCRIPTION_URL(Env.PRD, 'subscription');
      expect(url).toBe(
        'https://subscription-service.api.cx.metamask.io/api/v1/subscription',
      );
    });

    it('should construct URL with custom path', () => {
      const url = SUBSCRIPTION_URL(Env.DEV, 'subscription/123/cancel');
      expect(url).toBe(
        'https://subscription-service.dev-api.cx.metamask.io/api/v1/subscription/123/cancel',
      );
    });
  });

  describe('getSubscription', () => {
    it('should fetch subscription successfully', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl).get('/api/v1/subscription').reply(200, MOCK_SUBSCRIPTION);

      const result = await service.getSubscription();

      expect(result).toStrictEqual(MOCK_SUBSCRIPTION);
      expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should return null for 404 response', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl).get('/api/v1/subscription').reply(404, MOCK_ERROR_RESPONSE);

      const result = await service.getSubscription();

      expect(result).toBeNull();
    });

    it('should throw SubscriptionServiceError for non-404 error responses', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl).get('/api/v1/subscription').reply(500, MOCK_ERROR_RESPONSE);

      await expect(service.getSubscription()).rejects.toThrow(
        /Subscription not found/u,
      );
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl).get('/api/v1/subscription').replyWithError('Network error');

      await expect(service.getSubscription()).rejects.toThrow(/Network error/u);
    });

    it('should throw SubscriptionServiceError for authentication errors', async () => {
      const config = createMockConfig();
      config.auth.getAccessToken.mockRejectedValue(
        new Error('Authentication failed'),
      );
      const service = new SubscriptionService(config);

      await expect(service.getSubscription()).rejects.toThrow(
        SubscriptionServiceError,
      );
      await expect(service.getSubscription()).rejects.toThrow(
        'failed to get subscription. Authentication failed',
      );
    });

    it('should handle non-Error exceptions', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl).get('/api/v1/subscription').replyWithError('String error');

      await expect(service.getSubscription()).rejects.toThrow(/String error/u);
    });

    it('should handle null/undefined exceptions', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl).get('/api/v1/subscription').replyWithError('Network error');

      await expect(service.getSubscription()).rejects.toThrow(/Network error/u);
    });

    it('should handle non-Error exceptions in catch block', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      
      // Mock fetch to throw a non-Error object
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue('string error');

      try {
        await expect(service.getSubscription()).rejects.toThrow(
          SubscriptionServiceError,
        );
        await expect(service.getSubscription()).rejects.toThrow(
          /failed to get subscription\. "string error"/u,
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should handle null exceptions in catch block', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      
      // Mock fetch to throw null
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(null);

      try {
        await expect(service.getSubscription()).rejects.toThrow(
          SubscriptionServiceError,
        );
        await expect(service.getSubscription()).rejects.toThrow(
          /failed to get subscription\. ""/u,
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should use correct environment URL', async () => {
      const config = createMockConfig(Env.PRD);
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.PRD);

      nock(testUrl).get('/api/v1/subscription').reply(200, MOCK_SUBSCRIPTION);

      await service.getSubscription();

      // Verify the correct URL was used
      expect(isDone()).toBe(true);
    });

    it('should include correct headers', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl).get('/api/v1/subscription').reply(200, MOCK_SUBSCRIPTION);

      await service.getSubscription();

      // Verify the correct headers were sent
      expect(isDone()).toBe(true);
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl)
        .post('/api/v1/subscription/sub_123456789/cancel')
        .reply(200, {});

      await service.cancelSubscription({ subscriptionId: 'sub_123456789' });

      expect(config.auth.getAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should throw SubscriptionServiceError for error responses', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl)
        .post('/api/v1/subscription/sub_123456789/cancel')
        .reply(400, MOCK_ERROR_RESPONSE);

      await expect(
        service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
      ).rejects.toThrow(/Subscription not found/u);
    });

    it('should throw SubscriptionServiceError for network errors', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl)
        .post('/api/v1/subscription/sub_123456789/cancel')
        .replyWithError('Network error');

      await expect(
        service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
      ).rejects.toThrow(/Network error/u);
    });

    it('should throw SubscriptionServiceError for authentication errors', async () => {
      const config = createMockConfig();
      config.auth.getAccessToken.mockRejectedValue(
        new Error('Authentication failed'),
      );
      const service = new SubscriptionService(config);

      await expect(
        service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
      ).rejects.toThrow(SubscriptionServiceError);
      await expect(
        service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
      ).rejects.toThrow('failed to cancel subscription. Authentication failed');
    });

    it('should handle non-Error exceptions', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl)
        .post('/api/v1/subscription/sub_123456789/cancel')
        .replyWithError('String error');

      await expect(
        service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
      ).rejects.toThrow(/String error/u);
    });

    it('should handle null/undefined exceptions', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl)
        .post('/api/v1/subscription/sub_123456789/cancel')
        .replyWithError(new Error('Network error'));

      await expect(
        service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
      ).rejects.toThrow(/Network error/u);
    });

    it('should handle non-Error exceptions in catch block', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      
      // Mock fetch to throw a non-Error object
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue('string error');

      try {
        await expect(
          service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
        ).rejects.toThrow(SubscriptionServiceError);
        await expect(
          service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
        ).rejects.toThrow(/failed to cancel subscription\. "string error"/u);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should handle null exceptions in catch block', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      
      // Mock fetch to throw null
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(null);

      try {
        await expect(
          service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
        ).rejects.toThrow(SubscriptionServiceError);
        await expect(
          service.cancelSubscription({ subscriptionId: 'sub_123456789' }),
        ).rejects.toThrow(/failed to cancel subscription\. ""/u);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should use correct environment URL', async () => {
      const config = createMockConfig(Env.UAT);
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.UAT);

      nock(testUrl)
        .post('/api/v1/subscription/sub_123456789/cancel')
        .reply(200, {});

      await service.cancelSubscription({ subscriptionId: 'sub_123456789' });

      // Verify the correct URL was used
      expect(isDone()).toBe(true);
    });

    it('should include correct headers and method', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl)
        .post('/api/v1/subscription/sub_123456789/cancel')
        .reply(200, {});

      await service.cancelSubscription({ subscriptionId: 'sub_123456789' });

      // Verify the correct headers and method were used
      expect(isDone()).toBe(true);
    });

    it('should handle empty subscription ID', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl).post('/api/v1/subscription//cancel').reply(200, {});

      await service.cancelSubscription({ subscriptionId: '' });

      expect(isDone()).toBe(true);
    });

    it('should handle special characters in subscription ID', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl)
        .post('/api/v1/subscription/sub_123-456_789/cancel')
        .reply(200, {});

      await service.cancelSubscription({ subscriptionId: 'sub_123-456_789' });

      expect(isDone()).toBe(true);
    });
  });

  describe('authentication integration', () => {
    it('should call getAccessToken for each request', async () => {
      const config = createMockConfig();
      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl).get('/api/v1/subscription').reply(200, MOCK_SUBSCRIPTION);

      nock(testUrl)
        .post('/api/v1/subscription/sub_123456789/cancel')
        .reply(200, {});

      await service.getSubscription();
      await service.cancelSubscription({ subscriptionId: 'sub_123456789' });

      expect(config.auth.getAccessToken).toHaveBeenCalledTimes(2);
    });

    it('should handle getAccessToken returning different tokens', async () => {
      const config = createMockConfig();
      const firstToken = 'token-1';
      const secondToken = 'token-2';

      config.auth.getAccessToken
        .mockResolvedValueOnce(firstToken)
        .mockResolvedValueOnce(secondToken);

      const service = new SubscriptionService(config);
      const testUrl = getTestUrl(Env.DEV);

      nock(testUrl).get('/api/v1/subscription').reply(200, MOCK_SUBSCRIPTION);

      nock(testUrl)
        .post('/api/v1/subscription/sub_123456789/cancel')
        .reply(200, {});

      await service.getSubscription();
      await service.cancelSubscription({ subscriptionId: 'sub_123456789' });

      expect(isDone()).toBe(true);
    });
  });
});
