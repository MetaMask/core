import { errorCodes } from '@metamask/rpc-errors';
import type { Json, PendingJsonRpcResponse } from '@metamask/utils';

import type { QueuedRequestControllerEnqueueRequestAction } from './QueuedRequestController';
import { createQueuedRequestMiddleware } from './QueuedRequestMiddleware';
import type { QueuedRequestMiddlewareJsonRpcRequest } from './types';

const getRequestDefaults = (): QueuedRequestMiddlewareJsonRpcRequest => {
  return {
    method: 'doesnt matter',
    id: 'doesnt matter',
    jsonrpc: '2.0' as const,
    origin: 'example.com',
    networkClientId: 'mainnet',
  };
};

const getPendingResponseDefault = (): PendingJsonRpcResponse<Json> => {
  return {
    id: 'doesnt matter',
    jsonrpc: '2.0' as const,
  };
};

const getMockEnqueueRequest = () =>
  jest
    .fn<
      ReturnType<QueuedRequestControllerEnqueueRequestAction['handler']>,
      Parameters<QueuedRequestControllerEnqueueRequestAction['handler']>
    >()
    .mockImplementation((_request, requestNext) => requestNext());

describe('createQueuedRequestMiddleware', () => {
  it('throws if not provided an origin', async () => {
    const middleware = createQueuedRequestMiddleware({
      enqueueRequest: getMockEnqueueRequest(),
      useRequestQueue: () => false,
    });
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
    const middleware = createQueuedRequestMiddleware({
      enqueueRequest: getMockEnqueueRequest(),
      useRequestQueue: () => false,
    });
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
    const middleware = createQueuedRequestMiddleware({
      enqueueRequest: getMockEnqueueRequest(),
      useRequestQueue: () => false,
    });
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
    const middleware = createQueuedRequestMiddleware({
      enqueueRequest: getMockEnqueueRequest(),
      useRequestQueue: () => false,
    });
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
    const middleware = createQueuedRequestMiddleware({
      enqueueRequest: mockEnqueueRequest,
      useRequestQueue: () => false,
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
    const middleware = createQueuedRequestMiddleware({
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

  it('enqueues request that has a confirmation', async () => {
    const mockEnqueueRequest = getMockEnqueueRequest();
    const middleware = createQueuedRequestMiddleware({
      enqueueRequest: mockEnqueueRequest,
      useRequestQueue: () => true,
    });
    const request = {
      ...getRequestDefaults(),
      origin: 'exampleorigin.com',
      method: 'eth_sendTransaction',
    };

    await new Promise((resolve, reject) =>
      middleware(request, getPendingResponseDefault(), resolve, reject),
    );

    expect(mockEnqueueRequest).toHaveBeenCalledWith(
      request,
      expect.any(Function),
    );
  });

  it('enqueues request that have a confirmation', async () => {
    const mockEnqueueRequest = getMockEnqueueRequest();
    const middleware = createQueuedRequestMiddleware({
      enqueueRequest: mockEnqueueRequest,
      useRequestQueue: () => true,
    });
    const request = {
      ...getRequestDefaults(),
      origin: 'exampleorigin.com',
      method: 'eth_sendTransaction',
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
    const middleware = createQueuedRequestMiddleware({
      enqueueRequest: getMockEnqueueRequest(),
      useRequestQueue: () => false,
    });
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
    const middleware = createQueuedRequestMiddleware({
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
      const middleware = createQueuedRequestMiddleware({
        enqueueRequest: jest
          .fn()
          .mockRejectedValue(new Error('enqueuing error')),
        useRequestQueue: () => true,
      });
      const request = {
        ...getRequestDefaults(),
        method: 'eth_sendTransaction',
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
      const middleware = createQueuedRequestMiddleware({
        enqueueRequest: jest
          .fn()
          .mockRejectedValue(new Error('enqueuing error')),
        useRequestQueue: () => true,
      });
      const request = {
        ...getRequestDefaults(),
        method: 'eth_sendTransaction',
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
