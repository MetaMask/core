/// <reference types="node" />
import { EventEmitter } from 'events';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import type { TransactionController } from '../transaction/TransactionController';
import type { CollectiblesController } from './CollectiblesController';
export interface MintingOptions {
    nftType: 'rarible' | 'custom';
}
export interface CollectibleMintingMetaData {
    name: string;
    description: string;
    image: string;
    attributes: any;
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
    private customMint;
    raribleMint(tokenUri: string, royalties: any[]): Promise<import("@rarible/protocol-ethereum-sdk/build/nft/mint").MintOffChainResponse | import("@rarible/protocol-ethereum-sdk/build/nft/mint").MintOnChainResponse>;
    mint(tokenUri: string, options: MintingOptions): Promise<void>;
    /**
     * EventEmitter instance used to listen to specific transactional events
     */
    hub: EventEmitter;
    /**
     * Name of this controller used during composition
     */
    name: string;
    private addCollectible;
    private addTransaction;
    private web3;
    /**
     * Creates the CollectibleMintingController instance.
     *
     * @param options - The controller options.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.addCollectible - Allows the controlelr to add a collectible to collectible controller.
     * @param options.addTransaction - Allows the controler to add a transaction to transaction controller.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onNetworkStateChange, addCollectible, addTransaction, }: {
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        addCollectible: CollectiblesController['addCollectible'];
        addTransaction: TransactionController['addTransaction'];
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
