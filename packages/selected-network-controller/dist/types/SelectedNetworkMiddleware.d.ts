import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';
import type { SelectedNetworkControllerMessenger } from './SelectedNetworkController';
export type SelectedNetworkMiddlewareJsonRpcRequest = JsonRpcRequest & {
    networkClientId?: NetworkClientId;
    origin?: string;
};
export declare const createSelectedNetworkMiddleware: (messenger: SelectedNetworkControllerMessenger) => JsonRpcMiddleware<JsonRpcParams, Json>;
//# sourceMappingURL=SelectedNetworkMiddleware.d.ts.map