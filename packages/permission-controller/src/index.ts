export type {
  CaveatConstraint,
  Caveat,
  CaveatDecorator,
  CaveatValidator,
  CaveatDiffMap,
  CaveatValueMerger,
  CaveatSpecificationBase,
  RestrictedMethodCaveatSpecificationConstraint,
  EndowmentCaveatSpecificationConstraint,
  CaveatSpecificationConstraint,
  CaveatSpecificationMap,
  ExtractCaveats,
  ExtractCaveat,
  ExtractCaveatValue,
} from './Caveat';

export {
  isRestrictedMethodCaveatSpecification,
  decorateWithCaveats,
} from './Caveat';

export {
  unauthorized,
  methodNotFound,
  invalidParams,
  userRejectedRequest,
  internalError,
  InvalidSubjectIdentifierError,
  UnrecognizedSubjectError,
  CaveatMergerDoesNotExistError,
  InvalidMergedPermissionsError,
  InvalidApprovedPermissionError,
  PermissionDoesNotExistError,
  EndowmentPermissionDoesNotExistError,
  UnrecognizedCaveatTypeError,
  InvalidCaveatsPropertyError,
  CaveatDoesNotExistError,
  CaveatAlreadyExistsError,
  InvalidCaveatError,
  InvalidCaveatTypeError,
  CaveatMissingValueError,
  CaveatInvalidJsonError,
  InvalidCaveatFieldsError,
  ForbiddenCaveatError,
  DuplicateCaveatError,
  CaveatMergeTypeMismatchError,
  CaveatSpecificationMismatchError,
  PermissionsRequestNotFoundError,
} from './errors';

export type {
  OriginString,
  PermissionConstraint,
  ValidPermission,
  ExtractAllowedCaveatTypes,
  PermissionOptions,
  RequestedPermissions,
  RestrictedMethodParameters,
  SyncRestrictedMethod,
  AsyncRestrictedMethod,
  RestrictedMethod,
  EndowmentGetter,
  PermissionFactory,
  PermissionValidatorConstraint,
  RestrictedMethodSpecificationConstraint,
  EndowmentSpecificationConstraint,
  PermissionSpecificationConstraint,
  PermissionSpecificationMap,
  ExtractPermissionSpecification,
} from './Permission';

export {
  constructPermission,
  findCaveat,
  hasSpecificationType,
  PermissionType,
} from './Permission';

export type {
  PermissionSubjectMetadata,
  PermissionsRequestMetadata,
  PermissionDiffMap,
  PermissionsRequest,
  SideEffects,
  SubjectPermissions,
  PermissionSubjectEntry,
  PermissionControllerSubjects,
  PermissionControllerState,
  GetPermissionControllerState,
  GetSubjects,
  GetPermissions,
  HasPermissions,
  HasPermission,
  GrantPermissions,
  GrantPermissionsIncremental,
  RequestPermissions,
  RequestPermissionsIncremental,
  RevokePermissions,
  RevokeAllPermissions,
  RevokePermissionForAllSubjects,
  UpdateCaveat,
  ClearPermissions,
  GetEndowments,
  PermissionControllerActions,
  PermissionControllerStateChange,
  PermissionControllerEvents,
  PermissionControllerMessenger,
  SideEffectMessenger,
  GenericPermissionController,
  CaveatMutator,
  PermissionControllerOptions,
} from './PermissionController';

export { PermissionController } from './PermissionController';

export type {
  ExtractSpecifications,
  HandlerMiddlewareFunction,
  HookNames,
  PermittedHandlerExport,
} from './utils';
export { MethodNames } from './utils';
export * as permissionRpcMethods from './rpc-methods';
export * from './SubjectMetadataController';
