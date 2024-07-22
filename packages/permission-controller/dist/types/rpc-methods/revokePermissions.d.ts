import { type Json, type NonEmptyArray } from '@metamask/utils';
import type { PermissionConstraint } from '../Permission';
import type { PermittedHandlerExport } from '../utils';
export declare const revokePermissionsHandler: PermittedHandlerExport<RevokePermissionsHooks, RevokePermissionArgs, null>;
export type RevokePermissionArgs = Record<PermissionConstraint['parentCapability'], Json>;
type RevokePermissions = (permissions: NonEmptyArray<PermissionConstraint['parentCapability']>) => void;
export type RevokePermissionsHooks = {
    revokePermissionsForOrigin: RevokePermissions;
};
export {};
//# sourceMappingURL=revokePermissions.d.ts.map