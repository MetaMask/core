import { JsonRpcError } from '@metamask/rpc-errors';
import type { Json } from '@metamask/utils';

import {
  deepClone,
  fromLegacyRequest,
  makeContext,
  propagateToContext,
  propagateToRequest,
  unserializeError,
} from './compatibility-utils';
import { MiddlewareContext } from './MiddlewareContext';
import { stringify } from './utils';

const jsonrpc = '2.0' as const;

describe('compatibility-utils', () => {
  describe('deepClone', () => {
    it('clones an object', () => {
      const request = {
        jsonrpc,
        method: 'test_method',
        params: [],
        id: 1,
      };
      const clonedRequest = deepClone(request);

      expect(clonedRequest).toStrictEqual(request);
      expect(clonedRequest).not.toBe(request);
    });
  });

  describe('fromLegacyRequest', () => {
    it('converts a request, preserving its properties', () => {
      const legacyRequest = {
        jsonrpc,
        method: 'test_method',
        params: [1, 2, 3],
        id: 42,
      };
      const request = fromLegacyRequest(legacyRequest);

      expect(request).toStrictEqual({
        jsonrpc,
        method: 'test_method',
        params: [1, 2, 3],
        id: 42,
      });
    });

    it('clones params to avoid freezing them as part of the new request object', () => {
      const params = [1, { a: 2 }];
      const legacyRequest = {
        jsonrpc,
        method: 'test_method',
        params,
        id: 42,
      };
      const request = fromLegacyRequest(legacyRequest);

      expect(request.params).toStrictEqual(params);
      expect(request.params).not.toBe(params);
      expect(request.params?.[1]).not.toBe(params[1]);
    });

    it('handles requests without params', () => {
      const legacyRequest = {
        jsonrpc,
        method: 'test_method',
        id: 42,
      };
      const request = fromLegacyRequest(legacyRequest);

      expect(request).toStrictEqual({
        jsonrpc,
        method: 'test_method',
        id: 42,
      });
    });

    it('handles requests with undefined params', () => {
      const legacyRequest = {
        jsonrpc,
        method: 'test_method',
        id: 42,
        params: undefined,
      };

      // @ts-expect-error - Intentional abuse
      const request = fromLegacyRequest(legacyRequest);

      expect(request).toStrictEqual({
        jsonrpc,
        method: 'test_method',
        id: 42,
      });
    });

    it('handles requests without a jsonrpc property', () => {
      const legacyRequest = {
        method: 'test_method',
        params: [1],
        id: 42,
      };

      // @ts-expect-error - Intentional abuse
      const request = fromLegacyRequest(legacyRequest);

      expect(request).toStrictEqual({
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
      });
    });

    it('handles requests with a faulty jsonrpc property', () => {
      const legacyRequest = {
        jsonrpc: '1.0',
        method: 'test_method',
        params: [1],
        id: 42,
      };

      // @ts-expect-error - Intentional abuse
      const request = fromLegacyRequest(legacyRequest);

      expect(request).toStrictEqual({
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
      });
    });

    it('ignores additional properties on the legacy request', () => {
      const legacyRequest = {
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
        extraProp: 'value',
        anotherProp: { nested: true },
      };
      const request = fromLegacyRequest(legacyRequest);

      expect(request).toStrictEqual({
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
      });
    });
  });

  describe('makeContext', () => {
    it('creates a middleware context from a valid JSON-RPC request', () => {
      const request = {
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
      };
      const context = makeContext(request);

      expect(context).toBeInstanceOf(MiddlewareContext);
      expect(Array.from(context.keys())).toStrictEqual([]);
    });

    it('includes non-JSON-RPC properties from request in context', () => {
      const request = {
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
        extraProp: 'value',
        anotherProp: { nested: true },
      };
      const context = makeContext(request);

      expect(Array.from(context.keys())).toStrictEqual([
        'extraProp',
        'anotherProp',
      ]);
    });
  });

  describe('propagateToContext', () => {
    it('copies non-JSON-RPC properties from request to context', () => {
      const request = {
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
        extraProp: 'value',
        anotherProp: { nested: true },
      };
      const context = new MiddlewareContext();

      propagateToContext(request, context);

      expect(Array.from(context.keys())).toStrictEqual([
        'extraProp',
        'anotherProp',
      ]);
    });

    it('handles requests with no extra properties', () => {
      const request = {
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
      };
      const context = new MiddlewareContext();

      propagateToContext(request, context);

      expect(Array.from(context.keys())).toStrictEqual([]);
    });
  });

  describe('propagateToRequest', () => {
    it('copies non-JSON-RPC string properties from context to request', () => {
      const request = {
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
      };
      const context = new MiddlewareContext();
      context.set('extraProp', 'value');
      context.set('anotherProp', { nested: true });

      propagateToRequest(request, context);

      expect(request).toStrictEqual({
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
        extraProp: 'value',
        anotherProp: { nested: true },
      });
    });

    it('does not copy non-string properties from context to request', () => {
      const request = {
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
      };
      const context = new MiddlewareContext();
      context.set('extraProp', 'value');
      context.set(Symbol('anotherProp'), { nested: true });

      propagateToRequest(request, context);

      expect(request).toStrictEqual({
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
        extraProp: 'value',
      });
    });

    it('excludes JSON-RPC properties from propagation', () => {
      const request = {
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
      };
      const context = new MiddlewareContext();
      context.set('jsonrpc', '3.0');
      context.set('method', 'other_method');
      context.set('params', [2]);
      context.set('id', 99);
      context.set('extraProp', 'value');

      propagateToRequest(request, context);

      expect(request).toStrictEqual({
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
        extraProp: 'value',
      });
    });

    it('overwrites existing request properties', () => {
      const request = {
        jsonrpc,
        method: 'test_method',
        params: [1],
        id: 42,
        existingKey: 'oldValue',
      };
      const context = new MiddlewareContext();
      context.set('existingKey', 'newValue');

      propagateToRequest(request, context);

      expect(request.existingKey).toBe('newValue');
    });
  });

  describe('unserializeError', () => {
    // Requires some special handling due to the possible existence or
    // non-existence of Error.isError
    describe('Error.isError', () => {
      const isErrorExists = 'isError' in Error;
      let originalIsError: (value: unknown) => boolean;
      let isError: jest.Mock<boolean, [unknown]>;

      beforeAll(() => {
        isError = jest.fn();
        // @ts-expect-error - Error type outdated
        originalIsError = Error.isError;
        // @ts-expect-error - Error type outdated
        Error.isError = isError;
      });

      beforeEach(() => {
        isError.mockClear();
      });

      afterAll(() => {
        if (isErrorExists) {
          // @ts-expect-error - Error type outdated
          Error.isError = originalIsError;
        } else {
          // @ts-expect-error - Error type outdated
          delete Error.isError;
        }
      });

      it('returns the thrown value when Error.isError is available and returns true', () => {
        isError.mockReturnValueOnce(true);
        const originalError = new Error('test error');

        const result = unserializeError(originalError);
        expect(result).toBe(originalError);
      });

      it('returns the thrown value when it is instanceof Error', () => {
        isError.mockReturnValueOnce(false);
        const originalError = new Error('test error');

        const result = unserializeError(originalError);
        expect(result).toBe(originalError);
      });
    });

    it('creates a new Error when thrown value is a string', () => {
      const errorMessage = 'test error message';
      const result = unserializeError(errorMessage);

      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe(errorMessage);
    });

    it.each([42, true, false, null, undefined, Symbol('test')])(
      'creates a new Error with stringified message for non-object values',
      (value) => {
        const result = unserializeError(value);

        expect(result).toBeInstanceOf(Error);
        expect(result.message).toBe(`Unknown error: ${stringify(value)}`);
      },
    );

    it('creates a JsonRpcError when thrown value is an object with valid integer code', () => {
      const thrownValue = {
        code: 1234,
        message: 'test error message',
        cause: new Error('cause'),
        data: { foo: 'bar' },
      };

      const result = unserializeError(thrownValue);

      expect(result).toBeInstanceOf(JsonRpcError);
      expect(result).toMatchObject({
        message: 'test error message',
        code: 1234,
        cause: thrownValue.cause,
        data: { foo: 'bar' },
      });
    });

    it('creates a plain Error when thrown value is an object without code property', () => {
      const thrownValue = {
        message: 'test error message',
        cause: new Error('cause'),
        data: { foo: 'bar' },
      };

      const result = unserializeError(thrownValue);

      expect(result).toBeInstanceOf(Error);
      expect(result).not.toBeInstanceOf(JsonRpcError);
      expect(result).toStrictEqual(
        // @ts-expect-error - Error type outdated
        new Error('test error message', { cause: thrownValue.cause }),
      );
    });

    it('creates a plain Error when thrown value has non-integer code', () => {
      const thrownValue = {
        code: 123.45,
        message: 'test error message',
      };

      const result = unserializeError(thrownValue);

      expect(result).toBeInstanceOf(Error);
      expect(result).not.toBeInstanceOf(JsonRpcError);
      expect(result).toStrictEqual(new Error('test error message'));
    });

    it('preserves stack trace when thrown value has stack property', () => {
      const stackTrace = 'Error: test\n    at test.js:1:1';
      const thrownValue = {
        message: 'test error',
        stack: stackTrace,
      };

      const result = unserializeError(thrownValue);

      expect(result).toBeInstanceOf(Error);
      expect(result.stack).toBe(stackTrace);
    });

    it('preserves cause and data in JsonRpcError', () => {
      const cause = new Error('original cause');
      const data = { custom: 'data' };
      const thrownValue = {
        code: 1234,
        message: 'test error',
        cause,
        data,
      };

      const result = unserializeError(thrownValue) as JsonRpcError<Json>;

      expect(result.cause).toBe(cause);
      expect(result.data).toStrictEqual({
        ...data,
        cause,
      });
    });

    it('uses default error message when message property is missing and code is unrecognized', () => {
      const thrownValue = {
        code: 1234,
      };

      const result = unserializeError(thrownValue);

      expect(result.message).toBe('Unknown error');
    });

    it('uses default error message when message property is not a string and code is unrecognized', () => {
      const thrownValue = {
        code: 1234,
        message: 42,
      };

      const result = unserializeError(thrownValue);

      expect(result.message).toBe('Unknown error');
    });

    it('uses correct error message when message property is not a string and code is recognized', () => {
      const thrownValue = {
        code: -32603,
        message: 42,
      };

      const result = unserializeError(thrownValue);

      expect(result.message).toBe('Internal JSON-RPC error.');
    });
  });
});
