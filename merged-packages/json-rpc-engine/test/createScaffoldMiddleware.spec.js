/* eslint-env mocha */
'use strict';

const { strict: assert } = require('assert');
const { JsonRpcEngine, createScaffoldMiddleware } = require('../dist');

describe('createScaffoldMiddleware', function () {
  it('basic middleware test', async function () {
    const engine = new JsonRpcEngine();

    const scaffold = {
      method1: 'foo',
      method2: (_req, res, _next, end) => {
        res.result = 42;
        end();
      },
      method3: (_req, res, _next, end) => {
        res.error = new Error('method3');
        end();
      },
    };

    engine.push(createScaffoldMiddleware(scaffold));
    engine.push((_req, res, _next, end) => {
      res.result = 'passthrough';
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0' };

    const response1 = await engine.handle({ ...payload, method: 'method1' });
    const response2 = await engine.handle({ ...payload, method: 'method2' });
    const response3 = await engine.handle({ ...payload, method: 'method3' });
    const response4 = await engine.handle({ ...payload, method: 'unknown' });

    assert.equal(response1.result, 'foo', 'should have expected result');
    assert.equal(response2.result, 42, 'should have expected result');
    assert.equal(
      response3.error.message,
      'method3',
      'should have expected error',
    );
    assert.equal(
      response4.result,
      'passthrough',
      'should have expected result',
    );
  });
});
