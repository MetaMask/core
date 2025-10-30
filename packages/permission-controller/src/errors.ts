import type { DataWithOptionalCause } from '@metamask/rpc-errors';
import {
  errorCodes,
  providerErrors,
  rpcErrors,
  JsonRpcError,
} from '@metamask/rpc-errors';

import type { CaveatConstraint } from './Caveat';
import type { PermissionType } from './Permission';
import type { PermissionDiffMap } from './PermissionController';

type UnauthorizedArg = {
  data?: Record<string, unknown>;
  message?: string;
};

/**
 * Utility function for building an "unauthorized" error.
 *
 * @param opts - Optional arguments that add extra context
 * @returns The built error
 */
export function unauthorized(opts: UnauthorizedArg) {
  return providerErrors.unauthorized({
    message:
      'Unauthorized to perform action. Try requesting the required permission(s) first. For more information, see: https://docs.metamask.io/guide/rpc-api.html#permissions',
    data: opts.data,
  });
}

/**
 * Utility function for building a "method not found" error.
 *
 * @param method - The method in question.
 * @param data - Optional data for context.
 * @returns The built error
 */
export function methodNotFound(method: string, data?: DataWithOptionalCause) {
  const message = `The method "${method}" does not exist / is not available.`;

  const opts: Parameters<typeof rpcErrors.methodNotFound>[0] = { message };
  if (data !== undefined) {
    opts.data = data;
  }
  return rpcErrors.methodNotFound(opts);
}

type InvalidParamsArg = {
  message?: string;
  data?: DataWithOptionalCause;
};

/**
 * Utility function for building an "invalid params" error.
 *
 * @param opts - Optional arguments that add extra context
 * @returns The built error
 */
export function invalidParams(opts: InvalidParamsArg) {
  return rpcErrors.invalidParams({
    data: opts.data,
    message: opts.message,
  });
}

/**
 * Utility function for building an "user rejected request" error.
 *
 * @param data - Optional data to add extra context
 * @returns The built error
 */
export function userRejectedRequest<Data extends Record<string, unknown>>(
  data?: Data,
): JsonRpcError<Data> {
  return providerErrors.userRejectedRequest({ data });
}

/**
 * Utility function for building an internal error.
 *
 * @param message - The error message
 * @param data - Optional data to add extra context
 * @returns The built error
 */
export function internalError<Data extends Record<string, unknown>>(
  message: string,
  data?: Data,
): JsonRpcError<Data> {
  return rpcErrors.internal({ message, data });
}

class CustomError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidSubjectIdentifierError extends CustomError {
  constructor(origin: unknown) {
    super(
      `Invalid subject identifier: "${
        typeof origin === 'string' ? origin : typeof origin
      }"`,
    );
    this.name = this.constructor.name;
  }
}

export class UnrecognizedSubjectError extends CustomError {
  constructor(origin: string) {
    super(`Unrecognized subject: "${origin}" has no permissions.`);
    this.name = this.constructor.name;
  }
}

export class CaveatMergerDoesNotExistError extends CustomError {
  constructor(caveatType: string) {
    super(`Caveat value merger does not exist for type: "${caveatType}"`);
  }
}

export class InvalidMergedPermissionsError extends Error {
  public cause: Error;

  public data: {
    diff: PermissionDiffMap<string, CaveatConstraint>;
  };

  constructor(
    origin: string,
    cause: Error,
    diff: PermissionDiffMap<string, CaveatConstraint>,
  ) {
    super(
      `Invalid merged permissions for subject "${origin}":\n${cause.message}`,
    );
    this.cause = cause;
    this.data = { diff };
  }
}

export class InvalidApprovedPermissionError extends CustomError {
  public data: {
    origin: string;
    target: string;
    approvedPermission: Record<string, unknown>;
  };

  constructor(
    origin: string,
    target: string,
    approvedPermission: Record<string, unknown>,
  ) {
    super(
      `Invalid approved permission for origin "${origin}" and target "${target}".`,
    );
    this.data = { origin, target, approvedPermission };
  }
}
export class PermissionDoesNotExistError extends CustomError {
  constructor(origin: string, target: string) {
    super(`Subject "${origin}" has no permission for "${target}".`);
  }
}

export class EndowmentPermissionDoesNotExistError extends CustomError {
  public data?: { origin: string };

  constructor(target: string, origin?: string) {
    super(
      `${
        origin ? `Subject "${origin}"` : 'Unknown subject'
      } has no permission for "${target}".`,
    );
    if (origin) {
      this.data = { origin };
    }
  }
}

export class UnrecognizedCaveatTypeError extends CustomError {
  public data: {
    caveatType: string;
    origin?: string;
    target?: string;
  };

  constructor(caveatType: string);

  constructor(caveatType: string, origin: string, target: string);

  constructor(caveatType: string, origin?: string, target?: string) {
    super(`Unrecognized caveat type: "${caveatType}"`);
    this.data = { caveatType };
    if (origin !== undefined) {
      this.data.origin = origin;
    }

    if (target !== undefined) {
      this.data.target = target;
    }
  }
}

export class InvalidCaveatsPropertyError extends CustomError {
  public data: { origin: string; target: string; caveatsProperty: unknown };

  constructor(origin: string, target: string, caveatsProperty: unknown) {
    super(
      `The "caveats" property of permission for "${target}" of subject "${origin}" is invalid. It must be a non-empty array if specified.`,
    );
    this.data = { origin, target, caveatsProperty };
  }
}

export class CaveatDoesNotExistError extends CustomError {
  constructor(origin: string, target: string, caveatType: string) {
    super(
      `Permission for "${target}" of subject "${origin}" has no caveat of type "${caveatType}".`,
    );
  }
}

export class CaveatAlreadyExistsError extends CustomError {
  constructor(origin: string, target: string, caveatType: string) {
    super(
      `Permission for "${target}" of subject "${origin}" already has a caveat of type "${caveatType}".`,
    );
  }
}

export class InvalidCaveatError extends JsonRpcError<
  DataWithOptionalCause | undefined
> {
  public override data: { origin: string; target: string };

  constructor(receivedCaveat: unknown, origin: string, target: string) {
    super(
      errorCodes.rpc.invalidParams,
      `Invalid caveat. Caveats must be plain objects.`,
      { receivedCaveat },
    );
    this.data = { origin, target };
  }
}

export class InvalidCaveatTypeError extends CustomError {
  public data: {
    caveat: Record<string, unknown>;
    origin: string;
    target: string;
  };

  constructor(caveat: Record<string, unknown>, origin: string, target: string) {
    super(`Caveat types must be strings. Received: "${typeof caveat.type}"`);
    this.data = { caveat, origin, target };
  }
}

export class CaveatMissingValueError extends CustomError {
  public data: {
    caveat: Record<string, unknown>;
    origin: string;
    target: string;
  };

  constructor(caveat: Record<string, unknown>, origin: string, target: string) {
    super(`Caveat is missing "value" field.`);
    this.data = { caveat, origin, target };
  }
}

export class CaveatInvalidJsonError extends CustomError {
  public data: {
    caveat: Record<string, unknown>;
    origin: string;
    target: string;
  };

  constructor(caveat: Record<string, unknown>, origin: string, target: string) {
    super(`Caveat "value" is invalid JSON.`);
    this.data = { caveat, origin, target };
  }
}

export class InvalidCaveatFieldsError extends CustomError {
  public data: {
    caveat: Record<string, unknown>;
    origin: string;
    target: string;
  };

  constructor(caveat: Record<string, unknown>, origin: string, target: string) {
    super(
      `Caveat has unexpected number of fields: "${Object.keys(caveat).length}"`,
    );
    this.data = { caveat, origin, target };
  }
}

export class ForbiddenCaveatError extends CustomError {
  public data: {
    caveatType: string;
    origin: string;
    target: string;
  };

  constructor(caveatType: string, origin: string, targetName: string) {
    super(
      `Permissions for target "${targetName}" may not have caveats of type "${caveatType}".`,
    );
    this.data = { caveatType, origin, target: targetName };
  }
}

export class DuplicateCaveatError extends CustomError {
  public data: {
    caveatType: string;
    origin: string;
    target: string;
  };

  constructor(caveatType: string, origin: string, targetName: string) {
    super(
      `Permissions for target "${targetName}" contains multiple caveats of type "${caveatType}".`,
    );
    this.data = { caveatType, origin, target: targetName };
  }
}

export class CaveatMergeTypeMismatchError extends CustomError {
  public data: {
    leftCaveatType: string;
    rightCaveatType: string;
  };

  constructor(leftCaveatType: string, rightCaveatType: string) {
    super(
      `Cannot merge caveats of different types: "${leftCaveatType}" and "${rightCaveatType}".`,
    );
    this.data = { leftCaveatType, rightCaveatType };
  }
}

export class CaveatSpecificationMismatchError extends CustomError {
  public data: {
    caveatSpec: Record<string, unknown>;
    permissionType: PermissionType;
  };

  constructor(
    caveatSpec: Record<string, unknown>,
    permissionType: PermissionType,
  ) {
    super(
      `Caveat specification uses a mismatched type. Expected caveats for ${permissionType}`,
    );
    this.data = { caveatSpec, permissionType };
  }
}

export class PermissionsRequestNotFoundError extends CustomError {
  constructor(id: string) {
    super(`Permissions request with id "${id}" not found.`);
  }
}
