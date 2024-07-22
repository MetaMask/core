import type { NetworkClientId } from '@metamask/network-controller';
import type { JsonRpcRequest } from '@metamask/utils';
export type QueuedRequestMiddlewareJsonRpcRequest = JsonRpcRequest & {
    networkClientId: NetworkClientId;
    origin: string;
};
//# sourceMappingURL=types.d.ts.map