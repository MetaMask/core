"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasSpecificationType = exports.PermissionType = exports.findCaveat = exports.constructPermission = void 0;
const nanoid_1 = require("nanoid");
/**
 * The default permission factory function. Naively constructs a permission from
 * the inputs. Sets a default, random `id` if none is provided.
 *
 * @see {@link Permission} For more details.
 * @template TargetPermission- - The {@link Permission} that will be constructed.
 * @param options - The options for the permission.
 * @returns The new permission object.
 */
function constructPermission(options) {
    const { caveats = null, invoker, target } = options;
    return {
        id: (0, nanoid_1.nanoid)(),
        parentCapability: target,
        invoker,
        caveats,
        date: new Date().getTime(),
    };
}
exports.constructPermission = constructPermission;
/**
 * Gets the caveat of the specified type belonging to the specified permission.
 *
 * @param permission - The permission whose caveat to retrieve.
 * @param caveatType - The type of the caveat to retrieve.
 * @returns The caveat, or undefined if no such caveat exists.
 */
function findCaveat(permission, caveatType) {
    var _a;
    return (_a = permission.caveats) === null || _a === void 0 ? void 0 : _a.find((caveat) => caveat.type === caveatType);
}
exports.findCaveat = findCaveat;
/**
 * The different possible types of permissions.
 */
var PermissionType;
(function (PermissionType) {
    /**
     * A restricted JSON-RPC method. A subject must have the requisite permission
     * to call a restricted JSON-RPC method.
     */
    PermissionType["RestrictedMethod"] = "RestrictedMethod";
    /**
     * An "endowment" granted to subjects that possess the requisite permission,
     * such as a global environment variable exposing a restricted API, etc.
     */
    PermissionType["Endowment"] = "Endowment";
})(PermissionType = exports.PermissionType || (exports.PermissionType = {}));
/**
 * Checks that the specification has the expected permission type.
 *
 * @param specification - The specification to check.
 * @param expectedType - The expected permission type.
 * @template Specification - The specification to check.
 * @template Type - The expected permission type.
 * @returns Whether or not the specification is of the expected type.
 */
function hasSpecificationType(specification, expectedType) {
    return specification.permissionType === expectedType;
}
exports.hasSpecificationType = hasSpecificationType;
//# sourceMappingURL=Permission.js.map