import {
  validate,
  assert as superstructAssert,
  is,
  string,
  union,
  literal,
  max,
  number,
  optional,
} from '@metamask/superstruct';

import {
  assert,
  assertIsJsonRpcError,
  assertIsJsonRpcFailure,
  assertIsJsonRpcNotification,
  assertIsJsonRpcRequest,
  assertIsJsonRpcResponse,
  assertIsJsonRpcSuccess,
  assertIsPendingJsonRpcResponse,
  getJsonRpcIdValidator,
  getJsonSize,
  getSafeJson,
  isJsonRpcError,
  isJsonRpcFailure,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  isJsonRpcSuccess,
  isPendingJsonRpcResponse,
  isValidJson,
  object,
  exactOptional,
  JsonStruct,
} from '.';
import {
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

jest.mock('@metamask/superstruct', () => ({
  ...jest.requireActual('@metamask/superstruct'),
  assert: jest.fn(),
}));

describe('object', () => {
  it('validates an object', () => {
    expect(
      is(
        {
          foo: 'bar',
        },
        object({
          foo: string(),
        }),
      ),
    ).toBe(true);

    expect(
      is(
        {
          foo: 123,
        },
        object({
          foo: string(),
        }),
      ),
    ).toBe(false);
  });

  it('validates an object with exact optional values', () => {
    expect(
      is(
        {
          foo: 'bar',
        },
        object({
          foo: exactOptional(string()),
        }),
      ),
    ).toBe(true);

    expect(
      is(
        {},
        object({
          foo: exactOptional(string()),
        }),
      ),
    ).toBe(true);

    expect(
      is(
        {
          foo: undefined,
        },
        object({
          foo: exactOptional(string()),
        }),
      ),
    ).toBe(false);
  });

  it('validates an object with other values', () => {
    expect(
      is(
        {
          foo: 123,
        },
        object({
          foo: number(),
        }),
      ),
    ).toBe(true);

    expect(
      is(
        {
          foo: 123,
        },
        object({
          foo: string(),
        }),
      ),
    ).toBe(false);

    expect(
      is(
        {
          foo: undefined,
        },
        object({
          foo: optional(string()),
        }),
      ),
    ).toBe(true);

    expect(
      is(
        {
          foo: 'bar',
        },
        object({
          foo: optional(string()),
        }),
      ),
    ).toBe(true);
  });
});

describe('exactOptional', () => {
  const simpleStruct = object({
    foo: exactOptional(string()),
  });

  it.each([
    { struct: simpleStruct, obj: {}, expected: true },
    { struct: simpleStruct, obj: { foo: undefined }, expected: false },
    { struct: simpleStruct, obj: { foo: 'hi' }, expected: true },
    { struct: simpleStruct, obj: { bar: 'hi' }, expected: false },
    { struct: simpleStruct, obj: { foo: 1 }, expected: false },
  ])(
    'returns $expected for is($obj, <struct>)',
    ({ struct, obj, expected }) => {
      expect(is(obj, struct)).toBe(expected);
    },
  );

  const nestedStruct = object({
    foo: object({
      bar: exactOptional(string()),
    }),
  });

  it.each([
    { struct: nestedStruct, obj: { foo: {} }, expected: true },
    { struct: nestedStruct, obj: { foo: { bar: 'hi' } }, expected: true },
    {
      struct: nestedStruct,
      obj: { foo: { bar: undefined } },
      expected: false,
    },
  ])(
    'returns $expected for is($obj, <struct>)',
    ({ struct, obj, expected }) => {
      expect(is(obj, struct)).toBe(expected);
    },
  );

  const structWithUndefined = object({
    foo: exactOptional(union([string(), literal(undefined)])),
  });

  it.each([
    { struct: structWithUndefined, obj: {}, expected: true },
    { struct: structWithUndefined, obj: { foo: undefined }, expected: true },
    { struct: structWithUndefined, obj: { foo: 'hi' }, expected: true },
    { struct: structWithUndefined, obj: { bar: 'hi' }, expected: false },
    { struct: structWithUndefined, obj: { foo: 1 }, expected: false },
  ])(
    'returns $expected for is($obj, <struct>)',
    ({ struct, obj, expected }) => {
      expect(is(obj, struct)).toBe(expected);
    },
  );

  it('supports refinements', () => {
    const struct = object({
      foo: exactOptional(max(number(), 0)),
    });

    expect(is({ foo: 0 }, struct)).toBe(true);
    expect(is({ foo: -1 }, struct)).toBe(true);
    expect(is({ foo: 1 }, struct)).toBe(false);
  });
});

describe('json', () => {
  beforeEach(() => {
    const actual = jest.requireActual('@metamask/superstruct');
    (
      superstructAssert as jest.MockedFunction<typeof superstructAssert>
    ).mockImplementation(actual.assert);
  });

  describe('JsonStruct', () => {
    it('returns error message', () => {
      const [error] = validate(undefined, JsonStruct);
      assert(error !== undefined);
      expect(error.message).toBe(
        'Expected a value of type `JSON`, but received: `undefined`',
      );
    });

    it('returns a readable error message for a nested JsonStruct', () => {
      const struct = object({
        value: JsonStruct,
      });

      const [error] = validate({ value: undefined }, struct);
      assert(error !== undefined);
      expect(error.message).toBe(
        'At path: value -- Expected a value of type `JSON`, but received: `undefined`',
      );
    });
  });

  describe('getSafeJson', () => {
    it('should return sanitized JSON', () => {
      type TestSubjectType = {
        a: { value: string };
        jailbreak?: number;
      };
      // Make sure that getters cannot have side effect
      const testSubject: TestSubjectType = { a: { value: 'a' } };
      let counter = 0;
      Object.defineProperty(testSubject, 'jailbreak', {
        enumerable: true,
        get() {
          counter += 1;
          return counter;
        },
        set(value) {
          return (counter = value);
        },
      });
      const result = getSafeJson<TestSubjectType>(testSubject);

      // Check that the counter is not increasing
      expect(result.jailbreak).toStrictEqual(result.jailbreak);
      // Check that it's a value, not a getter explicitly
      const descriptor = Object.getOwnPropertyDescriptor(result, 'jailbreak');
      expect(descriptor?.value).toBe(result.jailbreak);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(descriptor?.get).toBeUndefined();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(descriptor?.set).toBeUndefined();
    });

    it('strips __proto__ and constructor', () => {
      const input =
        '{ "test": { "__proto__": { "foo": "bar" } }, "test2": { "constructor": { "baz": "qux" } } }';
      const parsed = JSON.parse(input);
      expect(getSafeJson(parsed)).toStrictEqual({ test: {}, test2: {} });
    });
  });

  describe('isValidJson', () => {
    it.each(JSON_FIXTURES.valid)('identifies valid JSON values', (value) => {
      expect(isValidJson(value)).toBe(true);
    });

    it.each(JSON_VALIDATION_FIXTURES)(
      'works on complex object %o',
      ({ value, valid }) => {
        expect(isValidJson(value)).toBe(valid);
      },
    );

    it.each(JSON_FIXTURES.invalid)(
      'identifies invalid JSON values',
      (value) => {
        expect(isValidJson(value)).toBe(false);
      },
    );
  });

  describe('getJsonSize', () => {
    it.each(JSON_VALIDATION_FIXTURES.filter((fixture) => fixture.valid))(
      'returns the size of %o',
      ({ value, size }) => {
        expect(getJsonSize(value)).toBe(size);
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

    it('is fast for large inputs', () => {
      const request = {
        jsonrpc: '2.0',
        id: 'foo',
        method: 'wallet_invokeSnap',
        params: {
          snapId: 'npm:@metamask/manage-state-example-snap',
          request: {
            method: 'setState',
            params: { items: new Array(9999999).fill(2) },
          },
        },
      };
      expect(() => assertIsJsonRpcRequest(request)).not.toThrow();
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
});
