import type { InternalProvider } from '@metamask/eth-json-rpc-provider';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';
import type { Json } from '@metamask/utils';
import {
  assertIsJsonRpcFailure,
  assertIsJsonRpcSuccess,
} from '@metamask/utils';

import {
  providerAsMiddleware,
  providerAsMiddlewareV2,
} from './providerAsMiddleware';
import { createRequest } from '../test/util/helpers';

const createMockProvider = (resultOrError: Json | Error): InternalProvider =>
  ({
    request:
      resultOrError instanceof Error
        ? jest.fn().mockRejectedValue(resultOrError)
        : jest.fn().mockResolvedValue(resultOrError),
  }) as unknown as InternalProvider;

describe('providerAsMiddleware', () => {
  it('forwards requests to the provider and returns the result', async () => {
    const mockResult = 42;
    const mockProvider = createMockProvider(mockResult);

    const engine = new JsonRpcEngine();
    engine.push(providerAsMiddleware(mockProvider));

    const request = createRequest({
      method: 'eth_chainId',
      params: [],
    });

    await new Promise<void>((resolve) => {
      engine.handle(request, (error, response) => {
        expect(error).toBeNull();
        assertIsJsonRpcSuccess(response);
        expect(response.result).toStrictEqual(mockResult);
        expect(mockProvider.request).toHaveBeenCalledWith(request);

        resolve();
      });
    });
  });

  it('forwards errors to the provider and returns the error', async () => {
    const mockError = new Error('test');
    const mockProvider = createMockProvider(mockError);

    const engine = new JsonRpcEngine();
    engine.push(providerAsMiddleware(mockProvider));

    const request = createRequest({
      method: 'eth_chainId',
      params: [],
    });

    await new Promise<void>((resolve) => {
      engine.handle(request, (error, response) => {
        assertIsJsonRpcFailure(response);
        expect(error).toBe(mockError);
        expect(response.error).toStrictEqual(
          expect.objectContaining({
            message: mockError.message,
            code: -32603,
            data: {
              cause: {
                message: mockError.message,
                stack: expect.any(String),
              },
            },
          }),
        );
        expect(mockProvider.request).toHaveBeenCalledWith(request);

        resolve();
      });
    });
  });
});

describe('providerAsMiddlewareV2', () => {
  it('forwards requests to the provider and returns the result', async () => {
    const mockResult = 123;
    const mockProvider = createMockProvider(mockResult);

    const engine = JsonRpcEngineV2.create({
      middleware: [providerAsMiddlewareV2(mockProvider)],
    });

    const request = createRequest({
      method: 'eth_chainId',
      params: [],
    });

    const result = await engine.handle(request);

    expect(result).toStrictEqual(mockResult);
    expect(mockProvider.request).toHaveBeenCalledWith(request);
  });

  it('forwards errors to the provider and returns the error', async () => {
    const mockError = new Error('test');
    const mockProvider = createMockProvider(mockError);

    const engine = JsonRpcEngineV2.create({
      middleware: [providerAsMiddlewareV2(mockProvider)],
    });

    const request = createRequest({
      method: 'eth_chainId',
      params: [],
    });

    await expect(engine.handle(request)).rejects.toThrow(mockError);
    expect(mockProvider.request).toHaveBeenCalledWith(request);
  });
});
