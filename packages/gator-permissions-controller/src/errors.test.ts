import {
  GatorPermissionsControllerError,
  GatorPermissionsFetchError,
  GatorPermissionsProviderError,
  OriginNotAllowedError,
  PermissionDecodingError,
} from './errors';
import {
  GatorPermissionsControllerErrorCode,
  GatorPermissionsSnapRpcMethod,
} from './types';

describe('errors', () => {
  describe('GatorPermissionsControllerError', () => {
    it('is extended by subclasses and sets message, cause, and code', () => {
      const cause = new Error('root cause');
      const error = new GatorPermissionsFetchError({
        cause,
        message: 'Fetch failed',
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(GatorPermissionsControllerError);
      expect(error).toBeInstanceOf(GatorPermissionsFetchError);
      expect(error.message).toBe('Fetch failed');
      expect(error.cause).toBe(cause);
      expect(error.code).toBe(
        GatorPermissionsControllerErrorCode.GatorPermissionsFetchError,
      );
    });
  });

  describe('GatorPermissionsFetchError', () => {
    it('constructs with cause and message and sets correct code', () => {
      const cause = new Error('network error');
      const error = new GatorPermissionsFetchError({
        cause,
        message: 'Failed to fetch gator permissions',
      });

      expect(error.message).toBe('Failed to fetch gator permissions');
      expect(error.cause).toBe(cause);
      expect(error.code).toBe(
        GatorPermissionsControllerErrorCode.GatorPermissionsFetchError,
      );
    });
  });

  describe('GatorPermissionsProviderError', () => {
    it('constructs with cause and method and builds message from method', () => {
      const cause = new Error('Snap threw');
      const method =
        GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions;
      const error = new GatorPermissionsProviderError({ cause, method });

      expect(error.message).toBe(
        `Failed to handle snap request to gator permissions provider for method ${method}`,
      );
      expect(error.cause).toBe(cause);
      expect(error.code).toBe(
        GatorPermissionsControllerErrorCode.GatorPermissionsProviderError,
      );
    });

    it('includes submitRevocation method in message when that method fails', () => {
      const cause = new Error('Snap rejected');
      const method =
        GatorPermissionsSnapRpcMethod.PermissionProviderSubmitRevocation;
      const error = new GatorPermissionsProviderError({ cause, method });

      expect(error.message).toContain(method);
      expect(error.code).toBe(
        GatorPermissionsControllerErrorCode.GatorPermissionsProviderError,
      );
    });
  });

  describe('OriginNotAllowedError', () => {
    it('constructs with origin and builds message and cause', () => {
      const origin = 'https://evil.com';
      const error = new OriginNotAllowedError({ origin });

      expect(error.message).toBe(`Origin ${origin} not allowed`);
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.cause.message).toBe(`Origin ${origin} not allowed`);
      expect(error.code).toBe(
        GatorPermissionsControllerErrorCode.OriginNotAllowedError,
      );
    });
  });

  describe('PermissionDecodingError', () => {
    it('constructs with cause and sets fixed message and code', () => {
      const cause = new Error('Invalid caveat format');
      const error = new PermissionDecodingError({ cause });

      expect(error.message).toBe('Failed to decode permission');
      expect(error.cause).toBe(cause);
      expect(error.code).toBe(
        GatorPermissionsControllerErrorCode.PermissionDecodingError,
      );
    });
  });
});
