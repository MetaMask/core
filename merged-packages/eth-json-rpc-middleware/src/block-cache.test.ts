import { PollingBlockTracker, Provider } from 'eth-block-tracker';
import { JsonRpcEngine } from 'json-rpc-engine';
import pify from 'pify';
import createHitTrackerMiddleware from '../test/util/createHitTrackerMiddleware';
import { providerFromEngine, createBlockCacheMiddleware } from '.';

function createTestSetup() {
  // raw data source
  // create block tracker
  // create higher level
  const engine = new JsonRpcEngine();
  const provider = providerFromEngine(engine);

  const blockTracker = new PollingBlockTracker({
    provider: provider as Provider,
  });

  return { engine, provider, blockTracker };
}

describe('block cache', () => {
  it('should cache a request and only hit the provider once', async () => {
    const { engine, provider, blockTracker } = createTestSetup();
    const spy = jest
      .spyOn(provider, 'sendAsync')
      .mockImplementation((req, cb) => {
        cb(undefined, { id: req.id, result: '0x0', jsonrpc: '2.0' });
      });
    let hitCount = 0;

    const hitCountMiddleware = createHitTrackerMiddleware();
    engine.push(hitCountMiddleware);

    engine.push(createBlockCacheMiddleware({ blockTracker }));

    engine.push((_req, res, _next, end) => {
      hitCount += 1;
      res.result = '0x0';
      end();
    });

    const response = await pify(engine.handle).call(engine, {
      id: 1,
      method: 'eth_getBalance',
      params: ['0x1234'],
    });

    const response2 = await pify(engine.handle).call(engine, {
      id: 2,
      method: 'eth_getBalance',
      params: ['0x1234'],
    });
    expect(hitCountMiddleware.getHits('eth_getBalance')).toHaveLength(2);
    expect(hitCount).toBe(1);
    expect(response.result).toStrictEqual('0x0');
    expect(response2.result).toStrictEqual('0x0');
    expect(spy).toHaveBeenCalled();
  });
});
