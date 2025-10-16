import { PollingBlockTracker } from '@metamask/eth-block-tracker';
import { providerFromEngine } from '@metamask/eth-json-rpc-provider';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import pify from 'pify';

import { createBlockCacheMiddleware } from '.';
import createHitTrackerMiddleware from '../test/util/createHitTrackerMiddleware';

function createTestSetup() {
  // raw data source
  // create block tracker
  // create higher level
  const engine = new JsonRpcEngine();
  const provider = providerFromEngine(engine);

  const blockTracker = new PollingBlockTracker({
    provider,
  });

  return { engine, provider, blockTracker };
}

describe('block cache', () => {
  it('should cache a request and only hit the provider once', async () => {
    const { engine, provider, blockTracker } = createTestSetup();
    const requestSpy = jest.spyOn(provider, 'request').mockResolvedValue('0x0');
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
    expect(response.result).toBe('0x0');
    expect(response2.result).toBe('0x0');
    expect(requestSpy).toHaveBeenCalled();
  });
});
