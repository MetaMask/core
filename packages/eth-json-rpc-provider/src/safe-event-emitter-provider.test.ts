import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import {
  type JsonRpcSuccess,
  type Json,
  assertIsJsonRpcFailure,
} from '@metamask/utils';
import { promisify } from 'util';

import {
  SafeEventEmitterProvider,
  convertEip1193RequestToJsonRpcRequest,
} from './safe-event-emitter-provider';

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

  describe('request', () => {
    it('handles a successful request', async () => {
      const engine = new JsonRpcEngine();
      engine.push((_req, res, _next, end) => {
        res.result = 42;
        end();
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      const response = await provider.request(exampleRequest);

      expect((response as JsonRpcSuccess<Json>).result).toBe(42);
    });

    it('handles a failed request', async () => {
      const engine = new JsonRpcEngine();
      engine.push((_req, _res, _next, _end) => {
        throw new Error('Test error');
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      const response = await provider.request(exampleRequest);

      expect(response).toBeDefined();
      assertIsJsonRpcFailure(response);
    });
  });

  describe('sendAsync', () => {
    it('handles a successful request', async () => {
      const engine = new JsonRpcEngine();
      engine.push((_req, res, _next, end) => {
        res.result = 42;
        end();
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const promisifiedSendAsync = promisify(provider.sendAsync);
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      const response = await promisifiedSendAsync(exampleRequest);

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

    it('handles a successful request', async () => {
      const engine = new JsonRpcEngine();
      engine.push((_req, res, _next, end) => {
        res.result = 42;
        end();
      });
      const provider = new SafeEventEmitterProvider({ engine });
      const promisifiedSend = promisify(provider.send);
      const exampleRequest = {
        id: 1,
        jsonrpc: '2.0' as const,
        method: 'test',
      };

      const response = await promisifiedSend(exampleRequest);

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
  it('converts an EIP-1193 request to a JSON-RPC request', () => {
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

  it('generates a unique id if id is not provided', () => {
    const eip1193Request = {
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest.id).toBeDefined();
    expect(typeof jsonRpcRequest.id).toBe('string');
  });

  it('uses the provided id if id is provided', () => {
    const eip1193Request = {
      id: '123',
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    };
    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest.id).toBe('123');
  });

  it('uses the default jsonrpc version if not provided', () => {
    const eip1193Request = {
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest.jsonrpc).toBe('2.0');
  });

  it('uses the provided jsonrpc version if provided', () => {
    const eip1193Request = {
      jsonrpc: '2.0' as const,
      method: 'test',
      params: { param1: 'value1', param2: 'value2' },
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest.jsonrpc).toBe('2.0');
  });

  it('uses an empty object as params if not provided', () => {
    const eip1193Request = {
      method: 'test',
    };

    const jsonRpcRequest =
      convertEip1193RequestToJsonRpcRequest(eip1193Request);

    expect(jsonRpcRequest.params).toStrictEqual({});
  });
});
