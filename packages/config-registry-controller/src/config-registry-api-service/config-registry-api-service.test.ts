import { SDK } from '@metamask/profile-sync-controller';
import nock from 'nock';

import { ConfigRegistryApiService } from './config-registry-api-service';
import type { RegistryConfigApiResponse } from './types';
import { jestAdvanceTime } from '../../../../tests/helpers';
import { createMockNetworkConfig } from '../test-helpers';

const CONFIG_PATH = '/v1/config/networks';
const UAT_ORIGIN = 'https://client-config.uat-api.cx.metamask.io';
const DEV_ORIGIN = 'https://client-config.dev-api.cx.metamask.io';
const PRD_ORIGIN = 'https://client-config.api.cx.metamask.io';

const MOCK_API_RESPONSE: RegistryConfigApiResponse = {
  data: {
    version: '"24952800ba9dafbc5e2c91f57f386d28"',
    timestamp: 1761829548000,
    chains: [createMockNetworkConfig()],
  },
};

describe('ConfigRegistryApiService', () => {
  describe('fetchConfig', () => {
    describe('URL by env', () => {
      it('uses UAT URL when env is UAT', async () => {
        const scope = nock(UAT_ORIGIN)
          .get(CONFIG_PATH)
          .reply(200, MOCK_API_RESPONSE);

        const service = new ConfigRegistryApiService({ env: SDK.Env.UAT });
        await service.fetchConfig();
        expect(scope.isDone()).toBe(true);
      });

      it('uses DEV URL when env is DEV', async () => {
        const scope = nock(DEV_ORIGIN)
          .get(CONFIG_PATH)
          .reply(200, MOCK_API_RESPONSE);

        const service = new ConfigRegistryApiService({ env: SDK.Env.DEV });
        await service.fetchConfig();
        expect(scope.isDone()).toBe(true);
      });

      it('uses PRD URL when env is PRD', async () => {
        const scope = nock(PRD_ORIGIN)
          .get(CONFIG_PATH)
          .reply(200, MOCK_API_RESPONSE);

        const service = new ConfigRegistryApiService({ env: SDK.Env.PRD });
        await service.fetchConfig();
        expect(scope.isDone()).toBe(true);
      });

      it('defaults to UAT environment', async () => {
        const scope = nock(UAT_ORIGIN)
          .get(CONFIG_PATH)
          .reply(200, MOCK_API_RESPONSE);

        const service = new ConfigRegistryApiService();

        await service.fetchConfig();

        expect(scope.isDone()).toBe(true);
      });
    });

    it('fetches config from API successfully', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, MOCK_API_RESPONSE, {
          ETag: '"test-etag-123"',
        });

      const service = new ConfigRegistryApiService();
      const result = await service.fetchConfig();

      expect(result).toMatchObject({
        modified: true,
        etag: '"test-etag-123"',
        data: MOCK_API_RESPONSE,
      });
      expect(scope.isDone()).toBe(true);
    });

    it('fetches config from API without ETag header', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService();
      const result = await service.fetchConfig();

      expect(result).toMatchObject({ modified: true, data: MOCK_API_RESPONSE });
      expect(result.etag).toBeUndefined();
      expect(scope.isDone()).toBe(true);
    });

    it('handles 304 Not Modified response', async () => {
      const etag = '"test-etag-123"';
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .matchHeader('If-None-Match', etag)
        .reply(304);

      const service = new ConfigRegistryApiService();
      const result = await service.fetchConfig({ etag });

      expect(result.modified).toBe(false);
      expect(result.data).toBeUndefined();
      expect(scope.isDone()).toBe(true);
    });

    it('returns cached data when 304 is received and service has prior successful response', async () => {
      const etag = '"test-etag-123"';
      const firstScope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, MOCK_API_RESPONSE, { ETag: etag });

      const service = new ConfigRegistryApiService();
      await service.fetchConfig();
      expect(firstScope.isDone()).toBe(true);

      const secondScope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .matchHeader('If-None-Match', etag)
        .reply(304);

      const result = await service.fetchConfig({ etag });

      expect(result.modified).toBe(false);
      expect(result.data).toStrictEqual(MOCK_API_RESPONSE);
      expect(secondScope.isDone()).toBe(true);
    });

    it('handles 304 Not Modified response without ETag header', async () => {
      const scope = nock(UAT_ORIGIN).get(CONFIG_PATH).reply(304);

      const service = new ConfigRegistryApiService();
      const result = await service.fetchConfig();

      expect(result.modified).toBe(false);
      expect(result.etag).toBeUndefined();
      expect(scope.isDone()).toBe(true);
    });

    it('includes If-None-Match header when etag is provided', async () => {
      const etag = '"test-etag-123"';
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .matchHeader('If-None-Match', etag)
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService();
      await service.fetchConfig({ etag });

      expect(scope.isDone()).toBe(true);
    });

    it('does not include If-None-Match header when etag is undefined', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .matchHeader('If-None-Match', (val) => val === undefined)
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService();
      await service.fetchConfig({ etag: undefined });

      expect(scope.isDone()).toBe(true);
    });

    it('handles fetchConfig called with undefined options', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService();
      await service.fetchConfig(undefined);

      expect(scope.isDone()).toBe(true);
    });

    it('throws error on invalid response structure', async () => {
      const invalidResponse = { invalid: 'data' };
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, invalidResponse);

      const service = new ConfigRegistryApiService();

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(scope.isDone()).toBe(true);
    });

    it('throws error when response body is null', async () => {
      const scope = nock(UAT_ORIGIN).get(CONFIG_PATH).reply(200, 'null');

      const service = new ConfigRegistryApiService();

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(scope.isDone()).toBe(true);
    });

    it('throws error when data is null', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, { data: null });

      const service = new ConfigRegistryApiService();

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(scope.isDone()).toBe(true);
    });

    it('throws error when data.chains is not an array', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, {
          data: { version: '1', timestamp: 0, chains: 'not-an-array' },
        });

      const service = new ConfigRegistryApiService();

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(scope.isDone()).toBe(true);
    });

    it('throws error on HTTP error status', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(500, 'Internal Server Error');

      const service = new ConfigRegistryApiService({
        policyOptions: { maxRetries: 0 },
      });

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({
          message: 'Failed to fetch config: 500 Internal Server Error',
        }),
      );
      expect(scope.isDone()).toBe(true);
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
      nock(UAT_ORIGIN).get(CONFIG_PATH).replyWithError('Network error');
      nock(UAT_ORIGIN).get(CONFIG_PATH).replyWithError('Network error');
      const successScope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, MOCK_API_RESPONSE);

      const service = new ConfigRegistryApiService({
        policyOptions: { maxRetries: 2 },
      });

      const result = await service.fetchConfig();

      expect(result).toMatchObject({ modified: true, data: MOCK_API_RESPONSE });
      expect(successScope.isDone()).toBe(true);
    });
  });

  describe('onBreak', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('registers and calls onBreak handler', async () => {
      const maximumConsecutiveFailures = 3;
      const retries = 0;

      for (let i = 0; i < maximumConsecutiveFailures; i++) {
        nock(UAT_ORIGIN).get(CONFIG_PATH).replyWithError('Network error');
      }

      const onBreakHandler = jest.fn();
      const service = new ConfigRegistryApiService({
        policyOptions: {
          maxRetries: retries,
          maxConsecutiveFailures: maximumConsecutiveFailures,
          circuitBreakDuration: 10000,
        },
      });

      service.onBreak(onBreakHandler);

      for (let i = 0; i < maximumConsecutiveFailures; i++) {
        await expect(service.fetchConfig()).rejects.toMatchObject(
          expect.objectContaining({ message: expect.any(String) }),
        );
        await jestAdvanceTime({ duration: 100 });
      }

      const finalPromise = service.fetchConfig();
      finalPromise.catch(() => {
        // Expected rejection
      });
      await jestAdvanceTime({ duration: 100 });

      await expect(finalPromise).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(onBreakHandler).toHaveBeenCalled();
    });
  });

  describe('onDegraded', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls onDegraded handler when service becomes degraded', async () => {
      const degradedThreshold = 2000; // 2 seconds
      nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, () => {
          jest.advanceTimersByTime(degradedThreshold + 100);
          return MOCK_API_RESPONSE;
        });

      const service = new ConfigRegistryApiService({
        policyOptions: { degradedThreshold, maxRetries: 0 },
      });
      const onDegradedHandler = jest.fn();
      service.onDegraded(onDegradedHandler);

      await service.fetchConfig();

      expect(onDegradedHandler).toHaveBeenCalled();
    });
  });

  describe('custom fetch function', () => {
    it('uses custom fetch function when provided', async () => {
      const customFetch = jest.fn().mockResolvedValue(
        // eslint-disable-next-line no-restricted-globals
        new Response(JSON.stringify(MOCK_API_RESPONSE), {
          status: 200,
          headers: { ETag: '"custom-etag"' },
        }),
      );

      const service = new ConfigRegistryApiService({
        fetch: customFetch,
      });

      const result = await service.fetchConfig();

      expect(customFetch).toHaveBeenCalled();
      expect(result).toMatchObject({ modified: true, data: MOCK_API_RESPONSE });
    });
  });
});
