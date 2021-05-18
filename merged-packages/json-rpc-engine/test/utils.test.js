/* eslint-env mocha */
'use strict';

const { strict: assert } = require('assert');
const {
  isJsonRpcFailure,
  isJsonRpcSuccess,
  getJsonRpcIdValidator,
} = require('../dist');

describe('isJsonRpcSuccess', function () {
  it('correctly identifies JSON-RPC response objects', function () {
    assert.equal(isJsonRpcSuccess({ result: 'success' }), true);
    assert.equal(isJsonRpcSuccess({ result: null }), true);
    assert.equal(isJsonRpcSuccess({ error: new Error('foo') }), false);
    assert.equal(isJsonRpcSuccess({}), false);
  });
});

describe('isJsonRpcFailure', function () {
  it('correctly identifies JSON-RPC response objects', function () {
    assert.equal(isJsonRpcFailure({ error: 'failure' }), true);
    assert.equal(isJsonRpcFailure({ error: null }), true);
    assert.equal(isJsonRpcFailure({ result: 'success' }), false);
    assert.equal(isJsonRpcFailure({}), false);
  });
});

describe('getJsonRpcIdValidator', function () {
  const getInputs = () => {
    return {
      // invariant with respect to options
      fractionString: { value: '1.2', expected: true },
      negativeInteger: { value: -1, expected: true },
      object: { value: {}, expected: false },
      positiveInteger: { value: 1, expected: true },
      string: { value: 'foo', expected: true },
      undefined: { value: undefined, expected: false },
      zero: { value: 0, expected: true },
      // variant with respect to options
      emptyString: { value: '', expected: true },
      fraction: { value: 1.2, expected: false },
      null: { value: null, expected: true },
    };
  };

  const validateAll = (validate, inputs) => {
    for (const input of Object.values(inputs)) {
      assert.equal(
        validate(input.value),
        input.expected,
        `should output "${input.expected}" for "${input.value}"`,
      );
    }
  };

  it('performs as expected with default options', function () {
    const inputs = getInputs();

    // The default options are:
    // permitEmptyString: true,
    // permitFractions: false,
    // permitNull: true,
    validateAll(getJsonRpcIdValidator(), inputs);
  });

  it('performs as expected with "permitEmptyString: false"', function () {
    const inputs = getInputs();
    inputs.emptyString.expected = false;

    validateAll(
      getJsonRpcIdValidator({
        permitEmptyString: false,
      }),
      inputs,
    );
  });

  it('performs as expected with "permitFractions: true"', function () {
    const inputs = getInputs();
    inputs.fraction.expected = true;

    validateAll(
      getJsonRpcIdValidator({
        permitFractions: true,
      }),
      inputs,
    );
  });

  it('performs as expected with "permitNull: false"', function () {
    const inputs = getInputs();
    inputs.null.expected = false;

    validateAll(
      getJsonRpcIdValidator({
        permitNull: false,
      }),
      inputs,
    );
  });
});
