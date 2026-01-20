import nock, { cleanAll } from 'nock';
import { useFakeTimers } from 'sinon';

import type {
  FetchConfigResult,
  RegistryConfigApiResponse,
} from './abstract-config-registry-api-service';
import {
  ConfigRegistryApiService,
  DEFAULT_API_BASE_URL,
  DEFAULT_ENDPOINT_PATH,
} from './config-registry-api-service';

const MOCK_API_RESPONSE: RegistryConfigApiResponse = {
  data: {
    version: '"24952800ba9dafbc5e2c91f57f386d28"',
    timestamp: 1761829548000,
    networks: [
      {
        chainId: '0x1',
        name: 'Ethereum Mainnet',
        nativeCurrency: 'ETH',
        rpcEndpoints: [
          {
            url: 'https://mainnet.infura.io/v3/{infuraProjectId}',
            type: 'infura',
            networkClientId: 'mainnet',
            failoverUrls: [],
          },
        ],
        blockExplorerUrls: ['https://etherscan.io'],
        defaultRpcEndpointIndex: 0,
        defaultBlockExplorerUrlIndex: 0,
        isActive: true,
        isTestnet: false,
        isDefault: true,
        isFeatured: true,
        isDeprecated: false,
        priority: 0,
        isDeletable: false,
      },
    ],
  },
};

describe('ConfigRegistryApiService', () => {
  describe('constructor', () => {
    it('should create instance with default options', () => {
      const service = new ConfigRegistryApiService();
      expect(service).toBeInstanceOf(ConfigRegistryApiService);
    });

    it('should create instance with custom options', () => {
      const customFetch = jest.fn();
      const service = new ConfigRegistryApiService({
        apiBaseUrl: 'https://custom-api.example.com',
        endpointPath: '/custom/path',
        timeout: 5000,
        fetch: customFetch,
        retries: 5,
      });
      expect(service).toBeInstanceOf(ConfigRegistryApiService);
    });
  });

  describe('fetchConfig', () => {
    beforeEach(() => {
      cleanAll();
    });

    afterEach(() => {
      cleanAll();
    });

    it('should successfully fetch config from API', async () => {
      const scope = nock(DEFAULT_API_BASE_URL)
        .get(DEFAULT_ENDPOINT_PATH)
        .reply(200, MOCK_API_RESPONSE, {
          ETag: '"test-etag-123"',
        });

      const service = new ConfigRegistryApiService();
      const result = await service.fetchConfig();

      expect(result.notModified).toBe(false);
      expect(result.etag).toBe('"test-etag-123"');
      expect(
        (result as Extract<FetchConfigResult, { notModified: false }>).data,
      ).toStrictEqual(MOCK_API_RESPONSE);
      expect(scope.isDone()).toBe(true);
    });

    it('should handle 304 Not Modified response', async () => {
      const etag = '"test-etag-123"';
      const scope = nock(DEFAULT_API_BASE_URL)
        .get(DEFAULT_ENDPOINT_PATH)
        .matchHeader('If-None-Match', etag)
        .reply(304);

      const service = new ConfigRegistryApiService();
      const result = await service.fetchConfig({ etag });

      expect(result.notModified).toBe(true);
      expect(scope.isDone()).toBe(true);
    });

    it('should include If-None-Match header when etag is provided', async () => {
      const etag = '"test-etag-123"';
      const scope = nock(DEFAULT_API_BASE_URL)
        .get(DEFAULT_ENDPOINT_PATH)
        .matchHeader('If-None-Match', etag)
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService();
      await service.fetchConfig({ etag });

      expect(scope.isDone()).toBe(true);
    });

    it('should throw error on invalid response structure', async () => {
      const invalidResponse = { invalid: 'data' };
      const scope = nock(DEFAULT_API_BASE_URL)
        .get(DEFAULT_ENDPOINT_PATH)
        .reply(200, invalidResponse);

      const service = new ConfigRegistryApiService();

      await expect(service.fetchConfig()).rejects.toThrow(
        'Invalid response structure from config registry API',
      );
      expect(scope.isDone()).toBe(true);
    });

    it('should throw error on HTTP error status', async () => {
      const scope = nock(DEFAULT_API_BASE_URL)
        .get(DEFAULT_ENDPOINT_PATH)
        .reply(500, { error: 'Internal Server Error' });

      const service = new ConfigRegistryApiService();

      await expect(service.fetchConfig()).rejects.toThrow(expect.any(Error));
      expect(scope.isDone()).toBe(true);
    });

    it('should handle timeout', async () => {
      const testTimeout = 1000; // Use shorter timeout for test
      // Use a custom fetch that simulates timeout with AbortError
      const customFetch = jest.fn().mockImplementation(() => {
        const abortError = new Error('Request aborted');
        abortError.name = 'AbortError';
        return Promise.reject(abortError);
      });

      const service = new ConfigRegistryApiService({
        timeout: testTimeout,
        fetch: customFetch,
      });

      await expect(service.fetchConfig()).rejects.toThrow(
        `Request timeout after ${testTimeout}ms`,
      );
    }, 10000); // Increase Jest timeout for this test

    it('should retry on failure', async () => {
      nock(DEFAULT_API_BASE_URL)
        .get(DEFAULT_ENDPOINT_PATH)
        .replyWithError('Network error');
      nock(DEFAULT_API_BASE_URL)
        .get(DEFAULT_ENDPOINT_PATH)
        .replyWithError('Network error');
      const successScope = nock(DEFAULT_API_BASE_URL)
        .get(DEFAULT_ENDPOINT_PATH)
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService({
        retries: 2,
      });

      const result = await service.fetchConfig();

      expect(result.notModified).toBe(false);
      expect(
        (result as Extract<FetchConfigResult, { notModified: false }>).data,
      ).toStrictEqual(MOCK_API_RESPONSE);
      expect(successScope.isDone()).toBe(true);
    });
  });

  describe('onBreak', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = useFakeTimers({ now: Date.now() });
    });

    afterEach(() => {
      clock.restore();
    });

    it('should register and call onBreak handler', async () => {
      const maximumConsecutiveFailures = 3;
      const retries = 0; // No retries to simplify test

      // Create enough failures to trigger circuit break
      for (let i = 0; i < maximumConsecutiveFailures; i++) {
        nock(DEFAULT_API_BASE_URL)
          .get(DEFAULT_ENDPOINT_PATH)
          .replyWithError('Network error');
      }

      const onBreakHandler = jest.fn();
      const service = new ConfigRegistryApiService({
        retries,
        maximumConsecutiveFailures,
        circuitBreakDuration: 10000,
      });

      service.onBreak(onBreakHandler);

      // Trigger failures to break the circuit
      for (let i = 0; i < maximumConsecutiveFailures; i++) {
        await expect(service.fetchConfig()).rejects.toThrow(expect.any(Error));
        // Advance time slightly between calls
        await clock.tickAsync(100);
      }

      // Next call should trigger onBreak
      const finalPromise = service.fetchConfig();
      finalPromise.catch(() => {
        // Suppress unhandled promise rejection
      });
      await clock.tickAsync(100);

      await expect(finalPromise).rejects.toThrow(expect.any(Error));
      expect(onBreakHandler).toHaveBeenCalled();
    });
  });

  describe('onDegraded', () => {
    it('should register onDegraded handler', () => {
      const service = new ConfigRegistryApiService();
      const onDegradedHandler = jest.fn();

      service.onDegraded(onDegradedHandler);

      expect(service.onDegraded).toBeDefined();
    });
  });

  describe('custom fetch function', () => {
    it('should use custom fetch function when provided', async () => {
      const mockHeaders = {
        get: jest.fn().mockReturnValue('"custom-etag"'),
      };
      const customFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
        json: async () => MOCK_API_RESPONSE,
      } as unknown as Response);

      const service = new ConfigRegistryApiService({
        fetch: customFetch,
        apiBaseUrl: 'https://custom-api.example.com',
        endpointPath: '/custom/path',
      });

      const result = await service.fetchConfig();

      expect(customFetch).toHaveBeenCalled();
      expect(result.notModified).toBe(false);
      expect(
        (result as Extract<FetchConfigResult, { notModified: false }>).data,
      ).toStrictEqual(MOCK_API_RESPONSE);
    });
  });

  describe('URL construction', () => {
    it('should handle base URL ending with slash', async () => {
      const scope = nock('https://test-api.example.com')
        .get('/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService({
        apiBaseUrl: 'https://test-api.example.com/',
        endpointPath: '/config/networks',
      });

      await service.fetchConfig();

      expect(scope.isDone()).toBe(true);
    });

    it('should handle endpoint path without leading slash', async () => {
      const scope = nock('https://test-api.example.com')
        .get('/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService({
        apiBaseUrl: 'https://test-api.example.com',
        endpointPath: 'config/networks',
      });

      await service.fetchConfig();

      expect(scope.isDone()).toBe(true);
    });
  });
});
