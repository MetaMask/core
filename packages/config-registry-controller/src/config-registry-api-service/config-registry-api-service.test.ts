import nock from 'nock';

import { createMockNetworkConfig } from '../../tests/helpers.js';
import {
  ConfigRegistryApiEnv,
  ConfigRegistryApiService,
} from './config-registry-api-service.js';
import type {
  ConfigRegistryApiServiceMessenger,
  ConfigRegistryApiServiceOptions,
} from './config-registry-api-service.js';
import type {
  RegistryConfigApiResponse,
  RegistryEventsConfigApiResponse,
} from './types.js';

function createMockServiceMessenger(): ConfigRegistryApiServiceMessenger {
  return {
    registerMethodActionHandlers: jest.fn(),
  } as unknown as ConfigRegistryApiServiceMessenger;
}

function createService(
  overrides: Partial<Omit<ConfigRegistryApiServiceOptions, 'messenger'>> = {},
): ConfigRegistryApiService {
  return new ConfigRegistryApiService({
    ...overrides,
    messenger: createMockServiceMessenger(),
  });
}

const CONFIG_PATH = '/v1/config/networks';
const EVENTS_CONFIG_PATH = '/v1/config/events-config';
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

        const service = createService({ env: ConfigRegistryApiEnv.UAT });
        await service.fetchConfig();
        expect(scope.isDone()).toBe(true);
      });

      it('uses DEV URL when env is DEV', async () => {
        const scope = nock(DEV_ORIGIN)
          .get(CONFIG_PATH)
          .reply(200, MOCK_API_RESPONSE);

        const service = createService({ env: ConfigRegistryApiEnv.DEV });
        await service.fetchConfig();
        expect(scope.isDone()).toBe(true);
      });

      it('uses PRD URL when env is PRD', async () => {
        const scope = nock(PRD_ORIGIN)
          .get(CONFIG_PATH)
          .reply(200, MOCK_API_RESPONSE);

        const service = createService({ env: ConfigRegistryApiEnv.PRD });
        await service.fetchConfig();
        expect(scope.isDone()).toBe(true);
      });

      it('defaults to UAT environment', async () => {
        const scope = nock(UAT_ORIGIN)
          .get(CONFIG_PATH)
          .reply(200, MOCK_API_RESPONSE);

        const service = createService();

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

      const service = createService();
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

      const service = createService();
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

      const service = createService();
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

      const service = createService();
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

      const service = createService();
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

      const service = createService();
      await service.fetchConfig({ etag });

      expect(scope.isDone()).toBe(true);
    });

    it('does not include If-None-Match header when etag is undefined', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .matchHeader('If-None-Match', (val) => val === undefined)
        .reply(200, MOCK_API_RESPONSE);

      const service = createService();
      await service.fetchConfig({ etag: undefined });

      expect(scope.isDone()).toBe(true);
    });

    it('handles fetchConfig called with undefined options', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, MOCK_API_RESPONSE);

      const service = createService();
      await service.fetchConfig(undefined);

      expect(scope.isDone()).toBe(true);
    });

    it('throws error on invalid response structure', async () => {
      const invalidResponse = { invalid: 'data' };
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, invalidResponse);

      const service = createService();

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(scope.isDone()).toBe(true);
    });

    it('throws error when response body is null', async () => {
      const scope = nock(UAT_ORIGIN).get(CONFIG_PATH).reply(200, 'null');

      const service = createService();

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(scope.isDone()).toBe(true);
    });

    it('throws error when data is null', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(200, { data: null });

      const service = createService();

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

      const service = createService();

      await expect(service.fetchConfig()).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(scope.isDone()).toBe(true);
    });

    it('throws error on HTTP error status', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(CONFIG_PATH)
        .reply(500, 'Internal Server Error');

      const service = createService({
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

      const service = createService({
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

      const service = createService({
        policyOptions: { maxRetries: 2 },
      });

      const result = await service.fetchConfig();

      expect(result).toMatchObject({ modified: true, data: MOCK_API_RESPONSE });
      expect(successScope.isDone()).toBe(true);
    });
  });

  describe('onRetry', () => {
    it('registers and returns a disposable', () => {
      const service = createService();
      const listener = jest.fn();
      const disposable = service.onRetry(listener);
      expect(disposable).toHaveProperty('dispose');
      expect(typeof disposable.dispose).toBe('function');
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
      const service = createService({
        policyOptions: {
          maxRetries: retries,
          maxConsecutiveFailures: maximumConsecutiveFailures,
          circuitBreakDuration: 10000,
        },
      });

      service.onBreak(onBreakHandler);
      service.onRetry(() => {
        jest.advanceTimersToNextTimer();
      });

      for (let i = 0; i < maximumConsecutiveFailures; i++) {
        await expect(service.fetchConfig()).rejects.toMatchObject(
          expect.objectContaining({ message: expect.any(String) }),
        );
      }

      const finalPromise = service.fetchConfig();
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

      const service = createService({
        policyOptions: { degradedThreshold, maxRetries: 0 },
      });
      const onDegradedHandler = jest.fn();
      service.onDegraded(onDegradedHandler);

      await service.fetchConfig();

      expect(onDegradedHandler).toHaveBeenCalled();
    });
  });

  describe('onEventsConfigRetry', () => {
    it('registers and returns a disposable', () => {
      const service = createService();
      const listener = jest.fn();
      const disposable = service.onEventsConfigRetry(listener);
      expect(disposable).toHaveProperty('dispose');
      expect(typeof disposable.dispose).toBe('function');
    });
  });

  describe('onEventsConfigBreak', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('registers and calls onEventsConfigBreak handler', async () => {
      const maximumConsecutiveFailures = 3;
      const retries = 0;

      for (let i = 0; i < maximumConsecutiveFailures; i++) {
        nock(UAT_ORIGIN)
          .get(EVENTS_CONFIG_PATH)
          .replyWithError('Network error');
      }

      const onBreakHandler = jest.fn();
      const service = createService({
        policyOptions: {
          maxRetries: retries,
          maxConsecutiveFailures: maximumConsecutiveFailures,
          circuitBreakDuration: 10000,
        },
      });

      service.onEventsConfigBreak(onBreakHandler);
      service.onEventsConfigRetry(() => {
        jest.advanceTimersToNextTimer();
      });

      for (let i = 0; i < maximumConsecutiveFailures; i++) {
        await expect(service.fetchEventsConfig()).rejects.toMatchObject(
          expect.objectContaining({ message: expect.any(String) }),
        );
      }

      const finalPromise = service.fetchEventsConfig();
      await expect(finalPromise).rejects.toMatchObject(
        expect.objectContaining({ message: expect.any(String) }),
      );
      expect(onBreakHandler).toHaveBeenCalled();
    });
  });

  describe('onEventsConfigDegraded', () => {
    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls onEventsConfigDegraded handler when events-config endpoint becomes degraded', async () => {
      const degradedThreshold = 2000;
      nock(UAT_ORIGIN)
        .get(EVENTS_CONFIG_PATH)
        .reply(200, () => {
          jest.advanceTimersByTime(degradedThreshold + 100);
          return MOCK_EVENTS_CONFIG_RESPONSE;
        });

      const service = createService({
        policyOptions: { degradedThreshold, maxRetries: 0 },
      });
      const onDegradedHandler = jest.fn();
      service.onEventsConfigDegraded(onDegradedHandler);

      await service.fetchEventsConfig();

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

      const service = createService({
        fetch: customFetch,
      });

      const result = await service.fetchConfig();

      expect(customFetch).toHaveBeenCalled();
      expect(result).toMatchObject({ modified: true, data: MOCK_API_RESPONSE });
    });
  });
});

const MOCK_EVENTS_CONFIG_RESPONSE: RegistryEventsConfigApiResponse = {
  data: {
    schemaVersion: '1.0.0',
    version: '4a1153d78e32ac8f9975c5fe40e3526a19497525',
    timestamp: 1761829548000,
    events: {
      TestEvent: ['product'],
      MarketingEvent: ['marketing'],
    },
  },
};

describe('ConfigRegistryApiService - fetchEventsConfig', () => {
  describe('URL by env', () => {
    it('uses UAT URL when env is UAT', async () => {
      const scope = nock(UAT_ORIGIN)
        .get(EVENTS_CONFIG_PATH)
        .reply(200, MOCK_EVENTS_CONFIG_RESPONSE);

      const service = createService({ env: ConfigRegistryApiEnv.UAT });
      await service.fetchEventsConfig();
      expect(scope.isDone()).toBe(true);
    });

    it('uses DEV URL when env is DEV', async () => {
      const scope = nock(DEV_ORIGIN)
        .get(EVENTS_CONFIG_PATH)
        .reply(200, MOCK_EVENTS_CONFIG_RESPONSE);

      const service = createService({ env: ConfigRegistryApiEnv.DEV });
      await service.fetchEventsConfig();
      expect(scope.isDone()).toBe(true);
    });

    it('uses PRD URL when env is PRD', async () => {
      const scope = nock(PRD_ORIGIN)
        .get(EVENTS_CONFIG_PATH)
        .reply(200, MOCK_EVENTS_CONFIG_RESPONSE);

      const service = createService({ env: ConfigRegistryApiEnv.PRD });
      await service.fetchEventsConfig();
      expect(scope.isDone()).toBe(true);
    });
  });

  it('fetches events config from API successfully', async () => {
    const scope = nock(UAT_ORIGIN)
      .get(EVENTS_CONFIG_PATH)
      .reply(200, MOCK_EVENTS_CONFIG_RESPONSE, {
        ETag: '"events-etag-123"',
      });

    const service = createService();
    const result = await service.fetchEventsConfig();

    expect(result).toMatchObject({
      modified: true,
      etag: '"events-etag-123"',
      data: MOCK_EVENTS_CONFIG_RESPONSE,
    });
    expect(scope.isDone()).toBe(true);
  });

  it('handles 304 Not Modified response', async () => {
    const etag = '"events-etag-123"';
    nock(UAT_ORIGIN)
      .get(EVENTS_CONFIG_PATH)
      .matchHeader('If-None-Match', etag)
      .reply(304);

    const service = createService();
    const result = await service.fetchEventsConfig({ etag });

    expect(result.modified).toBe(false);
    expect(result.data).toBeUndefined();
  });

  it('returns cached data when 304 is received and service has prior successful response', async () => {
    const etag = '"events-etag-123"';
    nock(UAT_ORIGIN)
      .get(EVENTS_CONFIG_PATH)
      .reply(200, MOCK_EVENTS_CONFIG_RESPONSE, { ETag: etag });

    const service = createService();
    await service.fetchEventsConfig();

    nock(UAT_ORIGIN)
      .get(EVENTS_CONFIG_PATH)
      .matchHeader('If-None-Match', etag)
      .reply(304);

    const result = await service.fetchEventsConfig({ etag });

    expect(result.modified).toBe(false);
    expect(result.data).toStrictEqual(MOCK_EVENTS_CONFIG_RESPONSE);
  });

  it('throws error on invalid response structure', async () => {
    nock(UAT_ORIGIN).get(EVENTS_CONFIG_PATH).reply(200, { invalid: 'data' });

    const service = createService();

    await expect(service.fetchEventsConfig()).rejects.toMatchObject(
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it('throws error on HTTP error status', async () => {
    nock(UAT_ORIGIN)
      .get(EVENTS_CONFIG_PATH)
      .reply(500, 'Internal Server Error');

    const service = createService({
      policyOptions: { maxRetries: 0 },
    });

    await expect(service.fetchEventsConfig()).rejects.toMatchObject(
      expect.objectContaining({
        message: 'Failed to fetch events config: 500 Internal Server Error',
      }),
    );
  });
});
