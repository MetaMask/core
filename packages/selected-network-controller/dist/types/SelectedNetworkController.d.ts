import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { BlockTrackerProxy, NetworkClientId, NetworkControllerGetNetworkClientByIdAction, NetworkControllerGetSelectedNetworkClientAction, NetworkControllerGetStateAction, NetworkControllerStateChangeEvent, ProviderProxy } from '@metamask/network-controller';
import type { PermissionControllerStateChange, GetSubjects as PermissionControllerGetSubjectsAction, HasPermissions as PermissionControllerHasPermissions } from '@metamask/permission-controller';
import type { Patch } from 'immer';
export declare const controllerName = "SelectedNetworkController";
export type Domain = string;
export declare const METAMASK_DOMAIN: "metamask";
export declare const SelectedNetworkControllerActionTypes: {
    getState: "SelectedNetworkController:getState";
    getNetworkClientIdForDomain: "SelectedNetworkController:getNetworkClientIdForDomain";
    setNetworkClientIdForDomain: "SelectedNetworkController:setNetworkClientIdForDomain";
};
export declare const SelectedNetworkControllerEventTypes: {
    stateChange: "SelectedNetworkController:stateChange";
};
export type SelectedNetworkControllerState = {
    domains: Record<Domain, NetworkClientId>;
};
export type SelectedNetworkControllerStateChangeEvent = {
    type: typeof SelectedNetworkControllerEventTypes.stateChange;
    payload: [SelectedNetworkControllerState, Patch[]];
};
export type SelectedNetworkControllerGetSelectedNetworkStateAction = {
    type: typeof SelectedNetworkControllerActionTypes.getState;
    handler: () => SelectedNetworkControllerState;
};
export type SelectedNetworkControllerGetNetworkClientIdForDomainAction = {
    type: typeof SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain;
    handler: SelectedNetworkController['getNetworkClientIdForDomain'];
};
export type SelectedNetworkControllerSetNetworkClientIdForDomainAction = {
    type: typeof SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain;
    handler: SelectedNetworkController['setNetworkClientIdForDomain'];
};
export type SelectedNetworkControllerActions = SelectedNetworkControllerGetSelectedNetworkStateAction | SelectedNetworkControllerGetNetworkClientIdForDomainAction | SelectedNetworkControllerSetNetworkClientIdForDomainAction;
export type AllowedActions = NetworkControllerGetNetworkClientByIdAction | NetworkControllerGetSelectedNetworkClientAction | NetworkControllerGetStateAction | PermissionControllerHasPermissions | PermissionControllerGetSubjectsAction;
export type SelectedNetworkControllerEvents = SelectedNetworkControllerStateChangeEvent;
export type AllowedEvents = NetworkControllerStateChangeEvent | PermissionControllerStateChange;
export type SelectedNetworkControllerMessenger = RestrictedControllerMessenger<typeof controllerName, SelectedNetworkControllerActions | AllowedActions, SelectedNetworkControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
export type SelectedNetworkControllerOptions = {
    state?: SelectedNetworkControllerState;
    messenger: SelectedNetworkControllerMessenger;
    useRequestQueuePreference: boolean;
    onPreferencesStateChange: (listener: (preferencesState: {
        useRequestQueue: boolean;
    }) => void) => void;
    domainProxyMap: Map<Domain, NetworkProxy>;
};
export type NetworkProxy = {
    provider: ProviderProxy;
    blockTracker: BlockTrackerProxy;
};
/**
 * Controller for getting and setting the network for a particular domain.
 */
export declare class SelectedNetworkController extends BaseController<typeof controllerName, SelectedNetworkControllerState, SelectedNetworkControllerMessenger> {
    #private;
    /**
     * Construct a SelectedNetworkController controller.
     *
     * @param options - The controller options.
     * @param options.messenger - The restricted controller messenger for the EncryptionPublicKey controller.
     * @param options.state - The controllers initial state.
     * @param options.useRequestQueuePreference - A boolean indicating whether to use the request queue preference.
     * @param options.onPreferencesStateChange - A callback that is called when the preference state changes.
     * @param options.domainProxyMap - A map for storing domain-specific proxies that are held in memory only during use.
     */
    constructor({ messenger, state, useRequestQueuePreference, onPreferencesStateChange, domainProxyMap, }: SelectedNetworkControllerOptions);
    setNetworkClientIdForDomain(domain: Domain, networkClientId: NetworkClientId): void;
    getNetworkClientIdForDomain(domain: Domain): NetworkClientId;
    /**
     * Accesses the provider and block tracker for the currently selected network.
     *
     * @param domain - the domain for the provider
     * @returns The proxy and block tracker proxies.
     */
    getProviderAndBlockTracker(domain: Domain): NetworkProxy;
}
//# sourceMappingURL=SelectedNetworkController.d.ts.map