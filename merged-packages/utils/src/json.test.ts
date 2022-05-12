import {
  jsonrpc2,
  isJsonRpcSuccess,
  JsonRpcError,
  isJsonRpcFailure,
  isValidJson,
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
});
