import type { ExternalProvider, JsonRpcFetchFunc } from '@ethersproject/providers';
import type { RestrictedControllerMessenger } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { NetworkControllerGetNetworkClientByIdAction, NetworkState } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
declare const name = "EnsController";
export declare const DEFAULT_ENS_NETWORK_MAP: Record<number, Hex>;
/**
 * @type EnsEntry
 *
 * ENS entry representation
 * @property chainId - Id of the associated chain
 * @property ensName - The ENS name
 * @property address - Hex address with the ENS name, or null
 */
export type EnsEntry = {
    chainId: Hex;
    ensName: string;
    address: string | null;
};
/**
 * @type EnsControllerState
 *
 * ENS controller state
 * @property ensEntries - Object of ENS entry objects
 */
export type EnsControllerState = {
    ensEntries: {
        [chainId: Hex]: {
            [ensName: string]: EnsEntry;
        };
    };
    ensResolutionsByAddress: {
        [key: string]: string;
    };
};
type AllowedActions = NetworkControllerGetNetworkClientByIdAction;
export type EnsControllerMessenger = RestrictedControllerMessenger<typeof name, AllowedActions, never, AllowedActions['type'], never>;
/**
 * Controller that manages a list ENS names and their resolved addresses
 * by chainId. A null address indicates an unresolved ENS name.
 */
export declare class EnsController extends BaseController<typeof name, EnsControllerState, EnsControllerMessenger> {
    #private;
    /**
     * Creates an EnsController instance.
     *
     * @param options - Constructor options.
     * @param options.registriesByChainId - Map between chain IDs and ENS contract addresses.
     * @param options.messenger - A reference to the messaging system.
     * @param options.state - Initial state to set on this controller.
     * @param options.provider - Provider instance.
     * @param options.onNetworkDidChange - Allows subscribing to network controller networkDidChange events.
     */
    constructor({ registriesByChainId, messenger, state, provider, onNetworkDidChange, }: {
        registriesByChainId?: Record<number, Hex>;
        messenger: EnsControllerMessenger;
        state?: Partial<EnsControllerState>;
        provider?: ExternalProvider | JsonRpcFetchFunc;
        onNetworkDidChange?: (listener: (networkState: NetworkState) => void) => void;
    });
    /**
     * Clears ensResolutionsByAddress state property.
     */
    resetState(): void;
    /**
     * Remove all chain Ids and ENS entries from state.
     */
    clear(): void;
    /**
     * Delete an ENS entry.
     *
     * @param chainId - Parent chain of the ENS entry to delete.
     * @param ensName - Name of the ENS entry to delete.
     * @returns Boolean indicating if the entry was deleted.
     */
    delete(chainId: Hex, ensName: string): boolean;
    /**
     * Retrieve a DNS entry.
     *
     * @param chainId - Parent chain of the ENS entry to retrieve.
     * @param ensName - Name of the ENS entry to retrieve.
     * @returns The EnsEntry or null if it does not exist.
     */
    get(chainId: Hex, ensName: string): EnsEntry | null;
    /**
     * Add or update an ENS entry by chainId and ensName.
     *
     * A null address indicates that the ENS name does not resolve.
     *
     * @param chainId - Id of the associated chain.
     * @param ensName - The ENS name.
     * @param address - Associated address (or null) to add or update.
     * @returns Boolean indicating if the entry was set.
     */
    set(chainId: Hex, ensName: string, address: string | null): boolean;
    /**
     * Resolve ens by address.
     *
     * @param nonChecksummedAddress - address
     * @returns ens resolution
     */
    reverseResolveAddress(nonChecksummedAddress: string): Promise<string | undefined>;
}
export default EnsController;
//# sourceMappingURL=EnsController.d.ts.map