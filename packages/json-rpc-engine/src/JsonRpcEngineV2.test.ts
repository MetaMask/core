import { Json } from '@metamask/utils';

import type { JsonRpcMiddleware } from './JsonRpcEngineV2';
import { JsonRpcEngineV2, EndNotification } from './JsonRpcEngineV2';
import type { JsonRpcCall, JsonRpcNotification, JsonRpcRequest } from './utils';

describe('JsonRpcEngineV2', () => {
  it('should handle a request', async () => {
    const engine = new JsonRpcEngineV2({
      middleware: [
        (req: JsonRpcNotification, context): void => {},
        (req: JsonRpcNotification, context): typeof EndNotification => {
          return EndNotification;
        },
        (req: JsonRpcCall, context): void | typeof EndNotification => {
          return EndNotification;
        },
        // (req: JsonRpcRequest, context): void | typeof EndNotification => {
        //   return EndNotification;
        // },
      ],
    });

    const middleware: JsonRpcMiddleware<JsonRpcRequest, void> = (
      req,
      context,
    ) => {};
    const middleware2: JsonRpcMiddleware<
      JsonRpcRequest,
      // @ts-expect-error Should be illegal.
      typeof EndNotification
    > = (req, context) => {
      return EndNotification;
    };
    type foo = ReturnType<typeof middleware2>;

    const engine2 = new JsonRpcEngineV2({
      middleware: [
        // @ts-expect-error Should be illegal.
        (req: JsonRpcRequest, context): void | typeof EndNotification => {
          return EndNotification;
        },
      ],
    });

    const engine3 = new JsonRpcEngineV2({
      middleware: [
        ((req: JsonRpcRequest, context) => {
          return null;
        }) as JsonRpcMiddleware<JsonRpcRequest, null>,
      ],
    });

    const engine4 = new JsonRpcEngineV2({
      middleware: [
        ((req: JsonRpcCall, context): null => {
          return null;
        }) as JsonRpcMiddleware<JsonRpcCall, null>,
      ],
    });

    const reqRes = await engine4.handle({
      id: '1',
      method: 'foo',
      jsonrpc: '2.0',
      params: [],
    });

    const notifRes = await engine4.handle({
      method: 'foo',
      jsonrpc: '2.0',
      params: [],
    });

    const callRes = await engine4.handleAny({
      id: '1',
      method: 'foo',
      jsonrpc: '2.0',
      params: [],
    });

    const a: JsonRpcRequest = {
      id: '1',
      method: 'foo',
      jsonrpc: '2.0',
      params: [],
    };

    const foo: JsonRpcCall = {
      id: '1',
      method: 'foo',
      jsonrpc: '2.0',
      params: [],
    };

    const bar: JsonRpcNotification = {
      method: 'foo',
      jsonrpc: '2.0',
      params: [],
    };

    const fizz: JsonRpcNotification = foo;

    const b: JsonRpcRequest = foo;
  });
});
