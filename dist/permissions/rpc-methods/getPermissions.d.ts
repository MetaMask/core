import type { PermittedHandlerExport } from '@metamask/types';
import type { PermissionConstraint } from '../Permission';
import type { SubjectPermissions } from '../PermissionController';
export declare const getPermissionsHandler: PermittedHandlerExport<GetPermissionsHooks, void, PermissionConstraint[]>;
export declare type GetPermissionsHooks = {
    getPermissionsForOrigin: () => SubjectPermissions<PermissionConstraint>;
};
