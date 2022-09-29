import { JsonRpcEngine } from 'json-rpc-engine';
import pify from 'pify';
import { createInflightCacheMiddleware } from '.';

function createTestSetup() {
  // raw data source
  // create block tracker
  // create higher level
  const engine = new JsonRpcEngine();
  return { engine };
}

describe('inflight cache', () => {
  it('should cache an inflight request and only hit provider once', async () => {
    const { engine } = createTestSetup();
    let hitCount = 0;

    // add inflight cache
    engine.push(createInflightCacheMiddleware());

    // add stalling result handler for `test_blockCache`
    engine.push((_req, res, _next, end) => {
      hitCount += 1;
      res.result = true;
      if (hitCount === 1) {
        setTimeout(end, 100);
      }
    });

    const results = await Promise.all([
      pify(engine.handle).call(engine, {
        id: 1,
        jsonrpc: '2.0',
        method: 'test_blockCache',
        params: [],
      }),
      pify(engine.handle).call(engine, {
        id: 2,
        jsonrpc: '2.0',
        method: 'test_blockCache',
        params: [],
      }),
    ]);

    expect(results[0].result).toBe(true);
    expect(results[1].result).toBe(true);
    expect(results[0]).not.toStrictEqual(results[1]); // make sure they are unique responses
    expect(hitCount).toBe(1); // check result handler was only hit once
  });
});
