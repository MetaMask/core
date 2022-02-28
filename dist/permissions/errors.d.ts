import { EthereumRpcError } from 'eth-rpc-errors';
declare type UnauthorizedArg = {
    data?: Record<string, unknown>;
};
/**
 * Utility function for building an "unauthorized" error.
 *
 * @param opts - Optional arguments that add extra context
 * @returns The built error
 */
export declare function unauthorized(opts: UnauthorizedArg): import("eth-rpc-errors").EthereumProviderError<Record<string, unknown>>;
/**
 * Utility function for building a "method not found" error.
 *
 * @param method - The method in question.
 * @param data - Optional data for context.
 * @returns The built error
 */
export declare function methodNotFound(method: string, data?: unknown): EthereumRpcError<unknown>;
declare type InvalidParamsArg = {
    message?: string;
    data?: unknown;
};
/**
 * Utility function for building an "invalid params" error.
 *
 * @param opts - Optional arguments that add extra context
 * @returns The built error
 */
export declare function invalidParams(opts: InvalidParamsArg): EthereumRpcError<unknown>;
/**
 * Utility function for building an "user rejected request" error.
 *
 * @param data - Optional data to add extra context
 * @returns The built error
 */
export declare function userRejectedRequest<Data extends Record<string, unknown>>(data?: Data): EthereumRpcError<Data>;
/**
 * Utility function for building an internal error.
 *
 * @param message - The error message
 * @param data - Optional data to add extra context
 * @returns The built error
 */
export declare function internalError<Data extends Record<string, unknown>>(message: string, data?: Data): EthereumRpcError<Data>;
export declare class InvalidSubjectIdentifierError extends Error {
    constructor(origin: unknown);
}
export declare class UnrecognizedSubjectError extends Error {
    constructor(origin: string);
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
export declare class InvalidCaveatError extends EthereumRpcError<unknown> {
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
export declare class PermissionsRequestNotFoundError extends Error {
    constructor(id: string);
}
export {};
