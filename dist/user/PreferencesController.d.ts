import BaseController, { BaseConfig, BaseState } from '../BaseController';
import { ContactEntry } from './AddressBookController';
/**
 * Custom RPC network information
 *
 * @param rpcUrl - RPC target URL
 * @param chainId? - Network ID as per EIP-155
 * @param ticker? - Currency ticker
 * @param nickname? - Personalized network name
 * @param rpcPrefs? - Personalized preferences
 */
export interface FrequentRpc {
    rpcUrl: string;
    chainId?: number;
    nickname?: string;
    ticker?: string;
    rpcPrefs?: RpcPreferences;
}
/**
 * Custom RPC network preferences
 *
 * @param blockExplorerUrl - Block explorer URL
 */
export interface RpcPreferences {
    blockExplorerUrl: string;
}
/**
 * @type PreferencesState
 *
 * Preferences controller state
 *
 * @property featureFlags - Map of specific features to enable or disable
 * @property frequentRpcList - A list of custom RPCs to provide the user
 * @property identities - Map of addresses to ContactEntry objects
 * @property lostIdentities - Map of lost addresses to ContactEntry objects
 * @property selectedAddress - Current coinbase account
 */
export interface PreferencesState extends BaseState {
    featureFlags: {
        [feature: string]: boolean;
    };
    frequentRpcList: FrequentRpc[];
    ipfsGateway: string;
    identities: {
        [address: string]: ContactEntry;
    };
    lostIdentities: {
        [address: string]: ContactEntry;
    };
    selectedAddress: string;
}
/**
 * Controller that stores shared settings and exposes convenience methods
 */
export declare class PreferencesController extends BaseController<BaseConfig, PreferencesState> {
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates a PreferencesController instance
     *
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor(config?: Partial<BaseConfig>, state?: Partial<PreferencesState>);
    /**
     * Adds identities to state
     *
     * @param addresses - List of addresses to use to generate new identities
     */
    addIdentities(addresses: string[]): void;
    /**
     * Removes an identity from state
     *
     * @param address - Address of the identity to remove
     */
    removeIdentity(address: string): void;
    /**
     * Associates a new label with an identity
     *
     * @param address - Address of the identity to associate
     * @param label - New label to assign
     */
    setAccountLabel(address: string, label: string): void;
    /**
     * Enable or disable a specific feature flag
     *
     * @param feature - Feature to toggle
     * @param activated - Value to assign
     */
    setFeatureFlag(feature: string, activated: boolean): void;
    /**
     * Synchronizes the current identity list with new identities
     *
     * @param addresses - List of addresses corresponding to identities to sync
     * @returns - Newly-selected address after syncing
     */
    syncIdentities(addresses: string[]): string;
    /**
     * Generates and stores a new list of stored identities based on address. If the selected address
     * is unset, or if it refers to an identity that was removed, it will be set to the first
     * identity.
     *
     * @param addresses - List of addresses to use as a basis for each identity
     */
    updateIdentities(addresses: string[]): void;
    /**
     * Adds custom RPC URL to state
     *
     * @param url - Custom RPC URL
     * @param chainId? - Network ID as per EIP-155
     * @param ticker? - Currency ticker
     * @param nickname? - Personalized network name
     * @param rpcPrefs? - Personalized preferences
     *
     */
    addToFrequentRpcList(url: string, chainId?: number, ticker?: string, nickname?: string, rpcPrefs?: RpcPreferences): void;
    /**
     * Removes custom RPC URL from state
     *
     * @param url - Custom RPC URL
     */
    removeFromFrequentRpcList(url: string): void;
    /**
     * Sets selected address
     *
     * @param selectedAddress - Ethereum address
     */
    setSelectedAddress(selectedAddress: string): void;
    /**
     * Sets new IPFS gateway
     *
     * @param ipfsGateway - IPFS gateway string
     */
    setIpfsGateway(ipfsGateway: string): void;
}
export default PreferencesController;
