import { makeRequest } from '../../tests/utils.js';
import { createOriginMiddleware } from './createOriginMiddleware.js';
import { JsonRpcEngineV2 } from './JsonRpcEngineV2.js';

describe('createOriginMiddleware', () => {
  it('sets the origin on the context object', async () => {
    const origin = 'https://metamask.io';
    const middleware = createOriginMiddleware(origin);

    const engine = JsonRpcEngineV2.create({
      middleware: [
        middleware,
        ({ context }): string => context.assertGet('origin'),
      ],
    });

    expect(await engine.handle(makeRequest())).toBe(origin);
  });
});
