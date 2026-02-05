import {
  GatorPermissionsControllerErrorCode,
  GatorPermissionsSnapRpcMethod,
} from '../types';
import {
  GatorPermissionsControllerError,
  GatorPermissionsFetchError,
  GatorPermissionsMapSerializationError,
  GatorPermissionsProviderError,
  OriginNotAllowedError,
  PermissionDecodingError,
} from '../errors';

describe('errors', () => {
  describe('GatorPermissionsControllerError', () => {
    it('is extended by subclasses and sets message, cause, and code', () => {
      const cause = new Error('root cause');
      const err = new GatorPermissionsFetchError({
        cause,
        message: 'Fetch failed',
      });

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(GatorPermissionsControllerError);
      expect(err).toBeInstanceOf(GatorPermissionsFetchError);
      expect(err.message).toBe('Fetch failed');
      expect(err.cause).toBe(cause);
      expect(err.code).toBe(
        GatorPermissionsControllerErrorCode.GatorPermissionsFetchError,
      );
    });
  });

  describe('GatorPermissionsFetchError', () => {
    it('constructs with cause and message and sets correct code', () => {
      const cause = new Error('network error');
      const err = new GatorPermissionsFetchError({
        cause,
        message: 'Failed to fetch gator permissions',
      });

      expect(err.message).toBe('Failed to fetch gator permissions');
      expect(err.cause).toBe(cause);
      expect(err.code).toBe(
        GatorPermissionsControllerErrorCode.GatorPermissionsFetchError,
      );
    });
  });

  describe('GatorPermissionsMapSerializationError', () => {
    it('constructs with cause, message, and optional data', () => {
      const cause = new Error('JSON parse error');
      const data = { invalid: 'payload' };
      const err = new GatorPermissionsMapSerializationError({
        cause,
        message: 'Failed to serialize',
        data,
      });

      expect(err.message).toBe('Failed to serialize');
      expect(err.cause).toBe(cause);
      expect(err.data).toBe(data);
      expect(err.code).toBe(
        GatorPermissionsControllerErrorCode.GatorPermissionsMapSerializationError,
      );
    });

    it('constructs without data (data is undefined)', () => {
      const cause = new Error('stringify error');
      const err = new GatorPermissionsMapSerializationError({
        cause,
        message: 'Failed to deserialize',
      });

      expect(err.message).toBe('Failed to deserialize');
      expect(err.cause).toBe(cause);
      expect(err.data).toBeUndefined();
      expect(err.code).toBe(
        GatorPermissionsControllerErrorCode.GatorPermissionsMapSerializationError,
      );
    });
  });

  describe('GatorPermissionsProviderError', () => {
    it('constructs with cause and method and builds message from method', () => {
      const cause = new Error('Snap threw');
      const method =
        GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions;
      const err = new GatorPermissionsProviderError({ cause, method });

      expect(err.message).toBe(
        `Failed to handle snap request to gator permissions provider for method ${method}`,
      );
      expect(err.cause).toBe(cause);
      expect(err.code).toBe(
        GatorPermissionsControllerErrorCode.GatorPermissionsProviderError,
      );
    });

    it('includes submitRevocation method in message when that method fails', () => {
      const cause = new Error('Snap rejected');
      const method =
        GatorPermissionsSnapRpcMethod.PermissionProviderSubmitRevocation;
      const err = new GatorPermissionsProviderError({ cause, method });

      expect(err.message).toContain(method);
      expect(err.code).toBe(
        GatorPermissionsControllerErrorCode.GatorPermissionsProviderError,
      );
    });
  });

  describe('OriginNotAllowedError', () => {
    it('constructs with origin and builds message and cause', () => {
      const origin = 'https://evil.com';
      const err = new OriginNotAllowedError({ origin });

      expect(err.message).toBe(`Origin ${origin} not allowed`);
      expect(err.cause).toBeInstanceOf(Error);
      expect(err.cause.message).toBe(`Origin ${origin} not allowed`);
      expect(err.code).toBe(
        GatorPermissionsControllerErrorCode.OriginNotAllowedError,
      );
    });
  });

  describe('PermissionDecodingError', () => {
    it('constructs with cause and sets fixed message and code', () => {
      const cause = new Error('Invalid caveat format');
      const err = new PermissionDecodingError({ cause });

      expect(err.message).toBe('Failed to decode permission');
      expect(err.cause).toBe(cause);
      expect(err.code).toBe(
        GatorPermissionsControllerErrorCode.PermissionDecodingError,
      );
    });
  });
});
