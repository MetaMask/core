import type { SafeEventEmitterProvider } from '@metamask/eth-json-rpc-provider';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';
import type { Json } from '@metamask/utils';
import { assertIsJsonRpcSuccess } from '@metamask/utils';

import {
  providerAsMiddleware,
  providerAsMiddlewareV2,
} from './providerAsMiddleware';
import { createRequest } from '../test/util/helpers';

const createMockProvider = (result: Json): SafeEventEmitterProvider =>
  ({
    request: jest.fn().mockResolvedValue(result),
  }) as unknown as SafeEventEmitterProvider;

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
        expect(response).toBeDefined();
        assertIsJsonRpcSuccess(response);
        expect(response.result).toStrictEqual(mockResult);
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
});
