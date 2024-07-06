import { Web3Provider } from '@ethersproject/providers';
import EthQuery from '@metamask/eth-query';
import EthJsQuery from '@metamask/ethjs-query';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { providerErrors } from '@metamask/rpc-errors';
import { type JsonRpcRequest, type Json } from '@metamask/utils';
import { BrowserProvider } from 'ethers';
import { promisify } from 'util';
import * as uuid from 'uuid';

import {
  SafeEventEmitterProvider,
  convertEip1193RequestToJsonRpcRequest,
} from './safe-event-emitter-provider';

jest.mock('uuid');

/**
 * Creates a mock JSON-RPC engine that returns a predefined response for a specific method.
 *
 * @param method - The RPC method to mock.
 * @param response - The response to return for the mocked method.
 * @returns A JSON-RPC engine instance with the mocked method.
 */
function createMockEngine(method: string, response: Json) {
  const engine = new JsonRpcEngine();
  engine.push((req, res, next, end) => {
    if (req.method === method) {
      res.result = response;
      return end();
    }
    return next();
  });
  return engine;
}

describe('SafeEventEmitterProvider', () => {
  describe('constructor', () => {
    it('listens for notifications from provider, emitting them as "data"', async () => {
      const engine = new JsonRpcEngine();
      const provider = new SafeEventEmitterProvider({ engine });
      const notificationListener = jest.fn();
      provider.on('data', notificationListener);

      // `json-rpc-engine` v6 does not support JSON-RPC notifications directly,
      // so this is the best way to emulate this behavior.
      // We should replace this with `await engine.handle(notification)` when we update to v7
      // TODO: v7 is now integrated; fix this
      engine.emit('notification', 'test');

      expect(notificationListener).toHaveBeenCalledWith(null, 'test');
    });

    it('does not throw if engine does not support events', () => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const engine = new JsonRpcEngine() as any;
      delete engine.on;

      expect(() => new SafeEventEmitterProvider({ engine })).not.toThrow();
    });
  });

  it('returns the correct block number with @metamask/eth-query', async () => {
    const provider = new SafeEventEmitterProvider({
      engine: createMockEngine('eth_blockNumber', 42),
    });
    const ethQuery = new EthQuery(provider);

    ethQuery.sendAsync({ method: 'eth_blockNumber' }, (_error, response) => {
      expect(response).toBe(42);
    });
  });

  it('returns the correct block number with @metamask/ethjs-query', async () => {
    const provider = new SafeEventEmitterProvider({
      engine: createMockEngine('eth_blockNumber', 42),
    });
    const ethJsQuery = new EthJsQuery(provider);

    const response = await ethJsQuery.blockNumber();

    expect(response.toNumber()).toBe(42);
  });

  it('returns the correct block number with Web3Provider', async () => {
    const provider = new SafeEventEmitterProvider({
      engine: createMockEngine('eth_blockNumber', 42),
    });
    const web3Provider = new Web3Provider(provider);

    const response = await web3Provider.send('eth_blockNumber', []);

    expect(response).toBe(42);
  });

  it('returns the correct block number with BrowserProvider', async () => {
    const provider = new SafeEventEmitterProvider({
      engine: createMockEngine('eth_blockNumber', 42),
    });
    const browserProvider = new BrowserProvider(provider);

    const response = await browserProvider.send('eth_blockNumber', []);

    expect(response).toBe(42);
  });

  describe('request', () => {
    it('handles a successful JSON-RPC object request', async () => {
      const engine = new JsonRpcEngine();
      let req: JsonRpcRequest | undefined;
      engine.push((_req, res, _next, end) => {
        req = _req;
        res.result = 42;
        end();
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };

      const result = await provider.request(exampleRequest);

      expect(req).toStrictEqual({
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      });
      expect(result).toBe(42);
    });

    it('handles a successful EIP-1193 object request', async () => {
      const engine = new JsonRpcEngine();
      let req: JsonRpcRequest | undefined;
      engine.push((_req, res, _next, end) => {
        req = _req;
        res.result = 42;
        end();
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const exampleRequest = {
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };
      jest.spyOn(uuid, 'v4').mockReturnValueOnce('mock-id');

      const result = await provider.request(exampleRequest);

      expect(req).toStrictEqual({
        id: 'mock-id',
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      });
      expect(result).toBe(42);
    });

    it('handles a failure with a non-JSON-RPC error', async () => {
      const engine = new JsonRpcEngine();
      engine.push((_req, _res, _next, end) => {
        end(
          providerErrors.custom({
            code: 1001,
            message: 'Test error',
            data: {
              cause: 'Test cause',
            },
          }),
        );
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      await expect(async () =>
        provider.request(exampleRequest),
      ).rejects.toThrow(
        expect.objectContaining({
          code: 1001,
          message: 'Test error',
          data: { cause: 'Test cause' },
          stack: expect.stringContaining('safe-event-emitter-provider.test.ts'),
        }),
      );
    });

    it('handles a failure with a JSON-RPC error', async () => {
      const engine = new JsonRpcEngine();
      engine.push(() => {
        throw new Error('Test error');
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      await expect(async () =>
        provider.request(exampleRequest),
      ).rejects.toThrow(
        expect.objectContaining({
          code: -32603,
          message: 'Internal JSON-RPC error.',
          data: {
            cause: expect.objectContaining({
              stack: expect.stringContaining(
                'safe-event-emitter-provider.test.ts',
              ),
              message: 'Test error',
            }),
          },
        }),
      );
    });
  });

  describe('sendAsync', () => {
    it('handles a successful JSON-RPC object request', async () => {
      const engine = new JsonRpcEngine();
      let req: JsonRpcRequest | undefined;
      engine.push((_req, res, _next, end) => {
        req = _req;
        res.result = 42;
        end();
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const promisifiedSendAsync = promisify(provider.sendAsync);
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };

      const response = await promisifiedSendAsync(exampleRequest);

      expect(req).toStrictEqual({
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      });
      expect(response.result).toBe(42);
    });

    it('handles a successful EIP-1193 object request', async () => {
      const engine = new JsonRpcEngine();
      let req: JsonRpcRequest | undefined;
      engine.push((_req, res, _next, end) => {
        req = _req;
        res.result = 42;
        end();
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const promisifiedSendAsync = promisify(provider.sendAsync);
      const exampleRequest = {
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };
      jest.spyOn(uuid, 'v4').mockReturnValueOnce('mock-id');

      const response = await promisifiedSendAsync(exampleRequest);

      expect(req).toStrictEqual({
        id: 'mock-id',
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      });
      expect(response.result).toBe(42);
    });

    it('handles a failed request', async () => {
      const engine = new JsonRpcEngine();
      engine.push((_req, _res, _next, _end) => {
        throw new Error('Test error');
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const promisifiedSendAsync = promisify(provider.sendAsync);
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      await expect(async () =>
        promisifiedSendAsync(exampleRequest),
      ).rejects.toThrow('Test error');
    });
  });

  describe('send', () => {
    it('throws if a callback is not provided', () => {
      const engine = new JsonRpcEngine();
      const provider = new SafeEventEmitterProvider({ engine });
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => (provider.send as any)(exampleRequest)).toThrow('');
    });

    it('handles a successful JSON-RPC object request', async () => {
      const engine = new JsonRpcEngine();
      let req: JsonRpcRequest | undefined;
      engine.push((_req, res, _next, end) => {
        req = _req;
        res.result = 42;
        end();
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const promisifiedSend = promisify(provider.send);
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };

      const response = await promisifiedSend(exampleRequest);

      expect(req).toStrictEqual({
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      });
      expect(response.result).toBe(42);
    });

    it('handles a successful EIP-1193 object request', async () => {
      const engine = new JsonRpcEngine();
      let req: JsonRpcRequest | undefined;
      engine.push((_req, res, _next, end) => {
        req = _req;
        res.result = 42;
        end();
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const promisifiedSend = promisify(provider.send);
      const exampleRequest = {
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };
      jest.spyOn(uuid, 'v4').mockReturnValueOnce('mock-id');

      const response = await promisifiedSend(exampleRequest);

      expect(req).toStrictEqual({
        id: 'mock-id',
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      });
      expect(response.result).toBe(42);
    });

    it('handles a failed request', async () => {
      const engine = new JsonRpcEngine();
      engine.push((_req, _res, _next, _end) => {
        throw new Error('Test error');
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const promisifiedSend = promisify(provider.send);
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      await expect(async () => promisifiedSend(exampleRequest)).rejects.toThrow(
        'Test error',
      );
    });
  });
});

describe('convertEip1193RequestToJsonRpcRequest', () => {
  it('generates a unique id if id is not provided', () => {
    jest.spyOn(uuid, 'v4').mockReturnValueOnce('mock-id');
    const eip1193Request = {
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest).toStrictEqual({
      id: 'mock-id',
      jsonrpc: '2.0',
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    });
  });

  it('uses the provided id if id is provided', () => {
    const eip1193Request = {
      id: '123',
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    };
    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest).toStrictEqual({
      id: '123',
      jsonrpc: '2.0',
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    });
  });

  it('uses the default jsonrpc version if not provided', () => {
    jest.spyOn(uuid, 'v4').mockReturnValueOnce('mock-id');
    const eip1193Request = {
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest).toStrictEqual({
      id: 'mock-id',
      jsonrpc: '2.0',
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    });
  });

  it('uses the provided jsonrpc version if provided', () => {
    jest.spyOn(uuid, 'v4').mockReturnValueOnce('mock-id');
    const eip1193Request = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest).toStrictEqual({
      id: 'mock-id',
      jsonrpc: '2.0',
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    });
  });

  it('uses an empty object as params if not provided', () => {
    jest.spyOn(uuid, 'v4').mockReturnValueOnce('mock-id');
    const eip1193Request = {
      method: 'test',
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest).toStrictEqual({
      id: 'mock-id',
      jsonrpc: '2.0',
      method: 'test',
      params: {},
    });
  });
});
