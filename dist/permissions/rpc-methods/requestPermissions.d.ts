import type { PermittedHandlerExport } from '@metamask/types';
import type { PermissionConstraint, RequestedPermissions } from '../Permission';
export declare const requestPermissionsHandler: PermittedHandlerExport<RequestPermissionsHooks, [
    RequestedPermissions
], PermissionConstraint[]>;
declare type RequestPermissions = (requestedPermissions: RequestedPermissions, id: string) => Promise<[
    Record<string, PermissionConstraint>,
    {
        id: string;
        origin: string;
    }
]>;
export declare type RequestPermissionsHooks = {
    requestPermissionsForOrigin: RequestPermissions;
};
export {};
