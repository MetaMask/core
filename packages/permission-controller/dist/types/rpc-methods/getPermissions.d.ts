import type { PermissionConstraint } from '../Permission';
import type { SubjectPermissions } from '../PermissionController';
import type { PermittedHandlerExport } from '../utils';
export declare const getPermissionsHandler: PermittedHandlerExport<GetPermissionsHooks, [
], PermissionConstraint[]>;
export type GetPermissionsHooks = {
    getPermissionsForOrigin: () => SubjectPermissions<PermissionConstraint>;
};
//# sourceMappingURL=getPermissions.d.ts.map