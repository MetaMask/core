"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionsRequestNotFoundError = exports.DuplicateCaveatError = exports.ForbiddenCaveatError = exports.InvalidCaveatFieldsError = exports.CaveatInvalidJsonError = exports.CaveatMissingValueError = exports.InvalidCaveatTypeError = exports.InvalidCaveatError = exports.CaveatAlreadyExistsError = exports.CaveatDoesNotExistError = exports.InvalidCaveatsPropertyError = exports.UnrecognizedCaveatTypeError = exports.EndowmentPermissionDoesNotExistError = exports.PermissionDoesNotExistError = exports.InvalidApprovedPermissionError = exports.UnrecognizedSubjectError = exports.InvalidSubjectIdentifierError = exports.internalError = exports.userRejectedRequest = exports.invalidParams = exports.methodNotFound = exports.unauthorized = void 0;
const eth_rpc_errors_1 = require("eth-rpc-errors");
/**
 * Utility function for building an "unauthorized" error.
 *
 * @param opts - Optional arguments that add extra context
 * @returns The built error
 */
function unauthorized(opts) {
    return eth_rpc_errors_1.ethErrors.provider.unauthorized({
        message: 'Unauthorized to perform action. Try requesting the required permission(s) first. For more information, see: https://docs.metamask.io/guide/rpc-api.html#permissions',
        data: opts.data,
    });
}
exports.unauthorized = unauthorized;
/**
 * Utility function for building a "method not found" error.
 *
 * @param method - The method in question.
 * @param data - Optional data for context.
 * @returns The built error
 */
function methodNotFound(method, data) {
    const message = `The method "${method}" does not exist / is not available.`;
    const opts = { message };
    if (data !== undefined) {
        opts.data = data;
    }
    return eth_rpc_errors_1.ethErrors.rpc.methodNotFound(opts);
}
exports.methodNotFound = methodNotFound;
/**
 * Utility function for building an "invalid params" error.
 *
 * @param opts - Optional arguments that add extra context
 * @returns The built error
 */
function invalidParams(opts) {
    return eth_rpc_errors_1.ethErrors.rpc.invalidParams({
        data: opts.data,
        message: opts.message,
    });
}
exports.invalidParams = invalidParams;
/**
 * Utility function for building an "user rejected request" error.
 *
 * @param data - Optional data to add extra context
 * @returns The built error
 */
function userRejectedRequest(data) {
    return eth_rpc_errors_1.ethErrors.provider.userRejectedRequest({ data });
}
exports.userRejectedRequest = userRejectedRequest;
/**
 * Utility function for building an internal error.
 *
 * @param message - The error message
 * @param data - Optional data to add extra context
 * @returns The built error
 */
function internalError(message, data) {
    return eth_rpc_errors_1.ethErrors.rpc.internal({ message, data });
}
exports.internalError = internalError;
class InvalidSubjectIdentifierError extends Error {
    constructor(origin) {
        super(`Invalid subject identifier: "${typeof origin === 'string' ? origin : typeof origin}"`);
    }
}
exports.InvalidSubjectIdentifierError = InvalidSubjectIdentifierError;
class UnrecognizedSubjectError extends Error {
    constructor(origin) {
        super(`Unrecognized subject: "${origin}" has no permissions.`);
    }
}
exports.UnrecognizedSubjectError = UnrecognizedSubjectError;
class InvalidApprovedPermissionError extends Error {
    constructor(origin, target, approvedPermission) {
        super(`Invalid approved permission for origin "${origin}" and target "${target}".`);
        this.data = { origin, target, approvedPermission };
    }
}
exports.InvalidApprovedPermissionError = InvalidApprovedPermissionError;
class PermissionDoesNotExistError extends Error {
    constructor(origin, target) {
        super(`Subject "${origin}" has no permission for "${target}".`);
    }
}
exports.PermissionDoesNotExistError = PermissionDoesNotExistError;
class EndowmentPermissionDoesNotExistError extends Error {
    constructor(target, origin) {
        super(`Subject "${origin}" has no permission for "${target}".`);
        if (origin) {
            this.data = { origin };
        }
    }
}
exports.EndowmentPermissionDoesNotExistError = EndowmentPermissionDoesNotExistError;
class UnrecognizedCaveatTypeError extends Error {
    constructor(caveatType, origin, target) {
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
exports.UnrecognizedCaveatTypeError = UnrecognizedCaveatTypeError;
class InvalidCaveatsPropertyError extends Error {
    constructor(origin, target, caveatsProperty) {
        super(`The "caveats" property of permission for "${target}" of subject "${origin}" is invalid. It must be a non-empty array if specified.`);
        this.data = { origin, target, caveatsProperty };
    }
}
exports.InvalidCaveatsPropertyError = InvalidCaveatsPropertyError;
class CaveatDoesNotExistError extends Error {
    constructor(origin, target, caveatType) {
        super(`Permission for "${target}" of subject "${origin}" has no caveat of type "${caveatType}".`);
    }
}
exports.CaveatDoesNotExistError = CaveatDoesNotExistError;
class CaveatAlreadyExistsError extends Error {
    constructor(origin, target, caveatType) {
        super(`Permission for "${target}" of subject "${origin}" already has a caveat of type "${caveatType}".`);
    }
}
exports.CaveatAlreadyExistsError = CaveatAlreadyExistsError;
class InvalidCaveatError extends eth_rpc_errors_1.EthereumRpcError {
    constructor(receivedCaveat, origin, target) {
        super(eth_rpc_errors_1.errorCodes.rpc.invalidParams, `Invalid caveat. Caveats must be plain objects.`, { receivedCaveat });
        this.data = { origin, target };
    }
}
exports.InvalidCaveatError = InvalidCaveatError;
class InvalidCaveatTypeError extends Error {
    constructor(caveat, origin, target) {
        super(`Caveat types must be strings. Received: "${typeof caveat.type}"`);
        this.data = { caveat, origin, target };
    }
}
exports.InvalidCaveatTypeError = InvalidCaveatTypeError;
class CaveatMissingValueError extends Error {
    constructor(caveat, origin, target) {
        super(`Caveat is missing "value" field.`);
        this.data = { caveat, origin, target };
    }
}
exports.CaveatMissingValueError = CaveatMissingValueError;
class CaveatInvalidJsonError extends Error {
    constructor(caveat, origin, target) {
        super(`Caveat "value" is invalid JSON.`);
        this.data = { caveat, origin, target };
    }
}
exports.CaveatInvalidJsonError = CaveatInvalidJsonError;
class InvalidCaveatFieldsError extends Error {
    constructor(caveat, origin, target) {
        super(`Caveat has unexpected number of fields: "${Object.keys(caveat).length}"`);
        this.data = { caveat, origin, target };
    }
}
exports.InvalidCaveatFieldsError = InvalidCaveatFieldsError;
class ForbiddenCaveatError extends Error {
    constructor(caveatType, origin, targetName) {
        super(`Permissions for target "${targetName}" may not have caveats of type "${caveatType}".`);
        this.data = { caveatType, origin, target: targetName };
    }
}
exports.ForbiddenCaveatError = ForbiddenCaveatError;
class DuplicateCaveatError extends Error {
    constructor(caveatType, origin, targetName) {
        super(`Permissions for target "${targetName}" contains multiple caveats of type "${caveatType}".`);
        this.data = { caveatType, origin, target: targetName };
    }
}
exports.DuplicateCaveatError = DuplicateCaveatError;
class PermissionsRequestNotFoundError extends Error {
    constructor(id) {
        super(`Permissions request with id "${id}" not found.`);
    }
}
exports.PermissionsRequestNotFoundError = PermissionsRequestNotFoundError;
//# sourceMappingURL=errors.js.map