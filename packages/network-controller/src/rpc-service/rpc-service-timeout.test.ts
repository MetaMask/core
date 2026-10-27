import { createDeferredPromise } from '@metamask/utils';
import nock from 'nock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RpcServiceChain } from './rpc-service-chain.js';
import type { RpcServiceOptions } from './rpc-service.js';
import { RpcService } from './rpc-service.js';

describe('RpcService request timeout', () => {
  const jsonRpcRequest = {
    id: 1,
    jsonrpc: '2.0' as const,
    method: 'eth_chainId',
    params: [],
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects a stalled fetch after five seconds even if fetch ignores cancellation', async () => {
    const mockFetch = vi.fn<typeof fetch>(() => new Promise(() => undefined));
    const service = new RpcService({
      fetch: mockFetch,
      btoa,
      endpointUrl: 'https://rpc.example.chain',
      isOffline: (): boolean => false,
      policyOptions: { maxRetries: 0 },
    });
    const rejected = vi.fn();
    const request = service.request(jsonRpcRequest).catch(rejected);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(rejected).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ETIMEDOUT' }),
    );
    await request;
    expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also bounds the time spent reading the response body', async () => {
    const response = new Response('', { status: 200 });
    vi.spyOn(response, 'json').mockImplementation(
      () => new Promise(() => undefined),
    );
    const service = new RpcService({
      fetch: async (): Promise<Response> => response,
      btoa,
      endpointUrl: 'https://rpc.example.chain',
      isOffline: (): boolean => false,
      policyOptions: { maxRetries: 0 },
    });
    const rejected = vi.fn();
    const request = service.request(jsonRpcRequest).catch(rejected);

    await vi.advanceTimersByTimeAsync(5_000);

    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ETIMEDOUT' }),
    );
    await request;
    expect(vi.getTimerCount()).toBe(0);
  });

  const responseBody = { id: 1, jsonrpc: '2.0', result: '0x1' };
  const options = {
    btoa,
    endpointUrl: 'https://rpc.example.chain',
    isOffline: (): boolean => false,
    policyOptions: { maxRetries: 0 },
  };

  it('allows configuring the timeout for each attempt', async () => {
    const service = new RpcService({
      ...options,
      fetch: (): Promise<Response> => new Promise(() => undefined),
      requestTimeout: 100,
    });
    const rejected = vi.fn();
    const request = service.request(jsonRpcRequest).catch(rejected);
    await vi.advanceTimersByTimeAsync(99);
    expect(rejected).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ETIMEDOUT' }),
    );
    await request;
  });

  it.each([0, -1, NaN, Infinity, 2 ** 31])(
    'rejects an invalid timeout of %s',
    (requestTimeout) => {
      expect(
        () => new RpcService({ ...options, fetch, requestTimeout }),
      ).toThrow(RangeError);
    },
  );

  it.each([
    {
      source: 'request',
      endpointUrl: options.endpointUrl,
      configure: (
        signal: AbortSignal,
      ): {
        fetchOptions: { signal?: AbortSignal };
        requestOptions: { signal?: AbortSignal };
      } => ({
        fetchOptions: {},
        requestOptions: { signal },
      }),
    },
    {
      source: 'default',
      endpointUrl: options.endpointUrl,
      configure: (
        signal: AbortSignal,
      ): {
        fetchOptions: { signal?: AbortSignal };
        requestOptions: { signal?: AbortSignal };
      } => ({
        fetchOptions: { signal },
        requestOptions: {},
      }),
    },
    {
      source: 'authenticated default',
      endpointUrl: 'https://user:password@rpc.example.chain',
      configure: (
        signal: AbortSignal,
      ): {
        fetchOptions: { signal?: AbortSignal };
        requestOptions: { signal?: AbortSignal };
      } => ({
        fetchOptions: { signal },
        requestOptions: {},
      }),
    },
  ])(
    'preserves cancellation from the $source fetch options',
    async ({ endpointUrl, configure }) => {
      const controller = new AbortController();
      const addListener = vi.spyOn(controller.signal, 'addEventListener');
      const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
      const mockFetch = vi.fn<typeof fetch>(() => new Promise(() => undefined));
      const { fetchOptions, requestOptions } = configure(controller.signal);
      const service = new RpcService({
        ...options,
        endpointUrl,
        fetch: mockFetch,
        fetchOptions,
      });
      const rejected = vi.fn();
      const request = service
        .request(jsonRpcRequest, requestOptions)
        .catch(rejected);
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);

      expect(rejected).toHaveBeenCalledWith(controller.signal.reason);
      await request;
      expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(removeListener).toHaveBeenCalledWith(
        'abort',
        addListener.mock.calls[0][1],
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not start fetch when the caller has already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const mockFetch = vi.fn(fetch);
    const service = new RpcService({ ...options, fetch: mockFetch });
    await expect(
      service.request(jsonRpcRequest, { signal: controller.signal }),
    ).rejects.toBe(controller.signal.reason);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up after a successful request without aborting it later', async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const mockFetch = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(responseBody)),
    );
    const service = new RpcService({ ...options, fetch: mockFetch });
    expect(
      await service.request(jsonRpcRequest, { signal: controller.signal }),
    ).toStrictEqual(responseBody);
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
  });

  it('retries a timeout with a fresh signal and can recover', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockImplementationOnce(
        async () => new Response(JSON.stringify(responseBody)),
      );
    const service = new RpcService({
      ...options,
      fetch: mockFetch,
      requestTimeout: 100,
      policyOptions: { maxRetries: 1 },
    });
    const retried = vi.fn();
    service.onRetry(retried);
    const request = service.request(jsonRpcRequest);
    await vi.advanceTimersByTimeAsync(100);
    expect(retried).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(await request).toStrictEqual(responseBody);
    const firstSignal = mockFetch.mock.calls[0][1]?.signal;
    const secondSignal = mockFetch.mock.calls[1][1]?.signal;
    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);
    expect(secondSignal).not.toBe(firstSignal);
    expect(service.lastError).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps concurrent request deadlines independent', async () => {
    const pending = createDeferredPromise<Response>();
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockReturnValueOnce(pending.promise);
    const service = new RpcService({
      ...options,
      fetch: mockFetch,
      requestTimeout: 100,
    });
    const rejected = vi.fn();
    const first = service.request(jsonRpcRequest).catch(rejected);
    await vi.advanceTimersByTimeAsync(50);
    const second = service.request({ ...jsonRpcRequest, id: 2 });
    await vi.advanceTimersByTimeAsync(50);
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[1][1]?.signal?.aborted).toBe(false);
    pending.resolve(new Response(JSON.stringify({ ...responseBody, id: 2 })));
    expect(await second).toStrictEqual({ ...responseBody, id: 2 });
    await first;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('switches to a backup after timeouts open the primary circuit', async () => {
    const primaryFetch = vi.fn<typeof fetch>(
      () => new Promise(() => undefined),
    );
    const backupFetch = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(responseBody)),
    );
    const configuration: RpcServiceOptions = {
      ...options,
      fetch: primaryFetch,
      requestTimeout: 100,
      policyOptions: { maxRetries: 1, maxConsecutiveFailures: 1 },
    };
    const chain = new RpcServiceChain([
      configuration,
      {
        ...configuration,
        endpointUrl: 'https://backup.example.chain',
        fetch: backupFetch,
      },
    ]);
    const request = chain.request(jsonRpcRequest);
    await vi.runAllTimersAsync();
    expect(await request).toStrictEqual(responseBody);
    expect(primaryFetch).toHaveBeenCalledTimes(1);
    expect(backupFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a real fetch implementation when the server is slow', async () => {
    nock(options.endpointUrl)
      .post('/')
      .delayConnection(200)
      .reply(200, responseBody);
    const service = new RpcService({ ...options, fetch, requestTimeout: 100 });
    const rejected = vi.fn();
    const request = service.request(jsonRpcRequest).catch(rejected);
    await vi.advanceTimersByTimeAsync(100);
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ETIMEDOUT' }),
    );
    await request;
    // Nock also owns a delayed connection timer, so only test our result here.
  });

  it('lets request options replace or clear the default cancellation signal', async () => {
    const defaultController = new AbortController();
    defaultController.abort();
    const requestController = new AbortController();
    const service = new RpcService({
      ...options,
      fetch: async (): Promise<Response> =>
        new Response(JSON.stringify(responseBody)),
      fetchOptions: { signal: defaultController.signal },
    });
    expect(
      await service.request(jsonRpcRequest, {
        signal: requestController.signal,
      }),
    ).toStrictEqual(responseBody);
    expect(
      await service.request(jsonRpcRequest, { signal: null }),
    ).toStrictEqual(responseBody);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up the deadline and cancellation listener after an HTTP error', async () => {
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const service = new RpcService({
      ...options,
      fetch: async (): Promise<Response> => new Response('', { status: 401 }),
    });
    await expect(
      service.request(jsonRpcRequest, { signal: controller.signal }),
    ).rejects.toThrow('Unauthorized.');
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let a late response change the trace ID of a retried request', async () => {
    const firstResponse = createDeferredPromise<Response>();
    const secondBody = createDeferredPromise<never>();
    const response = new Response('', { headers: { 'X-Trace-Id': 'second' } });
    vi.spyOn(response, 'json').mockReturnValue(secondBody.promise);
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(firstResponse.promise)
      .mockResolvedValueOnce(response);
    const service = new RpcService({
      ...options,
      fetch: mockFetch,
      requestTimeout: 100,
      policyOptions: { maxRetries: 1 },
    });
    const degraded = vi.fn();
    service.onDegraded(degraded);
    const rejected = vi.fn();
    const request = service.request(jsonRpcRequest).catch(rejected);
    await vi.advanceTimersByTimeAsync(100);
    // Advance only the backoff timer, leaving the next attempt's timeout pending.
    await vi.advanceTimersToNextTimerAsync();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    firstResponse.resolve(
      new Response('{}', { headers: { 'X-Trace-Id': 'first' } }),
    );
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ETIMEDOUT' }),
    );
    await request;
    expect(degraded).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: 'second' }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
});
