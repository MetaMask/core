import {
  isRequest,
  isNotification,
  stringify,
  JsonRpcEngineError,
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
    ])('should return $expected for $request', (request, expected) => {
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
    ])('should return $expected for $request', (request, expected) => {
      expect(isNotification(request)).toBe(expected);
    });
  });

  describe('stringify', () => {
    it('should stringify a JSON object', () => {
      expect(stringify({ foo: 'bar' })).toMatchInlineSnapshot(`
        "{
          \\"foo\\": \\"bar\\"
        }"
      `);
    });
  });

  describe('JsonRpcEngineError', () => {
    it('should create an error with the correct name', () => {
      const error = new JsonRpcEngineError('test');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('JsonRpcEngineError');
      expect(error.message).toBe('test');
    });
  });
});
