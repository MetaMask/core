import {
  isRequest,
  isNotification,
  stringify,
  JsonRpcEngineError,
  isInstance,
} from './utils';

const jsonrpc = '2.0' as const;

describe('utils', () => {
  describe('isRequest', () => {
    it.each([
      [
        {
          jsonrpc,
          id: 1,
          method: 'eth_getBlockByNumber',
          params: ['latest'],
        },
        true,
      ],
      [
        {
          jsonrpc,
          method: 'eth_getBlockByNumber',
          params: ['latest'],
        },
        false,
      ],
    ])('returns $expected for $request', (request, expected) => {
      expect(isRequest(request)).toBe(expected);
    });
  });

  describe('isNotification', () => {
    it.each([
      [{ jsonrpc, method: 'eth_getBlockByNumber', params: ['latest'] }, true],
      [
        { id: 1, jsonrpc, method: 'eth_getBlockByNumber', params: ['latest'] },
        false,
      ],
    ])('returns $expected for $request', (request, expected) => {
      expect(isNotification(request)).toBe(expected);
    });
  });

  describe('stringify', () => {
    it('stringifies a JSON object', () => {
      expect(stringify({ foo: 'bar' })).toMatchInlineSnapshot(`
        "{
          \\"foo\\": \\"bar\\"
        }"
      `);
    });
  });

  describe('isInstance', () => {
    const TestClassSymbol = Symbol('TestClass');

    class TestClass {
      // This is a computed property name, and it doesn't seem possible to make
      // it hash private using `#`.
      // eslint-disable-next-line no-restricted-syntax
      private readonly [TestClassSymbol] = true;
    }

    it('identifies class instances via the symbol property', () => {
      const value = new TestClass();
      expect(isInstance(value, TestClassSymbol)).toBe(true);
    });

    it('identifies plain objects via the symbol property', () => {
      const value = { [TestClassSymbol]: true };
      expect(isInstance(value, TestClassSymbol)).toBe(true);
    });

    it('identifies sub-classes of the class via the symbol property', () => {
      class SubClass extends TestClass {}
      const value = new SubClass();
      expect(isInstance(value, TestClassSymbol)).toBe(true);
    });
  });

  describe('JsonRpcEngineError', () => {
    it('creates an error with the correct name', () => {
      const error = new JsonRpcEngineError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('JsonRpcEngineError');
      expect(error.message).toBe('test');
    });

    it('identifies JsonRpcEngineError instances via isInstance', () => {
      const error = new JsonRpcEngineError('test');

      expect(JsonRpcEngineError.isInstance(error)).toBe(true);
      expect(JsonRpcEngineError.isInstance(new Error('test'))).toBe(false);
    });
  });
});
