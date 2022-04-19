import { PollingBlockTracker, Provider } from 'eth-block-tracker';
import { JsonRpcEngine } from 'json-rpc-engine';
import pify from 'pify';
import { providerFromEngine, createBlockRefMiddleware } from '../src';

const testAddresses = [
  '0xbe93f9bacbcffc8ee6663f2647917ed7a20a57bb',
  '0x1234362ef32bcd26d3dd18ca749378213625ba0b',
];

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

describe('block ref', () => {
  it('should rewrite "latest" blockRef to current block', async () => {
    const { engine, provider, blockTracker } = createTestSetup();
    const providerReqs: any[] = [];
    const spy = jest
      .spyOn(provider, 'sendAsync')
      .mockImplementation((_req, cb) => {
        providerReqs.push(_req);
        cb(
          undefined as any,
          { id: _req.id, result: '0x0', jsonrpc: '2.0' } as any,
        );
      });

    engine.push(createBlockRefMiddleware({ blockTracker, provider }));

    engine.push((_req, res, _next, end) => {
      if (res.result) {
        end();
      } else {
        _next();
      }
    });

    await pify(engine.handle).call(engine, {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [testAddresses[0], 'latest'],
    });

    expect(providerReqs[1].params[1]).toEqual('0x0');
    expect(spy).toHaveBeenCalled();
  });
});
