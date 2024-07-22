import {
  decorateWithCaveats,
  isRestrictedMethodCaveatSpecification
} from "./chunk-3WWJKO7P.mjs";
import {
  PermissionType,
  constructPermission,
  findCaveat,
  hasSpecificationType
} from "./chunk-HYMS7IGB.mjs";
import {
  getPermissionMiddlewareFactory
} from "./chunk-I62TTXZ6.mjs";
import {
  CaveatAlreadyExistsError,
  CaveatDoesNotExistError,
  CaveatInvalidJsonError,
  CaveatMergeTypeMismatchError,
  CaveatMergerDoesNotExistError,
  CaveatMissingValueError,
  CaveatSpecificationMismatchError,
  DuplicateCaveatError,
  EndowmentPermissionDoesNotExistError,
  ForbiddenCaveatError,
  InvalidApprovedPermissionError,
  InvalidCaveatError,
  InvalidCaveatFieldsError,
  InvalidCaveatTypeError,
  InvalidCaveatsPropertyError,
  InvalidMergedPermissionsError,
  InvalidSubjectIdentifierError,
  PermissionDoesNotExistError,
  PermissionsRequestNotFoundError,
  UnrecognizedCaveatTypeError,
  UnrecognizedSubjectError,
  internalError,
  invalidParams,
  methodNotFound,
  unauthorized,
  userRejectedRequest
} from "./chunk-G4BWJ7EA.mjs";
import {
  collectUniqueAndPairedCaveats
} from "./chunk-4NAVRO44.mjs";
import {
  __privateAdd,
  __privateMethod
} from "./chunk-2L4QPE5A.mjs";

// src/PermissionController.ts
import { BaseController } from "@metamask/base-controller";
import {
  isNonEmptyArray,
  isPlainObject,
  isValidJson
} from "@metamask/controller-utils";
import { JsonRpcError } from "@metamask/rpc-errors";
import { hasProperty } from "@metamask/utils";
import deepFreeze from "deep-freeze-strict";
import { castDraft, produce as immerProduce } from "immer";
import { nanoid } from "nanoid";
var controllerName = "PermissionController";
function getStateMetadata() {
  return { subjects: { anonymous: true, persist: true } };
}
function getDefaultState() {
  return { subjects: {} };
}
var CaveatMutatorOperation = /* @__PURE__ */ ((CaveatMutatorOperation2) => {
  CaveatMutatorOperation2[CaveatMutatorOperation2["Noop"] = 0] = "Noop";
  CaveatMutatorOperation2[CaveatMutatorOperation2["UpdateValue"] = 1] = "UpdateValue";
  CaveatMutatorOperation2[CaveatMutatorOperation2["DeleteCaveat"] = 2] = "DeleteCaveat";
  CaveatMutatorOperation2[CaveatMutatorOperation2["RevokePermission"] = 3] = "RevokePermission";
  return CaveatMutatorOperation2;
})(CaveatMutatorOperation || {});
var _expectGetCaveatMerger, expectGetCaveatMerger_fn, _applyGrantedPermissions, applyGrantedPermissions_fn, _mergeIncrementalPermissions, mergeIncrementalPermissions_fn, _mergePermission, mergePermission_fn, _mergeCaveat, mergeCaveat_fn, _handleApprovedPermissions, handleApprovedPermissions_fn;
var PermissionController = class extends BaseController {
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
    const {
      caveatSpecifications,
      permissionSpecifications,
      unrestrictedMethods,
      messenger,
      state = {}
    } = options;
    super({
      name: controllerName,
      metadata: getStateMetadata(),
      messenger,
      state: {
        ...getDefaultState(),
        ...state
      }
    });
    /**
     * Gets the merger function for the specified caveat. Throws if no
     * merger exists.
     *
     * @param caveatType - The type of the caveat whose merger to get.
     * @returns The caveat value merger function for the specified caveat type.
     */
    __privateAdd(this, _expectGetCaveatMerger);
    __privateAdd(this, _applyGrantedPermissions);
    /**
     * Merges a set of incrementally requested permissions into the existing permissions of
     * the requesting subject. The merge is a right-biased union, where the existing
     * permissions are the left-hand side, and the incrementally requested permissions are
     * the right-hand side.
     *
     * @param existingPermissions - The subject's existing permissions.
     * @param incrementalRequestedPermissions - The requested permissions to merge.
     * @returns The merged permissions and the resulting diff.
     */
    __privateAdd(this, _mergeIncrementalPermissions);
    /**
     * Performs a right-biased union between two permissions. The task of merging caveats
     * of the same type between the two permissions is delegated to the corresponding
     * caveat type's merger implementation.
     *
     * Throws if the left-hand and right-hand permissions both have a caveat whose
     * specification does not provide a caveat value merger function.
     *
     * @param leftPermission - The left-hand permission to merge.
     * @param rightPermission - The right-hand permission to merge.
     * @returns The merged permission.
     */
    __privateAdd(this, _mergePermission);
    /**
     * Merges two caveats of the same type. The task of merging the values of the
     * two caveats is delegated to the corresponding caveat type's merger implementation.
     *
     * @param leftCaveat - The left-hand caveat to merge.
     * @param rightCaveat - The right-hand caveat to merge.
     * @returns The merged caveat and the diff between the two caveats.
     */
    __privateAdd(this, _mergeCaveat);
    /**
     * Accepts a permissions request that has been approved by the user. This
     * method should be called after the user has approved the request and the
     * {@link ApprovalController} has resolved the user approval promise.
     *
     * @param options - Options bag.
     * @param options.subject - The subject to grant permissions to.
     * @param options.metadata - The metadata of the approved permissions request.
     * @param options.preserveExistingPermissions - Whether to preserve the
     * subject's existing permissions.
     * @param options.approvedRequest - The approved permissions request to handle.
     * @returns The granted permissions and request metadata.
     */
    __privateAdd(this, _handleApprovedPermissions);
    this._unrestrictedMethods = new Set(unrestrictedMethods);
    this._caveatSpecifications = deepFreeze({ ...caveatSpecifications });
    this.validatePermissionSpecifications(
      permissionSpecifications,
      this._caveatSpecifications
    );
    this._permissionSpecifications = deepFreeze({
      ...permissionSpecifications
    });
    this.registerMessageHandlers();
    this.createPermissionMiddleware = getPermissionMiddlewareFactory({
      executeRestrictedMethod: this._executeRestrictedMethod.bind(this),
      getRestrictedMethod: this.getRestrictedMethod.bind(this),
      isUnrestrictedMethod: this.unrestrictedMethods.has.bind(
        this.unrestrictedMethods
      )
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
   * @param targetName - The name of the permission specification to get.
   * @returns The permission specification with the specified target name.
   */
  getPermissionSpecification(targetName) {
    return this._permissionSpecifications[targetName];
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
   * Constructor helper for validating permission specifications.
   *
   * Throws an error if validation fails.
   *
   * @param permissionSpecifications - The permission specifications passed to
   * this controller's constructor.
   * @param caveatSpecifications - The caveat specifications passed to this
   * controller.
   */
  validatePermissionSpecifications(permissionSpecifications, caveatSpecifications) {
    Object.entries(
      permissionSpecifications
    ).forEach(
      ([
        targetName,
        { permissionType, targetName: innerTargetName, allowedCaveats }
      ]) => {
        if (!permissionType || !hasProperty(PermissionType, permissionType)) {
          throw new Error(`Invalid permission type: "${permissionType}"`);
        }
        if (!targetName) {
          throw new Error(`Invalid permission target name: "${targetName}"`);
        }
        if (targetName !== innerTargetName) {
          throw new Error(
            `Invalid permission specification: target name "${targetName}" must match specification.targetName value "${innerTargetName}".`
          );
        }
        if (allowedCaveats) {
          allowedCaveats.forEach((caveatType) => {
            if (!hasProperty(caveatSpecifications, caveatType)) {
              throw new UnrecognizedCaveatTypeError(caveatType);
            }
            const specification = caveatSpecifications[caveatType];
            const isRestrictedMethodCaveat = isRestrictedMethodCaveatSpecification(specification);
            if (permissionType === "RestrictedMethod" /* RestrictedMethod */ && !isRestrictedMethodCaveat || permissionType === "Endowment" /* Endowment */ && isRestrictedMethodCaveat) {
              throw new CaveatSpecificationMismatchError(
                specification,
                permissionType
              );
            }
          });
        }
      }
    );
  }
  /**
   * Constructor helper for registering the controller's messaging system
   * actions.
   */
  registerMessageHandlers() {
    this.messagingSystem.registerActionHandler(
      `${controllerName}:clearPermissions`,
      () => this.clearState()
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:getEndowments`,
      (origin, targetName, requestData) => this.getEndowments(origin, targetName, requestData)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:getSubjectNames`,
      () => this.getSubjectNames()
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:getPermissions`,
      (origin) => this.getPermissions(origin)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:hasPermission`,
      (origin, targetName) => this.hasPermission(origin, targetName)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:hasPermissions`,
      (origin) => this.hasPermissions(origin)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:grantPermissions`,
      this.grantPermissions.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:grantPermissionsIncremental`,
      this.grantPermissionsIncremental.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:requestPermissions`,
      (subject, permissions) => this.requestPermissions(subject, permissions)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:requestPermissionsIncremental`,
      (subject, permissions) => this.requestPermissionsIncremental(subject, permissions)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:revokeAllPermissions`,
      (origin) => this.revokeAllPermissions(origin)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:revokePermissionForAllSubjects`,
      (target) => this.revokePermissionForAllSubjects(target)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:revokePermissions`,
      this.revokePermissions.bind(this)
    );
    this.messagingSystem.registerActionHandler(
      `${controllerName}:updateCaveat`,
      (origin, target, caveatType, caveatValue) => {
        this.updateCaveat(
          origin,
          target,
          caveatType,
          caveatValue
        );
      }
    );
  }
  /**
   * Clears the state of the controller.
   */
  clearState() {
    this.update((_draftState) => {
      return {
        ...getDefaultState()
      };
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
    const failureError = permissionType === "RestrictedMethod" /* RestrictedMethod */ ? methodNotFound(
      targetName,
      requestingOrigin ? { origin: requestingOrigin } : void 0
    ) : new EndowmentPermissionDoesNotExistError(
      targetName,
      requestingOrigin
    );
    if (!this.targetExists(targetName)) {
      throw failureError;
    }
    const specification = this.getPermissionSpecification(targetName);
    if (!hasSpecificationType(specification, permissionType)) {
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
    return this.getTypedPermissionSpecification(
      "RestrictedMethod" /* RestrictedMethod */,
      method,
      origin
    ).methodImplementation;
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
    return this.state.subjects[origin]?.permissions[targetName];
  }
  /**
   * Gets all permissions for the specified subject, if any.
   *
   * @param origin - The origin of the subject.
   * @returns The permissions of the subject, if any.
   */
  getPermissions(origin) {
    return this.state.subjects[origin]?.permissions;
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
        throw new UnrecognizedSubjectError(origin);
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
        if (!hasProperty(draftState.subjects, origin)) {
          throw new UnrecognizedSubjectError(origin);
        }
        subjectsAndPermissions[origin].forEach((target) => {
          const { permissions } = draftState.subjects[origin];
          if (!hasProperty(permissions, target)) {
            throw new PermissionDoesNotExistError(origin, target);
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
        if (hasProperty(permissions, target)) {
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
    } else {
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
      throw new PermissionDoesNotExistError(origin, target);
    }
    return findCaveat(permission, caveatType);
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
      throw new CaveatAlreadyExistsError(origin, target, caveatType);
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
      throw new CaveatDoesNotExistError(origin, target, caveatType);
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
      if (!subject) {
        throw new UnrecognizedSubjectError(origin);
      }
      const permission = subject.permissions[target];
      if (!permission) {
        throw new PermissionDoesNotExistError(origin, target);
      }
      const caveat = {
        type: caveatType,
        value: caveatValue
      };
      this.validateCaveat(caveat, origin, target);
      if (permission.caveats) {
        const caveatIndex = permission.caveats.findIndex(
          (existingCaveat) => existingCaveat.type === caveat.type
        );
        if (caveatIndex === -1) {
          permission.caveats.push(caveat);
        } else {
          permission.caveats.splice(caveatIndex, 1, caveat);
        }
      } else {
        permission.caveats = [caveat];
      }
      this.validateModifiedPermission(permission, origin);
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
   * - Do nothing ({@link CaveatMutatorOperation.Noop})
   * - Update the value of the caveat ({@link CaveatMutatorOperation.UpdateValue}). The caveat specification validator, if any, will be called after updating the value.
   * - Delete the caveat ({@link CaveatMutatorOperation.DeleteCaveat}). The permission specification validator, if any, will be called after deleting the caveat.
   * - Revoke the parent permission ({@link CaveatMutatorOperation.RevokePermission})
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
          const targetCaveat = caveats?.find(
            ({ type }) => type === targetCaveatType
          );
          if (!targetCaveat) {
            return;
          }
          const mutatorResult = mutator(targetCaveat.value);
          const { operation } = mutatorResult;
          switch (operation) {
            case 0 /* Noop */:
              break;
            case 1 /* UpdateValue */:
              targetCaveat.value = mutatorResult.value;
              this.validateCaveat(
                targetCaveat,
                subject.origin,
                permission.parentCapability
              );
              break;
            case 2 /* DeleteCaveat */:
              this.deleteCaveat(permission, targetCaveatType, subject.origin);
              break;
            case 3 /* RevokePermission */:
              this.deletePermission(
                draftState.subjects,
                subject.origin,
                permission.parentCapability
              );
              break;
            default: {
              throw new Error(`Unrecognized mutation result: "${operation}"`);
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
      const permission = draftState.subjects[origin]?.permissions[target];
      if (!permission) {
        throw new PermissionDoesNotExistError(origin, target);
      }
      if (!permission.caveats) {
        throw new CaveatDoesNotExistError(origin, target, caveatType);
      }
      this.deleteCaveat(permission, caveatType, origin);
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
   */
  deleteCaveat(permission, caveatType, origin) {
    if (!permission.caveats) {
      throw new CaveatDoesNotExistError(
        origin,
        permission.parentCapability,
        caveatType
      );
    }
    const caveatIndex = permission.caveats.findIndex(
      (existingCaveat) => existingCaveat.type === caveatType
    );
    if (caveatIndex === -1) {
      throw new CaveatDoesNotExistError(
        origin,
        permission.parentCapability,
        caveatType
      );
    }
    if (permission.caveats.length === 1) {
      permission.caveats = null;
    } else {
      permission.caveats.splice(caveatIndex, 1);
    }
    this.validateModifiedPermission(permission, origin);
  }
  /**
   * Validates the specified modified permission. Should **always** be invoked
   * on a permission after its caveats have been modified.
   *
   * Just like {@link PermissionController.validatePermission}, except that the
   * corresponding target name and specification are retrieved first, and an
   * error is thrown if the target name does not exist.
   *
   * @param permission - The modified permission to validate.
   * @param origin - The origin associated with the permission.
   */
  validateModifiedPermission(permission, origin) {
    if (!this.targetExists(permission.parentCapability)) {
      throw new Error(
        `Fatal: Existing permission target "${permission.parentCapability}" has no specification.`
      );
    }
    this.validatePermission(
      this.getPermissionSpecification(permission.parentCapability),
      permission,
      origin
    );
  }
  /**
   * Verifies the existence the specified permission target, i.e. whether it has
   * a specification.
   *
   * @param target - The requested permission target.
   * @returns Whether the permission target exists.
   */
  targetExists(target) {
    return hasProperty(this._permissionSpecifications, target);
  }
  /**
   * Grants _approved_ permissions to the specified subject. Every permission and
   * caveat is stringently validated—including by calling their specification
   * validators—and an error is thrown if validation fails.
   *
   * ATTN: This method does **not** prompt the user for approval. User consent must
   * first be obtained through some other means.
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
   * @returns The subject's new permission state. It may or may not have changed.
   */
  grantPermissions({
    approvedPermissions,
    requestData,
    preserveExistingPermissions = true,
    subject
  }) {
    return __privateMethod(this, _applyGrantedPermissions, applyGrantedPermissions_fn).call(this, {
      approvedPermissions,
      subject,
      mergePermissions: false,
      preserveExistingPermissions,
      requestData
    });
  }
  /**
   * Incrementally grants _approved_ permissions to the specified subject. Every
   * permission and caveat is stringently validated—including by calling their
   * specification validators—and an error is thrown if validation fails.
   *
   * ATTN: This method does **not** prompt the user for approval. User consent must
   * first be obtained through some other means.
   *
   * @see {@link PermissionController.requestPermissionsIncremental} For initiating
   * an incremental permissions request requiring user approval.
   * @param options - Options bag.
   * @param options.approvedPermissions - The requested permissions approved by
   * the user.
   * @param options.requestData - Permission request data. Passed to permission
   * factory functions.
   * @param options.subject - The subject to grant permissions to.
   * @returns The subject's new permission state. It may or may not have changed.
   */
  grantPermissionsIncremental({
    approvedPermissions,
    requestData,
    subject
  }) {
    return __privateMethod(this, _applyGrantedPermissions, applyGrantedPermissions_fn).call(this, {
      approvedPermissions,
      subject,
      mergePermissions: true,
      preserveExistingPermissions: true,
      requestData
    });
  }
  /**
   * Validates the specified permission by:
   * - Ensuring that if `subjectTypes` is specified, the subject requesting the permission is of a type in the list.
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
   * @param validationOptions - Validation options.
   * @param validationOptions.invokePermissionValidator - Whether to invoke the
   * permission's consumer-specified validator function, if any.
   * @param validationOptions.performCaveatValidation - Whether to invoke
   * {@link PermissionController.validateCaveat} on each of the permission's
   * caveats.
   */
  validatePermission(specification, permission, origin, { invokePermissionValidator, performCaveatValidation } = {
    invokePermissionValidator: true,
    performCaveatValidation: true
  }) {
    const { allowedCaveats, validator, targetName } = specification;
    if (specification.subjectTypes?.length && specification.subjectTypes.length > 0) {
      const metadata = this.messagingSystem.call(
        "SubjectMetadataController:getSubjectMetadata",
        origin
      );
      if (!metadata || metadata.subjectType === null || !specification.subjectTypes.includes(metadata.subjectType)) {
        throw specification.permissionType === "RestrictedMethod" /* RestrictedMethod */ ? methodNotFound(targetName, { origin }) : new EndowmentPermissionDoesNotExistError(targetName, origin);
      }
    }
    if (hasProperty(permission, "caveats")) {
      const { caveats } = permission;
      if (caveats !== null && !(Array.isArray(caveats) && caveats.length > 0)) {
        throw new InvalidCaveatsPropertyError(origin, targetName, caveats);
      }
      const seenCaveatTypes = /* @__PURE__ */ new Set();
      caveats?.forEach((caveat) => {
        if (performCaveatValidation) {
          this.validateCaveat(caveat, origin, targetName);
        }
        if (!allowedCaveats?.includes(caveat.type)) {
          throw new ForbiddenCaveatError(caveat.type, origin, targetName);
        }
        if (seenCaveatTypes.has(caveat.type)) {
          throw new DuplicateCaveatError(caveat.type, origin, targetName);
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
      draftState.subjects[origin].permissions = castDraft(permissions);
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
    const caveatArray = requestedCaveats?.map((requestedCaveat) => {
      this.validateCaveat(requestedCaveat, origin, target);
      const { type, value } = requestedCaveat;
      return { type, value };
    });
    return caveatArray && isNonEmptyArray(caveatArray) ? caveatArray : void 0;
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
    if (!isPlainObject(caveat)) {
      throw new InvalidCaveatError(caveat, origin, target);
    }
    if (Object.keys(caveat).length !== 2) {
      throw new InvalidCaveatFieldsError(caveat, origin, target);
    }
    if (typeof caveat.type !== "string") {
      throw new InvalidCaveatTypeError(caveat, origin, target);
    }
    const specification = this.getCaveatSpecification(caveat.type);
    if (!specification) {
      throw new UnrecognizedCaveatTypeError(caveat.type, origin, target);
    }
    if (!hasProperty(caveat, "value") || caveat.value === void 0) {
      throw new CaveatMissingValueError(caveat, origin, target);
    }
    if (!isValidJson(caveat.value)) {
      throw new CaveatInvalidJsonError(caveat, origin, target);
    }
    specification.validator?.(caveat, origin, target);
  }
  /**
   * Initiates a permission request that requires user approval.
   *
   * Either this or {@link PermissionController.requestPermissionsIncremental}
   * should always be used to grant additional permissions to a subject,
   * unless user approval has been obtained through some other means.
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
   * @param options.metadata - Additional metadata about the permission request.
   * @returns The granted permissions and request metadata.
   */
  async requestPermissions(subject, requestedPermissions, options = {}) {
    const { origin } = subject;
    const { id = nanoid(), preserveExistingPermissions = true } = options;
    this.validateRequestedPermissions(origin, requestedPermissions);
    const metadata = {
      ...options.metadata,
      id,
      origin
    };
    const permissionsRequest = {
      metadata,
      permissions: requestedPermissions
    };
    const approvedRequest = await this.requestUserApproval(permissionsRequest);
    return await __privateMethod(this, _handleApprovedPermissions, handleApprovedPermissions_fn).call(this, {
      subject,
      metadata,
      preserveExistingPermissions,
      approvedRequest
    });
  }
  /**
   * Initiates an incremental permission request that prompts for user approval.
   * Incremental permission requests allow the caller to replace existing and/or
   * add brand new permissions and caveats for the specified subject.
   *
   * Incremental permission request are merged with the subject's existing permissions
   * through a right-biased union, where the incremental permission are the right-hand
   * side of the merger. If both sides of the merger specify the same caveats for a
   * given permission, the caveats are merged using their specification's caveat value
   * merger property.
   *
   * Either this or {@link PermissionController.requestPermissions} should
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
   * @param options.metadata - Additional metadata about the permission request.
   * @returns The granted permissions and request metadata.
   */
  async requestPermissionsIncremental(subject, requestedPermissions, options = {}) {
    const { origin } = subject;
    const { id = nanoid() } = options;
    this.validateRequestedPermissions(origin, requestedPermissions);
    const currentPermissions = this.getPermissions(origin) ?? {};
    const [newPermissions, permissionDiffMap] = __privateMethod(this, _mergeIncrementalPermissions, mergeIncrementalPermissions_fn).call(this, currentPermissions, requestedPermissions);
    if (newPermissions === void 0 || permissionDiffMap === void 0) {
      return [];
    }
    try {
      this.validateRequestedPermissions(origin, newPermissions);
    } catch (error) {
      if (error instanceof Error) {
        throw new InvalidMergedPermissionsError(
          origin,
          error,
          permissionDiffMap
        );
      }
      throw internalError("Unrecognized error type", { error });
    }
    const metadata = {
      ...options.metadata,
      id,
      origin
    };
    const permissionsRequest = {
      metadata,
      permissions: newPermissions,
      diff: {
        currentPermissions,
        permissionDiffMap
      }
    };
    const approvedRequest = await this.requestUserApproval(permissionsRequest);
    return await __privateMethod(this, _handleApprovedPermissions, handleApprovedPermissions_fn).call(this, {
      subject,
      metadata,
      preserveExistingPermissions: false,
      approvedRequest
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
    if (!isPlainObject(requestedPermissions)) {
      throw invalidParams({
        message: `Requested permissions for origin "${origin}" is not a plain object.`,
        data: { origin, requestedPermissions }
      });
    }
    if (Object.keys(requestedPermissions).length === 0) {
      throw invalidParams({
        message: `Permissions request for origin "${origin}" contains no permissions.`,
        data: { requestedPermissions }
      });
    }
    for (const targetName of Object.keys(requestedPermissions)) {
      const permission = requestedPermissions[targetName];
      if (!this.targetExists(targetName)) {
        throw methodNotFound(targetName, { origin, requestedPermissions });
      }
      if (!isPlainObject(permission) || permission.parentCapability !== void 0 && targetName !== permission.parentCapability) {
        throw invalidParams({
          message: `Permissions request for origin "${origin}" contains invalid requested permission(s).`,
          data: { origin, requestedPermissions }
        });
      }
      this.validatePermission(
        this.getPermissionSpecification(targetName),
        // Typecast: The permission is still a "PlainObject" here.
        permission,
        origin,
        { invokePermissionValidator: false, performCaveatValidation: true }
      );
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
  async requestUserApproval(permissionsRequest) {
    const { origin, id } = permissionsRequest.metadata;
    const approvedRequest = await this.messagingSystem.call(
      "ApprovalController:addRequest",
      {
        id,
        origin,
        requestData: permissionsRequest,
        type: "wallet_requestPermissions" /* RequestPermissions */
      },
      true
    );
    this.validateApprovedPermissions(approvedRequest, { id, origin });
    return approvedRequest;
  }
  /**
   * Reunites all the side-effects (onPermitted and onFailure) of the requested permissions inside a record of arrays.
   *
   * @param permissions - The approved permissions.
   * @returns The {@link SideEffects} object containing the handlers arrays.
   */
  getSideEffects(permissions) {
    return Object.keys(permissions).reduce(
      (sideEffectList, targetName) => {
        if (this.targetExists(targetName)) {
          const specification = this.getPermissionSpecification(targetName);
          if (specification.sideEffect) {
            sideEffectList.permittedHandlers[targetName] = specification.sideEffect.onPermitted;
            if (specification.sideEffect.onFailure) {
              sideEffectList.failureHandlers[targetName] = specification.sideEffect.onFailure;
            }
          }
        }
        return sideEffectList;
      },
      { permittedHandlers: {}, failureHandlers: {} }
    );
  }
  /**
   * Executes the side-effects of the approved permissions while handling the errors if any.
   * It will pass an instance of the {@link messagingSystem} and the request data associated with the permission request to the handlers through its params.
   *
   * @param sideEffects - the side-effect record created by {@link getSideEffects}
   * @param requestData - the permissions requestData.
   * @returns the value returned by all the `onPermitted` handlers in an array.
   */
  async executeSideEffects(sideEffects, requestData) {
    const { permittedHandlers, failureHandlers } = sideEffects;
    const params = {
      requestData,
      messagingSystem: this.messagingSystem
    };
    const promiseResults = await Promise.allSettled(
      Object.values(permittedHandlers).map(
        (permittedHandler) => permittedHandler(params)
      )
    );
    const rejectedHandlers = promiseResults.filter(
      (promise) => promise.status === "rejected"
    );
    if (rejectedHandlers.length > 0) {
      const failureHandlersList = Object.values(failureHandlers);
      if (failureHandlersList.length > 0) {
        try {
          await Promise.all(
            failureHandlersList.map((failureHandler) => failureHandler(params))
          );
        } catch (error) {
          throw internalError("Unexpected error in side-effects", { error });
        }
      }
      const reasons = rejectedHandlers.map((handler) => handler.reason);
      reasons.forEach((reason) => {
        console.error(reason);
      });
      throw reasons.length > 1 ? internalError(
        "Multiple errors occurred during side-effects execution",
        { errors: reasons }
      ) : reasons[0];
    }
    return promiseResults.map(
      ({ value }) => value
    );
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
    if (!isPlainObject(approvedRequest) || !isPlainObject(approvedRequest.metadata)) {
      throw internalError(
        `Approved permissions request for subject "${origin}" is invalid.`,
        { data: { approvedRequest } }
      );
    }
    const {
      metadata: { id: newId, origin: newOrigin },
      permissions
    } = approvedRequest;
    if (newId !== id) {
      throw internalError(
        `Approved permissions request for subject "${origin}" mutated its id.`,
        { originalId: id, mutatedId: newId }
      );
    }
    if (newOrigin !== origin) {
      throw internalError(
        `Approved permissions request for subject "${origin}" mutated its origin.`,
        { originalOrigin: origin, mutatedOrigin: newOrigin }
      );
    }
    try {
      this.validateRequestedPermissions(origin, permissions);
    } catch (error) {
      if (error instanceof Error) {
        throw internalError(
          `Invalid approved permissions request: ${error.message}`,
          error instanceof JsonRpcError ? error.data : void 0
        );
      }
      throw internalError("Unrecognized error type", { error });
    }
  }
  /**
   * Accepts a permissions request created by
   * {@link PermissionController.requestPermissions}.
   *
   * @param request - The permissions request.
   */
  async acceptPermissionsRequest(request) {
    const { id } = request.metadata;
    if (!this.hasApprovalRequest({ id })) {
      throw new PermissionsRequestNotFoundError(id);
    }
    if (Object.keys(request.permissions).length === 0) {
      this._rejectPermissionsRequest(
        id,
        invalidParams({
          message: "Must request at least one permission."
        })
      );
      return;
    }
    try {
      await this.messagingSystem.call(
        "ApprovalController:acceptRequest",
        id,
        request
      );
    } catch (error) {
      this._rejectPermissionsRequest(id, error);
      throw error;
    }
  }
  /**
   * Rejects a permissions request created by
   * {@link PermissionController.requestPermissions}.
   *
   * @param id - The id of the request to be rejected.
   */
  async rejectPermissionsRequest(id) {
    if (!this.hasApprovalRequest({ id })) {
      throw new PermissionsRequestNotFoundError(id);
    }
    this._rejectPermissionsRequest(id, userRejectedRequest());
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
    return this.messagingSystem.call("ApprovalController:hasRequest", options);
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
    return this.messagingSystem.call(
      "ApprovalController:rejectRequest",
      id,
      error
    );
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
  async getEndowments(origin, targetName, requestData) {
    if (!this.hasPermission(origin, targetName)) {
      throw unauthorized({ data: { origin, targetName } });
    }
    return this.getTypedPermissionSpecification(
      "Endowment" /* Endowment */,
      targetName,
      origin
    ).endowmentGetter({ origin, requestData });
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
  async executeRestrictedMethod(origin, targetName, params) {
    const methodImplementation = this.getRestrictedMethod(targetName, origin);
    const result = await this._executeRestrictedMethod(
      methodImplementation,
      { origin },
      targetName,
      params
    );
    if (result === void 0) {
      throw new Error(
        `Internal request for method "${targetName}" as origin "${origin}" returned no result.`
      );
    }
    return result;
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
      throw unauthorized({ data: { origin, method } });
    }
    return decorateWithCaveats(
      methodImplementation,
      permission,
      this._caveatSpecifications
    )({ method, params, context: { origin } });
  }
};
_expectGetCaveatMerger = new WeakSet();
expectGetCaveatMerger_fn = function(caveatType) {
  const { merger } = this.getCaveatSpecification(caveatType);
  if (merger === void 0) {
    throw new CaveatMergerDoesNotExistError(caveatType);
  }
  return merger;
};
_applyGrantedPermissions = new WeakSet();
applyGrantedPermissions_fn = function({
  approvedPermissions,
  subject,
  mergePermissions,
  preserveExistingPermissions,
  requestData
}) {
  const { origin } = subject;
  if (!origin || typeof origin !== "string") {
    throw new InvalidSubjectIdentifierError(origin);
  }
  const permissions = preserveExistingPermissions ? {
    ...this.getPermissions(origin)
  } : {};
  for (const [requestedTarget, approvedPermission] of Object.entries(
    approvedPermissions
  )) {
    if (!this.targetExists(requestedTarget)) {
      throw methodNotFound(requestedTarget);
    }
    if (approvedPermission.parentCapability !== void 0 && requestedTarget !== approvedPermission.parentCapability) {
      throw new InvalidApprovedPermissionError(
        origin,
        requestedTarget,
        approvedPermission
      );
    }
    const targetName = requestedTarget;
    const specification = this.getPermissionSpecification(targetName);
    const caveats = this.constructCaveats(
      origin,
      targetName,
      approvedPermission.caveats
    );
    const permissionOptions = {
      caveats,
      invoker: origin,
      target: targetName
    };
    let permission;
    let performCaveatValidation = true;
    if (specification.factory) {
      permission = specification.factory(permissionOptions, requestData);
    } else {
      permission = constructPermission(permissionOptions);
      performCaveatValidation = false;
    }
    if (mergePermissions) {
      permission = __privateMethod(this, _mergePermission, mergePermission_fn).call(this, permissions[targetName], permission)[0];
    }
    this.validatePermission(specification, permission, origin, {
      invokePermissionValidator: true,
      performCaveatValidation
    });
    permissions[targetName] = permission;
  }
  this.setValidatedPermissions(origin, permissions);
  return permissions;
};
_mergeIncrementalPermissions = new WeakSet();
mergeIncrementalPermissions_fn = function(existingPermissions, incrementalRequestedPermissions) {
  const permissionDiffMap = {};
  const newPermissions = immerProduce(
    existingPermissions,
    (draftExistingPermissions) => {
      const leftPermissions = draftExistingPermissions;
      Object.entries(incrementalRequestedPermissions).forEach(
        ([targetName, rightPermission]) => {
          const leftPermission = leftPermissions[targetName];
          const [newPermission, caveatsDiff] = __privateMethod(this, _mergePermission, mergePermission_fn).call(this, leftPermission ?? {}, rightPermission);
          if (leftPermission === void 0 || Object.keys(caveatsDiff).length > 0) {
            leftPermissions[targetName] = newPermission;
            permissionDiffMap[targetName] = caveatsDiff;
          }
        }
      );
    }
  );
  if (Object.keys(permissionDiffMap).length === 0) {
    return [];
  }
  return [newPermissions, permissionDiffMap];
};
_mergePermission = new WeakSet();
mergePermission_fn = function(leftPermission, rightPermission) {
  const { caveatPairs, leftUniqueCaveats, rightUniqueCaveats } = collectUniqueAndPairedCaveats(leftPermission, rightPermission);
  const [mergedCaveats, caveatDiffMap] = caveatPairs.reduce(
    ([caveats, diffMap], [leftCaveat, rightCaveat]) => {
      const [newCaveat, diff] = __privateMethod(this, _mergeCaveat, mergeCaveat_fn).call(this, leftCaveat, rightCaveat);
      if (newCaveat !== void 0 && diff !== void 0) {
        caveats.push(newCaveat);
        diffMap[newCaveat.type] = diff;
      } else {
        caveats.push(leftCaveat);
      }
      return [caveats, diffMap];
    },
    [[], {}]
  );
  const mergedRightUniqueCaveats = rightUniqueCaveats.map((caveat) => {
    const [newCaveat, diff] = __privateMethod(this, _mergeCaveat, mergeCaveat_fn).call(this, void 0, caveat);
    caveatDiffMap[newCaveat.type] = diff;
    return newCaveat;
  });
  const allCaveats = [
    ...mergedCaveats,
    ...leftUniqueCaveats,
    ...mergedRightUniqueCaveats
  ];
  const newPermission = {
    ...leftPermission,
    ...rightPermission,
    ...allCaveats.length > 0 ? { caveats: allCaveats } : {}
  };
  return [newPermission, caveatDiffMap];
};
_mergeCaveat = new WeakSet();
mergeCaveat_fn = function(leftCaveat, rightCaveat) {
  if (leftCaveat !== void 0 && leftCaveat.type !== rightCaveat.type) {
    throw new CaveatMergeTypeMismatchError(leftCaveat.type, rightCaveat.type);
  }
  const merger = __privateMethod(this, _expectGetCaveatMerger, expectGetCaveatMerger_fn).call(this, rightCaveat.type);
  if (leftCaveat === void 0) {
    return [
      {
        ...rightCaveat
      },
      rightCaveat.value
    ];
  }
  const [newValue, diff] = merger(leftCaveat.value, rightCaveat.value);
  return newValue !== void 0 && diff !== void 0 ? [
    {
      type: rightCaveat.type,
      value: newValue
    },
    diff
  ] : [];
};
_handleApprovedPermissions = new WeakSet();
handleApprovedPermissions_fn = async function({
  subject,
  metadata,
  preserveExistingPermissions,
  approvedRequest
}) {
  const { permissions: approvedPermissions, ...requestData } = approvedRequest;
  const approvedMetadata = { ...metadata };
  const sideEffects = this.getSideEffects(approvedPermissions);
  if (Object.values(sideEffects.permittedHandlers).length > 0) {
    const sideEffectsData = await this.executeSideEffects(
      sideEffects,
      approvedRequest
    );
    approvedMetadata.data = Object.keys(sideEffects.permittedHandlers).reduce(
      (acc, permission, i) => ({ [permission]: sideEffectsData[i], ...acc }),
      {}
    );
  }
  return [
    this.grantPermissions({
      subject,
      approvedPermissions,
      preserveExistingPermissions,
      requestData
    }),
    approvedMetadata
  ];
};

export {
  CaveatMutatorOperation,
  PermissionController
};
//# sourceMappingURL=chunk-COGJLF22.mjs.map