import type { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { NetworkControllerGetStateAction, NetworkControllerSetActiveNetworkAction } from '@metamask/network-controller';
import type { SelectedNetworkControllerGetNetworkClientIdForDomainAction, SelectedNetworkControllerStateChangeEvent } from '@metamask/selected-network-controller';
import type { QueuedRequestMiddlewareJsonRpcRequest } from './types';
export declare const controllerName = "QueuedRequestController";
export type QueuedRequestControllerState = {
    queuedRequestCount: number;
};
export declare const QueuedRequestControllerActionTypes: {
    enqueueRequest: "QueuedRequestController:enqueueRequest";
    getState: "QueuedRequestController:getState";
};
export type QueuedRequestControllerGetStateAction = ControllerGetStateAction<typeof controllerName, QueuedRequestControllerState>;
export type QueuedRequestControllerEnqueueRequestAction = {
    type: typeof QueuedRequestControllerActionTypes.enqueueRequest;
    handler: QueuedRequestController['enqueueRequest'];
};
export declare const QueuedRequestControllerEventTypes: {
    networkSwitched: "QueuedRequestController:networkSwitched";
    stateChange: "QueuedRequestController:stateChange";
};
export type QueuedRequestControllerStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, QueuedRequestControllerState>;
export type QueuedRequestControllerNetworkSwitched = {
    type: typeof QueuedRequestControllerEventTypes.networkSwitched;
    payload: [string];
};
export type QueuedRequestControllerEvents = QueuedRequestControllerStateChangeEvent | QueuedRequestControllerNetworkSwitched;
export type QueuedRequestControllerActions = QueuedRequestControllerGetStateAction | QueuedRequestControllerEnqueueRequestAction;
export type AllowedActions = NetworkControllerGetStateAction | NetworkControllerSetActiveNetworkAction | SelectedNetworkControllerGetNetworkClientIdForDomainAction;
export type AllowedEvents = SelectedNetworkControllerStateChangeEvent;
export type QueuedRequestControllerMessenger = RestrictedControllerMessenger<typeof controllerName, QueuedRequestControllerActions | AllowedActions, QueuedRequestControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
export type QueuedRequestControllerOptions = {
    messenger: QueuedRequestControllerMessenger;
    shouldRequestSwitchNetwork: (request: QueuedRequestMiddlewareJsonRpcRequest) => boolean;
    clearPendingConfirmations: () => void;
    showApprovalRequest: () => void;
};
/**
 * Queue requests for processing in batches, by request origin.
 *
 * Processing requests in batches allows us to completely separate sets of requests that originate
 * from different origins. This ensures that our UI will not display those requests as a set, which
 * could mislead users into thinking they are related.
 *
 * Queuing requests in batches also allows us to ensure the globally selected network matches the
 * dapp-selected network, before the confirmation UI is rendered. This is important because the
 * data shown on some confirmation screens is only collected for the globally selected network.
 *
 * Requests get processed in order of insertion, even across batches. All requests get processed
 * even in the event of preceding requests failing.
 */
export declare class QueuedRequestController extends BaseController<typeof controllerName, QueuedRequestControllerState, QueuedRequestControllerMessenger> {
    #private;
    /**
     * Construct a QueuedRequestController.
     *
     * @param options - Controller options.
     * @param options.messenger - The restricted controller messenger that facilitates communication with other controllers.
     * @param options.shouldRequestSwitchNetwork - A function that returns if a request requires the globally selected network to match the dapp selected network.
     * @param options.clearPendingConfirmations - A function that will clear all the pending confirmations.
     * @param options.showApprovalRequest - A function for opening the UI such that
     * the existing request can be displayed to the user.
     */
    constructor({ messenger, shouldRequestSwitchNetwork, clearPendingConfirmations, showApprovalRequest, }: QueuedRequestControllerOptions);
    /**
     * Enqueue a request to be processed in a batch with other requests from the same origin.
     *
     * We process requests one origin at a time, so that requests from different origins do not get
     * interwoven, and so that we can ensure that the globally selected network matches the dapp-
     * selected network.
     *
     * Requests get processed in order of insertion, even across origins/batches. All requests get
     * processed even in the event of preceding requests failing.
     *
     * @param request - The JSON-RPC request to process.
     * @param requestNext - A function representing the next steps for processing this request.
     * @returns A promise that resolves when the given request has been fully processed.
     */
    enqueueRequest(request: QueuedRequestMiddlewareJsonRpcRequest, requestNext: () => Promise<void>): Promise<void>;
}
//# sourceMappingURL=QueuedRequestController.d.ts.map