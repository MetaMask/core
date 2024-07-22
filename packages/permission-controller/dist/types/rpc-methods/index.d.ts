import type { GetPermissionsHooks } from './getPermissions';
import type { RequestPermissionsHooks } from './requestPermissions';
import type { RevokePermissionsHooks } from './revokePermissions';
export type PermittedRpcMethodHooks = RequestPermissionsHooks & GetPermissionsHooks & RevokePermissionsHooks;
export declare const handlers: readonly [import("..").PermittedHandlerExport<RequestPermissionsHooks, [import("..").RequestedPermissions], import("..").PermissionConstraint[]>, import("..").PermittedHandlerExport<GetPermissionsHooks, [], import("..").PermissionConstraint[]>, import("..").PermittedHandlerExport<RevokePermissionsHooks, import("./revokePermissions").RevokePermissionArgs, null>];
//# sourceMappingURL=index.d.ts.map