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
exports.getPermissionsHandler = void 0;
const utils_1 = require("../utils");
exports.getPermissionsHandler = {
    methodNames: [utils_1.MethodNames.getPermissions],
    implementation: getPermissionsImplementation,
    hookNames: {
        getPermissionsForOrigin: true,
    },
};
/**
 * Get Permissions implementation to be used in JsonRpcEngine middleware.
 *
 * @param _req - The JsonRpcEngine request - unused
 * @param res - The JsonRpcEngine result object
 * @param _next - JsonRpcEngine next() callback - unused
 * @param end - JsonRpcEngine end() callback
 * @param options - Method hooks passed to the method implementation
 * @param options.getPermissionsForOrigin - The specific method hook needed for this method implementation
 * @returns A promise that resolves to nothing
 */
function getPermissionsImplementation(_req, res, _next, end, { getPermissionsForOrigin }) {
    return __awaiter(this, void 0, void 0, function* () {
        res.result = Object.values(getPermissionsForOrigin() || {});
        return end();
    });
}
//# sourceMappingURL=getPermissions.js.map