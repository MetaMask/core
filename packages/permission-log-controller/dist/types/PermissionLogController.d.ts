import { BaseController, type RestrictedControllerMessenger } from '@metamask/base-controller';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { type Json, type JsonRpcRequest, type JsonRpcParams } from '@metamask/utils';
import { LOG_METHOD_TYPES } from './enums';
export type JsonRpcRequestWithOrigin<Params extends JsonRpcParams = JsonRpcParams> = JsonRpcRequest<Params> & {
    origin?: string;
};
export type Caveat = {
    type: string;
    value: string[];
};
export type Permission = {
    parentCapability: string;
    caveats?: Caveat[];
};
export type PermissionActivityLog = {
    id: string | number | null;
    method: string;
    methodType: LOG_METHOD_TYPES;
    origin?: string;
    requestTime: number;
    responseTime: number | null;
    success: boolean | null;
};
export type PermissionLog = {
    accounts?: Record<string, number>;
    lastApproved?: number;
};
export type PermissionEntry = Record<string, PermissionLog>;
export type PermissionHistory = Record<string, PermissionEntry>;
/**
 *
 * Permission log controller state
 * @property permissionHistory - permission history
 * @property permissionActivityLog - permission activity logs
 */
export type PermissionLogControllerState = {
    permissionHistory: PermissionHistory;
    permissionActivityLog: PermissionActivityLog[];
};
export type PermissionLogControllerOptions = {
    restrictedMethods: Set<string>;
    state?: Partial<PermissionLogControllerState>;
    messenger: PermissionLogControllerMessenger;
};
export type PermissionLogControllerMessenger = RestrictedControllerMessenger<typeof name, never, never, never, never>;
declare const name = "PermissionLogController";
/**
 * Controller with middleware for logging requests and responses to restricted
 * and permissions-related methods.
 */
export declare class PermissionLogController extends BaseController<typeof name, PermissionLogControllerState, PermissionLogControllerMessenger> {
    #private;
    constructor({ messenger, restrictedMethods, state, }: PermissionLogControllerOptions);
    /**
     * Updates the exposed account history for the given origin.
     * Sets the 'last seen' time to Date.now() for the given accounts.
     * Does **not** update the 'lastApproved' time for the permission itself.
     * Returns if the accounts array is empty.
     *
     * @param origin - The origin that the accounts are exposed to.
     * @param accounts - The accounts.
     */
    updateAccountsHistory(origin: string, accounts: string[]): void;
    /**
     * Create a permissions log middleware. Records permissions activity and history:
     *
     * Activity: requests and responses for restricted and most wallet_ methods.
     *
     * History: for each origin, the last time a permission was granted, including
     * which accounts were exposed, if any.
     *
     * @returns The permissions log middleware.
     */
    createMiddleware(): JsonRpcMiddleware<JsonRpcParams, Json>;
}
export {};
//# sourceMappingURL=PermissionLogController.d.ts.map