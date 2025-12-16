import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';
import type { Json, JsonRpcRequest } from '@metamask/utils';

import { createBlockRefRewriteMiddleware } from './block-ref-rewrite';
import {
  createFinalMiddlewareWithDefaultResult,
  createRequest,
} from '../test/util/helpers';

const createMockBlockTracker = (): PollingBlockTracker => {
  return {
    getLatestBlock: jest.fn(),
  } as unknown as PollingBlockTracker;
};

describe('createBlockRefRewriteMiddleware', () => {
  it('throws an error when blockTracker is not provided', () => {
    expect(() => {
      createBlockRefRewriteMiddleware();
    }).toThrow(
      'BlockRefRewriteMiddleware - mandatory "blockTracker" option is missing.',
    );
  });

  it('skips processing when method does not have a block reference parameter', async () => {
    const mockBlockTracker = createMockBlockTracker();
    const getLatestBlockSpy = jest.spyOn(mockBlockTracker, 'getLatestBlock');

    const engine = JsonRpcEngineV2.create({
      middleware: [
        createBlockRefRewriteMiddleware({
          blockTracker: mockBlockTracker,
        }),
        createFinalMiddlewareWithDefaultResult(),
      ],
    });

    const originalRequest = createRequest({
      method: 'eth_chainId',
    });

    await engine.handle(originalRequest);

    // blockTracker should not be called for methods without block reference
    expect(getLatestBlockSpy).not.toHaveBeenCalled();
  });

  it('skips processing when block reference is not "latest"', async () => {
    const mockBlockTracker = createMockBlockTracker();
    const getLatestBlockSpy = jest.spyOn(mockBlockTracker, 'getLatestBlock');

    const engine = JsonRpcEngineV2.create({
      middleware: [
        createBlockRefRewriteMiddleware({
          blockTracker: mockBlockTracker,
        }),
        createFinalMiddlewareWithDefaultResult(),
      ],
    });

    const originalRequest = createRequest({
      method: 'eth_getBalance',
      params: ['0x1234567890abcdef', '0x99'],
    });

    await engine.handle(originalRequest);

    // blockTracker should not be called when block reference is not "latest"
    expect(getLatestBlockSpy).not.toHaveBeenCalled();
  });

  it('rewrites "latest" block reference to actual block number for methods with a block reference parameter', async () => {
    const mockBlockTracker = createMockBlockTracker();
    jest
      .spyOn(mockBlockTracker, 'getLatestBlock')
      .mockResolvedValue('0xabc123');

    // Mock a middleware that captures the request after modification
    let capturedRequest: JsonRpcRequest | undefined;
    const engine = JsonRpcEngineV2.create({
      middleware: [
        createBlockRefRewriteMiddleware({
          blockTracker: mockBlockTracker,
        }),
        async ({
          request,
          next,
        }): Promise<Readonly<Json | void> | undefined> => {
          capturedRequest = { ...request } as JsonRpcRequest;
          return next();
        },
        createFinalMiddlewareWithDefaultResult(),
      ],
    });

    const originalRequest = createRequest({
      method: 'eth_getBalance',
      params: ['0x1234567890abcdef', 'latest'],
    });

    await engine.handle(originalRequest);

    expect(mockBlockTracker.getLatestBlock).toHaveBeenCalledTimes(1);
    expect(capturedRequest?.params).toStrictEqual([
      '0x1234567890abcdef',
      '0xabc123',
    ]);
  });

  it('treats omitted block reference as "latest" and rewrites it', async () => {
    const mockBlockTracker = createMockBlockTracker();
    jest
      .spyOn(mockBlockTracker, 'getLatestBlock')
      .mockResolvedValue('0x111222');

    let capturedRequest: JsonRpcRequest | undefined;
    const engine = JsonRpcEngineV2.create({
      middleware: [
        createBlockRefRewriteMiddleware({
          blockTracker: mockBlockTracker,
        }),
        async ({
          request,
          next,
        }): Promise<Readonly<Json | void> | undefined> => {
          capturedRequest = { ...request } as JsonRpcRequest;
          return next();
        },
        createFinalMiddlewareWithDefaultResult(),
      ],
    });

    const originalRequest = createRequest({
      method: 'eth_getBalance',
      params: ['0x1234567890abcdef'], // No block reference provided (should default to "latest")
    });

    await engine.handle(originalRequest);

    expect(mockBlockTracker.getLatestBlock).toHaveBeenCalled();
    expect(capturedRequest?.params).toStrictEqual([
      '0x1234567890abcdef',
      '0x111222',
    ]);
  });

  it('handles non-array params gracefully', async () => {
    const mockBlockTracker = createMockBlockTracker();
    jest
      .spyOn(mockBlockTracker, 'getLatestBlock')
      .mockResolvedValue('0xffffff');

    let capturedRequest: JsonRpcRequest | undefined;
    const engine = JsonRpcEngineV2.create({
      middleware: [
        createBlockRefRewriteMiddleware({
          blockTracker: mockBlockTracker,
        }),
        async ({
          request,
          next,
        }): Promise<Readonly<Json | void> | undefined> => {
          capturedRequest = { ...request } as JsonRpcRequest;
          return next();
        },
        createFinalMiddlewareWithDefaultResult(),
      ],
    });

    const originalRequest = createRequest({
      method: 'eth_getBalance',
      // @ts-expect-error - Destructive testing
      params: null, // Non-array params
    });

    await engine.handle(originalRequest);

    // getLatestBlock is still called but the request is unmodified
    expect(mockBlockTracker.getLatestBlock).toHaveBeenCalledTimes(1);
    expect(capturedRequest?.params).toBeNull();
  });
});
