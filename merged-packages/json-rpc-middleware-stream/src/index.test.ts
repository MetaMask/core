import { JsonRpcEngine } from 'json-rpc-engine';
import { createStreamMiddleware, createEngineStream } from '.';

const jsonrpc = '2.0' as const;

describe('createStreamMiddleware', () => {
  it('processes a request', async () => {
    const jsonRpcConnection = createStreamMiddleware();
    const req = { id: 1, jsonrpc, method: 'test' };
    const initRes = { id: 1, jsonrpc };
    const res = { id: 1, jsonrpc, result: 'test' };

    await new Promise<void>((resolve, reject) => {
      // listen for incoming requests
      jsonRpcConnection.stream.on('data', (_req) => {
        expect(req).toStrictEqual(_req);
        jsonRpcConnection.stream.write(res);
      });

      // run middleware, expect end fn to be called
      jsonRpcConnection.middleware(
        req,
        initRes,
        () => {
          reject(new Error('should not call next'));
        },
        (err) => {
          try {
            // eslint-disable-next-line jest/no-restricted-matchers
            expect(err).toBeFalsy();
            expect(initRes).toStrictEqual(res);
          } catch (error) {
            return reject(error);
          }
          return resolve();
        },
      );
    });
  });
});

describe('createEngineStream', () => {
  it('processes a request', async () => {
    const engine = new JsonRpcEngine();
    engine.push((_req, res, _next, end) => {
      res.result = 'test';
      end();
    });

    const stream = createEngineStream({ engine });
    const req = { id: 1, jsonrpc, method: 'test' };
    const res = { id: 1, jsonrpc, result: 'test' };

    await new Promise<void>((resolve, reject) => {
      // listen for incoming requests
      stream.on('data', (_res) => {
        try {
          expect(res).toStrictEqual(_res);
        } catch (error) {
          return reject(error);
        }
        return resolve();
      });

      stream.on('error', (err) => {
        reject(err);
      });

      stream.write(req);
    });
  });
});

describe('middleware and engine to stream', () => {
  it('forwards messages between streams', async () => {
    // create guest
    const engineA = new JsonRpcEngine();
    const jsonRpcConnection = createStreamMiddleware();
    engineA.push(jsonRpcConnection.middleware);

    // create host
    const engineB = new JsonRpcEngine();
    engineB.push((_req, res, _next, end) => {
      res.result = 'test';
      end();
    });

    // connect both
    const clientSideStream = jsonRpcConnection.stream;
    const hostSideStream = createEngineStream({ engine: engineB });
    clientSideStream.pipe(hostSideStream).pipe(clientSideStream);

    // request and expected result
    const req = { id: 1, jsonrpc, method: 'test' };
    const res = { id: 1, jsonrpc, result: 'test' };

    const response = await engineA.handle(req);
    expect(response).toStrictEqual(res);
  });
});
