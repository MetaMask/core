import { RequestPermissionsHooks } from './requestPermissions';
import { GetPermissionsHooks } from './getPermissions';
export declare type PermittedRpcMethodHooks = RequestPermissionsHooks & GetPermissionsHooks;
export declare const handlers: (import("@metamask/types").PermittedHandlerExport<RequestPermissionsHooks, [import("..").RequestedPermissions], import("..").PermissionConstraint[]> | import("@metamask/types").PermittedHandlerExport<GetPermissionsHooks, void, import("..").PermissionConstraint[]>)[];
