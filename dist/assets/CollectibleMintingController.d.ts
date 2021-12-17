/// <reference types="node" />
import { EventEmitter } from 'events';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import type { PreferencesState } from '../user/PreferencesController';
export interface MintingOptions {
    nftType: 'rarible' | 'custom';
}
/**
 * @type NftMetaData
 *
 * Collectible creator object coming from OpenSea api
 * @property name - name entered for nft
 * @property description - description entered for nft
 * @property image - IPFS hash of image (e.g. ipfs://QmYMuoAgKcqvd34rNU2WpoQunLj3WsAPWn9xUokiyposdC)
 */
export interface NftMetaData {
    name: string;
    description: string;
    image: string;
}
/**
 * @type NftMediaData
 *
 * Collectible creator object coming from OpenSea api
 * @property name - name of media with extension
 * @property type - post file type (e.g. image/jpeg)
 * @property uri - path of image to be uploaded to IPFS
 */
export interface NftMediaData {
    name: string | 'nft';
    type: string;
    uri: string;
}
export interface RaribleProps {
    royalties: any[];
    creatorProfitPercentage: number;
    lazy: boolean;
}
export interface CollectibleAttribute {
    name: string;
    value: string;
}
export interface CollectibleMintingMetaData {
    name: string;
    description: string;
    image: string;
    attributes?: CollectibleAttribute[];
}
export interface CollectibleMintingControllerConfig extends BaseConfig {
    networkType: NetworkType;
    selectedAddress: string;
    chainId: string;
    ipfsGateway: string;
    useIPFSSubdomains: boolean;
    provider: any;
}
export interface CollectibleMintingControllerState extends BaseState {
    minting: 'awaiting' | 'started' | 'processing' | 'complete';
}
export declare class CollectibleMintingController extends BaseController<CollectibleMintingControllerConfig, CollectibleMintingControllerState> {
    customMintWithMMCollection(tokenUri: string): Promise<void>;
    raribleMint(tokenUri: string, raribleProps: RaribleProps): Promise<import("@rarible/protocol-ethereum-sdk/build/nft/mint").MintOffChainResponse | import("@rarible/protocol-ethereum-sdk/build/nft/mint").MintOnChainResponse>;
    /**
     * Method to add and pin data to IPFS.
     *
     * @param data - data objects to be posted on IPFS
     * @returns IPFS response
     */
    uploadDataToIpfs(data: NftMediaData | NftMetaData): Promise<Response>;
    mint(tokenUri: string, options: MintingOptions, raribleProps?: RaribleProps): Promise<any>;
    /**
     * Sets an Infura Project ID to POST collectible information.
     *
     * @param infuraProjectId - Infura Project ID
     */
    setInfuraProjectId(infuraProjectId: string): void;
    /**
     * Optional Infura Project ID to use with infura
     */
    infuraProjectId?: string;
    /**
     * EventEmitter instance used to listen to specific transactional events
     */
    hub: EventEmitter;
    /**
     * Name of this controller used during composition
     */
    name: string;
    private web3;
    /**
     * Creates the CollectibleMintingController instance.
     *
     * @param options - The controller options.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, }: {
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        onPreferencesStateChange: (listener: (preferencesState: PreferencesState) => void) => void;
    }, config?: Partial<BaseConfig>, state?: Partial<CollectibleMintingController>);
    /**
     * Sets a new provider.
     *
     * @property provider - Provider used to create a new underlying Web3 instance
     */
    set provider(provider: any);
    get provider(): any;
}
export default CollectibleMintingController;
