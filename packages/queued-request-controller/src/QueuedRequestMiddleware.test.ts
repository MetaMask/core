import { errorCodes } from '@metamask/rpc-errors';
import type { Json, PendingJsonRpcResponse } from '@metamask/utils';

import type { QueuedRequestControllerEnqueueRequestAction } from './QueuedRequestController';
import { createQueuedRequestMiddleware } from './QueuedRequestMiddleware';
import type { QueuedRequestMiddlewareJsonRpcRequest } from './types';

describe('createQueuedRequestMiddleware', () => {
  it('throws if not provided an origin', async () => {
    const middleware = buildQueuedRequestMiddleware();
    const request = getRequestDefaults();
    // @ts-expect-error Intentionally invalid request
    delete request.origin;

    await expect(
      () =>
        new Promise((resolve, reject) =>
          middleware(request, getPendingResponseDefault(), resolve, reject),
        ),
    ).rejects.toThrow("Request object is lacking an 'origin'");
  });

  it('throws if provided an invalid origin', async () => {
    const middleware = buildQueuedRequestMiddleware();
    const request = getRequestDefaults();
    // @ts-expect-error Intentionally invalid request
    request.origin = 1;

    await expect(
      () =>
        new Promise((resolve, reject) =>
          middleware(request, getPendingResponseDefault(), resolve, reject),
        ),
    ).rejects.toThrow("Request object has an invalid origin of type 'number'");
  });

  it('throws if not provided an networkClientId', async () => {
    const middleware = buildQueuedRequestMiddleware();
    const request = getRequestDefaults();
    // @ts-expect-error Intentionally invalid request
    delete request.networkClientId;

    await expect(
      () =>
        new Promise((resolve, reject) =>
          middleware(request, getPendingResponseDefault(), resolve, reject),
        ),
    ).rejects.toThrow("Request object is lacking a 'networkClientId'");
  });

  it('throws if provided an invalid networkClientId', async () => {
    const middleware = buildQueuedRequestMiddleware();
    const request = getRequestDefaults();
    // @ts-expect-error Intentionally invalid request
    request.networkClientId = 1;

    await expect(
      () =>
        new Promise((resolve, reject) =>
          middleware(request, getPendingResponseDefault(), resolve, reject),
        ),
    ).rejects.toThrow(
      "Request object has an invalid networkClientId of type 'number'",
    );
  });

  it('does not enqueue the request when useRequestQueue is false', async () => {
    const mockEnqueueRequest = getMockEnqueueRequest();
    const middleware = buildQueuedRequestMiddleware({
      enqueueRequest: mockEnqueueRequest,
    });

    await new Promise((resolve, reject) =>
      middleware(
        getRequestDefaults(),
        getPendingResponseDefault(),
        resolve,
        reject,
      ),
    );

    expect(mockEnqueueRequest).not.toHaveBeenCalled();
  });

  it('does not enqueue request that has no confirmation', async () => {
    const mockEnqueueRequest = getMockEnqueueRequest();
    const middleware = buildQueuedRequestMiddleware({
      enqueueRequest: mockEnqueueRequest,
      useRequestQueue: () => true,
    });

    const request = {
      ...getRequestDefaults(),
      method: 'eth_chainId',
    };

    await new Promise((resolve, reject) =>
      middleware(request, getPendingResponseDefault(), resolve, reject),
    );

    expect(mockEnqueueRequest).not.toHaveBeenCalled();
  });

  it('enqueues the request if shouldEnqueueRest returns true', async () => {
    const mockEnqueueRequest = getMockEnqueueRequest();
    const middleware = buildQueuedRequestMiddleware({
      enqueueRequest: mockEnqueueRequest,
      useRequestQueue: () => true,
      shouldEnqueueRequest: ({ method }) =>
        method === 'method_with_confirmation',
    });
    const request = {
      ...getRequestDefaults(),
      origin: 'exampleorigin.com',
      method: 'method_with_confirmation',
    };

    await new Promise((resolve, reject) =>
      middleware(request, getPendingResponseDefault(), resolve, reject),
    );

    expect(mockEnqueueRequest).toHaveBeenCalledWith(
      request,
      expect.any(Function),
    );
  });

  it('calls next when a request is not queued', async () => {
    const middleware = buildQueuedRequestMiddleware();
    const mockNext = jest.fn();

    await new Promise((resolve) => {
      mockNext.mockImplementation(resolve);
      middleware(
        getRequestDefaults(),
        getPendingResponseDefault(),
        mockNext,
        jest.fn(),
      );
    });

    expect(mockNext).toHaveBeenCalled();
  });

  it('calls next after a request is queued and processed', async () => {
    const middleware = buildQueuedRequestMiddleware({
      enqueueRequest: getMockEnqueueRequest(),
      useRequestQueue: () => true,
    });
    const request = {
      ...getRequestDefaults(),
      method: 'eth_sendTransaction',
    };
    const mockNext = jest.fn();

    await new Promise((resolve) => {
      mockNext.mockImplementation(resolve);
      middleware(request, getPendingResponseDefault(), mockNext, jest.fn());
    });

    expect(mockNext).toHaveBeenCalled();
  });

  describe('when enqueueRequest throws', () => {
    it('ends without calling next', async () => {
      const middleware = buildQueuedRequestMiddleware({
        enqueueRequest: jest
          .fn()
          .mockRejectedValue(new Error('enqueuing error')),
        useRequestQueue: () => true,
        shouldEnqueueRequest: () => true,
      });
      const request = {
        ...getRequestDefaults(),
        method: 'method_should_be_enqueued',
      };
      const mockNext = jest.fn();
      const mockEnd = jest.fn();

      await new Promise((resolve) => {
        mockEnd.mockImplementation(resolve);
        middleware(request, getPendingResponseDefault(), mockNext, mockEnd);
      });

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockEnd).toHaveBeenCalled();
    });

    it('serializes processing errors and attaches them to the response', async () => {
      const middleware = buildQueuedRequestMiddleware({
        enqueueRequest: jest
          .fn()
          .mockRejectedValue(new Error('enqueuing error')),
        useRequestQueue: () => true,
        shouldEnqueueRequest: () => true,
      });
      const request = {
        ...getRequestDefaults(),
        method: 'method_should_be_enqueued',
      };
      const response = getPendingResponseDefault();

      await new Promise((resolve) =>
        middleware(request, response, jest.fn(), resolve),
      );

      expect(response.error).toMatchObject({
        code: errorCodes.rpc.internal,
        data: {
          cause: {
            message: 'enqueuing error',
            stack: expect.any(String),
          },
        },
      });
    });
  });
});

/**
 * Build a valid JSON-RPC request that includes all required properties
 *
 * @returns A valid JSON-RPC request with all required properties.
 */
function getRequestDefaults(): QueuedRequestMiddlewareJsonRpcRequest {
  return {
    method: 'doesnt matter',
    id: 'doesnt matter',
    jsonrpc: '2.0' as const,
    origin: 'example.com',
    networkClientId: 'mainnet',
  };
}

/**
 * Build a partial JSON-RPC response
 *
 * @returns A partial response request
 */
function getPendingResponseDefault(): PendingJsonRpcResponse<Json> {
  return {
    id: 'doesnt matter',
    jsonrpc: '2.0' as const,
  };
}

/**
 * Builds a mock QueuedRequestController.enqueueRequest function
 *
 * @returns A mock function that calls the next request in the middleware chain
 */
function getMockEnqueueRequest() {
  return jest
    .fn<
      ReturnType<QueuedRequestControllerEnqueueRequestAction['handler']>,
      Parameters<QueuedRequestControllerEnqueueRequestAction['handler']>
    >()
    .mockImplementation((_request, requestNext) => requestNext());
}

/**
 * Builds the QueuedRequestMiddleware
 *
 * @param overrideOptions - The optional options object.
 * @returns The QueuedRequestMiddleware.
 */
function buildQueuedRequestMiddleware(
  overrideOptions?: Partial<
    Parameters<typeof createQueuedRequestMiddleware>[0]
  >,
) {
  const options = {
    enqueueRequest: getMockEnqueueRequest(),
    useRequestQueue: () => false,
    shouldEnqueueRequest: () => false,
    ...overrideOptions,
  };

  return createQueuedRequestMiddleware(options);
}
