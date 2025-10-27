import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { JsonRpcRequest } from '@metamask/utils';

import { createBlockRefRewriteMiddleware } from './block-ref-rewrite';
import {
  buildFinalMiddlewareWithDefaultResult,
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

    const engine = new JsonRpcEngine();
    engine.push(
      createBlockRefRewriteMiddleware({
        blockTracker: mockBlockTracker,
      }),
    );

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

    const engine = new JsonRpcEngine();
    engine.push(
      createBlockRefRewriteMiddleware({
        blockTracker: mockBlockTracker,
      }),
    );

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

    const engine = new JsonRpcEngine();
    engine.push(
      createBlockRefRewriteMiddleware({
        blockTracker: mockBlockTracker,
      }),
    );

    // Mock a middleware that captures the request after modification
    let capturedRequest: JsonRpcRequest | undefined;
    engine.push(async (req, _res, next) => {
      capturedRequest = { ...req };
      return next();
    });
    engine.push(buildFinalMiddlewareWithDefaultResult());

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

    const engine = new JsonRpcEngine();
    engine.push(
      createBlockRefRewriteMiddleware({
        blockTracker: mockBlockTracker,
      }),
    );

    let capturedRequest: JsonRpcRequest | undefined;
    engine.push(async (req, _res, next) => {
      capturedRequest = { ...req };
      return next();
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

    const engine = new JsonRpcEngine();
    engine.push(
      createBlockRefRewriteMiddleware({
        blockTracker: mockBlockTracker,
      }),
    );

    let capturedRequest: JsonRpcRequest | undefined;
    engine.push(async (req, _res, next) => {
      capturedRequest = { ...req };
      return next();
    });
    engine.push(buildFinalMiddlewareWithDefaultResult());

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
