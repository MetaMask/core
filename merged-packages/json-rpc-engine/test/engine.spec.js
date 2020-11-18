/* eslint-env mocha */
'use strict';

const { strict: assert } = require('assert');
const { stub } = require('sinon');
const { JsonRpcEngine } = require('../dist');

describe('JsonRpcEngine', function () {
  it('handle: throws on truthy, non-function callback', function () {
    const engine = new JsonRpcEngine();
    assert.throws(
      () => engine.handle({}, true),
      { message: '"callback" must be a function if provided.' },
      'should throw expected error',
    );
  });

  it('handle: basic middleware test 1', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, _next, end) {
      res.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error');
      assert.ok(res, 'has res');
      assert.equal(res.result, 42, 'has expected result');
      done();
    });
  });

  it('handle: basic middleware test 2', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (req, res, _next, end) {
      req.method = 'banana';
      res.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error');
      assert.ok(res, 'has res');
      assert.equal(res.result, 42, 'has expected result');
      assert.equal(payload.method, 'hello', 'original request object is not mutated by middleware');
      done();
    });
  });

  it('handle (async): basic middleware test', async function () {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, _next, end) {
      res.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    const res = await engine.handle(payload);
    assert.ok(res, 'has res');
    assert.equal(res.result, 42, 'has expected result');
  });

  it('allow null result', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, _next, end) {
      res.result = null;
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error');
      assert.ok(res, 'has res');
      assert.equal(res.result, null, 'has expected result');
      done();
    });
  });

  it('interacting middleware test', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (req, _res, next, _end) {
      req.resultShouldBe = 42;
      next();
    });

    engine.push(function (req, res, _next, end) {
      res.result = req.resultShouldBe;
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error');
      assert.ok(res, 'has res');
      assert.equal(res.result, 42, 'has expected result');
      done();
    });
  });

  it('middleware ending request before all middlewares applied', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, _next, end) {
      res.result = 42;
      end();
    });

    engine.push(function (_req, _res, _next, _end) {
      assert.fail('should not have called second middleware');
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error');
      assert.ok(res, 'has res');
      assert.equal(res.result, 42, 'has expected result');
      done();
    });
  });

  it('erroring middleware test: end(error)', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, _res, _next, end) {
      end(new Error('no bueno'));
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, function (err, res) {
      assert.ok(err, 'did error');
      assert.ok(res, 'does have response');
      assert.ok(res.error, 'does have error on response');
      assert.ok(!res.result, 'does not have result on response');
      done();
    });
  });

  it('erroring middleware test: res.error -> next()', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, next, _end) {
      res.error = new Error('no bueno');
      next();
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, function (err, res) {
      assert.ok(err, 'did error');
      assert.ok(res, 'does have response');
      assert.ok(res.error, 'does have error on response');
      assert.ok(!res.result, 'does not have result on response');
      done();
    });
  });

  it('erroring middleware test: res.error -> end()', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, _next, end) {
      res.error = new Error('no bueno');
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, function (err, res) {
      assert.ok(err, 'did error');
      assert.ok(res, 'does have response');
      assert.ok(res.error, 'does have error on response');
      assert.ok(!res.result, 'does not have result on response');
      done();
    });
  });

  it('empty middleware test', function (done) {
    const engine = new JsonRpcEngine();

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, function (err, _res) {
      assert.ok(err, 'did error');
      done();
    });
  });

  it('handle batch payloads', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (req, res, _next, end) {
      if (req.id === 4) {
        delete res.result;
        res.error = new Error('foobar');
        return end(res.error);
      }
      res.result = req.id;
      return end();
    });

    const payloadA = { id: 1, jsonrpc: '2.0', method: 'hello' };
    const payloadB = { id: 2, jsonrpc: '2.0', method: 'hello' };
    const payloadC = { id: 3, jsonrpc: '2.0', method: 'hello' };
    const payloadD = { id: 4, jsonrpc: '2.0', method: 'hello' };
    const payloadE = { id: 5, jsonrpc: '2.0', method: 'hello' };
    const payload = [payloadA, payloadB, payloadC, payloadD, payloadE];

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error');
      assert.ok(res, 'has res');
      assert.ok(Array.isArray(res), 'res is array');
      assert.equal(res[0].result, 1, 'has expected result');
      assert.equal(res[1].result, 2, 'has expected result');
      assert.equal(res[2].result, 3, 'has expected result');
      assert.ok(!res[3].result, 'has no result');
      assert.equal(res[3].error.code, -32603, 'has expected error');
      assert.equal(res[4].result, 5, 'has expected result');
      done();
    });
  });

  it('handle batch payloads (async signature)', async function () {
    const engine = new JsonRpcEngine();

    engine.push(function (req, res, _next, end) {
      if (req.id === 4) {
        delete res.result;
        res.error = new Error('foobar');
        return end(res.error);
      }
      res.result = req.id;
      return end();
    });

    const payloadA = { id: 1, jsonrpc: '2.0', method: 'hello' };
    const payloadB = { id: 2, jsonrpc: '2.0', method: 'hello' };
    const payloadC = { id: 3, jsonrpc: '2.0', method: 'hello' };
    const payloadD = { id: 4, jsonrpc: '2.0', method: 'hello' };
    const payloadE = { id: 5, jsonrpc: '2.0', method: 'hello' };
    const payload = [payloadA, payloadB, payloadC, payloadD, payloadE];

    const res = await engine.handle(payload);
    assert.ok(res, 'has res');
    assert.ok(Array.isArray(res), 'res is array');
    assert.equal(res[0].result, 1, 'has expected result');
    assert.equal(res[1].result, 2, 'has expected result');
    assert.equal(res[2].result, 3, 'has expected result');
    assert.ok(!res[3].result, 'has no result');
    assert.equal(res[3].error.code, -32603, 'has expected error');
    assert.equal(res[4].result, 5, 'has expected result');
  });

  it('basic notifications', function (done) {
    const engine = new JsonRpcEngine();

    engine.once('notification', (notif) => {
      assert.equal(notif.method, 'test_notif');
      done();
    });

    const payload = { jsonrpc: '2.0', method: 'test_notif' };
    engine.emit('notification', payload);
  });

  it('return handlers test', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, next, _end) {
      next(function (cb) {
        res.sawReturnHandler = true;
        cb();
      });
    });

    engine.push(function (_req, res, _next, end) {
      res.result = true;
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, function (err, res) {
      assert.ifError(err, 'did not error');
      assert.ok(res, 'has res');
      assert.ok(res.sawReturnHandler, 'saw return handler');
      done();
    });
  });

  it('return order of events', function (done) {
    const engine = new JsonRpcEngine();

    const events = [];

    engine.push(function (_req, _res, next, _end) {
      events.push('1-next');
      next(function (cb) {
        events.push('1-return');
        cb();
      });
    });

    engine.push(function (_req, _res, next, _end) {
      events.push('2-next');
      next(function (cb) {
        events.push('2-return');
        cb();
      });
    });

    engine.push(function (_req, res, _next, end) {
      events.push('3-end');
      res.result = true;
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, function (err, _res) {
      assert.ifError(err, 'did not error');
      assert.equal(events[0], '1-next', '(event 0) was "1-next"');
      assert.equal(events[1], '2-next', '(event 1) was "2-next"');
      assert.equal(events[2], '3-end', '(event 2) was "3-end"');
      assert.equal(events[3], '2-return', '(event 3) was "2-return"');
      assert.equal(events[4], '1-return', '(event 4) was "1-return"');
      done();
    });
  });

  it('calls back next handler even if error', function (done) {
    const engine = new JsonRpcEngine();

    let sawNextReturnHandlerCalled = false;

    engine.push(function (_req, _res, next, _end) {
      next(function (cb) {
        sawNextReturnHandlerCalled = true;
        cb();
      });
    });

    engine.push(function (_req, _res, _next, end) {
      end(new Error('boom'));
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, (err, _res) => {
      assert.ok(err, 'did error');
      assert.ok(sawNextReturnHandlerCalled, 'saw next return handler called');
      done();
    });
  });

  it('handles error in next handler', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, _res, next, _end) {
      next(function (_cb) {
        throw new Error('foo');
      });
    });

    engine.push(function (_req, res, _next, end) {
      res.result = 42;
      end();
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, (err, _res) => {
      assert.ok(err, 'did error');
      assert.equal(err.message, 'foo', 'error has expected message');
      done();
    });
  });

  it('handles failure to end request', function (done) {
    const engine = new JsonRpcEngine();

    engine.push(function (_req, res, next, _end) {
      res.result = 42;
      next();
    });

    const payload = { id: 1, jsonrpc: '2.0', method: 'hello' };

    engine.handle(payload, (err, res) => {
      assert.ok(err, 'should have errored');
      assert.ok(
        err.message.startsWith('JsonRpcEngine: Nothing ended request:'),
        'should have expected error message',
      );
      assert.ok(!res.result, 'should not have result');
      done();
    });
  });

  it('handles batch request processing error', function (done) {
    const engine = new JsonRpcEngine();
    stub(engine, '_promiseHandle').throws(new Error('foo'));

    engine.handle([{}], (err) => {
      assert.ok(err, 'did error');
      assert.equal(err.message, 'foo', 'error has expected message');
      done();
    });
  });

  it('handles batch request processing error (async)', async function () {
    const engine = new JsonRpcEngine();
    stub(engine, '_promiseHandle').throws(new Error('foo'));

    try {
      await engine.handle([{}]);
      assert.fail('should have errored');
    } catch (err) {
      assert.ok(err, 'did error');
      assert.equal(err.message, 'foo', 'error has expected message');
    }
  });
});
