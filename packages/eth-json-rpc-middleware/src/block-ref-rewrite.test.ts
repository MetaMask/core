import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { JsonRpcRequest } from '@metamask/utils';

import { createBlockRefRewriteMiddleware } from './block-ref-rewrite';

describe('createBlockRefRewriteMiddleware', () => {
  it('throws an error when blockTracker is not provided', () => {
    expect(() => {
      createBlockRefRewriteMiddleware();
    }).toThrow('BlockRefRewriteMiddleware - mandatory "blockTracker" option is missing.');
  });

  it('throws an error when blockTracker is explicitly undefined', () => {
    expect(() => {
      createBlockRefRewriteMiddleware({ blockTracker: undefined });
    }).toThrow('BlockRefRewriteMiddleware - mandatory "blockTracker" option is missing.');
  });

  it('skips processing when method does not have a block reference parameter', async () => {
    const mockBlockTracker = buildMockBlockTracker();
    const getLatestBlockSpy = jest.spyOn(mockBlockTracker, 'getLatestBlock');
    const middleware = createBlockRefRewriteMiddleware({
      blockTracker: mockBlockTracker,
    });

    const engine = new JsonRpcEngine();
    engine.push(middleware);
    
    const originalRequest: JsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_chainId', // This method doesn't have a block reference
      params: [],
    };

    await engine.handle(originalRequest);

    // blockTracker should not be called for methods without block reference
    expect(getLatestBlockSpy).not.toHaveBeenCalled();
  });

  it('skips processing when block reference is not "latest"', async () => {
    const mockBlockTracker = buildMockBlockTracker();
    const getLatestBlockSpy = jest.spyOn(mockBlockTracker, 'getLatestBlock');
    const middleware = createBlockRefRewriteMiddleware({
      blockTracker: mockBlockTracker,
    });

    const engine = new JsonRpcEngine();
    engine.push(middleware);
    
    const originalRequest: JsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: ['0x1234567890abcdef', '0x123'], // Specific block number, not "latest"
    };

    await engine.handle(originalRequest);

    // blockTracker should not be called when block reference is not "latest"
    expect(getLatestBlockSpy).not.toHaveBeenCalled();
  });

  it('rewrites "latest" block reference to actual block number for eth_getBalance', async () => {
    const mockBlockTracker = buildMockBlockTracker();
    jest.spyOn(mockBlockTracker, 'getLatestBlock').mockResolvedValue('0xabc123');
    const middleware = createBlockRefRewriteMiddleware({
      blockTracker: mockBlockTracker,
    });

    const engine = new JsonRpcEngine();
    engine.push(middleware);
    
    // Mock a middleware that captures the request after modification
    let capturedRequest: JsonRpcRequest | undefined;
    engine.push(async (req, _res, next) => {
      capturedRequest = { ...req };
      return next();
    });
    
    const originalRequest: JsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: ['0x1234567890abcdef', 'latest'],
    };

    await engine.handle(originalRequest);

    expect(mockBlockTracker.getLatestBlock).toHaveBeenCalled();
    expect(capturedRequest?.params).toEqual(['0x1234567890abcdef', '0xabc123']);
  });

  it('rewrites "latest" block reference to actual block number for eth_getStorageAt', async () => {
    const mockBlockTracker = buildMockBlockTracker();
    jest.spyOn(mockBlockTracker, 'getLatestBlock').mockResolvedValue('0xdef456');
    const middleware = createBlockRefRewriteMiddleware({
      blockTracker: mockBlockTracker,
    });

    const engine = new JsonRpcEngine();
    engine.push(middleware);
    
    let capturedRequest: JsonRpcRequest | undefined;
    engine.push(async (req, _res, next) => {
      capturedRequest = { ...req };
      return next();
    });
    
    const originalRequest: JsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_getStorageAt',
      params: ['0x1234567890abcdef', '0x0', 'latest'], // blockRef is at index 2
    };

    await engine.handle(originalRequest);

    expect(mockBlockTracker.getLatestBlock).toHaveBeenCalled();
    expect(capturedRequest?.params).toEqual(['0x1234567890abcdef', '0x0', '0xdef456']);
  });

  it('rewrites "latest" block reference to actual block number for eth_getBlockByNumber', async () => {
    const mockBlockTracker = buildMockBlockTracker();
    jest.spyOn(mockBlockTracker, 'getLatestBlock').mockResolvedValue('0x789abc');
    const middleware = createBlockRefRewriteMiddleware({
      blockTracker: mockBlockTracker,
    });

    const engine = new JsonRpcEngine();
    engine.push(middleware);
    
    let capturedRequest: JsonRpcRequest | undefined;
    engine.push(async (req, _res, next) => {
      capturedRequest = { ...req };
      return next();
    });
    
    const originalRequest: JsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_getBlockByNumber',
      params: ['latest', true], // blockRef is at index 0
    };

    await engine.handle(originalRequest);

    expect(mockBlockTracker.getLatestBlock).toHaveBeenCalled();
    expect(capturedRequest?.params).toEqual(['0x789abc', true]);
  });

  it('treats omitted block reference as "latest" and rewrites it', async () => {
    const mockBlockTracker = buildMockBlockTracker();
    jest.spyOn(mockBlockTracker, 'getLatestBlock').mockResolvedValue('0x111222');
    const middleware = createBlockRefRewriteMiddleware({
      blockTracker: mockBlockTracker,
    });

    const engine = new JsonRpcEngine();
    engine.push(middleware);
    
    let capturedRequest: JsonRpcRequest | undefined;
    engine.push(async (req, _res, next) => {
      capturedRequest = { ...req };
      return next();
    });
    
    const originalRequest: JsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: ['0x1234567890abcdef'], // No block reference provided (should default to "latest")
    };

    await engine.handle(originalRequest);

    expect(mockBlockTracker.getLatestBlock).toHaveBeenCalled();
    expect(capturedRequest?.params).toEqual(['0x1234567890abcdef', '0x111222']);
  });

  it('handles non-array params gracefully', async () => {
    const mockBlockTracker = buildMockBlockTracker();
    const getLatestBlockSpy = jest.spyOn(mockBlockTracker, 'getLatestBlock');
    const middleware = createBlockRefRewriteMiddleware({
      blockTracker: mockBlockTracker,
    });

    const engine = new JsonRpcEngine();
    engine.push(middleware);
    
    const originalRequest: JsonRpcRequest = {
      id: 1,
      jsonrpc: '2.0',
      method: 'eth_getBalance',
      params: null, // Non-array params
    };

    await engine.handle(originalRequest);

    // Should treat non-array params as "latest" and try to process
    expect(getLatestBlockSpy).toHaveBeenCalled();
  });

  it('preserves original request properties except for the modified param', async () => {
    const mockBlockTracker = buildMockBlockTracker();
    jest.spyOn(mockBlockTracker, 'getLatestBlock').mockResolvedValue('0xffffff');
    const middleware = createBlockRefRewriteMiddleware({
      blockTracker: mockBlockTracker,
    });

    const engine = new JsonRpcEngine();
    engine.push(middleware);
    
    let capturedRequest: JsonRpcRequest | undefined;
    engine.push(async (req, _res, next) => {
      capturedRequest = { ...req };
      return next();
    });
    
    const originalRequest: JsonRpcRequest = {
      id: 42,
      jsonrpc: '2.0',
      method: 'eth_call',
      params: [{ to: '0x123', data: '0x456' }, 'latest'],
    };

    await engine.handle(originalRequest);

    expect(capturedRequest?.id).toBe(42);
    expect(capturedRequest?.jsonrpc).toBe('2.0');
    expect(capturedRequest?.method).toBe('eth_call');
    expect(capturedRequest?.params).toEqual([{ to: '0x123', data: '0x456' }, '0xffffff']);
  });
});

/**
 * Constructs a mock PollingBlockTracker for use in tests.
 *
 * @returns The mock block tracker.
 */
function buildMockBlockTracker(): PollingBlockTracker {
  return {
    getLatestBlock: jest.fn().mockResolvedValue('0x123'),
  } as unknown as PollingBlockTracker;
}