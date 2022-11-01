import * as superstructModule from 'superstruct';
import {
  ARRAY_OF_DIFFRENT_KINDS_OF_NUMBERS,
  ARRAY_OF_MIXED_SPECIAL_OBJECTS,
  COMPLEX_OBJECT,
  JSON_FIXTURES,
  JSON_RPC_ERROR_FIXTURES,
  JSON_RPC_FAILURE_FIXTURES,
  JSON_RPC_NOTIFICATION_FIXTURES,
  JSON_RPC_PENDING_RESPONSE_FIXTURES,
  JSON_RPC_REQUEST_FIXTURES,
  JSON_RPC_RESPONSE_FIXTURES,
  JSON_RPC_SUCCESS_FIXTURES,
  NON_SERIALIZABLE_NESTED_OBJECT,
  OBJECT_MIXED_WITH_UNDEFINED_VALUES,
} from './__fixtures__';
import {
  assertIsJsonRpcFailure,
  assertIsJsonRpcNotification,
  assertIsJsonRpcRequest,
  assertIsJsonRpcResponse,
  assertIsJsonRpcSuccess,
  assertIsPendingJsonRpcResponse,
  getJsonRpcIdValidator,
  isJsonRpcFailure,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  isJsonRpcSuccess,
  isPendingJsonRpcResponse,
  isValidJson,
  validateJsonAndGetSize,
  isJsonRpcError,
  assertIsJsonRpcError,
} from '.';

describe('json', () => {
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
          'Not a JSON-RPC notification',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcNotification(JSON_RPC_NOTIFICATION_FIXTURES.invalid[0]),
      ).toThrow(
        'Not a JSON-RPC notification: At path: jsonrpc -- Expected the literal `"2.0"`, but received: undefined.',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      jest.spyOn(superstructModule, 'assert').mockImplementation(() => {
        throw 'oops';
      });

      expect(() =>
        assertIsJsonRpcNotification(JSON_RPC_NOTIFICATION_FIXTURES.invalid[0]),
      ).toThrow('Not a JSON-RPC notification: oops');
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
          'Not a JSON-RPC request',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcRequest(JSON_RPC_REQUEST_FIXTURES.invalid[0]),
      ).toThrow(
        'Not a JSON-RPC request: At path: id -- Expected the value to satisfy a union of `number | string`, but received: undefined.',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      jest.spyOn(superstructModule, 'assert').mockImplementation(() => {
        throw 'oops';
      });

      expect(() =>
        assertIsJsonRpcRequest(JSON_RPC_REQUEST_FIXTURES.invalid[0]),
      ).toThrow('Not a JSON-RPC request: oops');
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
          'Not a successful JSON-RPC response',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcSuccess(JSON_RPC_SUCCESS_FIXTURES.invalid[0]),
      ).toThrow(
        'Not a successful JSON-RPC response: At path: id -- Expected the value to satisfy a union of `number | string`, but received: undefined.',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      jest.spyOn(superstructModule, 'assert').mockImplementation(() => {
        throw 'oops';
      });

      expect(() =>
        assertIsJsonRpcSuccess(JSON_RPC_SUCCESS_FIXTURES.invalid[0]),
      ).toThrow('Not a successful JSON-RPC response: oops');
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
          'Not a failed JSON-RPC response',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcFailure(JSON_RPC_FAILURE_FIXTURES.invalid[0]),
      ).toThrow(
        'Not a failed JSON-RPC response: At path: id -- Expected the value to satisfy a union of `number | string`, but received: undefined.',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      jest.spyOn(superstructModule, 'assert').mockImplementation(() => {
        throw 'oops';
      });

      expect(() =>
        assertIsJsonRpcFailure(JSON_RPC_FAILURE_FIXTURES.invalid[0]),
      ).toThrow('Not a failed JSON-RPC response: oops');
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
          'Not a JSON-RPC error',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcError(JSON_RPC_ERROR_FIXTURES.invalid[0]),
      ).toThrow(
        'Not a JSON-RPC error: At path: code -- Expected an integer, but received: undefined.',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      jest.spyOn(superstructModule, 'assert').mockImplementation(() => {
        throw 'oops';
      });

      expect(() =>
        assertIsJsonRpcError(JSON_RPC_ERROR_FIXTURES.invalid[0]),
      ).toThrow('Not a JSON-RPC error: oops');
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
          'Not a pending JSON-RPC response',
        );
      },
    );

    it('includes the value thrown in the message if it is not an error', () => {
      jest.spyOn(superstructModule, 'assert').mockImplementation(() => {
        throw 'oops';
      });

      expect(() =>
        assertIsPendingJsonRpcResponse(JSON_RPC_FAILURE_FIXTURES.invalid[0]),
      ).toThrow('Not a pending JSON-RPC response: oops');
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
          'Not a JSON-RPC response',
        );
      },
    );

    it('includes the reason in the error message', () => {
      expect(() =>
        assertIsJsonRpcResponse(JSON_RPC_RESPONSE_FIXTURES.invalid[0]),
      ).toThrow(
        'Not a JSON-RPC response: Expected the value to satisfy a union of `object | object`, but received: [object Object].',
      );
    });

    it('includes the value thrown in the message if it is not an error', () => {
      jest.spyOn(superstructModule, 'assert').mockImplementation(() => {
        throw 'oops';
      });

      expect(() =>
        assertIsJsonRpcResponse(JSON_RPC_RESPONSE_FIXTURES.invalid[0]),
      ).toThrow('Not a JSON-RPC response: oops');
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
      validate: ReturnType<typeof getJsonRpcIdValidator>,
      inputs: ReturnType<typeof getInputs>,
    ) => {
      for (const input of Object.values(inputs)) {
        expect(validate(input.value)).toStrictEqual(input.expected);
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
    it('should return true for serialization and 10 for a size', () => {
      const valueToSerialize = {
        a: 'bc',
      };

      expect(validateJsonAndGetSize(valueToSerialize)).toStrictEqual([
        true,
        10,
      ]);
    });

    it('should return true for serialization and 11 for a size', () => {
      const valueToSerialize = {
        a: 1234,
      };

      expect(validateJsonAndGetSize(valueToSerialize)).toStrictEqual([
        true,
        10,
      ]);
    });

    it('should return true for serialization and 16 for a size when mixed UTF8 and ASCII values are used', () => {
      const valueToSerialize = {
        a: 'bcšečf',
      };

      expect(validateJsonAndGetSize(valueToSerialize)).toStrictEqual([
        true,
        16,
      ]);
    });

    it('should return true for serialization and 2 for a size when only one key with undefined value is provided', () => {
      const valueToSerialize = {
        a: undefined,
      };

      expect(validateJsonAndGetSize(valueToSerialize)).toStrictEqual([true, 2]);
    });

    it('should return true for serialization and 25 for a size when some of the values are undefined', () => {
      expect(
        validateJsonAndGetSize(OBJECT_MIXED_WITH_UNDEFINED_VALUES),
      ).toStrictEqual([true, 25]);
    });

    it('should return true for serialization and 17 for a size with mixed null and undefined in an array', () => {
      expect(
        validateJsonAndGetSize(ARRAY_OF_MIXED_SPECIAL_OBJECTS),
      ).toStrictEqual([true, 51]);
    });

    it('should return true for serialization and 73 for a size, for an array of numbers', () => {
      expect(
        validateJsonAndGetSize(ARRAY_OF_DIFFRENT_KINDS_OF_NUMBERS),
      ).toStrictEqual([true, 73]);
    });

    it('should return true for serialization and 1259 for a size of a complex nested object', () => {
      expect(validateJsonAndGetSize(COMPLEX_OBJECT)).toStrictEqual([
        true,
        1259,
      ]);
    });

    it('should return true for serialization and 107 for a size of an object containing Date object', () => {
      const dateObjects = {
        dates: {
          someDate: new Date(),
          someOther: new Date(2022, 0, 2, 15, 4, 5),
          invalidDate: new Date('bad-date-format'),
        },
      };
      expect(validateJsonAndGetSize(dateObjects)).toStrictEqual([true, 107]);
    });

    it('should return false for serialization and 0 for size when non-serializable nested object was provided', () => {
      expect(
        NON_SERIALIZABLE_NESTED_OBJECT.levelOne.levelTwo.levelThree.levelFour.levelFive(),
      ).toStrictEqual('anything');

      expect(
        validateJsonAndGetSize(NON_SERIALIZABLE_NESTED_OBJECT),
      ).toStrictEqual([false, 0]);
    });

    it('should return true for serialization and 0 for a size when sizing is skipped', () => {
      expect(validateJsonAndGetSize(COMPLEX_OBJECT, true)).toStrictEqual([
        true,
        0,
      ]);
    });

    it('should return false for serialization and 0 for a size when sizing is skipped and non-serializable object was provided', () => {
      expect(
        validateJsonAndGetSize(NON_SERIALIZABLE_NESTED_OBJECT, true),
      ).toStrictEqual([false, 0]);
    });

    it('should return false for serialization and 0 for a size when checking object containing symbols', () => {
      const objectContainingSymbols = {
        mySymbol: Symbol('MySymbol'),
      };
      expect(validateJsonAndGetSize(objectContainingSymbols)).toStrictEqual([
        false,
        0,
      ]);
    });

    it('should return false for serialization and 0 for a size when checking an array containing a function', () => {
      const objectContainingFunction = [
        function () {
          return 'whatever';
        },
      ];
      expect(validateJsonAndGetSize(objectContainingFunction)).toStrictEqual([
        false,
        0,
      ]);
    });

    it('should return true or false for validity depending on the test scenario from ECMA TC39 (test262)', () => {
      // This test will perform a series of validation assertions.
      // These tests are taken from ECMA TC39 (test262) test scenarios used
      // for testing the JSON.stringify function.
      // https://github.com/tc39/test262/tree/main/test/built-ins/JSON/stringify

      // Value: array proxy revoked
      const handle = Proxy.revocable([], {});
      handle.revoke();

      expect(validateJsonAndGetSize(handle.proxy)).toStrictEqual([false, 0]);
      expect(validateJsonAndGetSize([[[handle.proxy]]])).toStrictEqual([
        false,
        0,
      ]);

      // Value: array proxy
      const arrayProxy = new Proxy([], {
        get(_target, key) {
          if (key === 'length') {
            return 2;
          }
          return Number(key);
        },
      });

      expect(validateJsonAndGetSize(arrayProxy, true)).toStrictEqual([true, 0]);

      expect(validateJsonAndGetSize([[arrayProxy]], true)).toStrictEqual([
        true,
        0,
      ]);

      const arrayProxyProxy = new Proxy(arrayProxy, {});
      expect(validateJsonAndGetSize([[arrayProxyProxy]], true)).toStrictEqual([
        true,
        0,
      ]);

      // Value: Boolean object
      // eslint-disable-next-line no-new-wrappers
      expect(validateJsonAndGetSize(new Boolean(true), true)).toStrictEqual([
        true,
        0,
      ]);

      expect(
        // eslint-disable-next-line no-new-wrappers
        validateJsonAndGetSize({ key: new Boolean(false) }, true),
      ).toStrictEqual([true, 0]);

      expect(
        // eslint-disable-next-line no-new-wrappers
        validateJsonAndGetSize(new Boolean(false)),
      ).toStrictEqual([true, 5]);

      expect(
        // eslint-disable-next-line no-new-wrappers
        validateJsonAndGetSize(new Boolean(true)),
      ).toStrictEqual([true, 4]);

      // Value: number negative zero
      expect(validateJsonAndGetSize(-0, true)).toStrictEqual([true, 0]);
      expect(validateJsonAndGetSize(['-0', 0, -0], true)).toStrictEqual([
        true,
        0,
      ]);

      expect(validateJsonAndGetSize({ key: -0 }, true)).toStrictEqual([
        true,
        0,
      ]);

      // Value: number non finite
      expect(validateJsonAndGetSize(Infinity, true)).toStrictEqual([true, 0]);
      expect(validateJsonAndGetSize({ key: -Infinity }, true)).toStrictEqual([
        true,
        0,
      ]);
      expect(validateJsonAndGetSize([NaN], true)).toStrictEqual([true, 0]);

      // Value: object abrupt
      expect(
        validateJsonAndGetSize(
          {
            get key() {
              throw new Error();
            },
          },
          true,
        ),
      ).toStrictEqual([false, 0]);

      // Value: Number object
      // eslint-disable-next-line no-new-wrappers
      expect(validateJsonAndGetSize(new Number(3.14), true)).toStrictEqual([
        true,
        0,
      ]);

      // eslint-disable-next-line no-new-wrappers
      expect(validateJsonAndGetSize(new Number(3.14))).toStrictEqual([true, 4]);

      // Value: object proxy
      const objectProxy = new Proxy(
        {},
        {
          getOwnPropertyDescriptor() {
            return {
              value: 1,
              writable: true,
              enumerable: true,
              configurable: true,
            };
          },
          get() {
            return 1;
          },
          ownKeys() {
            return ['a', 'b'];
          },
        },
      );

      expect(validateJsonAndGetSize(objectProxy, true)).toStrictEqual([
        true,
        0,
      ]);

      expect(
        validateJsonAndGetSize({ l1: { l2: objectProxy } }, true),
      ).toStrictEqual([true, 0]);

      // Value: object proxy revoked
      const handleForObjectProxy = Proxy.revocable({}, {});
      handleForObjectProxy.revoke();
      expect(
        validateJsonAndGetSize(handleForObjectProxy.proxy, true),
      ).toStrictEqual([false, 0]);

      expect(
        validateJsonAndGetSize({ a: { b: handleForObjectProxy.proxy } }, true),
      ).toStrictEqual([false, 0]);

      // Value: primitive top level
      expect(validateJsonAndGetSize(null, true)).toStrictEqual([true, 0]);
      expect(validateJsonAndGetSize(true, true)).toStrictEqual([true, 0]);
      expect(validateJsonAndGetSize(false, true)).toStrictEqual([true, 0]);
      expect(validateJsonAndGetSize('str', true)).toStrictEqual([true, 0]);
      expect(validateJsonAndGetSize(123, true)).toStrictEqual([true, 0]);
      expect(validateJsonAndGetSize(undefined, true)).toStrictEqual([true, 0]);

      // Value: string escape ASCII
      const charToJson = {
        '"': '\\"',
        '\\': '\\\\',
        '\x00': '\\u0000',
        '\x01': '\\u0001',
        '\x02': '\\u0002',
        '\x03': '\\u0003',
        '\x04': '\\u0004',
        '\x05': '\\u0005',
        '\x06': '\\u0006',
        '\x07': '\\u0007',
        '\x08': '\\b',
        '\x09': '\\t',
        '\x0A': '\\n',
        '\x0B': '\\u000b',
        '\x0C': '\\f',
        '\x0D': '\\r',
        '\x0E': '\\u000e',
        '\x0F': '\\u000f',
        '\x10': '\\u0010',
        '\x11': '\\u0011',
        '\x12': '\\u0012',
        '\x13': '\\u0013',
        '\x14': '\\u0014',
        '\x15': '\\u0015',
        '\x16': '\\u0016',
        '\x17': '\\u0017',
        '\x18': '\\u0018',
        '\x19': '\\u0019',
        '\x1A': '\\u001a',
        '\x1B': '\\u001b',
        '\x1C': '\\u001c',
        '\x1D': '\\u001d',
        '\x1E': '\\u001e',
        '\x1F': '\\u001f',
      };

      const chars = Object.keys(charToJson).join('');
      const charsReversed = Object.keys(charToJson).reverse().join('');
      const jsonChars = Object.values(charToJson).join('');
      const jsonCharsReversed = Object.values(charToJson).reverse().join('');

      expect(validateJsonAndGetSize(charToJson, true)).toStrictEqual([true, 0]);

      // eslint-disable-next-line guard-for-in
      for (const char in charToJson) {
        expect(validateJsonAndGetSize(char, true)).toStrictEqual([true, 0]);
      }

      expect(validateJsonAndGetSize(chars, true)).toStrictEqual([true, 0]);
      expect(validateJsonAndGetSize(charsReversed, true)).toStrictEqual([
        true,
        0,
      ]);
      expect(validateJsonAndGetSize(jsonChars, true)).toStrictEqual([true, 0]);
      expect(validateJsonAndGetSize(jsonCharsReversed, true)).toStrictEqual([
        true,
        0,
      ]);

      // Value: string escape unicode
      const stringEscapeUnicode: string[] = [
        '\uD834',
        '\uDF06',
        '\uD834\uDF06',
        '\uD834\uD834\uDF06\uD834',
        '\uD834\uD834\uDF06\uDF06',
        '\uDF06\uD834\uDF06\uD834',
        '\uDF06\uD834\uDF06\uDF06',
        '\uDF06\uD834',
        '\uD834\uDF06\uD834\uD834',
        '\uD834\uDF06\uD834\uDF06',
        '\uDF06\uDF06\uD834\uD834',
        '\uDF06\uDF06\uD834\uDF06',
      ];

      // eslint-disable-next-line guard-for-in
      for (const strUnicode in stringEscapeUnicode) {
        expect(validateJsonAndGetSize(strUnicode, true)).toStrictEqual([
          true,
          0,
        ]);
      }

      // Value: string object
      // eslint-disable-next-line no-new-wrappers
      expect(validateJsonAndGetSize(new String('str'), true)).toStrictEqual([
        true,
        0,
      ]);

      // eslint-disable-next-line no-new-wrappers
      expect(validateJsonAndGetSize(new String('str'))).toStrictEqual([
        true,
        5,
      ]);

      // Value: toJSON not a function
      expect(validateJsonAndGetSize({ toJSON: null }, true)).toStrictEqual([
        true,
        0,
      ]);

      expect(validateJsonAndGetSize({ toJSON: false }, true)).toStrictEqual([
        true,
        0,
      ]);

      expect(validateJsonAndGetSize({ toJSON: [] }, true)).toStrictEqual([
        true,
        0,
      ]);

      // Value: array circular
      const direct: unknown[] = [];
      direct.push(direct);

      expect(validateJsonAndGetSize(direct)).toStrictEqual([false, 0]);

      const indirect: unknown[] = [];
      indirect.push([[indirect]]);

      expect(validateJsonAndGetSize(indirect)).toStrictEqual([false, 0]);

      // Value: object circular
      const directObject = { prop: {} };
      directObject.prop = directObject;

      expect(validateJsonAndGetSize(directObject, false)).toStrictEqual([
        false,
        0,
      ]);

      const indirectObject = {
        p1: {
          p2: {
            get p3() {
              return indirectObject;
            },
          },
        },
      };

      expect(validateJsonAndGetSize(indirectObject, false)).toStrictEqual([
        false,
        0,
      ]);

      // Value: toJSON object circular
      const obj = {
        toJSON() {
          return {};
        },
      };
      const circular = { prop: obj };

      obj.toJSON = function () {
        return circular;
      };

      expect(validateJsonAndGetSize(circular, true)).toStrictEqual([false, 0]);
    });

    it('should return false for validation for an object that contains nested circular references', () => {
      const circularStructure = {
        levelOne: {
          levelTwo: {
            levelThree: {
              levelFour: {
                levelFive: {},
              },
            },
          },
        },
      };
      circularStructure.levelOne.levelTwo.levelThree.levelFour.levelFive =
        circularStructure;

      expect(validateJsonAndGetSize(circularStructure, false)).toStrictEqual([
        false,
        0,
      ]);
    });

    it('should return false for an object that contains multiple nested circular references', () => {
      const circularStructure = {
        levelOne: {
          levelTwo: {
            levelThree: {
              levelFour: {
                levelFive: {},
              },
            },
          },
        },
        anotherOne: {},
        justAnotherOne: {
          toAnotherOne: {
            andAnotherOne: {},
          },
        },
      };
      circularStructure.levelOne.levelTwo.levelThree.levelFour.levelFive =
        circularStructure;
      circularStructure.anotherOne = circularStructure;
      circularStructure.justAnotherOne.toAnotherOne.andAnotherOne =
        circularStructure;

      expect(validateJsonAndGetSize(circularStructure)).toStrictEqual([
        false,
        0,
      ]);
    });

    it('should return true for validity for an object that contains the same object multiple times', () => {
      // This will test if false positives are removed from the circular reference detection
      const date = new Date();
      const testObject = {
        value: 'whatever',
      };
      const objectToTest = {
        a: date,
        b: date,
        c: date,
        testOne: testObject,
        testTwo: testObject,
        testThree: {
          nestedObjectTest: {
            multipleTimes: {
              valueOne: testObject,
              valueTwo: testObject,
              valueThree: testObject,
              valueFour: testObject,
              valueFive: date,
              valueSix: {},
            },
          },
        },
        testFour: {},
        testFive: {
          something: null,
          somethingElse: null,
          anotherValue: null,
          somethingAgain: testObject,
          anotherOne: {
            nested: {
              multipleTimes: {
                valueOne: testObject,
              },
            },
          },
        },
      };

      expect(validateJsonAndGetSize(objectToTest, true)).toStrictEqual([
        true,
        0,
      ]);
    });
  });
});
