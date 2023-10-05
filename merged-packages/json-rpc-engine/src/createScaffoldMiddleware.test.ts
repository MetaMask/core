import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcParams, Json } from '@metamask/utils';
import {
  assertIsJsonRpcSuccess,
  assertIsJsonRpcFailure,
} from '@metamask/utils';

import type { JsonRpcMiddleware } from '.';
import { JsonRpcEngine, createScaffoldMiddleware } from '.';

describe('createScaffoldMiddleware', () => {
  it('basic middleware test', async () => {
    const engine = new JsonRpcEngine();

    const scaffold: Record<
      string,
      string | JsonRpcMiddleware<JsonRpcParams, Json>
    > = {
      method1: 'foo',
      method2: (_request, response, _next, end) => {
        response.result = 42;
        end();
      },
      method3: (_request, response, _next, end) => {
        response.error = rpcErrors.internal({ message: 'method3' });
        end();
      },
    };

    engine.push(createScaffoldMiddleware(scaffold));
    engine.push((_request, response, _next, end) => {
      response.result = 'passthrough';
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0' as const };

    const response1 = await engine.handle({ ...payload, method: 'method1' });
    const response2 = await engine.handle({ ...payload, method: 'method2' });
    const response3 = await engine.handle({ ...payload, method: 'method3' });
    const response4 = await engine.handle({ ...payload, method: 'unknown' });

    assertIsJsonRpcSuccess(response1);
    expect(response1.result).toBe('foo');

    assertIsJsonRpcSuccess(response2);
    expect(response2.result).toBe(42);

    assertIsJsonRpcFailure(response3);
    expect(response3.error.message).toBe('method3');

    assertIsJsonRpcSuccess(response4);
    expect(response4.result).toBe('passthrough');
  });
});
