import {
  assertIsJsonRpcFailure,
  assertIsJsonRpcNotification,
  assertIsJsonRpcRequest,
  assertIsJsonRpcSuccess,
  getJsonRpcIdValidator,
  isJsonRpcFailure,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcSuccess,
  isValidJson,
  jsonrpc2,
  JsonRpcError,
} from '.';

const getError = () => {
  const error: any = new Error('bar');
  error.code = 2;
  return error as JsonRpcError;
};

describe('json', () => {
  // TODO: Make this test suite exhaustive.
  // The current implementation is guaranteed to be correct, but in the future
  // we may opt for a bespoke implementation that is more performant, but may
  // contain bugs.
  describe('isValidJson', () => {
    it('identifies valid JSON values', () => {
      [
        null,
        { a: 1 },
        ['a', 2, null],
        [{ a: null, b: 2, c: [{ foo: 'bar' }] }],
      ].forEach((validValue) => {
        expect(isValidJson(validValue)).toBe(true);
      });

      [
        undefined,
        Symbol('bar'),
        Promise.resolve(),
        () => 'foo',
        [{ a: undefined }],
      ].forEach((invalidValue) => {
        expect(isValidJson(invalidValue)).toBe(false);
      });
    });
  });

  describe('isJsonRpcNotification', () => {
    it('identifies a JSON-RPC notification', () => {
      expect(
        isJsonRpcNotification({
          jsonrpc: jsonrpc2,
          method: 'foo',
        }),
      ).toBe(true);
    });

    it('identifies a JSON-RPC request', () => {
      expect(
        isJsonRpcNotification({
          jsonrpc: jsonrpc2,
          id: 1,
          method: 'foo',
        }),
      ).toBe(false);
    });
  });

  describe('assertIsJsonRpcNotification', () => {
    it('identifies JSON-RPC notification objects', () => {
      [
        { jsonrpc: jsonrpc2, method: 'foo' },
        { jsonrpc: jsonrpc2, method: 'bar', params: ['baz'] },
      ].forEach((input) => {
        expect(() => assertIsJsonRpcNotification(input)).not.toThrow();
      });

      [
        { id: 1, jsonrpc: jsonrpc2, method: 'foo' },
        { id: 1, jsonrpc: jsonrpc2, method: 'bar', params: ['baz'] },
      ].forEach((input) => {
        expect(() => assertIsJsonRpcNotification(input)).toThrow(
          'Not a JSON-RPC notification.',
        );
      });
    });
  });

  describe('isJsonRpcRequest', () => {
    it('identifies a JSON-RPC notification', () => {
      expect(
        isJsonRpcRequest({
          id: 1,
          jsonrpc: jsonrpc2,
          method: 'foo',
        }),
      ).toBe(true);
    });

    it('identifies a JSON-RPC request', () => {
      expect(
        isJsonRpcRequest({
          jsonrpc: jsonrpc2,
          method: 'foo',
        }),
      ).toBe(false);
    });
  });

  describe('assertIsJsonRpcRequest', () => {
    it('identifies JSON-RPC notification objects', () => {
      [
        { id: 1, jsonrpc: jsonrpc2, method: 'foo' },
        { id: 1, jsonrpc: jsonrpc2, method: 'bar', params: ['baz'] },
      ].forEach((input) => {
        expect(() => assertIsJsonRpcRequest(input)).not.toThrow();
      });

      [
        { jsonrpc: jsonrpc2, method: 'foo' },
        { jsonrpc: jsonrpc2, method: 'bar', params: ['baz'] },
      ].forEach((input) => {
        expect(() => assertIsJsonRpcRequest(input)).toThrow(
          'Not a JSON-RPC request.',
        );
      });
    });
  });

  describe('isJsonRpcSuccess', () => {
    it('identifies a successful JSON-RPC response', () => {
      expect(
        isJsonRpcSuccess({
          jsonrpc: jsonrpc2,
          id: 1,
          result: 'foo',
        }),
      ).toBe(true);
    });

    it('identifies a failed JSON-RPC response', () => {
      expect(
        isJsonRpcSuccess({
          jsonrpc: jsonrpc2,
          id: 1,
          error: getError(),
        }),
      ).toBe(false);
    });
  });

  describe('assertIsJsonRpcSuccess', () => {
    it('identifies JSON-RPC response objects', () => {
      [
        { id: 1, jsonrpc: jsonrpc2, result: 'success' },
        { id: 1, jsonrpc: jsonrpc2, result: null },
      ].forEach((input) => {
        expect(() => assertIsJsonRpcSuccess(input)).not.toThrow();
      });

      [
        { id: 1, jsonrpc: jsonrpc2, error: getError() },
        { id: 1, jsonrpc: jsonrpc2, error: null as any },
      ].forEach((input) => {
        expect(() => assertIsJsonRpcSuccess(input)).toThrow(
          'Not a successful JSON-RPC response.',
        );
      });
    });
  });

  describe('isJsonRpcFailure', () => {
    it('identifies a failed JSON-RPC response', () => {
      expect(
        isJsonRpcFailure({
          jsonrpc: jsonrpc2,
          id: 1,
          error: getError(),
        }),
      ).toBe(true);
    });

    it('identifies a successful JSON-RPC response', () => {
      expect(
        isJsonRpcFailure({
          jsonrpc: jsonrpc2,
          id: 1,
          result: 'foo',
        }),
      ).toBe(false);
    });
  });

  describe('assertIsJsonRpcFailure', () => {
    it('identifies JSON-RPC response objects', () => {
      ([{ error: 'failure' }, { error: null }] as any[]).forEach((input) => {
        expect(() => assertIsJsonRpcFailure(input)).not.toThrow();
      });

      ([{ result: 'success' }, {}] as any[]).forEach((input) => {
        expect(() => assertIsJsonRpcFailure(input)).toThrow(
          'Not a failed JSON-RPC response.',
        );
      });
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
});
