import { validate, assert as superstructAssert } from 'superstruct';

import {
  assert,
  assertIsJson,
  assertIsJsonRpcError,
  assertIsJsonRpcFailure,
  assertIsJsonRpcNotification,
  assertIsJsonRpcRequest,
  assertIsJsonRpcResponse,
  assertIsJsonRpcSuccess,
  assertIsPendingJsonRpcResponse,
  createJson,
  getJsonRpcIdValidator,
  isJsonRpcError,
  isJsonRpcFailure,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  isJsonRpcSuccess,
  isPendingJsonRpcResponse,
  isValidJson,
  JsonStruct,
  validateJsonAndGetSize,
} from '.';
import {
  CHARACTER_MAP,
  ESCAPED_STRINGS,
  JSON_FIXTURES,
  JSON_RPC_ERROR_FIXTURES,
  JSON_RPC_FAILURE_FIXTURES,
  JSON_RPC_NOTIFICATION_FIXTURES,
  JSON_RPC_PENDING_RESPONSE_FIXTURES,
  JSON_RPC_REQUEST_FIXTURES,
  JSON_RPC_RESPONSE_FIXTURES,
  JSON_RPC_SUCCESS_FIXTURES,
  JSON_VALIDATION_FIXTURES,
} from './__fixtures__';

jest.mock('superstruct', () => ({
  ...jest.requireActual('superstruct'),
  assert: jest.fn(),
}));

describe('json', () => {
  beforeEach(() => {
    const actual = jest.requireActual('superstruct');
    (
      superstructAssert as jest.MockedFunction<typeof superstructAssert>
    ).mockImplementation(actual.assert);
  });

  describe('JsonStruct', () => {
    it('returns error message', () => {
      const [error] = validate(undefined, JsonStruct);
      assert(error !== undefined);
      expect(error.message).toBe(
        'The value must be one of: null, boolean, number, string, JSON array, or JSON object',
      );
    });
  });

  // TODO: Make this test suite exhaustive.
  // The current implementation is guaranteed to be correct, but in the future
  // we may opt for a bespoke implementation that is more performant, but may
  // contain bugs.
  describe('isValidJson', () => {
    it.each(JSON_FIXTURES.valid)('identifies valid JSON values', (value) => {
      expect(isValidJson(value)).toBe(true);
    });

    it.each(JSON_FIXTURES.invalid)(
      'identifies invalid JSON values',
      (value) => {
        expect(isValidJson(value)).toBe(false);
      },
    );
  });

  describe('assertIsJson', () => {
    it.each(JSON_FIXTURES.valid)(
      'does not throw an error for valid JSON',
      (value) => {
        expect(() => assertIsJson(value)).not.toThrow();
      },
    );

    it.each(JSON_FIXTURES.invalid)(
      'throws an error for invalid JSON',
      (value) => {
        expect(() => assertIsJson(value)).toThrow(
          'Invalid JSON-serializable value: The value must be one of: null, boolean, number, string, JSON array, or JSON object.',
        );
      },
    );
  });

  describe('createJson', () => {
    it.each(JSON_FIXTURES.valid)(
      'creates a JSON-serializable value and returns the parsed value',
      (value) => {
        expect(createJson(value)).toStrictEqual(value);
      },
    );

    it.each(JSON_FIXTURES.invalid)(
      'throws an error for invalid JSON',
      (value) => {
        expect(() => createJson(value)).toThrow(
          'Invalid JSON-serializable value: The value must be one of: null, boolean, number, string, JSON array, or JSON object.',
        );
      },
    );

    it('handles `toJSON` with objects', () => {
      const object = {
        foo: 'bar',
      };

      const value = { foo: 'bar', baz: 'qux' };

      Object.defineProperty(object, 'toJSON', {
        value: () => value,
        enumerable: false,
      });

      expect(createJson(object)).toStrictEqual(value);
    });

    it('handles `toJSON` with arrays', () => {
      const array = ['foo', 'bar'];
      const value = ['foo', 'bar', 'baz', 'qux'];

      Object.defineProperty(array, 'toJSON', {
        value: () => value,
        enumerable: false,
      });

      expect(createJson(array)).toStrictEqual(value);
    });

    it('handles `toJSON` with other values', () => {
      // Please don't do this in your code.
      // @ts-expect-error `toJSON` is not a function.
      // eslint-disable-next-line no-extend-native
      String.prototype.toJSON = () => 'foo bar baz';

      expect(createJson('bar')).toBe('foo bar baz');

      // @ts-expect-error `toJSON` is not a function.
      // eslint-disable-next-line no-extend-native
      String.prototype.toJSON = undefined;
    });

    it('handles `toJSON` in nested objects', () => {
      // Please don't do this in your code.
      // @ts-expect-error `toJSON` is not a function.
      // eslint-disable-next-line no-extend-native
      String.prototype.toJSON = () => 'foo bar baz';

      const object = {
        foo: 'bar',
      };

      const value = { foo: 'bar', baz: 'qux' };

      Object.defineProperty(object, 'toJSON', {
        value: () => value,
        enumerable: false,
      });

      const nestedObject = {
        foo: object,
        bar: {
          baz: object,
          qux: [
            {
              quux: [[[object]]],
            },
          ],
        },
      };

      expect(createJson(nestedObject)).toStrictEqual({
        foo: {
          foo: 'foo bar baz',
          baz: 'foo bar baz',
        },
        bar: {
          baz: {
            foo: 'foo bar baz',
            baz: 'foo bar baz',
          },
          qux: [
            {
              quux: [
                [
                  [
                    {
                      foo: 'foo bar baz',
                      baz: 'foo bar baz',
                    },
                  ],
                ],
              ],
            },
          ],
        },
      });

      // @ts-expect-error `toJSON` is not a function.
      // eslint-disable-next-line no-extend-native
      String.prototype.toJSON = undefined;
    });

    it('validates that the value is within the maximum size', () => {
      const value = 'foo';

      expect(() => createJson(value, 2)).toThrow(
        `Invalid JSON-serializable value: The provided JSON value exceeds the maximum size (5 bytes > 2 bytes).`,
      );
    });

    it('checks the size of the value returned by `toJSON`', () => {
      // 13 bytes
      const object = {
        foo: 'bar',
      };

      // 25 bytes
      const value = { foo: 'bar', baz: 'qux' };

      Object.defineProperty(object, 'toJSON', {
        value: () => value,
        enumerable: false,
      });

      expect(() => createJson(object, 13)).toThrow(
        'Invalid JSON-serializable value: The provided JSON value exceeds the maximum size (25 bytes > 13 bytes).',
      );
    });
  });

  describe('isJsonRpcNotification', () => {
    it.each(JSON_RPC_NOTIFICATION_FIXTURES.valid)(
      'returns true for a valid JSON-RPC notification',
      (notification) => {
        expect(isJsonRpcNotification(notification)).toBe(true);
      },
    );

    it.each(JSON_RPC_NOTIFICATION_FIXTURES.invalid)(
      'returns false for an invalid JSON-RPC notification',
      (notification) => {
        expect(isJsonRpcNotification(notification)).toBe(false);
      },
    );
  });

  describe('assertIsJsonRpcNotification', () => {
    it.each(JSON_RPC_NOTIFICATION_FIXTURES.valid)(
      'does not throw an error for valid JSON-RPC notifications',
      (notification) => {
        expect(() => assertIsJsonRpcNotification(notification)).not.toThrow();
      },
    );

    it.each(JSON_RPC_NOTIFICATION_FIXTURES.invalid)(
      'throws an error for invalid JSON-RPC notifications',
      (notification) => {
        expect(() => assertIsJsonRpcNotification(notification)).toThrow(
          'Invalid JSON-RPC notification',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcNotification(JSON_RPC_NOTIFICATION_FIXTURES.invalid[0]),
      ).toThrow(
        'Invalid JSON-RPC notification: At path: jsonrpc -- Expected the literal `"2.0"`, but received: undefined.',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      (
        superstructAssert as jest.MockedFunction<typeof superstructAssert>
      ).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'oops';
      });

      expect(() =>
        assertIsJsonRpcNotification(JSON_RPC_NOTIFICATION_FIXTURES.invalid[0]),
      ).toThrow('Invalid JSON-RPC notification: oops');
    });
  });

  describe('isJsonRpcRequest', () => {
    it.each(JSON_RPC_REQUEST_FIXTURES.valid)(
      'returns true for a valid JSON-RPC request',
      (request) => {
        expect(isJsonRpcRequest(request)).toBe(true);
      },
    );

    it.each(JSON_RPC_REQUEST_FIXTURES.invalid)(
      'returns false for an invalid JSON-RPC request',
      (request) => {
        expect(isJsonRpcRequest(request)).toBe(false);
      },
    );
  });

  describe('assertIsJsonRpcRequest', () => {
    it.each(JSON_RPC_REQUEST_FIXTURES.valid)(
      'does not throw an error for valid JSON-RPC requests',
      (request) => {
        expect(() => assertIsJsonRpcRequest(request)).not.toThrow();
      },
    );

    it.each(JSON_RPC_REQUEST_FIXTURES.invalid)(
      'throws an error for invalid JSON-RPC requests',
      (request) => {
        expect(() => assertIsJsonRpcRequest(request)).toThrow(
          'Invalid JSON-RPC request',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcRequest(JSON_RPC_REQUEST_FIXTURES.invalid[0]),
      ).toThrow(
        'Invalid JSON-RPC request: At path: id -- Expected the value to satisfy a union of `number | string`, but received: undefined.',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      (
        superstructAssert as jest.MockedFunction<typeof superstructAssert>
      ).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'oops';
      });

      expect(() =>
        assertIsJsonRpcRequest(JSON_RPC_REQUEST_FIXTURES.invalid[0]),
      ).toThrow('Invalid JSON-RPC request: oops');
    });
  });

  describe('isJsonRpcSuccess', () => {
    it.each(JSON_RPC_SUCCESS_FIXTURES.valid)(
      'returns true for a valid JSON-RPC success',
      (success) => {
        expect(isJsonRpcSuccess(success)).toBe(true);
      },
    );

    it.each(JSON_RPC_SUCCESS_FIXTURES.invalid)(
      'returns false for an invalid JSON-RPC success',
      (success) => {
        expect(isJsonRpcSuccess(success)).toBe(false);
      },
    );
  });

  describe('assertIsJsonRpcSuccess', () => {
    it.each(JSON_RPC_SUCCESS_FIXTURES.valid)(
      'does not throw an error for valid JSON-RPC success',
      (success) => {
        expect(() => assertIsJsonRpcSuccess(success)).not.toThrow();
      },
    );

    it.each(JSON_RPC_SUCCESS_FIXTURES.invalid)(
      'throws an error for invalid JSON-RPC success',
      (success) => {
        expect(() => assertIsJsonRpcSuccess(success)).toThrow(
          'Invalid JSON-RPC success response',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcSuccess(JSON_RPC_SUCCESS_FIXTURES.invalid[0]),
      ).toThrow(
        'Invalid JSON-RPC success response: At path: id -- Expected the value to satisfy a union of `number | string`, but received: undefined.',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      (
        superstructAssert as jest.MockedFunction<typeof superstructAssert>
      ).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'oops.';
      });

      expect(() =>
        assertIsJsonRpcSuccess(JSON_RPC_SUCCESS_FIXTURES.invalid[0]),
      ).toThrow('Invalid JSON-RPC success response: oops.');
    });
  });

  describe('isJsonRpcFailure', () => {
    it.each(JSON_RPC_FAILURE_FIXTURES.valid)(
      'returns true for a valid JSON-RPC failure',
      (failure) => {
        expect(isJsonRpcFailure(failure)).toBe(true);
      },
    );

    it.each(JSON_RPC_FAILURE_FIXTURES.invalid)(
      'returns false for an invalid JSON-RPC failure',
      (failure) => {
        expect(isJsonRpcFailure(failure)).toBe(false);
      },
    );
  });

  describe('assertIsJsonRpcFailure', () => {
    it.each(JSON_RPC_FAILURE_FIXTURES.valid)(
      'does not throw an error for valid JSON-RPC failure',
      (failure) => {
        expect(() => assertIsJsonRpcFailure(failure)).not.toThrow();
      },
    );

    it.each(JSON_RPC_FAILURE_FIXTURES.invalid)(
      'throws an error for invalid JSON-RPC failure',
      (failure) => {
        expect(() => assertIsJsonRpcFailure(failure)).toThrow(
          'Invalid JSON-RPC failure response',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcFailure(JSON_RPC_FAILURE_FIXTURES.invalid[0]),
      ).toThrow(
        'Invalid JSON-RPC failure response: At path: id -- Expected the value to satisfy a union of `number | string`, but received: undefined.',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      (
        superstructAssert as jest.MockedFunction<typeof superstructAssert>
      ).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'oops.';
      });

      expect(() =>
        assertIsJsonRpcFailure(JSON_RPC_FAILURE_FIXTURES.invalid[0]),
      ).toThrow('Invalid JSON-RPC failure response: oops.');
    });
  });

  describe('isJsonRpcError', () => {
    it.each(JSON_RPC_ERROR_FIXTURES.valid)(
      'returns true for a valid JSON-RPC error',
      (error) => {
        expect(isJsonRpcError(error)).toBe(true);
      },
    );

    it.each(JSON_RPC_ERROR_FIXTURES.invalid)(
      'returns false for an invalid JSON-RPC error',
      (error) => {
        expect(isJsonRpcError(error)).toBe(false);
      },
    );
  });

  describe('assertIsJsonRpcError', () => {
    it.each(JSON_RPC_ERROR_FIXTURES.valid)(
      'does not throw an error for valid JSON-RPC error',
      (error) => {
        expect(() => assertIsJsonRpcError(error)).not.toThrow();
      },
    );

    it.each(JSON_RPC_ERROR_FIXTURES.invalid)(
      'throws an error for invalid JSON-RPC error',
      (error) => {
        expect(() => assertIsJsonRpcError(error)).toThrow(
          'Invalid JSON-RPC error',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcError(JSON_RPC_ERROR_FIXTURES.invalid[0]),
      ).toThrow(
        'Invalid JSON-RPC error: At path: code -- Expected an integer, but received: undefined.',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      (
        superstructAssert as jest.MockedFunction<typeof superstructAssert>
      ).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'oops';
      });

      expect(() =>
        assertIsJsonRpcError(JSON_RPC_ERROR_FIXTURES.invalid[0]),
      ).toThrow('Invalid JSON-RPC error: oops');
    });
  });

  describe('isPendingJsonRpcResponse', () => {
    it.each(JSON_RPC_PENDING_RESPONSE_FIXTURES.valid)(
      'returns true for a valid pending JSON-RPC response',
      (response) => {
        expect(isPendingJsonRpcResponse(response)).toBe(true);
      },
    );

    it.each(JSON_RPC_PENDING_RESPONSE_FIXTURES.invalid)(
      'returns false for an invalid pending JSON-RPC response',
      (response) => {
        expect(isPendingJsonRpcResponse(response)).toBe(false);
      },
    );
  });

  describe('assertIsPendingJsonRpcResponse', () => {
    it.each(JSON_RPC_PENDING_RESPONSE_FIXTURES.valid)(
      'does not throw for a valid pending JSON-RPC response',
      (response) => {
        expect(() => assertIsPendingJsonRpcResponse(response)).not.toThrow();
      },
    );

    it.each(JSON_RPC_PENDING_RESPONSE_FIXTURES.invalid)(
      'throws for an invalid pending JSON-RPC response',
      (response) => {
        expect(() => assertIsPendingJsonRpcResponse(response)).toThrow(
          'Invalid pending JSON-RPC response',
        );
      },
    );

    it('includes the value thrown in the message if it is not an error', () => {
      (
        superstructAssert as jest.MockedFunction<typeof superstructAssert>
      ).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'oops';
      });

      expect(() =>
        assertIsPendingJsonRpcResponse(JSON_RPC_FAILURE_FIXTURES.invalid[0]),
      ).toThrow('Invalid pending JSON-RPC response: oops');
    });
  });

  describe('isJsonRpcResponse', () => {
    it.each(JSON_RPC_RESPONSE_FIXTURES.valid)(
      'returns true for a valid JSON-RPC response',
      (response) => {
        expect(isJsonRpcResponse(response)).toBe(true);
      },
    );

    it.each(JSON_RPC_RESPONSE_FIXTURES.invalid)(
      'returns false for an invalid JSON-RPC response',
      (response) => {
        expect(isJsonRpcResponse(response)).toBe(false);
      },
    );
  });

  describe('assertIsJsonRpcResponse', () => {
    it.each(JSON_RPC_RESPONSE_FIXTURES.valid)(
      'does not throw an error for valid JSON-RPC response',
      (response) => {
        expect(() => assertIsJsonRpcResponse(response)).not.toThrow();
      },
    );

    it.each(JSON_RPC_RESPONSE_FIXTURES.invalid)(
      'throws an error for invalid JSON-RPC response',
      (response) => {
        expect(() => assertIsJsonRpcResponse(response)).toThrow(
          'Invalid JSON-RPC response',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcResponse(JSON_RPC_RESPONSE_FIXTURES.invalid[0]),
      ).toThrow(
        'Invalid JSON-RPC response: Expected the value to satisfy a union of `object | object`, but received: [object Object].',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      (
        superstructAssert as jest.MockedFunction<typeof superstructAssert>
      ).mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'oops.';
      });

      expect(() =>
        assertIsJsonRpcResponse(JSON_RPC_RESPONSE_FIXTURES.invalid[0]),
      ).toThrow('Invalid JSON-RPC response: oops');
    });
  });

  describe('getJsonRpcIdValidator', () => {
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

    const validateAll = (
      validator: ReturnType<typeof getJsonRpcIdValidator>,
      inputs: ReturnType<typeof getInputs>,
    ) => {
      for (const input of Object.values(inputs)) {
        expect(validator(input.value)).toStrictEqual(input.expected);
      }
    };

    it('performs as expected with default options', () => {
      const inputs = getInputs();

      // The default options are:
      // permitEmptyString: true,
      // permitFractions: false,
      // permitNull: true,
      expect(() => validateAll(getJsonRpcIdValidator(), inputs)).not.toThrow();
    });

    it('performs as expected with "permitEmptyString: false"', () => {
      const inputs = getInputs();
      inputs.emptyString.expected = false;

      expect(() =>
        validateAll(
          getJsonRpcIdValidator({
            permitEmptyString: false,
          }),
          inputs,
        ),
      ).not.toThrow();
    });

    it('performs as expected with "permitFractions: true"', () => {
      const inputs = getInputs();
      inputs.fraction.expected = true;

      expect(() =>
        validateAll(
          getJsonRpcIdValidator({
            permitFractions: true,
          }),
          inputs,
        ),
      ).not.toThrow();
    });

    it('performs as expected with "permitNull: false"', () => {
      const inputs = getInputs();
      inputs.null.expected = false;

      expect(() =>
        validateAll(
          getJsonRpcIdValidator({
            permitNull: false,
          }),
          inputs,
        ),
      ).not.toThrow();
    });
  });

  describe('validateJsonAndGetSize', () => {
    it.each(JSON_VALIDATION_FIXTURES)(
      'handles %o',
      ({ value, valid, size }) => {
        const result = validateJsonAndGetSize(value);

        expect(result.valid).toBe(valid);
        expect(result.size).toBe(size);
      },
    );

    it.each(JSON_VALIDATION_FIXTURES)(
      'handles %o without sizing',
      ({ value, valid }) => {
        const result = validateJsonAndGetSize(value, true);

        expect(result.valid).toBe(valid);
        expect(result.size).toBe(0);
      },
    );

    it.each(Object.values(CHARACTER_MAP))(
      'handles special character %o',
      (value) => {
        const result = validateJsonAndGetSize(value);

        expect(result.valid).toBe(true);
        expect(result.size).toBeGreaterThan(0);
      },
    );

    it.each(ESCAPED_STRINGS)('handles escaped string %o', (value) => {
      const result = validateJsonAndGetSize(value);

      expect(result.valid).toBe(true);
      expect(result.size).toBeGreaterThan(0);
    });

    it('handles `toJSON` with objects', () => {
      const object = {
        foo: 'bar',
      };

      const value = { foo: 'bar', baz: 'qux' };

      Object.defineProperty(object, 'toJSON', {
        value: () => value,
        enumerable: false,
      });

      expect(validateJsonAndGetSize(object)).toStrictEqual({
        valid: true,
        result: value,
        size: 25,
      });
    });

    it('handles `toJSON` with arrays', () => {
      const array = ['foo', 'bar'];
      const value = ['foo', 'bar', 'baz', 'qux'];

      Object.defineProperty(array, 'toJSON', {
        value: () => value,
        enumerable: false,
      });

      expect(validateJsonAndGetSize(array)).toStrictEqual({
        valid: true,
        result: value,
        size: 25,
      });
    });

    it('handles `toJSON` with other values', () => {
      // Please don't do this in your code.
      // @ts-expect-error `toJSON` is not a function.
      // eslint-disable-next-line no-extend-native
      String.prototype.toJSON = () => 'foo bar baz';

      expect(validateJsonAndGetSize('bar')).toStrictEqual({
        valid: true,
        result: 'foo bar baz',
        size: 13,
      });

      // @ts-expect-error `toJSON` is not a function.
      // eslint-disable-next-line no-extend-native
      String.prototype.toJSON = undefined;
    });

    it('handles `toJSON` in nested objects', () => {
      // Please don't do this in your code.
      // @ts-expect-error `toJSON` is not a function.
      // eslint-disable-next-line no-extend-native
      String.prototype.toJSON = () => 'foo bar baz';

      const object = {
        foo: 'bar',
      };

      const value = { foo: 'bar', baz: 'qux' };

      Object.defineProperty(object, 'toJSON', {
        value: () => value,
        enumerable: false,
      });

      const nestedObject = {
        foo: object,
        bar: {
          baz: object,
          qux: [
            {
              quux: [[[object]]],
            },
          ],
        },
      };

      expect(validateJsonAndGetSize(nestedObject)).toStrictEqual({
        valid: true,
        result: {
          foo: {
            foo: 'foo bar baz',
            baz: 'foo bar baz',
          },
          bar: {
            baz: {
              foo: 'foo bar baz',
              baz: 'foo bar baz',
            },
            qux: [
              {
                quux: [
                  [
                    [
                      {
                        foo: 'foo bar baz',
                        baz: 'foo bar baz',
                      },
                    ],
                  ],
                ],
              },
            ],
          },
        },
        size: 170,
      });

      // @ts-expect-error `toJSON` is not a function.
      // eslint-disable-next-line no-extend-native
      String.prototype.toJSON = undefined;
    });
  });
});
