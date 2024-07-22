import type { SnapController } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import type { Json } from '@metamask/utils';
/**
 * Handler for Snap requests.
 */
export type Handler = SnapController['handleRequest'];
/**
 * Snap client to submit requests through a handler that submit requests to
 * a Snap.
 */
export declare class SnapHandlerClient {
    #private;
    /**
     * Constructor for SnapHandlerClient.
     *
     * @param options - The client options.
     * @param options.handler - A function to submit requests to the Snap handler
     * (this should call the SnapController.handleRequest)
     * @param options.snapId - The Snap ID.
     * @param options.origin - The origin from which the Snap is being invoked.
     */
    constructor({ handler, snapId, origin, }: {
        handler: Handler;
        snapId: SnapId;
        origin?: string;
    });
    /**
     * Submit a request to the underlying SnapHandlerSender.
     *
     * @param method - The RPC handler method to be called.
     * @param params - The RPC handler parameters.
     * @returns The RPC handler response.
     */
    submitRequest: (method: string, params: Json[] | Record<string, Json>) => Promise<unknown>;
}
//# sourceMappingURL=SnapHandlerClient.d.ts.map