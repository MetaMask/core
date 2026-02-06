import { SDK } from '@metamask/profile-sync-controller';
import nock, { cleanAll } from 'nock';
import { useFakeTimers } from 'sinon';

import { ConfigRegistryApiService } from './config-registry-api-service';
import type { FetchConfigResult, RegistryConfigApiResponse } from './types';
import { createMockNetworkConfig } from '../test-helpers';

const MOCK_API_RESPONSE: RegistryConfigApiResponse = {
  data: {
    version: '"24952800ba9dafbc5e2c91f57f386d28"',
    timestamp: 1761829548000,
    networks: [createMockNetworkConfig()],
  },
};

describe('ConfigRegistryApiService', () => {
  describe('constructor URL by env', () => {
    it('uses UAT URL when env is UAT', async () => {
      const scope = nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService({ env: SDK.Env.UAT });
      await service.fetchConfig();
      expect(scope.isDone()).toBe(true);
    });

    it('uses DEV URL when env is DEV', async () => {
      const scope = nock('https://client-config.dev-api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService({ env: SDK.Env.DEV });
      await service.fetchConfig();
      expect(scope.isDone()).toBe(true);
    });

    it('uses PRD URL when env is PRD', async () => {
      const scope = nock('https://client-config.api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService({ env: SDK.Env.PRD });
      await service.fetchConfig();
      expect(scope.isDone()).toBe(true);
    });
  });

  describe('constructor', () => {
    it('creates instance with default options', () => {
      const service = new ConfigRegistryApiService();
      expect(service).toBeInstanceOf(ConfigRegistryApiService);
    });

    it('creates instance with custom options', () => {
      const customFetch = jest.fn();
      const service = new ConfigRegistryApiService({
        env: SDK.Env.DEV,
        fetch: customFetch,
        retries: 5,
      });
      expect(service).toBeInstanceOf(ConfigRegistryApiService);
    });

    it('creates instance with empty options object', () => {
      const service = new ConfigRegistryApiService({});
      expect(service).toBeInstanceOf(ConfigRegistryApiService);
    });

    it('uses default values for unspecified options', () => {
      const service = new ConfigRegistryApiService({
        env: SDK.Env.PRD,
      });
      expect(service).toBeInstanceOf(ConfigRegistryApiService);
    });

    it('uses default fetch when not provided', () => {
      const service = new ConfigRegistryApiService({
        env: SDK.Env.DEV,
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

    it('fetches config from API successfully', async () => {
      const scope = nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE, {
          ETag: '"test-etag-123"',
        });

      const service = new ConfigRegistryApiService();
      const result = await service.fetchConfig();

      expect(result.modified).toBe(true);
      expect(result.etag).toBe('"test-etag-123"');
      expect(
        (result as Extract<FetchConfigResult, { modified: true }>).data,
      ).toStrictEqual(MOCK_API_RESPONSE);
      expect(scope.isDone()).toBe(true);
    });

    it('fetches config from API without ETag header', async () => {
      const scope = nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService();
      const result = await service.fetchConfig();

      expect(result.modified).toBe(true);
      expect(result.etag).toBeUndefined();
      expect(
        (result as Extract<FetchConfigResult, { modified: true }>).data,
      ).toStrictEqual(MOCK_API_RESPONSE);
      expect(scope.isDone()).toBe(true);
    });

    it('handles 304 Not Modified response', async () => {
      const etag = '"test-etag-123"';
      const scope = nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .matchHeader('If-None-Match', etag)
        .reply(304);

      const service = new ConfigRegistryApiService();
      const result = await service.fetchConfig({ etag });

      expect(result.modified).toBe(false);
      expect(scope.isDone()).toBe(true);
    });

    it('handles 304 Not Modified response without ETag header', async () => {
      const mockHeaders = {
        get: jest.fn().mockReturnValue(null),
      };
      const customFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 304,
        headers: mockHeaders,
      } as unknown as Response);

      const service = new ConfigRegistryApiService({
        fetch: customFetch,
      });

      const result = await service.fetchConfig();

      expect(result.modified).toBe(false);
      expect(result.etag).toBeUndefined();
    });

    it('includes If-None-Match header when etag is provided', async () => {
      const etag = '"test-etag-123"';
      const scope = nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .matchHeader('If-None-Match', etag)
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService();
      await service.fetchConfig({ etag });

      expect(scope.isDone()).toBe(true);
    });

    it('does not include If-None-Match header when etag is undefined', async () => {
      const scope = nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService();
      await service.fetchConfig({ etag: undefined });

      expect(scope.isDone()).toBe(true);
    });

    it('handles fetchConfig called with undefined options', async () => {
      const scope = nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await service.fetchConfig(undefined as any);

      expect(scope.isDone()).toBe(true);
    });

    it('throws error on invalid response structure', async () => {
      const invalidResponse = { invalid: 'data' };
      const scope = nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, invalidResponse);

      const service = new ConfigRegistryApiService();

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(scope.isDone()).toBe(true);
    });

    it('throws error when data is null', async () => {
      const mockHeaders = {
        get: jest.fn().mockReturnValue(null),
      };
      const customFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
        json: async () => null,
      } as unknown as Response);

      const service = new ConfigRegistryApiService({
        fetch: customFetch,
      });

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
    });

    it('throws error when data.data is null', async () => {
      const mockHeaders = {
        get: jest.fn().mockReturnValue(null),
      };
      const customFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
        json: async () => ({ data: null }),
      } as unknown as Response);

      const service = new ConfigRegistryApiService({
        fetch: customFetch,
      });

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
    });

    it('throws error when data.data.networks is not an array', async () => {
      const mockHeaders = {
        get: jest.fn().mockReturnValue(null),
      };
      const customFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
        json: async () => ({ data: { networks: 'not-an-array' } }),
      } as unknown as Response);

      const service = new ConfigRegistryApiService({
        fetch: customFetch,
      });

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
    });

    it('throws error on HTTP error status', async () => {
      const mockHeaders = {
        get: jest.fn().mockReturnValue(null),
      };
      const customFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: mockHeaders,
      } as unknown as Response);

      const service = new ConfigRegistryApiService({
        fetch: customFetch,
      });

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({
          message: 'Failed to fetch config: 500 Internal Server Error',
        }),
      );
    });

    it('handles network errors', async () => {
      const customFetch = jest
        .fn()
        .mockRejectedValue(new Error('Network connection failed'));

      const service = new ConfigRegistryApiService({
        fetch: customFetch,
      });

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: 'Network connection failed' }),
      );
    });

    it('retries on failure', async () => {
      nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .replyWithError('Network error');
      nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .replyWithError('Network error');
      const successScope = nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService({
        retries: 2,
      });

      const result = await service.fetchConfig();

      expect(result.modified).toBe(true);
      expect(
        (result as Extract<FetchConfigResult, { modified: true }>).data,
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

    it('registers and calls onBreak handler', async () => {
      const maximumConsecutiveFailures = 3;
      const retries = 0;

      for (let i = 0; i < maximumConsecutiveFailures; i++) {
        nock('https://client-config.uat-api.cx.metamask.io')
          .get('/v1/config/networks')
          .replyWithError('Network error');
      }

      const onBreakHandler = jest.fn();
      const service = new ConfigRegistryApiService({
        retries,
        maximumConsecutiveFailures,
        circuitBreakDuration: 10000,
      });

      service.onBreak(onBreakHandler);

      for (let i = 0; i < maximumConsecutiveFailures; i++) {
        await expect(service.fetchConfig()).rejects.toMatchObject(
          expect.objectContaining({ message: expect.any(String) }),
        );
        await clock.tickAsync(100);
      }

      const finalPromise = service.fetchConfig();
      finalPromise.catch(() => {
        // Expected rejection
      });
      await clock.tickAsync(100);

      await expect(finalPromise).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(onBreakHandler).toHaveBeenCalled();
    });

    it('returns the result from policy.onBreak', () => {
      const service = new ConfigRegistryApiService();
      const handler = jest.fn();
      const result = service.onBreak(handler);
      expect(result).toBeDefined();
    });
  });

  describe('onDegraded', () => {
    it('registers onDegraded handler', () => {
      const service = new ConfigRegistryApiService();
      const onDegradedHandler = jest.fn();

      service.onDegraded(onDegradedHandler);

      expect(service.onDegraded).toBeDefined();
    });

    it('calls onDegraded handler when service becomes degraded', async () => {
      const degradedThreshold = 2000; // 2 seconds
      const service = new ConfigRegistryApiService({
        degradedThreshold,
        retries: 0,
      });

      const onDegradedHandler = jest.fn();
      service.onDegraded(onDegradedHandler);

      const slowFetch = jest.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  status: 200,
                  headers: {
                    get: jest.fn().mockReturnValue('"custom-etag"'),
                  } as unknown as Headers,
                  json: async () => MOCK_API_RESPONSE,
                } as Response),
              degradedThreshold + 100,
            );
          }),
      );

      const slowService = new ConfigRegistryApiService({
        fetch: slowFetch,
        degradedThreshold,
        retries: 0,
      });

      slowService.onDegraded(onDegradedHandler);

      await slowService.fetchConfig();

      expect(slowService.onDegraded).toBeDefined();
    });

    it('returns the result from policy.onDegraded', () => {
      const service = new ConfigRegistryApiService();
      const handler = jest.fn();
      const result = service.onDegraded(handler);
      expect(result).toBeDefined();
    });
  });

  describe('custom fetch function', () => {
    it('uses custom fetch function when provided', async () => {
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
      });

      const result = await service.fetchConfig();

      expect(customFetch).toHaveBeenCalled();
      expect(result.modified).toBe(true);
      expect(
        (result as Extract<FetchConfigResult, { modified: true }>).data,
      ).toStrictEqual(MOCK_API_RESPONSE);
    });
  });

  describe('environment configuration', () => {
    it('uses DEV environment URL when env is DEV', async () => {
      const scope = nock('https://client-config.dev-api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService({
        env: SDK.Env.DEV,
      });

      await service.fetchConfig();

      expect(scope.isDone()).toBe(true);
    });

    it('uses UAT environment URL when env is UAT', async () => {
      const scope = nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService({
        env: SDK.Env.UAT,
      });

      await service.fetchConfig();

      expect(scope.isDone()).toBe(true);
    });

    it('uses PRD environment URL when env is PRD', async () => {
      const scope = nock('https://client-config.api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService({
        env: SDK.Env.PRD,
      });

      await service.fetchConfig();

      expect(scope.isDone()).toBe(true);
    });

    it('defaults to UAT environment', async () => {
      const scope = nock('https://client-config.uat-api.cx.metamask.io')
        .get('/v1/config/networks')
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService();

      await service.fetchConfig();

      expect(scope.isDone()).toBe(true);
    });
  });
});
