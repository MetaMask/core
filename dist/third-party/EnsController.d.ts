import BaseController, { BaseConfig, BaseState } from '../BaseController';
/**
 * @type EnsEntry
 *
 * ENS entry representation
 *
 * @property chainId - Id of the associated chain
 * @property ensName - The ENS name
 * @property address - Hex address with the ENS name, or null
 */
export interface EnsEntry {
    chainId: string;
    ensName: string;
    address: string | null;
}
/**
 * @type EnsState
 *
 * ENS controller state
 *
 * @property ensEntries - Object of ENS entry objects
 */
export interface EnsState extends BaseState {
    ensEntries: {
        [chainId: string]: {
            [ensName: string]: EnsEntry;
        };
    };
}
/**
 * Controller that manages a list ENS names and their resolved addresses
 * by chainId. A null address indicates an unresolved ENS name.
 */
export declare class EnsController extends BaseController<BaseConfig, EnsState> {
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates an EnsController instance
     *
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor(config?: Partial<BaseConfig>, state?: Partial<EnsState>);
    /**
     * Remove all chain Ids and ENS entries from state
     */
    clear(): void;
    /**
     * Delete an ENS entry.
     *
     * @param chainId - Parent chain of the ENS entry to delete
     * @param ensName - Name of the ENS entry to delete
     *
     * @returns - Boolean indicating if the entry was deleted
     */
    delete(chainId: string, ensName: string): boolean;
    /**
     * Retrieve a DNS entry.
     *
     * @param chainId - Parent chain of the ENS entry to retrieve
     * @param ensName - Name of the ENS entry to retrieve
     *
     * @returns - The EnsEntry or null if it does not exist
     */
    get(chainId: string, ensName: string): EnsEntry | null;
    /**
     * Add or update an ENS entry by chainId and ensName.
     *
     * A null address indicates that the ENS name does not resolve.
     *
     * @param chainId - Id of the associated chain
     * @param ensName - The ENS name
     * @param address - Associated address (or null) to add or update
     *
     * @returns - Boolean indicating if the entry was set
     */
    set(chainId: string, ensName: string, address: string | null): boolean;
}
export default EnsController;
