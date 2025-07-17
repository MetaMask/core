import { produce } from 'immer';

import {
  isRequest,
  isNotification,
  stringify,
  JsonRpcEngineError,
  cloneRequest,
} from './utils';
import type { JsonRpcCall } from './utils';

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

  describe('cloneRequest', () => {
    it('should clone a request', () => {
      let clonedRequest: JsonRpcCall | undefined;

      const producedRequest = produce(
        {
          jsonrpc,
          id: 1,
          method: 'eth_getBlockByNumber',
          params: ['latest'],
        },
        (draft) => {
          clonedRequest = cloneRequest(draft);
          draft.id = 2;
        },
      );

      expect(clonedRequest).toStrictEqual({
        jsonrpc,
        id: 1,
        method: 'eth_getBlockByNumber',
        params: ['latest'],
      });
      expect(producedRequest).not.toBe(clonedRequest);
      expect(producedRequest.id).toBe(2);
    });
  });
});
