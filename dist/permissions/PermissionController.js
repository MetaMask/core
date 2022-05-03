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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionController = exports.CaveatMutatorOperation = void 0;
const deep_freeze_strict_1 = __importDefault(require("deep-freeze-strict"));
const immer_1 = require("immer");
const nanoid_1 = require("nanoid");
const eth_rpc_errors_1 = require("eth-rpc-errors");
const BaseControllerV2_1 = require("../BaseControllerV2");
const util_1 = require("../util");
const Caveat_1 = require("./Caveat");
const errors_1 = require("./errors");
const Permission_1 = require("./Permission");
const permission_middleware_1 = require("./permission-middleware");
const utils_1 = require("./utils");
/**
 * The name of the {@link PermissionController}.
 */
const controllerName = 'PermissionController';
/**
 * Get the state metadata of the {@link PermissionController}.
 *
 * @template Permission - The controller's permission type union.
 * @returns The state metadata
 */
function getStateMetadata() {
    return { subjects: { anonymous: true, persist: true } };
}
/**
 * Get the default state of the {@link PermissionController}.
 *
 * @template Permission - The controller's permission type union.
 * @returns The default state of the controller
 */
function getDefaultState() {
    return { subjects: {} };
}
/**
 * Describes the possible results of a {@link CaveatMutator} function.
 */
var CaveatMutatorOperation;
(function (CaveatMutatorOperation) {
    CaveatMutatorOperation[CaveatMutatorOperation["noop"] = 0] = "noop";
    CaveatMutatorOperation[CaveatMutatorOperation["updateValue"] = 1] = "updateValue";
    CaveatMutatorOperation[CaveatMutatorOperation["deleteCaveat"] = 2] = "deleteCaveat";
    CaveatMutatorOperation[CaveatMutatorOperation["revokePermission"] = 3] = "revokePermission";
})(CaveatMutatorOperation = exports.CaveatMutatorOperation || (exports.CaveatMutatorOperation = {}));
/**
 * The permission controller. See the README for details.
 *
 * Assumes the existence of an {@link ApprovalController} reachable via the
 * {@link ControllerMessenger}.
 *
 * @template ControllerPermissionSpecification - A union of the types of all
 * permission specifications available to the controller. Any referenced caveats
 * must be included in the controller's caveat specifications.
 * @template ControllerCaveatSpecification - A union of the types of all
 * caveat specifications available to the controller.
 */
class PermissionController extends BaseControllerV2_1.BaseController {
    /**
     * Constructs the PermissionController.
     *
     * @param options - Permission controller options.
     * @param options.caveatSpecifications - The specifications of all caveats
     * available to the controller. See {@link CaveatSpecificationMap} and the
     * documentation for more details.
     * @param options.permissionSpecifications - The specifications of all
     * permissions available to the controller. See
     * {@link PermissionSpecificationMap} and the README for more details.
     * @param options.unrestrictedMethods - The callable names of all JSON-RPC
     * methods ignored by the new controller.
     * @param options.messenger - The controller messenger. See
     * {@link BaseController} for more information.
     * @param options.state - Existing state to hydrate the controller with at
     * initialization.
     */
    constructor(options) {
        const { caveatSpecifications, permissionSpecifications, unrestrictedMethods, messenger, state = {}, } = options;
        super({
            name: controllerName,
            metadata: getStateMetadata(),
            messenger,
            state: Object.assign(Object.assign({}, getDefaultState()), state),
        });
        this._unrestrictedMethods = new Set(unrestrictedMethods);
        this._caveatSpecifications = (0, deep_freeze_strict_1.default)(Object.assign({}, caveatSpecifications));
        this.validatePermissionSpecifications(permissionSpecifications, this._caveatSpecifications);
        this._permissionSpecifications = (0, deep_freeze_strict_1.default)(Object.assign({}, permissionSpecifications));
        this.registerMessageHandlers();
        this.createPermissionMiddleware = (0, permission_middleware_1.getPermissionMiddlewareFactory)({
            executeRestrictedMethod: this._executeRestrictedMethod.bind(this),
            getRestrictedMethod: this.getRestrictedMethod.bind(this),
            isUnrestrictedMethod: this.unrestrictedMethods.has.bind(this.unrestrictedMethods),
        });
    }
    /**
     * The names of all JSON-RPC methods that will be ignored by the controller.
     *
     * @returns The names of all unrestricted JSON-RPC methods
     */
    get unrestrictedMethods() {
        return this._unrestrictedMethods;
    }
    /**
     * Gets a permission specification.
     *
     * @param targetKey - The target key of the permission specification to get.
     * @returns The permission specification with the specified target key.
     */
    getPermissionSpecification(targetKey) {
        return this._permissionSpecifications[targetKey];
    }
    /**
     * Gets a caveat specification.
     *
     * @param caveatType - The type of the caveat specification to get.
     * @returns The caveat specification with the specified type.
     */
    getCaveatSpecification(caveatType) {
        return this._caveatSpecifications[caveatType];
    }
    /**
     * Constructor helper for validating permission specifications. This is
     * intended to prevent the use of invalid target keys which, while impossible
     * to add in TypeScript, could rather easily occur in plain JavaScript.
     *
     * Throws an error if validation fails.
     *
     * @param permissionSpecifications - The permission specifications passed to
     * this controller's constructor.
     * @param caveatSpecifications - The caveat specifications passed to this
     * controller.
     */
    validatePermissionSpecifications(permissionSpecifications, caveatSpecifications) {
        Object.entries(permissionSpecifications).forEach(([targetKey, { permissionType, targetKey: innerTargetKey, allowedCaveats },]) => {
            if (!permissionType || !(0, util_1.hasProperty)(Permission_1.PermissionType, permissionType)) {
                throw new Error(`Invalid permission type: "${permissionType}"`);
            }
            // Check if the target key is the empty string, ends with "_", or ends
            // with "*" but not "_*"
            if (!targetKey || /_$/u.test(targetKey) || /[^_]\*$/u.test(targetKey)) {
                throw new Error(`Invalid permission target key: "${targetKey}"`);
            }
            if (targetKey !== innerTargetKey) {
                throw new Error(`Invalid permission specification: key "${targetKey}" must match specification.target value "${innerTargetKey}".`);
            }
            if (allowedCaveats) {
                allowedCaveats.forEach((caveatType) => {
                    if (!(0, util_1.hasProperty)(caveatSpecifications, caveatType)) {
                        throw new errors_1.UnrecognizedCaveatTypeError(caveatType);
                    }
                });
            }
        });
    }
    /**
     * Constructor helper for registering the controller's messaging system
     * actions.
     */
    registerMessageHandlers() {
        this.messagingSystem.registerActionHandler(`${controllerName}:clearPermissions`, () => this.clearState());
        this.messagingSystem.registerActionHandler(`${controllerName}:getEndowments`, (origin, targetName, requestData) => this.getEndowments(origin, targetName, requestData));
        this.messagingSystem.registerActionHandler(`${controllerName}:getSubjectNames`, () => this.getSubjectNames());
        this.messagingSystem.registerActionHandler(`${controllerName}:getPermissions`, (origin) => this.getPermissions(origin));
        this.messagingSystem.registerActionHandler(`${controllerName}:hasPermission`, (origin, targetName) => this.hasPermission(origin, targetName));
        this.messagingSystem.registerActionHandler(`${controllerName}:hasPermissions`, (origin) => this.hasPermissions(origin));
        this.messagingSystem.registerActionHandler(`${controllerName}:grantPermissions`, this.grantPermissions.bind(this));
        this.messagingSystem.registerActionHandler(`${controllerName}:requestPermissions`, (subject, permissions) => this.requestPermissions(subject, permissions));
        this.messagingSystem.registerActionHandler(`${controllerName}:revokeAllPermissions`, (origin) => this.revokeAllPermissions(origin));
        this.messagingSystem.registerActionHandler(`${controllerName}:revokePermissionForAllSubjects`, (target) => this.revokePermissionForAllSubjects(target));
        this.messagingSystem.registerActionHandler(`${controllerName}:revokePermissions`, this.revokePermissions.bind(this));
    }
    /**
     * Clears the state of the controller.
     */
    clearState() {
        this.update((_draftState) => {
            return Object.assign({}, getDefaultState());
        });
    }
    /**
     * Gets the permission specification corresponding to the given permission
     * type and target name. Throws an error if the target name does not
     * correspond to a permission, or if the specification is not of the
     * given permission type.
     *
     * @template Type - The type of the permission specification to get.
     * @param permissionType - The type of the permission specification to get.
     * @param targetName - The name of the permission whose specification to get.
     * @param requestingOrigin - The origin of the requesting subject, if any.
     * Will be added to any thrown errors.
     * @returns The specification object corresponding to the given type and
     * target name.
     */
    getTypedPermissionSpecification(permissionType, targetName, requestingOrigin) {
        const failureError = permissionType === Permission_1.PermissionType.RestrictedMethod
            ? (0, errors_1.methodNotFound)(targetName, requestingOrigin ? { origin: requestingOrigin } : undefined)
            : new errors_1.EndowmentPermissionDoesNotExistError(targetName, requestingOrigin);
        const targetKey = this.getTargetKey(targetName);
        if (!targetKey) {
            throw failureError;
        }
        const specification = this.getPermissionSpecification(targetKey);
        if (!(0, Permission_1.hasSpecificationType)(specification, permissionType)) {
            throw failureError;
        }
        return specification;
    }
    /**
     * Gets the implementation of the specified restricted method.
     *
     * A JSON-RPC error is thrown if the method does not exist.
     *
     * @see {@link PermissionController.executeRestrictedMethod} and
     * {@link PermissionController.createPermissionMiddleware} for internal usage.
     * @param method - The name of the restricted method.
     * @param origin - The origin associated with the request for the restricted
     * method, if any.
     * @returns The restricted method implementation.
     */
    getRestrictedMethod(method, origin) {
        return this.getTypedPermissionSpecification(Permission_1.PermissionType.RestrictedMethod, method, origin).methodImplementation;
    }
    /**
     * Gets a list of all origins of subjects.
     *
     * @returns The origins (i.e. IDs) of all subjects.
     */
    getSubjectNames() {
        return Object.keys(this.state.subjects);
    }
    /**
     * Gets the permission for the specified target of the subject corresponding
     * to the specified origin.
     *
     * @param origin - The origin of the subject.
     * @param targetName - The method name as invoked by a third party (i.e., not
     * a method key).
     * @returns The permission if it exists, or undefined otherwise.
     */
    getPermission(origin, targetName) {
        var _a;
        return (_a = this.state.subjects[origin]) === null || _a === void 0 ? void 0 : _a.permissions[targetName];
    }
    /**
     * Gets all permissions for the specified subject, if any.
     *
     * @param origin - The origin of the subject.
     * @returns The permissions of the subject, if any.
     */
    getPermissions(origin) {
        var _a;
        return (_a = this.state.subjects[origin]) === null || _a === void 0 ? void 0 : _a.permissions;
    }
    /**
     * Checks whether the subject with the specified origin has the specified
     * permission.
     *
     * @param origin - The origin of the subject.
     * @param target - The target name of the permission.
     * @returns Whether the subject has the permission.
     */
    hasPermission(origin, target) {
        return Boolean(this.getPermission(origin, target));
    }
    /**
     * Checks whether the subject with the specified origin has any permissions.
     * Use this if you want to know if a subject "exists".
     *
     * @param origin - The origin of the subject to check.
     * @returns Whether the subject has any permissions.
     */
    hasPermissions(origin) {
        return Boolean(this.state.subjects[origin]);
    }
    /**
     * Revokes all permissions from the specified origin.
     *
     * Throws an error of the origin has no permissions.
     *
     * @param origin - The origin whose permissions to revoke.
     */
    revokeAllPermissions(origin) {
        this.update((draftState) => {
            if (!draftState.subjects[origin]) {
                throw new errors_1.UnrecognizedSubjectError(origin);
            }
            delete draftState.subjects[origin];
        });
    }
    /**
     * Revokes the specified permission from the subject with the specified
     * origin.
     *
     * Throws an error if the subject or the permission does not exist.
     *
     * @param origin - The origin of the subject whose permission to revoke.
     * @param target - The target name of the permission to revoke.
     */
    revokePermission(origin, target) {
        this.revokePermissions({ [origin]: [target] });
    }
    /**
     * Revokes the specified permissions from the specified subjects.
     *
     * Throws an error if any of the subjects or permissions do not exist.
     *
     * @param subjectsAndPermissions - An object mapping subject origins
     * to arrays of permission target names to revoke.
     */
    revokePermissions(subjectsAndPermissions) {
        this.update((draftState) => {
            Object.keys(subjectsAndPermissions).forEach((origin) => {
                if (!(0, util_1.hasProperty)(draftState.subjects, origin)) {
                    throw new errors_1.UnrecognizedSubjectError(origin);
                }
                subjectsAndPermissions[origin].forEach((target) => {
                    const { permissions } = draftState.subjects[origin];
                    if (!(0, util_1.hasProperty)(permissions, target)) {
                        throw new errors_1.PermissionDoesNotExistError(origin, target);
                    }
                    this.deletePermission(draftState.subjects, origin, target);
                });
            });
        });
    }
    /**
     * Revokes all permissions corresponding to the specified target for all subjects.
     * Does nothing if no subjects or no such permission exists.
     *
     * @param target - The name of the target to revoke all permissions for.
     */
    revokePermissionForAllSubjects(target) {
        if (this.getSubjectNames().length === 0) {
            return;
        }
        this.update((draftState) => {
            Object.entries(draftState.subjects).forEach(([origin, subject]) => {
                const { permissions } = subject;
                if ((0, util_1.hasProperty)(permissions, target)) {
                    this.deletePermission(draftState.subjects, origin, target);
                }
            });
        });
    }
    /**
     * Deletes the permission identified by the given origin and target. If the
     * permission is the single remaining permission of its subject, the subject
     * is also deleted.
     *
     * @param subjects - The draft permission controller subjects.
     * @param origin - The origin of the subject associated with the permission
     * to delete.
     * @param target - The target name of the permission to delete.
     */
    deletePermission(subjects, origin, target) {
        const { permissions } = subjects[origin];
        if (Object.keys(permissions).length > 1) {
            delete permissions[target];
        }
        else {
            delete subjects[origin];
        }
    }
    /**
     * Checks whether the permission of the subject corresponding to the given
     * origin has a caveat of the specified type.
     *
     * Throws an error if the subject does not have a permission with the
     * specified target name.
     *
     * @template TargetName - The permission target name. Should be inferred.
     * @template CaveatType - The valid caveat types for the permission. Should
     * be inferred.
     * @param origin - The origin of the subject.
     * @param target - The target name of the permission.
     * @param caveatType - The type of the caveat to check for.
     * @returns Whether the permission has the specified caveat.
     */
    hasCaveat(origin, target, caveatType) {
        return Boolean(this.getCaveat(origin, target, caveatType));
    }
    /**
     * Gets the caveat of the specified type, if any, for the permission of
     * the subject corresponding to the given origin.
     *
     * Throws an error if the subject does not have a permission with the
     * specified target name.
     *
     * @template TargetName - The permission target name. Should be inferred.
     * @template CaveatType - The valid caveat types for the permission. Should
     * be inferred.
     * @param origin - The origin of the subject.
     * @param target - The target name of the permission.
     * @param caveatType - The type of the caveat to get.
     * @returns The caveat, or `undefined` if no such caveat exists.
     */
    getCaveat(origin, target, caveatType) {
        const permission = this.getPermission(origin, target);
        if (!permission) {
            throw new errors_1.PermissionDoesNotExistError(origin, target);
        }
        return (0, Permission_1.findCaveat)(permission, caveatType);
    }
    /**
     * Adds a caveat of the specified type, with the specified caveat value, to
     * the permission corresponding to the given subject origin and permission
     * target.
     *
     * For modifying existing caveats, use
     * {@link PermissionController.updateCaveat}.
     *
     * Throws an error if no such permission exists, or if the caveat already
     * exists.
     *
     * @template TargetName - The permission target name. Should be inferred.
     * @template CaveatType - The valid caveat types for the permission. Should
     * be inferred.
     * @param origin - The origin of the subject.
     * @param target - The target name of the permission.
     * @param caveatType - The type of the caveat to add.
     * @param caveatValue - The value of the caveat to add.
     */
    addCaveat(origin, target, caveatType, caveatValue) {
        if (this.hasCaveat(origin, target, caveatType)) {
            throw new errors_1.CaveatAlreadyExistsError(origin, target, caveatType);
        }
        this.setCaveat(origin, target, caveatType, caveatValue);
    }
    /**
     * Updates the value of the caveat of the specified type belonging to the
     * permission corresponding to the given subject origin and permission
     * target.
     *
     * For adding new caveats, use
     * {@link PermissionController.addCaveat}.
     *
     * Throws an error if no such permission or caveat exists.
     *
     * @template TargetName - The permission target name. Should be inferred.
     * @template CaveatType - The valid caveat types for the permission. Should
     * be inferred.
     * @param origin - The origin of the subject.
     * @param target - The target name of the permission.
     * @param caveatType - The type of the caveat to update.
     * @param caveatValue - The new value of the caveat.
     */
    updateCaveat(origin, target, caveatType, caveatValue) {
        if (!this.hasCaveat(origin, target, caveatType)) {
            throw new errors_1.CaveatDoesNotExistError(origin, target, caveatType);
        }
        this.setCaveat(origin, target, caveatType, caveatValue);
    }
    /**
     * Sets the specified caveat on the specified permission. Overwrites existing
     * caveats of the same type in-place (preserving array order), and adds the
     * caveat to the end of the array otherwise.
     *
     * Throws an error if the permission does not exist or fails to validate after
     * its caveats have been modified.
     *
     * @see {@link PermissionController.addCaveat}
     * @see {@link PermissionController.updateCaveat}
     * @template TargetName - The permission target name. Should be inferred.
     * @template CaveatType - The valid caveat types for the permission. Should
     * be inferred.
     * @param origin - The origin of the subject.
     * @param target - The target name of the permission.
     * @param caveatType - The type of the caveat to set.
     * @param caveatValue - The value of the caveat to set.
     */
    setCaveat(origin, target, caveatType, caveatValue) {
        this.update((draftState) => {
            const subject = draftState.subjects[origin];
            // Unreachable because `hasCaveat` is always called before this, and it
            // throws if permissions are missing. TypeScript needs this, however.
            /* istanbul ignore if */
            if (!subject) {
                throw new errors_1.UnrecognizedSubjectError(origin);
            }
            const permission = subject.permissions[target];
            /* istanbul ignore if: practically impossible, but TypeScript wants it */
            if (!permission) {
                throw new errors_1.PermissionDoesNotExistError(origin, target);
            }
            const caveat = {
                type: caveatType,
                value: caveatValue,
            };
            this.validateCaveat(caveat, origin, target);
            if (permission.caveats) {
                const caveatIndex = permission.caveats.findIndex((existingCaveat) => existingCaveat.type === caveat.type);
                if (caveatIndex === -1) {
                    permission.caveats.push(caveat);
                }
                else {
                    permission.caveats.splice(caveatIndex, 1, caveat);
                }
            }
            else {
                // Typecast: At this point, we don't know if the specific permission
                // is allowed to have caveats, but it should be impossible to call
                // this method for a permission that may not have any caveats.
                // If all else fails, the permission validator is also called.
                permission.caveats = [caveat];
            }
            this.validateModifiedPermission(permission, origin, target);
        });
    }
    /**
     * Updates all caveats with the specified type for all subjects and
     * permissions by applying the specified mutator function to them.
     *
     * ATTN: Permissions can be revoked entirely by the action of this method,
     * read on for details.
     *
     * Caveat mutators are functions that receive a caveat value and return a
     * tuple consisting of a {@link CaveatMutatorOperation} and, optionally, a new
     * value to update the existing caveat with.
     *
     * For each caveat, depending on the mutator result, this method will:
     * - Do nothing ({@link CaveatMutatorOperation.noop})
     * - Update the value of the caveat ({@link CaveatMutatorOperation.updateValue}). The caveat specification validator, if any, will be called after updating the value.
     * - Delete the caveat ({@link CaveatMutatorOperation.deleteCaveat}). The permission specification validator, if any, will be called after deleting the caveat.
     * - Revoke the parent permission ({@link CaveatMutatorOperation.revokePermission})
     *
     * This method throws if the validation of any caveat or permission fails.
     *
     * @param targetCaveatType - The type of the caveats to update.
     * @param mutator - The mutator function which will be applied to all caveat
     * values.
     */
    updatePermissionsByCaveat(targetCaveatType, mutator) {
        if (Object.keys(this.state.subjects).length === 0) {
            return;
        }
        this.update((draftState) => {
            Object.values(draftState.subjects).forEach((subject) => {
                Object.values(subject.permissions).forEach((permission) => {
                    const { caveats } = permission;
                    const targetCaveat = caveats === null || caveats === void 0 ? void 0 : caveats.find(({ type }) => type === targetCaveatType);
                    if (!targetCaveat) {
                        return;
                    }
                    // The mutator may modify the caveat value in place, and must always
                    // return a valid mutation result.
                    const mutatorResult = mutator(targetCaveat.value);
                    switch (mutatorResult.operation) {
                        case CaveatMutatorOperation.noop:
                            break;
                        case CaveatMutatorOperation.updateValue:
                            // Typecast: `Mutable` is used here to assign to a readonly
                            // property. `targetConstraint` should already be mutable because
                            // it's part of a draft, but for some reason it's not. We can't
                            // use the more-correct `Draft` type here either because it
                            // results in an error.
                            targetCaveat.value =
                                mutatorResult.value;
                            this.validateCaveat(targetCaveat, subject.origin, permission.parentCapability);
                            break;
                        case CaveatMutatorOperation.deleteCaveat:
                            this.deleteCaveat(permission, targetCaveatType, subject.origin, permission.parentCapability);
                            break;
                        case CaveatMutatorOperation.revokePermission:
                            this.deletePermission(draftState.subjects, subject.origin, permission.parentCapability);
                            break;
                        default: {
                            // This type check ensures that the switch statement is
                            // exhaustive.
                            const _exhaustiveCheck = mutatorResult;
                            throw new Error(`Unrecognized mutation result: "${_exhaustiveCheck.operation}"`);
                        }
                    }
                });
            });
        });
    }
    /**
     * Removes the caveat of the specified type from the permission corresponding
     * to the given subject origin and target name.
     *
     * Throws an error if no such permission or caveat exists.
     *
     * @template TargetName - The permission target name. Should be inferred.
     * @template CaveatType - The valid caveat types for the permission. Should
     * be inferred.
     * @param origin - The origin of the subject.
     * @param target - The target name of the permission.
     * @param caveatType - The type of the caveat to remove.
     */
    removeCaveat(origin, target, caveatType) {
        this.update((draftState) => {
            var _a;
            const permission = (_a = draftState.subjects[origin]) === null || _a === void 0 ? void 0 : _a.permissions[target];
            if (!permission) {
                throw new errors_1.PermissionDoesNotExistError(origin, target);
            }
            if (!permission.caveats) {
                throw new errors_1.CaveatDoesNotExistError(origin, target, caveatType);
            }
            this.deleteCaveat(permission, caveatType, origin, target);
        });
    }
    /**
     * Deletes the specified caveat from the specified permission. If no caveats
     * remain after deletion, the permission's caveat property is set to `null`.
     * The permission is validated after being modified.
     *
     * Throws an error if the permission does not have a caveat with the specified
     * type.
     *
     * @param permission - The permission whose caveat to delete.
     * @param caveatType - The type of the caveat to delete.
     * @param origin - The origin the permission subject.
     * @param target - The name of the permission target.
     */
    deleteCaveat(permission, caveatType, origin, target) {
        /* istanbul ignore if: not possible in our usage */
        if (!permission.caveats) {
            throw new errors_1.CaveatDoesNotExistError(origin, target, caveatType);
        }
        const caveatIndex = permission.caveats.findIndex((existingCaveat) => existingCaveat.type === caveatType);
        if (caveatIndex === -1) {
            throw new errors_1.CaveatDoesNotExistError(origin, target, caveatType);
        }
        if (permission.caveats.length === 1) {
            permission.caveats = null;
        }
        else {
            permission.caveats.splice(caveatIndex, 1);
        }
        this.validateModifiedPermission(permission, origin, target);
    }
    /**
     * Validates the specified modified permission. Should **always** be invoked
     * on a permission after its caveats have been modified.
     *
     * Just like {@link PermissionController.validatePermission}, except that the
     * corresponding target key and specification are retrieved first, and an
     * error is thrown if the target key does not exist.
     *
     * @param permission - The modified permission to validate.
     * @param origin - The origin associated with the permission.
     * @param targetName - The target name name of the permission.
     */
    validateModifiedPermission(permission, origin, targetName) {
        const targetKey = this.getTargetKey(permission.parentCapability);
        /* istanbul ignore if: this should be impossible */
        if (!targetKey) {
            throw new Error(`Fatal: Existing permission target key "${targetKey}" has no specification.`);
        }
        this.validatePermission(this.getPermissionSpecification(targetKey), permission, origin, targetName);
    }
    /**
     * Gets the key for the specified permission target.
     *
     * Used to support our namespaced permission target feature, which is used
     * to implement namespaced restricted JSON-RPC methods.
     *
     * @param target - The requested permission target.
     * @returns The internal key of the permission target.
     */
    getTargetKey(target) {
        if ((0, util_1.hasProperty)(this._permissionSpecifications, target)) {
            return target;
        }
        const namespacedTargetsWithoutWildcard = {};
        for (const targetKey of Object.keys(this._permissionSpecifications)) {
            const wildCardMatch = targetKey.match(/(.+)\*$/u);
            if (wildCardMatch) {
                namespacedTargetsWithoutWildcard[wildCardMatch[1]] = true;
            }
        }
        // Check for potentially nested namespaces:
        // Ex: wildzone_
        // Ex: eth_plugin_
        const segments = target.split('_');
        let targetKey = '';
        while (segments.length > 0 &&
            !(0, util_1.hasProperty)(this._permissionSpecifications, targetKey) &&
            !namespacedTargetsWithoutWildcard[targetKey]) {
            targetKey += `${segments.shift()}_`;
        }
        if (namespacedTargetsWithoutWildcard[targetKey]) {
            return `${targetKey}*`;
        }
        return undefined;
    }
    /**
     * Grants _approved_ permissions to the specified subject. Every permission and
     * caveat is stringently validated – including by calling every specification
     * validator – and an error is thrown if any validation fails.
     *
     * ATTN: This method does **not** prompt the user for approval.
     *
     * @see {@link PermissionController.requestPermissions} For initiating a
     * permissions request requiring user approval.
     * @param options - Options bag.
     * @param options.approvedPermissions - The requested permissions approved by
     * the user.
     * @param options.requestData - Permission request data. Passed to permission
     * factory functions.
     * @param options.preserveExistingPermissions - Whether to preserve the
     * subject's existing permissions.
     * @param options.subject - The subject to grant permissions to.
     * @returns The granted permissions.
     */
    grantPermissions({ approvedPermissions, requestData, preserveExistingPermissions = true, subject, }) {
        const { origin } = subject;
        if (!origin || typeof origin !== 'string') {
            throw new errors_1.InvalidSubjectIdentifierError(origin);
        }
        const permissions = (preserveExistingPermissions
            ? Object.assign({}, this.getPermissions(origin)) : {});
        for (const [requestedTarget, approvedPermission] of Object.entries(approvedPermissions)) {
            const targetKey = this.getTargetKey(requestedTarget);
            if (!targetKey) {
                throw (0, errors_1.methodNotFound)(requestedTarget);
            }
            if (approvedPermission.parentCapability !== undefined &&
                requestedTarget !== approvedPermission.parentCapability) {
                throw new errors_1.InvalidApprovedPermissionError(origin, requestedTarget, approvedPermission);
            }
            // The requested target must be a valid target name if we found its key.
            // We reassign it to change its type.
            const targetName = requestedTarget;
            const specification = this.getPermissionSpecification(targetKey);
            // The requested caveats are validated here.
            const caveats = this.constructCaveats(origin, targetName, approvedPermission.caveats);
            const permissionOptions = {
                caveats,
                invoker: origin,
                target: targetName,
            };
            let permission;
            if (specification.factory) {
                permission = specification.factory(permissionOptions, requestData);
                // Full caveat and permission validation is performed here since the
                // factory function can arbitrarily modify the entire permission object,
                // including its caveats.
                this.validatePermission(specification, permission, origin, targetName);
            }
            else {
                permission = (0, Permission_1.constructPermission)(permissionOptions);
                // We do not need to validate caveats in this case, because the plain
                // permission constructor function does not modify the caveats, which
                // were already validated by `constructCaveats` above.
                this.validatePermission(specification, permission, origin, targetName, {
                    invokePermissionValidator: true,
                    performCaveatValidation: false,
                });
            }
            permissions[targetName] = permission;
        }
        this.setValidatedPermissions(origin, permissions);
        return permissions;
    }
    /**
     * Validates the specified permission by:
     * - Ensuring that its `caveats` property is either `null` or a non-empty array.
     * - Ensuring that it only includes caveats allowed by its specification.
     * - Ensuring that it includes no duplicate caveats (by caveat type).
     * - Validating each caveat object, if `performCaveatValidation` is `true`.
     * - Calling the validator of its specification, if one exists and `invokePermissionValidator` is `true`.
     *
     * An error is thrown if validation fails.
     *
     * @param specification - The specification of the permission.
     * @param permission - The permission to validate.
     * @param origin - The origin associated with the permission.
     * @param targetName - The target name of the permission.
     * @param validationOptions - Validation options.
     * @param validationOptions.invokePermissionValidator - Whether to invoke the
     * permission's consumer-specified validator function, if any.
     * @param validationOptions.performCaveatValidation - Whether to invoke
     * {@link PermissionController.validateCaveat} on each of the permission's
     * caveats.
     */
    validatePermission(specification, permission, origin, targetName, { invokePermissionValidator, performCaveatValidation } = {
        invokePermissionValidator: true,
        performCaveatValidation: true,
    }) {
        const { allowedCaveats, validator } = specification;
        if ((0, util_1.hasProperty)(permission, 'caveats')) {
            const { caveats } = permission;
            if (caveats !== null && !(Array.isArray(caveats) && caveats.length > 0)) {
                throw new errors_1.InvalidCaveatsPropertyError(origin, targetName, caveats);
            }
            const seenCaveatTypes = new Set();
            caveats === null || caveats === void 0 ? void 0 : caveats.forEach((caveat) => {
                if (performCaveatValidation) {
                    this.validateCaveat(caveat, origin, targetName);
                }
                if (!(allowedCaveats === null || allowedCaveats === void 0 ? void 0 : allowedCaveats.includes(caveat.type))) {
                    throw new errors_1.ForbiddenCaveatError(caveat.type, origin, targetName);
                }
                if (seenCaveatTypes.has(caveat.type)) {
                    throw new errors_1.DuplicateCaveatError(caveat.type, origin, targetName);
                }
                seenCaveatTypes.add(caveat.type);
            });
        }
        if (invokePermissionValidator && validator) {
            validator(permission, origin, targetName);
        }
    }
    /**
     * Assigns the specified permissions to the subject with the given origin.
     * Overwrites all existing permissions, and creates a subject entry if it
     * doesn't already exist.
     *
     * ATTN: Assumes that the new permissions have been validated.
     *
     * @param origin - The origin of the grantee subject.
     * @param permissions - The new permissions for the grantee subject.
     */
    setValidatedPermissions(origin, permissions) {
        this.update((draftState) => {
            if (!draftState.subjects[origin]) {
                draftState.subjects[origin] = { origin, permissions: {} };
            }
            draftState.subjects[origin].permissions = (0, immer_1.castDraft)(permissions);
        });
    }
    /**
     * Validates the requested caveats for the permission of the specified
     * subject origin and target name and returns the validated caveat array.
     *
     * Throws an error if validation fails.
     *
     * @param origin - The origin of the permission subject.
     * @param target - The permission target name.
     * @param requestedCaveats - The requested caveats to construct.
     * @returns The constructed caveats.
     */
    constructCaveats(origin, target, requestedCaveats) {
        const caveatArray = requestedCaveats === null || requestedCaveats === void 0 ? void 0 : requestedCaveats.map((requestedCaveat) => {
            this.validateCaveat(requestedCaveat, origin, target);
            // Reassign so that we have a fresh object.
            const { type, value } = requestedCaveat;
            return { type, value };
        });
        return caveatArray && (0, util_1.isNonEmptyArray)(caveatArray)
            ? caveatArray
            : undefined;
    }
    /**
     * This methods validates that the specified caveat is an object with the
     * expected properties and types. It also ensures that a caveat specification
     * exists for the requested caveat type, and calls the specification
     * validator, if it exists, on the caveat object.
     *
     * Throws an error if validation fails.
     *
     * @param caveat - The caveat object to validate.
     * @param origin - The origin associated with the subject of the parent
     * permission.
     * @param target - The target name associated with the parent permission.
     */
    validateCaveat(caveat, origin, target) {
        var _a;
        if (!(0, util_1.isPlainObject)(caveat)) {
            throw new errors_1.InvalidCaveatError(caveat, origin, target);
        }
        if (Object.keys(caveat).length !== 2) {
            throw new errors_1.InvalidCaveatFieldsError(caveat, origin, target);
        }
        if (typeof caveat.type !== 'string') {
            throw new errors_1.InvalidCaveatTypeError(caveat, origin, target);
        }
        const specification = this.getCaveatSpecification(caveat.type);
        if (!specification) {
            throw new errors_1.UnrecognizedCaveatTypeError(caveat.type, origin, target);
        }
        if (!(0, util_1.hasProperty)(caveat, 'value') || caveat.value === undefined) {
            throw new errors_1.CaveatMissingValueError(caveat, origin, target);
        }
        if (!(0, util_1.isValidJson)(caveat.value)) {
            throw new errors_1.CaveatInvalidJsonError(caveat, origin, target);
        }
        // Typecast: TypeScript still believes that the caveat is a PlainObject.
        (_a = specification.validator) === null || _a === void 0 ? void 0 : _a.call(specification, caveat, origin, target);
    }
    /**
     * Initiates a permission request that requires user approval. This should
     * always be used to grant additional permissions to a subject, unless user
     * approval has been obtained through some other means.
     *
     * Permissions are validated at every step of the approval process, and this
     * method will reject if validation fails.
     *
     * @see {@link ApprovalController} For the user approval logic.
     * @see {@link PermissionController.acceptPermissionsRequest} For the method
     * that _accepts_ the request and resolves the user approval promise.
     * @see {@link PermissionController.rejectPermissionsRequest} For the method
     * that _rejects_ the request and the user approval promise.
     * @param subject - The grantee subject.
     * @param requestedPermissions - The requested permissions.
     * @param options - Additional options.
     * @param options.id - The id of the permissions request. Defaults to a unique
     * id.
     * @param options.preserveExistingPermissions - Whether to preserve the
     * subject's existing permissions. Defaults to `true`.
     * @returns The granted permissions and request metadata.
     */
    requestPermissions(subject, requestedPermissions, options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const { origin } = subject;
            const { id = (0, nanoid_1.nanoid)(), preserveExistingPermissions = true } = options;
            this.validateRequestedPermissions(origin, requestedPermissions);
            const metadata = {
                id,
                origin,
            };
            const permissionsRequest = {
                metadata,
                permissions: requestedPermissions,
            };
            const _a = yield this.requestUserApproval(permissionsRequest), { permissions: approvedPermissions } = _a, requestData = __rest(_a, ["permissions"]);
            return [
                this.grantPermissions({
                    subject,
                    approvedPermissions,
                    preserveExistingPermissions,
                    requestData,
                }),
                metadata,
            ];
        });
    }
    /**
     * Validates requested permissions. Throws if validation fails.
     *
     * This method ensures that the requested permissions are a properly
     * formatted {@link RequestedPermissions} object, and performs the same
     * validation as {@link PermissionController.grantPermissions}, except that
     * consumer-specified permission validator functions are not called, since
     * they are only called on fully constructed, approved permissions that are
     * otherwise completely valid.
     *
     * Unrecognzied properties on requested permissions are ignored.
     *
     * @param origin - The origin of the grantee subject.
     * @param requestedPermissions - The requested permissions.
     */
    validateRequestedPermissions(origin, requestedPermissions) {
        if (!(0, util_1.isPlainObject)(requestedPermissions)) {
            throw (0, errors_1.invalidParams)({
                message: `Requested permissions for origin "${origin}" is not a plain object.`,
                data: { origin, requestedPermissions },
            });
        }
        if (Object.keys(requestedPermissions).length === 0) {
            throw (0, errors_1.invalidParams)({
                message: `Permissions request for origin "${origin}" contains no permissions.`,
                data: { requestedPermissions },
            });
        }
        for (const targetName of Object.keys(requestedPermissions)) {
            const permission = requestedPermissions[targetName];
            const targetKey = this.getTargetKey(targetName);
            if (!targetKey) {
                throw (0, errors_1.methodNotFound)(targetName, { origin, requestedPermissions });
            }
            if (!(0, util_1.isPlainObject)(permission) ||
                (permission.parentCapability !== undefined &&
                    targetName !== permission.parentCapability)) {
                throw (0, errors_1.invalidParams)({
                    message: `Permissions request for origin "${origin}" contains invalid requested permission(s).`,
                    data: { origin, requestedPermissions },
                });
            }
            // Here we validate the permission without invoking its validator, if any.
            // The validator will be invoked after the permission has been approved.
            this.validatePermission(this.getPermissionSpecification(targetKey), 
            // Typecast: The permission is still a "PlainObject" here.
            permission, origin, targetName, { invokePermissionValidator: false, performCaveatValidation: true });
        }
    }
    /**
     * Adds a request to the {@link ApprovalController} using the
     * {@link AddApprovalRequest} action. Also validates the resulting approved
     * permissions request, and throws an error if validation fails.
     *
     * @param permissionsRequest - The permissions request object.
     * @returns The approved permissions request object.
     */
    requestUserApproval(permissionsRequest) {
        return __awaiter(this, void 0, void 0, function* () {
            const { origin, id } = permissionsRequest.metadata;
            const approvedRequest = yield this.messagingSystem.call('ApprovalController:addRequest', {
                id,
                origin,
                requestData: permissionsRequest,
                type: utils_1.MethodNames.requestPermissions,
            }, true);
            this.validateApprovedPermissions(approvedRequest, { id, origin });
            return approvedRequest;
        });
    }
    /**
     * Validates an approved {@link PermissionsRequest} object. The approved
     * request must have the required `metadata` and `permissions` properties,
     * the `id` and `origin` of the `metadata` must match the original request
     * metadata, and the requested permissions must be valid per
     * {@link PermissionController.validateRequestedPermissions}. Any extra
     * metadata properties are ignored.
     *
     * An error is thrown if validation fails.
     *
     * @param approvedRequest - The approved permissions request object.
     * @param originalMetadata - The original request metadata.
     */
    validateApprovedPermissions(approvedRequest, originalMetadata) {
        const { id, origin } = originalMetadata;
        if (!(0, util_1.isPlainObject)(approvedRequest) ||
            !(0, util_1.isPlainObject)(approvedRequest.metadata)) {
            throw (0, errors_1.internalError)(`Approved permissions request for subject "${origin}" is invalid.`, { data: { approvedRequest } });
        }
        const { metadata: { id: newId, origin: newOrigin }, permissions, } = approvedRequest;
        if (newId !== id) {
            throw (0, errors_1.internalError)(`Approved permissions request for subject "${origin}" mutated its id.`, { originalId: id, mutatedId: newId });
        }
        if (newOrigin !== origin) {
            throw (0, errors_1.internalError)(`Approved permissions request for subject "${origin}" mutated its origin.`, { originalOrigin: origin, mutatedOrigin: newOrigin });
        }
        try {
            this.validateRequestedPermissions(origin, permissions);
        }
        catch (error) {
            if (error instanceof eth_rpc_errors_1.EthereumRpcError) {
                // Re-throw as an internal error; we should never receive invalid approved
                // permissions.
                throw (0, errors_1.internalError)(`Invalid approved permissions request: ${error.message}`, error.data);
            }
            throw (0, errors_1.internalError)('Unrecognized error type', { error });
        }
    }
    /**
     * Accepts a permissions request created by
     * {@link PermissionController.requestPermissions}.
     *
     * @param request - The permissions request.
     */
    acceptPermissionsRequest(request) {
        return __awaiter(this, void 0, void 0, function* () {
            const { id } = request.metadata;
            if (!this.hasApprovalRequest({ id })) {
                throw new errors_1.PermissionsRequestNotFoundError(id);
            }
            if (Object.keys(request.permissions).length === 0) {
                this._rejectPermissionsRequest(id, (0, errors_1.invalidParams)({
                    message: 'Must request at least one permission.',
                }));
                return;
            }
            try {
                this.messagingSystem.call('ApprovalController:acceptRequest', id, request);
            }
            catch (error) {
                // If accepting unexpectedly fails, reject the request and re-throw the
                // error
                this._rejectPermissionsRequest(id, error);
                throw error;
            }
        });
    }
    /**
     * Rejects a permissions request created by
     * {@link PermissionController.requestPermissions}.
     *
     * @param id - The id of the request to be rejected.
     */
    rejectPermissionsRequest(id) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.hasApprovalRequest({ id })) {
                throw new errors_1.PermissionsRequestNotFoundError(id);
            }
            this._rejectPermissionsRequest(id, (0, errors_1.userRejectedRequest)());
        });
    }
    /**
     * Checks whether the {@link ApprovalController} has a particular permissions
     * request.
     *
     * @see {@link PermissionController.acceptPermissionsRequest} and
     * {@link PermissionController.rejectPermissionsRequest} for usage.
     * @param options - The {@link HasApprovalRequest} options.
     * @param options.id - The id of the approval request to check for.
     * @returns Whether the specified request exists.
     */
    hasApprovalRequest(options) {
        return this.messagingSystem.call('ApprovalController:hasRequest', 
        // Typecast: For some reason, the type here expects all of the possible
        // HasApprovalRequest options to be specified, when they're actually all
        // optional. Passing just the id is definitely valid, so we just cast it.
        options);
    }
    /**
     * Rejects the permissions request with the specified id, with the specified
     * error as the reason. This method is effectively a wrapper around a
     * messenger call for the `ApprovalController:rejectRequest` action.
     *
     * @see {@link PermissionController.acceptPermissionsRequest} and
     * {@link PermissionController.rejectPermissionsRequest} for usage.
     * @param id - The id of the request to reject.
     * @param error - The error associated with the rejection.
     * @returns Nothing
     */
    _rejectPermissionsRequest(id, error) {
        return this.messagingSystem.call('ApprovalController:rejectRequest', id, error);
    }
    /**
     * Gets the subject's endowments per the specified endowment permission.
     * Throws if the subject does not have the required permission or if the
     * permission is not an endowment permission.
     *
     * @param origin - The origin of the subject whose endowments to retrieve.
     * @param targetName - The name of the endowment permission. This must be a
     * valid permission target name.
     * @param requestData - Additional data associated with the request, if any.
     * Forwarded to the endowment getter function for the permission.
     * @returns The endowments, if any.
     */
    getEndowments(origin, targetName, requestData) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.hasPermission(origin, targetName)) {
                throw (0, errors_1.unauthorized)({ data: { origin, targetName } });
            }
            return this.getTypedPermissionSpecification(Permission_1.PermissionType.Endowment, targetName, origin).endowmentGetter({ origin, requestData });
        });
    }
    /**
     * Executes a restricted method as the subject with the given origin.
     * The specified params, if any, will be passed to the method implementation.
     *
     * ATTN: Great caution should be exercised in the use of this method.
     * Methods that cause side effects or affect application state should
     * be avoided.
     *
     * This method will first attempt to retrieve the requested restricted method
     * implementation, throwing if it does not exist. The method will then be
     * invoked as though the subject with the specified origin had invoked it with
     * the specified parameters. This means that any existing caveats will be
     * applied to the restricted method, and this method will throw if the
     * restricted method or its caveat decorators throw.
     *
     * In addition, this method will throw if the subject does not have a
     * permission for the specified restricted method.
     *
     * @param origin - The origin of the subject to execute the method on behalf
     * of.
     * @param targetName - The name of the method to execute. This must be a valid
     * permission target name.
     * @param params - The parameters to pass to the method implementation.
     * @returns The result of the executed method.
     */
    executeRestrictedMethod(origin, targetName, params) {
        return __awaiter(this, void 0, void 0, function* () {
            // Throws if the method does not exist
            const methodImplementation = this.getRestrictedMethod(targetName, origin);
            const result = yield this._executeRestrictedMethod(methodImplementation, { origin }, targetName, params);
            if (result === undefined) {
                throw new Error(`Internal request for method "${targetName}" as origin "${origin}" returned no result.`);
            }
            return result;
        });
    }
    /**
     * An internal method used in the controller's `json-rpc-engine` middleware
     * and {@link PermissionController.executeRestrictedMethod}. Calls the
     * specified restricted method implementation after decorating it with the
     * caveats of its permission. Throws if the subject does not have the
     * requisite permission.
     *
     * ATTN: Parameter validation is the responsibility of the caller, or
     * the restricted method implementation in the case of `params`.
     *
     * @see {@link PermissionController.executeRestrictedMethod} and
     * {@link PermissionController.createPermissionMiddleware} for usage.
     * @param methodImplementation - The implementation of the method to call.
     * @param subject - Metadata about the subject that made the request.
     * @param method - The method name
     * @param params - Params needed for executing the restricted method
     * @returns The result of the restricted method implementation
     */
    _executeRestrictedMethod(methodImplementation, subject, method, params = []) {
        const { origin } = subject;
        const permission = this.getPermission(origin, method);
        if (!permission) {
            throw (0, errors_1.unauthorized)({ data: { origin, method } });
        }
        return (0, Caveat_1.decorateWithCaveats)(methodImplementation, permission, this._caveatSpecifications)({ method, params, context: { origin } });
    }
}
exports.PermissionController = PermissionController;
//# sourceMappingURL=PermissionController.js.map