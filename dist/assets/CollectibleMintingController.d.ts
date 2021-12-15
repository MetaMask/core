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
}
export interface CollectibleMintingControllerState extends BaseState {
    minting: 'awaiting' | 'started' | 'processing' | 'complete';
}
export declare class CollectibleMintingController extends BaseController<CollectibleMintingControllerConfig, CollectibleMintingControllerState> {
    private customMint;
    private raribleMint;
    uploadDataToIpfs(data: string): Promise<Response>;
    mint(collectible: CollectibleMintingMetaData, options: MintingOptions): Promise<void>;
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
    private addCollectible;
    private addTransaction;
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
}
export default CollectibleMintingController;
