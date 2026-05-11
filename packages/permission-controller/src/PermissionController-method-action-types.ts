/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { PermissionController } from './PermissionController';

/**
 * Checks whether the given method was declared as unrestricted at
 * construction time. Methods unknown to the controller return `false` and
 * would be treated as restricted by callers such as the permission
 * middleware.
 *
 * @param method - The name of the method to check.
 * @returns Whether the method is unrestricted.
 */
export type PermissionControllerHasUnrestrictedMethodAction = {
  type: `PermissionController:hasUnrestrictedMethod`;
  handler: PermissionController['hasUnrestrictedMethod'];
};

/**
 * Clears the state of the controller.
 */
export type PermissionControllerClearStateAction = {
  type: `PermissionController:clearState`;
  handler: PermissionController['clearState'];
};

/**
 * Gets a list of all origins of subjects.
 *
 * @returns The origins (i.e. IDs) of all subjects.
 */
export type PermissionControllerGetSubjectNamesAction = {
  type: `PermissionController:getSubjectNames`;
  handler: PermissionController['getSubjectNames'];
};

/**
 * Gets the permission for the specified target of the subject corresponding
 * to the specified origin.
 *
 * @param origin - The origin of the subject.
 * @param targetName - The method name as invoked by a third party (i.e., not
 * a method key).
 * @returns The permission if it exists, or undefined otherwise.
 */
export type PermissionControllerGetPermissionAction = {
  type: `PermissionController:getPermission`;
  handler: PermissionController['getPermission'];
};

/**
 * Gets all permissions for the specified subject, if any.
 *
 * @param origin - The origin of the subject.
 * @returns The permissions of the subject, if any.
 */
export type PermissionControllerGetPermissionsAction = {
  type: `PermissionController:getPermissions`;
  handler: PermissionController['getPermissions'];
};

/**
 * Checks whether the subject with the specified origin has the specified
 * permission.
 *
 * @param origin - The origin of the subject.
 * @param target - The target name of the permission.
 * @returns Whether the subject has the permission.
 */
export type PermissionControllerHasPermissionAction = {
  type: `PermissionController:hasPermission`;
  handler: PermissionController['hasPermission'];
};

/**
 * Checks whether the subject with the specified origin has any permissions.
 * Use this if you want to know if a subject "exists".
 *
 * @param origin - The origin of the subject to check.
 * @returns Whether the subject has any permissions.
 */
export type PermissionControllerHasPermissionsAction = {
  type: `PermissionController:hasPermissions`;
  handler: PermissionController['hasPermissions'];
};

/**
 * Revokes all permissions from the specified origin.
 *
 * Throws an error if the origin has no permissions.
 *
 * @param origin - The origin whose permissions to revoke.
 */
export type PermissionControllerRevokeAllPermissionsAction = {
  type: `PermissionController:revokeAllPermissions`;
  handler: PermissionController['revokeAllPermissions'];
};

/**
 * Revokes the specified permission from the subject with the specified
 * origin.
 *
 * Throws an error if the subject or the permission does not exist.
 *
 * @param origin - The origin of the subject whose permission to revoke.
 * @param target - The target name of the permission to revoke.
 */
export type PermissionControllerRevokePermissionAction = {
  type: `PermissionController:revokePermission`;
  handler: PermissionController['revokePermission'];
};

/**
 * Revokes the specified permissions from the specified subjects.
 *
 * Throws an error if any of the subjects or permissions do not exist.
 *
 * @param subjectsAndPermissions - An object mapping subject origins
 * to arrays of permission target names to revoke.
 */
export type PermissionControllerRevokePermissionsAction = {
  type: `PermissionController:revokePermissions`;
  handler: PermissionController['revokePermissions'];
};

/**
 * Revokes all permissions corresponding to the specified target for all subjects.
 * Does nothing if no subjects or no such permission exists.
 *
 * @param target - The name of the target to revoke all permissions for.
 */
export type PermissionControllerRevokePermissionForAllSubjectsAction = {
  type: `PermissionController:revokePermissionForAllSubjects`;
  handler: PermissionController['revokePermissionForAllSubjects'];
};

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
export type PermissionControllerGetCaveatAction = {
  type: `PermissionController:getCaveat`;
  handler: PermissionController['getCaveat'];
};

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
export type PermissionControllerUpdateCaveatAction = {
  type: `PermissionController:updateCaveat`;
  handler: PermissionController['updateCaveat'];
};

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
export type PermissionControllerUpdatePermissionsByCaveatAction = {
  type: `PermissionController:updatePermissionsByCaveat`;
  handler: PermissionController['updatePermissionsByCaveat'];
};

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
export type PermissionControllerGrantPermissionsAction = {
  type: `PermissionController:grantPermissions`;
  handler: PermissionController['grantPermissions'];
};

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
export type PermissionControllerGrantPermissionsIncrementalAction = {
  type: `PermissionController:grantPermissionsIncremental`;
  handler: PermissionController['grantPermissionsIncremental'];
};

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
export type PermissionControllerRequestPermissionsAction = {
  type: `PermissionController:requestPermissions`;
  handler: PermissionController['requestPermissions'];
};

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
export type PermissionControllerRequestPermissionsIncrementalAction = {
  type: `PermissionController:requestPermissionsIncremental`;
  handler: PermissionController['requestPermissionsIncremental'];
};

/**
 * Accepts a permissions request created by
 * {@link PermissionController.requestPermissions}.
 *
 * @param request - The permissions request.
 */
export type PermissionControllerAcceptPermissionsRequestAction = {
  type: `PermissionController:acceptPermissionsRequest`;
  handler: PermissionController['acceptPermissionsRequest'];
};

/**
 * Rejects a permissions request created by
 * {@link PermissionController.requestPermissions}.
 *
 * @param id - The id of the request to be rejected.
 */
export type PermissionControllerRejectPermissionsRequestAction = {
  type: `PermissionController:rejectPermissionsRequest`;
  handler: PermissionController['rejectPermissionsRequest'];
};

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
export type PermissionControllerGetEndowmentsAction = {
  type: `PermissionController:getEndowments`;
  handler: PermissionController['getEndowments'];
};

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
export type PermissionControllerExecuteRestrictedMethodAction = {
  type: `PermissionController:executeRestrictedMethod`;
  handler: PermissionController['executeRestrictedMethod'];
};

/**
 * Union of all PermissionController action types.
 */
export type PermissionControllerMethodActions =
  | PermissionControllerHasUnrestrictedMethodAction
  | PermissionControllerClearStateAction
  | PermissionControllerGetSubjectNamesAction
  | PermissionControllerGetPermissionAction
  | PermissionControllerGetPermissionsAction
  | PermissionControllerHasPermissionAction
  | PermissionControllerHasPermissionsAction
  | PermissionControllerRevokeAllPermissionsAction
  | PermissionControllerRevokePermissionAction
  | PermissionControllerRevokePermissionsAction
  | PermissionControllerRevokePermissionForAllSubjectsAction
  | PermissionControllerGetCaveatAction
  | PermissionControllerUpdateCaveatAction
  | PermissionControllerUpdatePermissionsByCaveatAction
  | PermissionControllerGrantPermissionsAction
  | PermissionControllerGrantPermissionsIncrementalAction
  | PermissionControllerRequestPermissionsAction
  | PermissionControllerRequestPermissionsIncrementalAction
  | PermissionControllerAcceptPermissionsRequestAction
  | PermissionControllerRejectPermissionsRequestAction
  | PermissionControllerGetEndowmentsAction
  | PermissionControllerExecuteRestrictedMethodAction;
