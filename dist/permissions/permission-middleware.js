"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPermissionMiddlewareFactory = void 0;
const json_rpc_engine_1 = require("json-rpc-engine");
const errors_1 = require("./errors");
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
function getPermissionMiddlewareFactory({ executeRestrictedMethod, getRestrictedMethod, isUnrestrictedMethod, }) {
    return function createPermissionMiddleware(subject) {
        const { origin } = subject;
        if (typeof origin !== 'string' || !origin) {
            throw new Error('The subject "origin" must be a non-empty string.');
        }
        const permissionsMiddleware = (req, res, next) => __awaiter(this, void 0, void 0, function* () {
            const { method, params } = req;
            // Skip registered unrestricted methods.
            if (isUnrestrictedMethod(method)) {
                return next();
            }
            // This will throw if no restricted method implementation is found.
            const methodImplementation = getRestrictedMethod(method, origin);
            // This will throw if the permission does not exist.
            const result = yield executeRestrictedMethod(methodImplementation, subject, method, params);
            if (result === undefined) {
                res.error = (0, errors_1.internalError)(`Request for method "${req.method}" returned undefined result.`, { request: req });
                return undefined;
            }
            res.result = result;
            return undefined;
        });
        return (0, json_rpc_engine_1.createAsyncMiddleware)(permissionsMiddleware);
    };
}
exports.getPermissionMiddlewareFactory = getPermissionMiddlewareFactory;
//# sourceMappingURL=permission-middleware.js.map