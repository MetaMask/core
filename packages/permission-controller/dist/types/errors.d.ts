import type { DataWithOptionalCause } from '@metamask/rpc-errors';
import { JsonRpcError } from '@metamask/rpc-errors';
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
export declare function unauthorized(opts: UnauthorizedArg): import("@metamask/rpc-errors").EthereumProviderError<Record<string, unknown>>;
/**
 * Utility function for building a "method not found" error.
 *
 * @param method - The method in question.
 * @param data - Optional data for context.
 * @returns The built error
 */
export declare function methodNotFound(method: string, data?: DataWithOptionalCause): JsonRpcError<import("@metamask/rpc-errors").OptionalDataWithOptionalCause>;
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
export declare function invalidParams(opts: InvalidParamsArg): JsonRpcError<string | number | boolean | import("@metamask/utils").Json[] | {
    [prop: string]: import("@metamask/utils").Json;
} | {
    [key: string]: unknown;
    cause?: unknown;
} | null>;
/**
 * Utility function for building an "user rejected request" error.
 *
 * @param data - Optional data to add extra context
 * @returns The built error
 */
export declare function userRejectedRequest<Data extends Record<string, unknown>>(data?: Data): JsonRpcError<Data>;
/**
 * Utility function for building an internal error.
 *
 * @param message - The error message
 * @param data - Optional data to add extra context
 * @returns The built error
 */
export declare function internalError<Data extends Record<string, unknown>>(message: string, data?: Data): JsonRpcError<Data>;
export declare class InvalidSubjectIdentifierError extends Error {
    constructor(origin: unknown);
}
export declare class UnrecognizedSubjectError extends Error {
    constructor(origin: string);
}
export declare class CaveatMergerDoesNotExistError extends Error {
    constructor(caveatType: string);
}
export declare class InvalidMergedPermissionsError extends Error {
    cause: Error;
    data: {
        diff: PermissionDiffMap<string, CaveatConstraint>;
    };
    constructor(origin: string, cause: Error, diff: PermissionDiffMap<string, CaveatConstraint>);
}
export declare class InvalidApprovedPermissionError extends Error {
    data: {
        origin: string;
        target: string;
        approvedPermission: Record<string, unknown>;
    };
    constructor(origin: string, target: string, approvedPermission: Record<string, unknown>);
}
export declare class PermissionDoesNotExistError extends Error {
    constructor(origin: string, target: string);
}
export declare class EndowmentPermissionDoesNotExistError extends Error {
    data?: {
        origin: string;
    };
    constructor(target: string, origin?: string);
}
export declare class UnrecognizedCaveatTypeError extends Error {
    data: {
        caveatType: string;
        origin?: string;
        target?: string;
    };
    constructor(caveatType: string);
    constructor(caveatType: string, origin: string, target: string);
}
export declare class InvalidCaveatsPropertyError extends Error {
    data: {
        origin: string;
        target: string;
        caveatsProperty: unknown;
    };
    constructor(origin: string, target: string, caveatsProperty: unknown);
}
export declare class CaveatDoesNotExistError extends Error {
    constructor(origin: string, target: string, caveatType: string);
}
export declare class CaveatAlreadyExistsError extends Error {
    constructor(origin: string, target: string, caveatType: string);
}
export declare class InvalidCaveatError extends JsonRpcError<DataWithOptionalCause | undefined> {
    data: {
        origin: string;
        target: string;
    };
    constructor(receivedCaveat: unknown, origin: string, target: string);
}
export declare class InvalidCaveatTypeError extends Error {
    data: {
        caveat: Record<string, unknown>;
        origin: string;
        target: string;
    };
    constructor(caveat: Record<string, unknown>, origin: string, target: string);
}
export declare class CaveatMissingValueError extends Error {
    data: {
        caveat: Record<string, unknown>;
        origin: string;
        target: string;
    };
    constructor(caveat: Record<string, unknown>, origin: string, target: string);
}
export declare class CaveatInvalidJsonError extends Error {
    data: {
        caveat: Record<string, unknown>;
        origin: string;
        target: string;
    };
    constructor(caveat: Record<string, unknown>, origin: string, target: string);
}
export declare class InvalidCaveatFieldsError extends Error {
    data: {
        caveat: Record<string, unknown>;
        origin: string;
        target: string;
    };
    constructor(caveat: Record<string, unknown>, origin: string, target: string);
}
export declare class ForbiddenCaveatError extends Error {
    data: {
        caveatType: string;
        origin: string;
        target: string;
    };
    constructor(caveatType: string, origin: string, targetName: string);
}
export declare class DuplicateCaveatError extends Error {
    data: {
        caveatType: string;
        origin: string;
        target: string;
    };
    constructor(caveatType: string, origin: string, targetName: string);
}
export declare class CaveatMergeTypeMismatchError extends Error {
    data: {
        leftCaveatType: string;
        rightCaveatType: string;
    };
    constructor(leftCaveatType: string, rightCaveatType: string);
}
export declare class CaveatSpecificationMismatchError extends Error {
    data: {
        caveatSpec: Record<string, unknown>;
        permissionType: PermissionType;
    };
    constructor(caveatSpec: Record<string, unknown>, permissionType: PermissionType);
}
export declare class PermissionsRequestNotFoundError extends Error {
    constructor(id: string);
}
export {};
//# sourceMappingURL=errors.d.ts.map