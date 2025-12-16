import { rpcErrors } from '@metamask/rpc-errors';

import type { MiddlewareScaffold } from './createScaffoldMiddleware';
import { createScaffoldMiddleware } from './createScaffoldMiddleware';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2';
import { makeRequest } from '../../tests/utils';

describe('createScaffoldMiddleware', () => {
  it('basic middleware test', async () => {
    const scaffold: MiddlewareScaffold = {
      method1: 'foo',
      method2: () => 42,
      method3: () => {
        throw rpcErrors.internal({ message: 'method3' });
      },
    };

    const engine = JsonRpcEngineV2.create({
      middleware: [
        createScaffoldMiddleware(scaffold),
        (): string => 'passthrough',
      ],
    });

    const result1 = await engine.handle(makeRequest({ method: 'method1' }));
    const result2 = await engine.handle(makeRequest({ method: 'method2' }));
    const promise3 = engine.handle(makeRequest({ method: 'method3' }));
    const result4 = await engine.handle(makeRequest({ method: 'unknown' }));

    expect(result1).toBe('foo');

    expect(result2).toBe(42);

    await expect(promise3).rejects.toThrow(
      rpcErrors.internal({ message: 'method3' }),
    );

    expect(result4).toBe('passthrough');
  });
});
