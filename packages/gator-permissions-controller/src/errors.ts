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

export class OriginNotAllowedError extends GatorPermissionsControllerError {
  constructor({ origin }: { origin: string }) {
    const message = `Origin ${origin} not allowed`;

    super({
      cause: new Error(message),
      message,
      code: GatorPermissionsControllerErrorCode.OriginNotAllowedError,
    });
  }
}

export class PermissionDecodingError extends GatorPermissionsControllerError {
  constructor({ cause }: { cause: Error }) {
    super({
      cause,
      message: `Failed to decode permission`,
      code: GatorPermissionsControllerErrorCode.PermissionDecodingError,
    });
  }
}
