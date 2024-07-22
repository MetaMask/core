// src/errors.ts
import {
  errorCodes,
  providerErrors,
  rpcErrors,
  JsonRpcError
} from "@metamask/rpc-errors";
function unauthorized(opts) {
  return providerErrors.unauthorized({
    message: "Unauthorized to perform action. Try requesting the required permission(s) first. For more information, see: https://docs.metamask.io/guide/rpc-api.html#permissions",
    data: opts.data
  });
}
function methodNotFound(method, data) {
  const message = `The method "${method}" does not exist / is not available.`;
  const opts = { message };
  if (data !== void 0) {
    opts.data = data;
  }
  return rpcErrors.methodNotFound(opts);
}
function invalidParams(opts) {
  return rpcErrors.invalidParams({
    data: opts.data,
    message: opts.message
  });
}
function userRejectedRequest(data) {
  return providerErrors.userRejectedRequest({ data });
}
function internalError(message, data) {
  return rpcErrors.internal({ message, data });
}
var InvalidSubjectIdentifierError = class extends Error {
  constructor(origin) {
    super(
      `Invalid subject identifier: "${typeof origin === "string" ? origin : typeof origin}"`
    );
  }
};
var UnrecognizedSubjectError = class extends Error {
  constructor(origin) {
    super(`Unrecognized subject: "${origin}" has no permissions.`);
  }
};
var CaveatMergerDoesNotExistError = class extends Error {
  constructor(caveatType) {
    super(`Caveat value merger does not exist for type: "${caveatType}"`);
  }
};
var InvalidMergedPermissionsError = class extends Error {
  constructor(origin, cause, diff) {
    super(
      `Invalid merged permissions for subject "${origin}":
${cause.message}`
    );
    this.cause = cause;
    this.data = { diff };
  }
};
var InvalidApprovedPermissionError = class extends Error {
  constructor(origin, target, approvedPermission) {
    super(
      `Invalid approved permission for origin "${origin}" and target "${target}".`
    );
    this.data = { origin, target, approvedPermission };
  }
};
var PermissionDoesNotExistError = class extends Error {
  constructor(origin, target) {
    super(`Subject "${origin}" has no permission for "${target}".`);
  }
};
var EndowmentPermissionDoesNotExistError = class extends Error {
  constructor(target, origin) {
    super(
      `${origin ? `Subject "${origin}"` : "Unknown subject"} has no permission for "${target}".`
    );
    if (origin) {
      this.data = { origin };
    }
  }
};
var UnrecognizedCaveatTypeError = class extends Error {
  constructor(caveatType, origin, target) {
    super(`Unrecognized caveat type: "${caveatType}"`);
    this.data = { caveatType };
    if (origin !== void 0) {
      this.data.origin = origin;
    }
    if (target !== void 0) {
      this.data.target = target;
    }
  }
};
var InvalidCaveatsPropertyError = class extends Error {
  constructor(origin, target, caveatsProperty) {
    super(
      `The "caveats" property of permission for "${target}" of subject "${origin}" is invalid. It must be a non-empty array if specified.`
    );
    this.data = { origin, target, caveatsProperty };
  }
};
var CaveatDoesNotExistError = class extends Error {
  constructor(origin, target, caveatType) {
    super(
      `Permission for "${target}" of subject "${origin}" has no caveat of type "${caveatType}".`
    );
  }
};
var CaveatAlreadyExistsError = class extends Error {
  constructor(origin, target, caveatType) {
    super(
      `Permission for "${target}" of subject "${origin}" already has a caveat of type "${caveatType}".`
    );
  }
};
var InvalidCaveatError = class extends JsonRpcError {
  constructor(receivedCaveat, origin, target) {
    super(
      errorCodes.rpc.invalidParams,
      `Invalid caveat. Caveats must be plain objects.`,
      { receivedCaveat }
    );
    this.data = { origin, target };
  }
};
var InvalidCaveatTypeError = class extends Error {
  constructor(caveat, origin, target) {
    super(`Caveat types must be strings. Received: "${typeof caveat.type}"`);
    this.data = { caveat, origin, target };
  }
};
var CaveatMissingValueError = class extends Error {
  constructor(caveat, origin, target) {
    super(`Caveat is missing "value" field.`);
    this.data = { caveat, origin, target };
  }
};
var CaveatInvalidJsonError = class extends Error {
  constructor(caveat, origin, target) {
    super(`Caveat "value" is invalid JSON.`);
    this.data = { caveat, origin, target };
  }
};
var InvalidCaveatFieldsError = class extends Error {
  constructor(caveat, origin, target) {
    super(
      `Caveat has unexpected number of fields: "${Object.keys(caveat).length}"`
    );
    this.data = { caveat, origin, target };
  }
};
var ForbiddenCaveatError = class extends Error {
  constructor(caveatType, origin, targetName) {
    super(
      `Permissions for target "${targetName}" may not have caveats of type "${caveatType}".`
    );
    this.data = { caveatType, origin, target: targetName };
  }
};
var DuplicateCaveatError = class extends Error {
  constructor(caveatType, origin, targetName) {
    super(
      `Permissions for target "${targetName}" contains multiple caveats of type "${caveatType}".`
    );
    this.data = { caveatType, origin, target: targetName };
  }
};
var CaveatMergeTypeMismatchError = class extends Error {
  constructor(leftCaveatType, rightCaveatType) {
    super(
      `Cannot merge caveats of different types: "${leftCaveatType}" and "${rightCaveatType}".`
    );
    this.data = { leftCaveatType, rightCaveatType };
  }
};
var CaveatSpecificationMismatchError = class extends Error {
  constructor(caveatSpec, permissionType) {
    super(
      `Caveat specification uses a mismatched type. Expected caveats for ${permissionType}`
    );
    this.data = { caveatSpec, permissionType };
  }
};
var PermissionsRequestNotFoundError = class extends Error {
  constructor(id) {
    super(`Permissions request with id "${id}" not found.`);
  }
};

export {
  unauthorized,
  methodNotFound,
  invalidParams,
  userRejectedRequest,
  internalError,
  InvalidSubjectIdentifierError,
  UnrecognizedSubjectError,
  CaveatMergerDoesNotExistError,
  InvalidMergedPermissionsError,
  InvalidApprovedPermissionError,
  PermissionDoesNotExistError,
  EndowmentPermissionDoesNotExistError,
  UnrecognizedCaveatTypeError,
  InvalidCaveatsPropertyError,
  CaveatDoesNotExistError,
  CaveatAlreadyExistsError,
  InvalidCaveatError,
  InvalidCaveatTypeError,
  CaveatMissingValueError,
  CaveatInvalidJsonError,
  InvalidCaveatFieldsError,
  ForbiddenCaveatError,
  DuplicateCaveatError,
  CaveatMergeTypeMismatchError,
  CaveatSpecificationMismatchError,
  PermissionsRequestNotFoundError
};
//# sourceMappingURL=chunk-G4BWJ7EA.mjs.map