import type { GatorPermissionsSnapRpcMethod } from './types';
import { GatorPermissionsControllerErrorCode } from './types';

/**
 * Represents a base gator permissions error.
 */
type GatorPermissionsErrorParams = {
  code: GatorPermissionsControllerErrorCode;
  cause: Error;
  message: string;
};

export class GatorPermissionsControllerError extends Error {
  code: GatorPermissionsControllerErrorCode;

  cause: Error;

  constructor({ cause, message, code }: GatorPermissionsErrorParams) {
    super(message);

    this.cause = cause;
    this.code = code;
  }
}

export class GatorPermissionsFetchError extends GatorPermissionsControllerError {
  constructor({ cause, message }: { cause: Error; message: string }) {
    super({
      cause,
      message,
      code: GatorPermissionsControllerErrorCode.GatorPermissionsFetchError,
    });
  }
}

export class GatorPermissionsMapSerializationError extends GatorPermissionsControllerError {
  data: unknown;

  constructor({
    cause,
    message,
    data,
  }: {
    cause: Error;
    message: string;
    data?: unknown;
  }) {
    super({
      cause,
      message,
      code: GatorPermissionsControllerErrorCode.GatorPermissionsMapSerializationError,
    });

    this.data = data;
  }
}

export class GatorPermissionsNotEnabledError extends GatorPermissionsControllerError {
  constructor() {
    super({
      cause: new Error('Gator permissions are not enabled'),
      message: 'Gator permissions are not enabled',
      code: GatorPermissionsControllerErrorCode.GatorPermissionsNotEnabled,
    });
  }
}

export class GatorPermissionsProviderError extends GatorPermissionsControllerError {
  constructor({
    cause,
    method,
  }: {
    cause: Error;
    method: GatorPermissionsSnapRpcMethod;
  }) {
    super({
      cause,
      message: `Failed to handle snap request to gator permissions provider for method ${method}`,
      code: GatorPermissionsControllerErrorCode.GatorPermissionsProviderError,
    });
  }
}
