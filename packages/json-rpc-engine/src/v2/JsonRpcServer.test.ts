import { rpcErrors } from '@metamask/rpc-errors';
import { Json } from '@metamask/utils';

import type { JsonRpcMiddleware } from './JsonRpcEngineV2';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import { JsonRpcServer } from './JsonRpcServer';
import type { MiddlewareContext } from './MiddlewareContext';
import type { JsonRpcNotification, JsonRpcRequest } from './utils';
import { isRequest, JsonRpcEngineError, stringify } from './utils';

const jsonrpc = '2.0' as const;

const makeEngine = (): JsonRpcEngineV2 => {
  return JsonRpcEngineV2.create<JsonRpcMiddleware>({
    middleware: [
      ({ request }): Json | undefined => {
        if (request.method !== 'hello') {
          throw new Error('Unknown method');
        }
        return isRequest(request) ? (request.params ?? null) : undefined;
      },
    ],
  });
};

describe('JsonRpcServer', () => {
  it('can be constructed with an engine', () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: (): undefined => undefined,
    });

    expect(server).toBeDefined();
  });

  it('can be constructed with middleware', () => {
    const server = new JsonRpcServer({
      middleware: [(): null => null],
      onError: (): undefined => undefined,
    });

    expect(server).toBeDefined();
  });

  it('handles a request', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: (): undefined => undefined,
    });

    const response = await server.handle({
      jsonrpc,
      id: 1,
      method: 'hello',
    });

    expect(response).toStrictEqual({
      jsonrpc,
      id: 1,
      result: null,
    });
  });

  it('handles a request with params', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: (): undefined => undefined,
    });

    const response = await server.handle({
      jsonrpc,
      id: 1,
      method: 'hello',
      params: ['world'],
    });

    expect(response).toStrictEqual({
      jsonrpc,
      id: 1,
      result: ['world'],
    });
  });

  it('handles a notification', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: (): undefined => undefined,
    });

    const response = await server.handle({
      jsonrpc,
      method: 'hello',
    });

    expect(response).toBeUndefined();
  });

  it('handles a notification with params', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: (): undefined => undefined,
    });

    const response = await server.handle({
      jsonrpc,
      method: 'hello',
      params: { hello: 'world' },
    });

    expect(response).toBeUndefined();
  });

  it('forwards the context to the engine', async () => {
    const middleware: JsonRpcMiddleware<
      JsonRpcRequest,
      string,
      MiddlewareContext<{ foo: string }>
    > = ({ context }) => {
      return context.assertGet('foo');
    };
    const server = new JsonRpcServer({
      middleware: [middleware],
      onError: (): undefined => undefined,
    });

    const response = await server.handle(
      {
        jsonrpc,
        id: 1,
        method: 'hello',
      },
      {
        context: {
          foo: 'bar',
        },
      },
    );

    expect(response).toStrictEqual({
      jsonrpc,
      id: 1,
      result: 'bar',
    });
  });

  it('returns an error response for a failed request', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: (): undefined => undefined,
    });

    const response = await server.handle({
      jsonrpc,
      id: 1,
      method: 'unknown',
    });

    expect(response).toStrictEqual({
      jsonrpc,
      id: 1,
      error: {
        code: -32603,
        message: 'Unknown method',
        data: { cause: expect.any(Object) },
      },
    });
  });

  it('returns undefined for a failed notification', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: (): undefined => undefined,
    });

    const response = await server.handle({
      jsonrpc,
      method: 'unknown',
    });

    expect(response).toBeUndefined();
  });

  it('calls onError for a failed request', async () => {
    const onError = jest.fn();
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError,
    });

    await server.handle({
      jsonrpc,
      id: 1,
      method: 'unknown',
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(new Error('Unknown method'));
  });

  it('returns a failed request when onError is not provided', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
    });

    const response = await server.handle({
      jsonrpc,
      id: 1,
      method: 'unknown',
    });

    expect(response).toStrictEqual({
      jsonrpc,
      id: 1,
      error: {
        code: -32603,
        message: 'Unknown method',
        data: { cause: expect.any(Object) },
      },
    });
  });

  it('calls onError for a failed notification', async () => {
    const onError = jest.fn();
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError,
    });

    await server.handle({
      jsonrpc,
      method: 'unknown',
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(new Error('Unknown method'));
  });

  it('accepts requests with malformed jsonrpc', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: (): undefined => undefined,
    });

    const response = await server.handle({
      jsonrpc: '1.0',
      id: 1,
      method: 'hello',
    });

    expect(response).toStrictEqual({
      jsonrpc,
      id: 1,
      result: null,
    });
  });

  it('errors if passed a notification when only requests are supported', async () => {
    const onError = jest.fn();
    const server = new JsonRpcServer<JsonRpcMiddleware<JsonRpcRequest>>({
      middleware: [(): null => null],
      onError,
    });

    const notification = { jsonrpc, method: 'hello' };
    const response = await server.handle(notification);

    expect(response).toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      new JsonRpcEngineError(
        `Result returned for notification: ${stringify(notification)}`,
      ),
    );
  });

  it('errors if passed a request when only notifications are supported', async () => {
    const onError = jest.fn();
    const server = new JsonRpcServer<JsonRpcMiddleware<JsonRpcNotification>>({
      middleware: [(): undefined => undefined],
      onError,
    });

    const request = { jsonrpc, id: 1, method: 'hello' };
    const response = await server.handle(request);

    expect(response).toStrictEqual({
      jsonrpc,
      id: 1,
      error: {
        code: -32603,
        message: expect.stringMatching(/^Nothing ended request: /u),
        data: { cause: expect.any(Object) },
      },
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        // Using a regex match because id in the error message is not predictable.
        message: expect.stringMatching(/^Nothing ended request: /u),
      }),
    );
  });

  it.each([undefined, Symbol('test'), null, true, false, {}, []])(
    'accepts requests with malformed ids',
    async (id) => {
      const server = new JsonRpcServer({
        engine: makeEngine(),
        onError: (): undefined => undefined,
      });

      const response = await server.handle({
        jsonrpc,
        id,
        method: 'hello',
      });

      expect(response).toStrictEqual({
        jsonrpc,
        id,
        result: null,
      });
    },
  );

  it('does not throw when onError throws synchronously for a request', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: () => {
        throw new Error('onError failure');
      },
    });

    const response = await server.handle({
      jsonrpc,
      id: 1,
      method: 'unknown',
    });

    expect(response).toStrictEqual({
      jsonrpc,
      id: 1,
      error: {
        code: -32603,
        message: 'Unknown method',
        data: { cause: expect.any(Object) },
      },
    });
  });

  it('does not throw when onError throws synchronously for a notification', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: () => {
        throw new Error('onError failure');
      },
    });

    const response = await server.handle({
      jsonrpc,
      method: 'unknown',
    });

    expect(response).toBeUndefined();
  });

  it('does not cause an unhandled rejection when onError rejects asynchronously for a request', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: async () => {
        throw new Error('async onError failure');
      },
    });

    const response = await server.handle({
      jsonrpc,
      id: 1,
      method: 'unknown',
    });

    expect(response).toStrictEqual({
      jsonrpc,
      id: 1,
      error: {
        code: -32603,
        message: 'Unknown method',
        data: { cause: expect.any(Object) },
      },
    });
  });

  it('does not cause an unhandled rejection when onError rejects asynchronously for a notification', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      onError: async () => {
        throw new Error('async onError failure');
      },
    });

    const response = await server.handle({
      jsonrpc,
      method: 'unknown',
    });

    expect(response).toBeUndefined();
  });

  it.each([
    null,
    {},
    [],
    false,
    true,
    { method: 'hello', params: 'world' },
    { method: 'hello', params: null },
    { method: 'hello', params: undefined },
    { params: ['world'] },
    { jsonrpc },
    { id: 1 },
  ])(
    'errors if the request is not minimally conformant',
    async (malformedRequest) => {
      const onError = jest.fn();
      const server = new JsonRpcServer({
        engine: makeEngine(),
        onError,
      });

      await server.handle(malformedRequest);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        rpcErrors.invalidRequest({
          data: {
            request: malformedRequest,
          },
        }),
      );
    },
  );
});
