import type { Json } from '@metamask/types';
import { JsonRpcMiddleware } from 'json-rpc-engine';
import { GenericPermissionController, PermissionSubjectMetadata, RestrictedMethodParameters } from '.';
declare type PermissionMiddlewareFactoryOptions = {
    executeRestrictedMethod: GenericPermissionController['_executeRestrictedMethod'];
    getRestrictedMethod: GenericPermissionController['getRestrictedMethod'];
    isUnrestrictedMethod: (method: string) => boolean;
};
/**
 * Creates a permission middleware function factory. Intended for internal use
 * in the {@link PermissionController}. Like any {@link JsonRpcEngine}
 * middleware, each middleware will only receive requests from a particular
 * subject / origin. However, each middleware also requires access to some
 * `PermissionController` internals, which is why this "factory factory" exists.
 *
 * The middlewares returned by the factory will pass through requests for
 * unrestricted methods, and attempt to execute restricted methods. If a method
 * is neither restricted nor unrestricted, a "method not found" error will be
 * returned.
 * If a method is restricted, the middleware will first attempt to retrieve the
 * subject's permission for that method. If the permission is found, the method
 * will be executed. Otherwise, an "unauthorized" error will be returned.
 *
 * @param options - Options bag.
 * @param options.executeRestrictedMethod - {@link PermissionController._executeRestrictedMethod}.
 * @param options.getRestrictedMethod - {@link PermissionController.getRestrictedMethod}.
 * @param options.isUnrestrictedMethod - A function that checks whether a
 * particular method is unrestricted.
 * @returns A permission middleware factory function.
 */
export declare function getPermissionMiddlewareFactory({ executeRestrictedMethod, getRestrictedMethod, isUnrestrictedMethod, }: PermissionMiddlewareFactoryOptions): (subject: PermissionSubjectMetadata) => JsonRpcMiddleware<RestrictedMethodParameters, Json>;
export {};
