import { Web3Provider } from '@ethersproject/providers';
import EthQuery from '@metamask/eth-query';
import EthJsQuery from '@metamask/ethjs-query';
import { asV2Middleware, JsonRpcEngine } from '@metamask/json-rpc-engine';
import type {
  JsonRpcMiddleware,
  MiddlewareContext,
} from '@metamask/json-rpc-engine/v2';
import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import { type JsonRpcRequest, type Json } from '@metamask/utils';
import { BrowserProvider } from 'ethers';
import { promisify } from 'util';

import {
  InternalProvider,
  convertEip1193RequestToJsonRpcRequest,
} from './internal-provider';

jest.mock('uuid');

type ResultParam =
  | Json
  | ((req?: JsonRpcRequest, context?: MiddlewareContext) => Json);

const createLegacyEngine = (method: string, result: ResultParam) => {
  const engine = new JsonRpcEngine();
  engine.push((req, res, next, end) => {
    if (req.method === method) {
      res.result = typeof result === 'function' ? result(req) : result;
      return end();
    }
    return next();
  });
  return engine;
};

const createV2Engine = (method: string, result: ResultParam) => {
  return JsonRpcEngineV2.create<JsonRpcMiddleware<JsonRpcRequest>>({
    middleware: [
      ({ request, next, context }) => {
        if (request.method === method) {
          return typeof result === 'function'
            ? result(request as JsonRpcRequest, context)
            : result;
        }
        return next();
      },
    ],
  });
};

describe('legacy constructor', () => {
  it('can be constructed with an engine', () => {
    const provider = new InternalProvider({
      engine: createLegacyEngine('eth_blockNumber', 42),
    });
    expect(provider).toBeDefined();
  });
});

describe.each([
  {
    createRpcHandler: createLegacyEngine,
    name: 'JsonRpcEngine',
  },
  {
    createRpcHandler: createV2Engine,
    name: 'JsonRpcServer',
  },
] as const)('InternalProvider with $name', ({ createRpcHandler }) => {
  it('returns the correct block number with @metamask/eth-query', async () => {
    const provider = new InternalProvider({
      engine: createRpcHandler('eth_blockNumber', 42),
    });
    const ethQuery = new EthQuery(provider);

    ethQuery.sendAsync({ method: 'eth_blockNumber' }, (_error, response) => {
      expect(response).toBe(42);
    });
  });

  it('returns the correct block number with @metamask/ethjs-query', async () => {
    const provider = new InternalProvider({
      engine: createRpcHandler('eth_blockNumber', 42),
    });
    const ethJsQuery = new EthJsQuery(provider);

    const response = await ethJsQuery.blockNumber();

    expect(response.toNumber()).toBe(42);
  });

  it('returns the correct block number with Web3Provider', async () => {
    const provider = new InternalProvider({
      engine: createRpcHandler('eth_blockNumber', 42),
    });
    const web3Provider = new Web3Provider(provider);

    const response = await web3Provider.send('eth_blockNumber', []);

    expect(response).toBe(42);
  });

  it('returns the correct block number with BrowserProvider', async () => {
    const provider = new InternalProvider({
      engine: createRpcHandler('eth_blockNumber', 42),
    });
    const browserProvider = new BrowserProvider(provider);

    const response = await browserProvider.send('eth_blockNumber', []);

    expect(response).toBe(42);

    browserProvider.destroy();
  });

  describe('request', () => {
    it('handles a successful JSON-RPC object request', async () => {
      let req: JsonRpcRequest | undefined;
      const rpcHandler = createRpcHandler('test', (request) => {
        req = request;
        return 42;
      });
      const provider = new InternalProvider({ engine: rpcHandler });
      const request = {
        id: '1',
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };

      const result = await provider.request(request);

      expect(req).toStrictEqual({
        id: expect.any(String),
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
      let req: JsonRpcRequest | undefined;
      const rpcHandler = createRpcHandler('test', (request) => {
        req = request;
        return 42;
      });
      const provider = new InternalProvider({ engine: rpcHandler });
      const request = {
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };

      const result = await provider.request(request);

      expect(req).toStrictEqual({
        id: expect.any(String),
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
      const rpcHandler = createRpcHandler('test', () => {
        throw providerErrors.custom({
          code: 1001,
          message: 'Test error',
          data: { cause: 'Test cause' },
        });
      });
      const provider = new InternalProvider({ engine: rpcHandler });
      const request = {
        id: '1',
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      await expect(async () => provider.request(request)).rejects.toThrow(
        'Test error',
      );
    });

    it('handles a failure with a JSON-RPC error', async () => {
      const rpcHandler = createRpcHandler('test', () => {
        throw new Error('Test error');
      });
      const provider = new InternalProvider({ engine: rpcHandler });
      const request = {
        id: '1',
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      await expect(async () => provider.request(request)).rejects.toThrow(
        'Test error',
      );
    });
  });

  describe('sendAsync', () => {
    it('handles a successful JSON-RPC object request', async () => {
      let req: JsonRpcRequest | undefined;
      const rpcHandler = createRpcHandler('test', (request) => {
        req = request;
        return 42;
      });
      const provider = new InternalProvider({ engine: rpcHandler });
      const promisifiedSendAsync = promisify(provider.sendAsync);
      const request = {
        id: '1',
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };

      const response = await promisifiedSendAsync(request);

      expect(req).toStrictEqual({
        id: expect.any(String),
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      });
      expect(response.result).toBe(42);
    });

    it('forwards the context to the JSON-RPC handler', async () => {
      const rpcHandler = createRpcHandler('test', (request, context) => {
        // @ts-expect-error - Intentional type abuse.
        return context?.assertGet('foo') ?? request.foo;
      });
      const provider = new InternalProvider({ engine: rpcHandler });

      const request = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      const result = await provider.request(request, {
        context: {
          foo: 'bar',
        },
      });

      expect(result).toBe('bar');
    });

    it('handles a successful EIP-1193 object request', async () => {
      let req: JsonRpcRequest | undefined;
      const rpcHandler = createRpcHandler('test', (request) => {
        req = request;
        return 42;
      });
      const provider = new InternalProvider({ engine: rpcHandler });
      const promisifiedSendAsync = promisify(provider.sendAsync);
      const request = {
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };

      const response = await promisifiedSendAsync(request);

      expect(req).toStrictEqual({
        id: expect.any(String),
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
      const rpcHandler = createRpcHandler('test', () => {
        throw new Error('Test error');
      });
      const provider = new InternalProvider({ engine: rpcHandler });
      const promisifiedSendAsync = promisify(provider.sendAsync);
      const request = {
        id: '1',
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      await expect(async () => promisifiedSendAsync(request)).rejects.toThrow(
        'Test error',
      );
    });

    it('handles an error thrown by the JSON-RPC handler', async () => {
      let rpcHandler = createRpcHandler('test', () => null);
      // Transform the engine into a server so we can mock the "handle" method.
      // The "handle" method should never throw, but we should be resilient to it anyway.
      rpcHandler =
        'push' in rpcHandler
          ? JsonRpcEngineV2.create({ middleware: [asV2Middleware(rpcHandler)] })
          : rpcHandler;
      jest
        .spyOn(rpcHandler, 'handle')
        .mockRejectedValue(new Error('Test error'));
      const provider = new InternalProvider({ engine: rpcHandler });
      const promisifiedSendAsync = promisify(provider.sendAsync);
      const request = {
        id: '1',
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      await expect(async () => promisifiedSendAsync(request)).rejects.toThrow(
        'Test error',
      );
    });
  });

  describe('send', () => {
    it('throws if a callback is not provided', () => {
      const rpcHandler = createRpcHandler('test', 42);
      const provider = new InternalProvider({ engine: rpcHandler });
      const request = {
        id: '1',
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      // @ts-expect-error - Destructive testing.
      expect(() => provider.send(request)).toThrow(
        'Must provide callback to "send" method.',
      );
    });

    it('handles a successful JSON-RPC object request', async () => {
      let req: JsonRpcRequest | undefined;
      const rpcHandler = createRpcHandler('test', (request) => {
        req = request;
        return 42;
      });
      const provider = new InternalProvider({ engine: rpcHandler });
      const promisifiedSend = promisify(provider.send);
      const request = {
        id: '1',
        jsonrpc: '2.0' as const,
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };

      const response = await promisifiedSend(request);

      expect(req).toStrictEqual({
        id: expect.any(String),
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
      let req: JsonRpcRequest | undefined;
      const rpcHandler = createRpcHandler('test', (request) => {
        req = request;
        return 42;
      });
      const provider = new InternalProvider({ engine: rpcHandler });
      const promisifiedSend = promisify(provider.send);
      const request = {
        method: 'test',
        params: {
          param1: 'value1',
          param2: 'value2',
        },
      };

      const response = await promisifiedSend(request);

      expect(req).toStrictEqual({
        id: expect.any(String),
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
      const rpcHandler = createRpcHandler('test', () => {
        throw new Error('Test error');
      });
      const provider = new InternalProvider({ engine: rpcHandler });
      const promisifiedSend = promisify(provider.send);
      const request = {
        id: '1',
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      await expect(async () => promisifiedSend(request)).rejects.toThrow(
        'Test error',
      );
    });
  });
});

describe('convertEip1193RequestToJsonRpcRequest', () => {
  it('generates a unique id if id is not provided', () => {
    const eip1193Request = {
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest).toStrictEqual({
      id: expect.any(String),
      jsonrpc: '2.0',
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    });
  });

  it('uses the default jsonrpc version if not provided', () => {
    const eip1193Request = {
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest).toStrictEqual({
      id: expect.any(String),
      jsonrpc: '2.0',
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    });
  });

  it('uses the provided jsonrpc version if provided', () => {
    const eip1193Request = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest).toStrictEqual({
      id: expect.any(String),
      jsonrpc: '2.0',
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    });
  });

  it('uses an empty object as params if not provided', () => {
    const eip1193Request = {
      method: 'test',
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest).toStrictEqual({
      id: expect.any(String),
      jsonrpc: '2.0',
      method: 'test',
    });
  });
});
