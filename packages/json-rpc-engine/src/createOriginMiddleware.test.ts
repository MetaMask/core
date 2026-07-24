import { JsonRpcRequest } from '@metamask/utils';

import { makeRequest } from '../tests/utils.js';
import { createOriginMiddleware } from './createOriginMiddleware.js';
import { JsonRpcEngine } from './JsonRpcEngine.js';

describe('createOriginMiddleware', () => {
  it('adds the origin property to the request', async () => {
    const origin = 'https://metamask.io';
    const engine = new JsonRpcEngine();

    engine.push(createOriginMiddleware(origin));

    engine.push((request, response, _next, end) => {
      response.result = (
        request as unknown as JsonRpcRequest & { origin: string }
      ).origin;
      end();
    });

    expect(await engine.handle(makeRequest())).toStrictEqual({
      id: '1',
      jsonrpc: '2.0',
      result: origin,
    });
  });
});
