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
exports.requestPermissionsHandler = void 0;
const eth_rpc_errors_1 = require("eth-rpc-errors");
const utils_1 = require("../utils");
const errors_1 = require("../errors");
const util_1 = require("../../util");
exports.requestPermissionsHandler = {
    methodNames: [utils_1.MethodNames.requestPermissions],
    implementation: requestPermissionsImplementation,
    hookNames: {
        requestPermissionsForOrigin: true,
    },
};
/**
 * Request Permissions implementation to be used in JsonRpcEngine middleware.
 *
 * @param req - The JsonRpcEngine request
 * @param res - The JsonRpcEngine result object
 * @param _next - JsonRpcEngine next() callback - unused
 * @param end - JsonRpcEngine end() callback
 * @param options - Method hooks passed to the method implementation
 * @param options.requestPermissionsForOrigin - The specific method hook needed for this method implementation
 * @returns A promise that resolves to nothing
 */
function requestPermissionsImplementation(req, res, _next, end, { requestPermissionsForOrigin }) {
    return __awaiter(this, void 0, void 0, function* () {
        const { id, params } = req;
        if ((typeof id !== 'number' && typeof id !== 'string') ||
            (typeof id === 'string' && !id)) {
            return end(eth_rpc_errors_1.ethErrors.rpc.invalidRequest({
                message: 'Invalid request: Must specify a valid id.',
                data: { request: req },
            }));
        }
        if (!Array.isArray(params) || !(0, util_1.isPlainObject)(params[0])) {
            return end((0, errors_1.invalidParams)({ data: { request: req } }));
        }
        const [requestedPermissions] = params;
        const [grantedPermissions] = yield requestPermissionsForOrigin(requestedPermissions, String(id));
        // `wallet_requestPermission` is specified to return an array.
        res.result = Object.values(grantedPermissions);
        return end();
    });
}
//# sourceMappingURL=requestPermissions.js.map