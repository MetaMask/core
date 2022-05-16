import {
  assertIsJsonRpcSuccess,
  assertIsJsonRpcFailure,
} from '@metamask/utils';
import { ethErrors } from 'eth-rpc-errors';
import { JsonRpcEngine, createScaffoldMiddleware, JsonRpcMiddleware } from '.';

describe('createScaffoldMiddleware', () => {
  it('basic middleware test', async () => {
    const engine = new JsonRpcEngine();

    const scaffold: Record<
      string,
      string | JsonRpcMiddleware<unknown, unknown>
    > = {
      method1: 'foo',
      method2: (_req, res, _next, end) => {
        res.result = 42;
        end();
      },
      method3: (_req, res, _next, end) => {
        res.error = ethErrors.rpc.internal({ message: 'method3' });
        end();
      },
    };

    engine.push(createScaffoldMiddleware(scaffold));
    engine.push((_req, res, _next, end) => {
      res.result = 'passthrough';
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0' as const };

    const response1 = await engine.handle({ ...payload, method: 'method1' });
    const response2 = await engine.handle({ ...payload, method: 'method2' });
    const response3 = await engine.handle({ ...payload, method: 'method3' });
    const response4 = await engine.handle({ ...payload, method: 'unknown' });

    assertIsJsonRpcSuccess(response1);
    expect(response1.result).toStrictEqual('foo');

    assertIsJsonRpcSuccess(response2);
    expect(response2.result).toStrictEqual(42);

    assertIsJsonRpcFailure(response3);
    expect(response3.error.message).toStrictEqual('method3');

    assertIsJsonRpcSuccess(response4);
    expect(response4.result).toStrictEqual('passthrough');
  });
});
