import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';

import { createInflightCacheMiddleware } from '.';
import { createRequest } from '../test/util/helpers';

describe('inflight cache', () => {
  it('should cache an inflight request and only hit provider once', async () => {
    let hitCount = 0;
    const engine = JsonRpcEngineV2.create({
      middleware: [
        createInflightCacheMiddleware(),
        async () => {
          hitCount += 1;
          if (hitCount === 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return true;
        },
      ],
    });

    const results = await Promise.all([
      engine.handle(
        createRequest({
          id: 1,
          method: 'test_blockCache',
          params: [],
        }),
      ),
      engine.handle(
        createRequest({
          id: 2,
          method: 'test_blockCache',
          params: [],
        }),
      ),
    ]);

    expect(results[0]).toBe(true);
    expect(results[1]).toBe(true);
    expect(hitCount).toBe(1); // check result handler was only hit once
  });
});
