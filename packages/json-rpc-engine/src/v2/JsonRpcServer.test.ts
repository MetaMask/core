import { rpcErrors } from '@metamask/rpc-errors';

import { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import { JsonRpcServer } from './JsonRpcServer';
import { isRequest } from './utils';

const jsonrpc = '2.0' as const;

const makeEngine = () => {
  return new JsonRpcEngineV2({
    middleware: [
      ({ request }) => {
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
      handleError: () => undefined,
    });

    expect(server).toBeDefined();
  });

  it('can be constructed with middleware', () => {
    const server = new JsonRpcServer({
      middleware: [() => null],
      handleError: () => undefined,
    });

    expect(server).toBeDefined();
  });

  it('handles a request', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      handleError: () => undefined,
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
      handleError: () => undefined,
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
      handleError: () => undefined,
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
      handleError: () => undefined,
    });

    const response = await server.handle({
      jsonrpc,
      method: 'hello',
      params: { hello: 'world' },
    });

    expect(response).toBeUndefined();
  });

  it('returns an error response for a failed request', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      handleError: () => undefined,
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
      handleError: () => undefined,
    });

    const response = await server.handle({
      jsonrpc,
      method: 'unknown',
    });

    expect(response).toBeUndefined();
  });

  it('calls handleError for a failed request', async () => {
    const handleError = jest.fn();
    const server = new JsonRpcServer({
      engine: makeEngine(),
      handleError,
    });

    await server.handle({
      jsonrpc,
      id: 1,
      method: 'unknown',
    });

    expect(handleError).toHaveBeenCalledTimes(1);
    expect(handleError).toHaveBeenCalledWith(new Error('Unknown method'));
  });

  it('calls handleError for a failed notification', async () => {
    const handleError = jest.fn();
    const server = new JsonRpcServer({
      engine: makeEngine(),
      handleError,
    });

    await server.handle({
      jsonrpc,
      method: 'unknown',
    });

    expect(handleError).toHaveBeenCalledTimes(1);
    expect(handleError).toHaveBeenCalledWith(new Error('Unknown method'));
  });

  it('accepts requests with malformed jsonrpc', async () => {
    const server = new JsonRpcServer({
      engine: makeEngine(),
      handleError: () => undefined,
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

  it.each([undefined, Symbol('test'), null, true, false, {}, []])(
    'accepts requests with malformed ids',
    async (id) => {
      const server = new JsonRpcServer({
        engine: makeEngine(),
        handleError: () => undefined,
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
    'throws if the request is not minimally conformant',
    async (malformedRequest) => {
      const handleError = jest.fn();
      const server = new JsonRpcServer({
        engine: makeEngine(),
        handleError,
      });

      await server.handle(malformedRequest);

      expect(handleError).toHaveBeenCalledTimes(1);
      expect(handleError).toHaveBeenCalledWith(
        rpcErrors.invalidRequest({
          data: {
            request: malformedRequest,
          },
        }),
      );
    },
  );
});
