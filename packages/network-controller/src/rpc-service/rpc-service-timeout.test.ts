import { createDeferredPromise } from '@metamask/utils';
import nock from 'nock';

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
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects a stalled fetch after five seconds even if fetch ignores cancellation', async () => {
    const mockFetch = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >(() => new Promise(() => undefined));
    const service = new RpcService({
      fetch: mockFetch,
      btoa,
      endpointUrl: 'https://rpc.example.chain',
      isOffline: (): boolean => false,
      policyOptions: { maxRetries: 0 },
    });
    const rejected = jest.fn();
    const request = service.request(jsonRpcRequest).catch(rejected);

    await jest.advanceTimersByTimeAsync(4_999);
    expect(rejected).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ETIMEDOUT' }),
    );
    await request;
    expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('also bounds the time spent reading the response body', async () => {
    const response = new Response('', { status: 200 });
    jest
      .spyOn(response, 'json')
      .mockImplementation(() => new Promise(() => undefined));
    const service = new RpcService({
      fetch: async (): Promise<Response> => response,
      btoa,
      endpointUrl: 'https://rpc.example.chain',
      isOffline: (): boolean => false,
      policyOptions: { maxRetries: 0 },
    });
    const rejected = jest.fn();
    const request = service.request(jsonRpcRequest).catch(rejected);

    await jest.advanceTimersByTimeAsync(5_000);

    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ETIMEDOUT' }),
    );
    await request;
    expect(jest.getTimerCount()).toBe(0);
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
    const rejected = jest.fn();
    const request = service.request(jsonRpcRequest).catch(rejected);
    await jest.advanceTimersByTimeAsync(99);
    expect(rejected).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
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

  it.each(['request', 'default', 'authenticated default'])(
    'preserves cancellation from the %s fetch options',
    async (source) => {
      const controller = new AbortController();
      const addListener = jest.spyOn(controller.signal, 'addEventListener');
      const removeListener = jest.spyOn(
        controller.signal,
        'removeEventListener',
      );
      const mockFetch = jest.fn<
        ReturnType<typeof fetch>,
        Parameters<typeof fetch>
      >(() => new Promise(() => undefined));
      const service = new RpcService({
        ...options,
        endpointUrl:
          source === 'authenticated default'
            ? 'https://user:password@rpc.example.chain'
            : options.endpointUrl,
        fetch: mockFetch,
        fetchOptions: source === 'request' ? {} : { signal: controller.signal },
      });
      const rejected = jest.fn();
      const request = service
        .request(
          jsonRpcRequest,
          source === 'request' ? { signal: controller.signal } : {},
        )
        .catch(rejected);
      controller.abort();
      await jest.advanceTimersByTimeAsync(0);

      expect(rejected).toHaveBeenCalledWith(controller.signal.reason);
      await request;
      expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(removeListener).toHaveBeenCalledWith(
        'abort',
        addListener.mock.calls[0][1],
      );
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  it('does not start fetch when the caller has already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const mockFetch = jest.fn(fetch);
    const service = new RpcService({ ...options, fetch: mockFetch });
    await expect(
      service.request(jsonRpcRequest, { signal: controller.signal }),
    ).rejects.toBe(controller.signal.reason);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cleans up after a successful request without aborting it later', async () => {
    const controller = new AbortController();
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener');
    const mockFetch = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >(async () => new Response(JSON.stringify(responseBody)));
    const service = new RpcService({ ...options, fetch: mockFetch });
    expect(
      await service.request(jsonRpcRequest, { signal: controller.signal }),
    ).toStrictEqual(responseBody);
    expect(jest.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
  });

  it('retries a timeout with a fresh signal and can recover', async () => {
    const mockFetch = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
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
    const retried = jest.fn();
    service.onRetry(retried);
    const request = service.request(jsonRpcRequest);
    await jest.advanceTimersByTimeAsync(100);
    expect(retried).toHaveBeenCalledTimes(1);
    await jest.runAllTimersAsync();
    expect(await request).toStrictEqual(responseBody);
    const firstSignal = mockFetch.mock.calls[0][1]?.signal;
    const secondSignal = mockFetch.mock.calls[1][1]?.signal;
    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);
    expect(secondSignal).not.toBe(firstSignal);
    expect(service.lastError).toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps concurrent request deadlines independent', async () => {
    const pending = createDeferredPromise<Response>();
    const mockFetch = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockReturnValueOnce(pending.promise);
    const service = new RpcService({
      ...options,
      fetch: mockFetch,
      requestTimeout: 100,
    });
    const rejected = jest.fn();
    const first = service.request(jsonRpcRequest).catch(rejected);
    await jest.advanceTimersByTimeAsync(50);
    const second = service.request({ ...jsonRpcRequest, id: 2 });
    await jest.advanceTimersByTimeAsync(50);
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[1][1]?.signal?.aborted).toBe(false);
    pending.resolve(new Response(JSON.stringify({ ...responseBody, id: 2 })));
    expect(await second).toStrictEqual({ ...responseBody, id: 2 });
    await first;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('switches to a backup after timeouts open the primary circuit', async () => {
    const primaryFetch = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >(() => new Promise(() => undefined));
    const backupFetch = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >(async () => new Response(JSON.stringify(responseBody)));
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
    await jest.runAllTimersAsync();
    expect(await request).toStrictEqual(responseBody);
    expect(primaryFetch).toHaveBeenCalledTimes(1);
    expect(backupFetch).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('aborts a real fetch implementation when the server is slow', async () => {
    nock(options.endpointUrl)
      .post('/')
      .delayConnection(200)
      .reply(200, responseBody);
    const service = new RpcService({ ...options, fetch, requestTimeout: 100 });
    const rejected = jest.fn();
    const request = service.request(jsonRpcRequest).catch(rejected);
    await jest.advanceTimersByTimeAsync(100);
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
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cleans up the deadline and cancellation listener after an HTTP error', async () => {
    const controller = new AbortController();
    const removeListener = jest.spyOn(controller.signal, 'removeEventListener');
    const service = new RpcService({
      ...options,
      fetch: async (): Promise<Response> => new Response('', { status: 401 }),
    });
    await expect(
      service.request(jsonRpcRequest, { signal: controller.signal }),
    ).rejects.toThrow('Unauthorized.');
    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not let a late response change the trace ID of a retried request', async () => {
    const firstResponse = createDeferredPromise<Response>();
    const secondBody = createDeferredPromise<never>();
    const response = new Response('', { headers: { 'X-Trace-Id': 'second' } });
    jest.spyOn(response, 'json').mockReturnValue(secondBody.promise);
    const mockFetch = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockReturnValueOnce(firstResponse.promise)
      .mockResolvedValueOnce(response);
    const service = new RpcService({
      ...options,
      fetch: mockFetch,
      requestTimeout: 100,
      policyOptions: { maxRetries: 1 },
    });
    const degraded = jest.fn();
    service.onDegraded(degraded);
    const rejected = jest.fn();
    const request = service.request(jsonRpcRequest).catch(rejected);
    await jest.advanceTimersByTimeAsync(100);
    // Advance only the backoff timer, leaving the next attempt's timeout pending.
    await jest.advanceTimersToNextTimerAsync();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    firstResponse.resolve(
      new Response('{}', { headers: { 'X-Trace-Id': 'first' } }),
    );
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(100);
    expect(rejected).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ETIMEDOUT' }),
    );
    await request;
    expect(degraded).toHaveBeenCalledWith(
      expect.objectContaining({ traceId: 'second' }),
    );
    expect(jest.getTimerCount()).toBe(0);
  });
});
