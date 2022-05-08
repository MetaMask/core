import { Patch } from 'immer';
import { AcceptRequest as AcceptApprovalRequest, AddApprovalRequest, HasApprovalRequest, RejectRequest as RejectApprovalRequest } from '../approval/ApprovalController';
import { BaseController, Json } from '../BaseControllerV2';
import { RestrictedControllerMessenger } from '../ControllerMessenger';
import { NonEmptyArray } from '../util';
import { CaveatConstraint, CaveatSpecificationConstraint, CaveatSpecificationMap, ExtractCaveat, ExtractCaveats, ExtractCaveatValue } from './Caveat';
import { EndowmentSpecificationConstraint, ExtractAllowedCaveatTypes, OriginString, PermissionConstraint, PermissionSpecificationConstraint, PermissionSpecificationMap, RequestedPermissions, RestrictedMethod, RestrictedMethodParameters, RestrictedMethodSpecificationConstraint, ValidPermission, ValidPermissionSpecification } from './Permission';
import { getPermissionMiddlewareFactory } from './permission-middleware';
/**
 * Metadata associated with {@link PermissionController} subjects.
 */
export declare type PermissionSubjectMetadata = {
    origin: OriginString;
};
/**
 * Metadata associated with permission requests.
 */
export declare type PermissionsRequestMetadata = PermissionSubjectMetadata & {
    id: string;
};
/**
 * Used for prompting the user about a proposed new permission.
 * Includes information about the grantee subject, requested permissions, and
 * any additional information added by the consumer.
 *
 * All properties except `permissions` are passed to any factories found for
 * the requested permissions.
 */
export declare type PermissionsRequest = {
    metadata: PermissionsRequestMetadata;
    permissions: RequestedPermissions;
    [key: string]: Json;
};
/**
 * The name of the {@link PermissionController}.
 */
declare const controllerName = "PermissionController";
/**
 * Permissions associated with a {@link PermissionController} subject.
 */
export declare type SubjectPermissions<Permission extends PermissionConstraint> = Record<Permission['parentCapability'], Permission>;
/**
 * Permissions and metadata associated with a {@link PermissionController}
 * subject.
 */
export declare type PermissionSubjectEntry<SubjectPermission extends PermissionConstraint> = {
    origin: SubjectPermission['invoker'];
    permissions: SubjectPermissions<SubjectPermission>;
};
/**
 * All subjects of a {@link PermissionController}.
 *
 * @template SubjectPermission - The permissions of the subject.
 */
export declare type PermissionControllerSubjects<SubjectPermission extends PermissionConstraint> = Record<SubjectPermission['invoker'], PermissionSubjectEntry<SubjectPermission>>;
/**
 * The state of a {@link PermissionController}.
 *
 * @template Permission - The controller's permission type union.
 */
export declare type PermissionControllerState<Permission> = Permission extends PermissionConstraint ? {
    subjects: PermissionControllerSubjects<Permission>;
} : never;
/**
 * Gets the state of the {@link PermissionController}.
 */
export declare type GetPermissionControllerState = {
    type: `${typeof controllerName}:getState`;
    handler: () => PermissionControllerState<PermissionConstraint>;
};
/**
 * Gets the names of all subjects from the {@link PermissionController}.
 */
export declare type GetSubjects = {
    type: `${typeof controllerName}:getSubjectNames`;
    handler: () => (keyof PermissionControllerSubjects<PermissionConstraint>)[];
};
/**
 * Gets the permissions for specified subject
 */
export declare type GetPermissions = {
    type: `${typeof controllerName}:getPermissions`;
    handler: GenericPermissionController['getPermissions'];
};
/**
 * Checks whether the specified subject has any permissions.
 */
export declare type HasPermissions = {
    type: `${typeof controllerName}:hasPermissions`;
    handler: GenericPermissionController['hasPermissions'];
};
/**
 * Checks whether the specified subject has a specific permission.
 */
export declare type HasPermission = {
    type: `${typeof controllerName}:hasPermission`;
    handler: GenericPermissionController['hasPermission'];
};
/**
 * Directly grants given permissions for a specificed origin without requesting user approval
 */
export declare type GrantPermissions = {
    type: `${typeof controllerName}:grantPermissions`;
    handler: GenericPermissionController['grantPermissions'];
};
/**
 * Requests given permissions for a specified origin
 */
export declare type RequestPermissions = {
    type: `${typeof controllerName}:requestPermissions`;
    handler: GenericPermissionController['requestPermissions'];
};
/**
 * Removes the specified permissions for each origin.
 */
export declare type RevokePermissions = {
    type: `${typeof controllerName}:revokePermissions`;
    handler: GenericPermissionController['revokePermissions'];
};
/**
 * Removes all permissions for a given origin
 */
export declare type RevokeAllPermissions = {
    type: `${typeof controllerName}:revokeAllPermissions`;
    handler: GenericPermissionController['revokeAllPermissions'];
};
/**
 * Revokes all permissions corresponding to the specified target for all subjects.
 * Does nothing if no subjects or no such permission exists.
 */
export declare type RevokePermissionForAllSubjects = {
    type: `${typeof controllerName}:revokePermissionForAllSubjects`;
    handler: GenericPermissionController['revokePermissionForAllSubjects'];
};
/**
 * Clears all permissions from the {@link PermissionController}.
 */
export declare type ClearPermissions = {
    type: `${typeof controllerName}:clearPermissions`;
    handler: () => void;
};
/**
 * Gets the endowments for the given subject and permission.
 */
export declare type GetEndowments = {
    type: `${typeof controllerName}:getEndowments`;
    handler: GenericPermissionController['getEndowments'];
};
/**
 * The {@link ControllerMessenger} actions of the {@link PermissionController}.
 */
export declare type PermissionControllerActions = ClearPermissions | GetEndowments | GetPermissionControllerState | GetSubjects | GetPermissions | HasPermission | HasPermissions | GrantPermissions | RequestPermissions | RevokeAllPermissions | RevokePermissionForAllSubjects | RevokePermissions;
/**
 * The generic state change event of the {@link PermissionController}.
 */
export declare type PermissionControllerStateChange = {
    type: `${typeof controllerName}:stateChange`;
    payload: [PermissionControllerState<PermissionConstraint>, Patch[]];
};
/**
 * The {@link ControllerMessenger} events of the {@link PermissionController}.
 *
 * The permission controller only emits its generic state change events.
 * Consumers should use selector subscriptions to subscribe to relevant
 * substate.
 */
export declare type PermissionControllerEvents = PermissionControllerStateChange;
/**
 * The external {@link ControllerMessenger} actions available to the
 * {@link PermissionController}.
 */
declare type AllowedActions = AddApprovalRequest | HasApprovalRequest | AcceptApprovalRequest | RejectApprovalRequest;
/**
 * The messenger of the {@link PermissionController}.
 */
export declare type PermissionControllerMessenger = RestrictedControllerMessenger<typeof controllerName, PermissionControllerActions | AllowedActions, PermissionControllerEvents, AllowedActions['type'], never>;
/**
 * A generic {@link PermissionController}.
 */
export declare type GenericPermissionController = PermissionController<PermissionSpecificationConstraint, CaveatSpecificationConstraint>;
/**
 * Describes the possible results of a {@link CaveatMutator} function.
 */
export declare enum CaveatMutatorOperation {
    noop = 0,
    updateValue = 1,
    deleteCaveat = 2,
    revokePermission = 3
}
/**
 * Given a caveat value, returns a {@link CaveatMutatorOperation} and, optionally,
 * a new caveat value.
 *
 * @see {@link PermissionController.updatePermissionsByCaveat} for more details.
 * @template Caveat - The caveat type for which this mutator is intended.
 * @param caveatValue - The existing value of the caveat being mutated.
 * @returns A tuple of the mutation result and, optionally, the new caveat
 * value.
 */
export declare type CaveatMutator<TargetCaveat extends CaveatConstraint> = (caveatValue: TargetCaveat['value']) => CaveatMutatorResult;
declare type CaveatMutatorResult = Readonly<{
    operation: CaveatMutatorOperation.updateValue;
    value: CaveatConstraint['value'];
}> | Readonly<{
    operation: Exclude<CaveatMutatorOperation, CaveatMutatorOperation.updateValue>;
}>;
/**
 * Extracts the permission(s) specified by the given permission and caveat
 * specifications.
 *
 * @template ControllerPermissionSpecification - The permission specification(s)
 * to extract from.
 * @template ControllerCaveatSpecification - The caveat specification(s) to
 * extract from. Necessary because {@link Permission} has a generic parameter
 * that describes the allowed caveats for the permission.
 */
export declare type ExtractPermission<ControllerPermissionSpecification extends PermissionSpecificationConstraint, ControllerCaveatSpecification extends CaveatSpecificationConstraint> = ControllerPermissionSpecification extends ValidPermissionSpecification<ControllerPermissionSpecification> ? ValidPermission<ControllerPermissionSpecification['targetKey'], ExtractCaveats<ControllerCaveatSpecification>> : never;
/**
 * Extracts the restricted method permission(s) specified by the given
 * permission and caveat specifications.
 *
 * @template ControllerPermissionSpecification - The permission specification(s)
 * to extract from.
 * @template ControllerCaveatSpecification - The caveat specification(s) to
 * extract from. Necessary because {@link Permission} has a generic parameter
 * that describes the allowed caveats for the permission.
 */
export declare type ExtractRestrictedMethodPermission<ControllerPermissionSpecification extends PermissionSpecificationConstraint, ControllerCaveatSpecification extends CaveatSpecificationConstraint> = ExtractPermission<Extract<ControllerPermissionSpecification, RestrictedMethodSpecificationConstraint>, ControllerCaveatSpecification>;
/**
 * Extracts the endowment permission(s) specified by the given permission and
 * caveat specifications.
 *
 * @template ControllerPermissionSpecification - The permission specification(s)
 * to extract from.
 * @template ControllerCaveatSpecification - The caveat specification(s) to
 * extract from. Necessary because {@link Permission} has a generic parameter
 * that describes the allowed caveats for the permission.
 */
export declare type ExtractEndowmentPermission<ControllerPermissionSpecification extends PermissionSpecificationConstraint, ControllerCaveatSpecification extends CaveatSpecificationConstraint> = ExtractPermission<Extract<ControllerPermissionSpecification, EndowmentSpecificationConstraint>, ControllerCaveatSpecification>;
/**
 * Options for the {@link PermissionController} constructor.
 *
 * @template ControllerPermissionSpecification - A union of the types of all
 * permission specifications available to the controller. Any referenced caveats
 * must be included in the controller's caveat specifications.
 * @template ControllerCaveatSpecification - A union of the types of all
 * caveat specifications available to the controller.
 */
export declare type PermissionControllerOptions<ControllerPermissionSpecification extends PermissionSpecificationConstraint, ControllerCaveatSpecification extends CaveatSpecificationConstraint> = {
    messenger: PermissionControllerMessenger;
    caveatSpecifications: CaveatSpecificationMap<ControllerCaveatSpecification>;
    permissionSpecifications: PermissionSpecificationMap<ControllerPermissionSpecification>;
    unrestrictedMethods: string[];
    state?: Partial<PermissionControllerState<ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>>>;
};
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
export declare class PermissionController<ControllerPermissionSpecification extends PermissionSpecificationConstraint, ControllerCaveatSpecification extends CaveatSpecificationConstraint> extends BaseController<typeof controllerName, PermissionControllerState<ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>>, PermissionControllerMessenger> {
    private readonly _caveatSpecifications;
    private readonly _permissionSpecifications;
    private readonly _unrestrictedMethods;
    /**
     * The names of all JSON-RPC methods that will be ignored by the controller.
     *
     * @returns The names of all unrestricted JSON-RPC methods
     */
    get unrestrictedMethods(): ReadonlySet<string>;
    /**
     * Returns a `json-rpc-engine` middleware function factory, so that the rules
     * described by the state of this controller can be applied to incoming
     * JSON-RPC requests.
     *
     * The middleware **must** be added in the correct place in the middleware
     * stack in order for it to work. See the README for an example.
     */
    createPermissionMiddleware: ReturnType<typeof getPermissionMiddlewareFactory>;
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
    constructor(options: PermissionControllerOptions<ControllerPermissionSpecification, ControllerCaveatSpecification>);
    /**
     * Gets a permission specification.
     *
     * @param targetKey - The target key of the permission specification to get.
     * @returns The permission specification with the specified target key.
     */
    private getPermissionSpecification;
    /**
     * Gets a caveat specification.
     *
     * @param caveatType - The type of the caveat specification to get.
     * @returns The caveat specification with the specified type.
     */
    private getCaveatSpecification;
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
    private validatePermissionSpecifications;
    /**
     * Constructor helper for registering the controller's messaging system
     * actions.
     */
    private registerMessageHandlers;
    /**
     * Clears the state of the controller.
     */
    clearState(): void;
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
    private getTypedPermissionSpecification;
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
    getRestrictedMethod(method: string, origin?: string): RestrictedMethod<RestrictedMethodParameters, Json>;
    /**
     * Gets a list of all origins of subjects.
     *
     * @returns The origins (i.e. IDs) of all subjects.
     */
    getSubjectNames(): OriginString[];
    /**
     * Gets the permission for the specified target of the subject corresponding
     * to the specified origin.
     *
     * @param origin - The origin of the subject.
     * @param targetName - The method name as invoked by a third party (i.e., not
     * a method key).
     * @returns The permission if it exists, or undefined otherwise.
     */
    getPermission<SubjectPermission extends ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>>(origin: OriginString, targetName: SubjectPermission['parentCapability']): SubjectPermission | undefined;
    /**
     * Gets all permissions for the specified subject, if any.
     *
     * @param origin - The origin of the subject.
     * @returns The permissions of the subject, if any.
     */
    getPermissions(origin: OriginString): SubjectPermissions<ValidPermission<string, ExtractCaveats<ControllerCaveatSpecification>>> | undefined;
    /**
     * Checks whether the subject with the specified origin has the specified
     * permission.
     *
     * @param origin - The origin of the subject.
     * @param target - The target name of the permission.
     * @returns Whether the subject has the permission.
     */
    hasPermission(origin: OriginString, target: ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>['parentCapability']): boolean;
    /**
     * Checks whether the subject with the specified origin has any permissions.
     * Use this if you want to know if a subject "exists".
     *
     * @param origin - The origin of the subject to check.
     * @returns Whether the subject has any permissions.
     */
    hasPermissions(origin: OriginString): boolean;
    /**
     * Revokes all permissions from the specified origin.
     *
     * Throws an error of the origin has no permissions.
     *
     * @param origin - The origin whose permissions to revoke.
     */
    revokeAllPermissions(origin: OriginString): void;
    /**
     * Revokes the specified permission from the subject with the specified
     * origin.
     *
     * Throws an error if the subject or the permission does not exist.
     *
     * @param origin - The origin of the subject whose permission to revoke.
     * @param target - The target name of the permission to revoke.
     */
    revokePermission(origin: OriginString, target: ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>['parentCapability']): void;
    /**
     * Revokes the specified permissions from the specified subjects.
     *
     * Throws an error if any of the subjects or permissions do not exist.
     *
     * @param subjectsAndPermissions - An object mapping subject origins
     * to arrays of permission target names to revoke.
     */
    revokePermissions(subjectsAndPermissions: Record<OriginString, NonEmptyArray<ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>['parentCapability']>>): void;
    /**
     * Revokes all permissions corresponding to the specified target for all subjects.
     * Does nothing if no subjects or no such permission exists.
     *
     * @param target - The name of the target to revoke all permissions for.
     */
    revokePermissionForAllSubjects(target: ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>['parentCapability']): void;
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
    private deletePermission;
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
    hasCaveat<TargetName extends ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>['parentCapability'], CaveatType extends ExtractAllowedCaveatTypes<ControllerPermissionSpecification>>(origin: OriginString, target: TargetName, caveatType: CaveatType): boolean;
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
    getCaveat<TargetName extends ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>['parentCapability'], CaveatType extends ExtractAllowedCaveatTypes<ControllerPermissionSpecification>>(origin: OriginString, target: TargetName, caveatType: CaveatType): ExtractCaveat<ControllerCaveatSpecification, CaveatType> | undefined;
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
    addCaveat<TargetName extends ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>['parentCapability'], CaveatType extends ExtractAllowedCaveatTypes<ControllerPermissionSpecification>>(origin: OriginString, target: TargetName, caveatType: CaveatType, caveatValue: ExtractCaveatValue<ControllerCaveatSpecification, CaveatType>): void;
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
    updateCaveat<TargetName extends ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>['parentCapability'], CaveatType extends ExtractAllowedCaveatTypes<ControllerPermissionSpecification>, CaveatValue extends ExtractCaveatValue<ControllerCaveatSpecification, CaveatType>>(origin: OriginString, target: TargetName, caveatType: CaveatType, caveatValue: CaveatValue): void;
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
    private setCaveat;
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
    updatePermissionsByCaveat<CaveatType extends ExtractCaveats<ControllerCaveatSpecification>['type'], TargetCaveat extends ExtractCaveat<ControllerCaveatSpecification, CaveatType>>(targetCaveatType: CaveatType, mutator: CaveatMutator<TargetCaveat>): void;
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
    removeCaveat<TargetName extends ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>['parentCapability'], CaveatType extends ExtractAllowedCaveatTypes<ControllerPermissionSpecification>>(origin: OriginString, target: TargetName, caveatType: CaveatType): void;
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
    private deleteCaveat;
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
    private validateModifiedPermission;
    /**
     * Gets the key for the specified permission target.
     *
     * Used to support our namespaced permission target feature, which is used
     * to implement namespaced restricted JSON-RPC methods.
     *
     * @param target - The requested permission target.
     * @returns The internal key of the permission target.
     */
    private getTargetKey;
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
    grantPermissions({ approvedPermissions, requestData, preserveExistingPermissions, subject, }: {
        approvedPermissions: RequestedPermissions;
        subject: PermissionSubjectMetadata;
        preserveExistingPermissions?: boolean;
        requestData?: Record<string, unknown>;
    }): SubjectPermissions<ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>>;
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
    private validatePermission;
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
    private setValidatedPermissions;
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
    private constructCaveats;
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
    private validateCaveat;
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
    requestPermissions(subject: PermissionSubjectMetadata, requestedPermissions: RequestedPermissions, options?: {
        id?: string;
        preserveExistingPermissions?: boolean;
    }): Promise<[
        SubjectPermissions<ExtractPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>>,
        {
            id: string;
            origin: OriginString;
        }
    ]>;
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
    private validateRequestedPermissions;
    /**
     * Adds a request to the {@link ApprovalController} using the
     * {@link AddApprovalRequest} action. Also validates the resulting approved
     * permissions request, and throws an error if validation fails.
     *
     * @param permissionsRequest - The permissions request object.
     * @returns The approved permissions request object.
     */
    private requestUserApproval;
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
    private validateApprovedPermissions;
    /**
     * Accepts a permissions request created by
     * {@link PermissionController.requestPermissions}.
     *
     * @param request - The permissions request.
     */
    acceptPermissionsRequest(request: PermissionsRequest): Promise<void>;
    /**
     * Rejects a permissions request created by
     * {@link PermissionController.requestPermissions}.
     *
     * @param id - The id of the request to be rejected.
     */
    rejectPermissionsRequest(id: string): Promise<void>;
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
    private hasApprovalRequest;
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
    private _rejectPermissionsRequest;
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
    getEndowments(origin: string, targetName: ExtractEndowmentPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>['parentCapability'], requestData?: unknown): Promise<Json>;
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
    executeRestrictedMethod(origin: OriginString, targetName: ExtractRestrictedMethodPermission<ControllerPermissionSpecification, ControllerCaveatSpecification>['parentCapability'], params?: RestrictedMethodParameters): Promise<Json>;
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
    private _executeRestrictedMethod;
}
export {};
