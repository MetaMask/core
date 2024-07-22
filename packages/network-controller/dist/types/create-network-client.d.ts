import type { BlockTracker, NetworkClientConfiguration, Provider } from './types';
/**
 * The pair of provider / block tracker that can be used to interface with the
 * network and respond to new activity.
 */
export type NetworkClient = {
    configuration: NetworkClientConfiguration;
    provider: Provider;
    blockTracker: BlockTracker;
    destroy: () => void;
};
/**
 * Create a JSON RPC network client for a specific network.
 *
 * @param networkConfig - The network configuration.
 * @returns The network client.
 */
export declare function createNetworkClient(networkConfig: NetworkClientConfiguration): NetworkClient;
//# sourceMappingURL=create-network-client.d.ts.map