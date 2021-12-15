import { EventEmitter } from 'events';
import Web3 from 'web3';
import { createRaribleSdk } from '@rarible/protocol-ethereum-sdk';
import { Web3Ethereum } from '@rarible/web3-ethereum';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import {
  MAINNET,
  RINKEBY,
  ROPSTEN,
  IPFS_DEFAULT_GATEWAY_URL,
  ERC721_RARIBLE_COLLECTIONS,
} from '../constants';
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

export class CollectibleMintingController extends BaseController<
  CollectibleMintingControllerConfig,
  CollectibleMintingControllerState
> {
  // private async deployNewERC721(
  //   smartContractBytecode: any,
  //   name: string,
  //   symbol: string,
  // ): Promise<void> {
  //   const payload = {
  //     data: smartContractBytecode,
  //     arguments: [name, symbol],
  //   };
  //   const params = {
  //     from: 'address',
  //     gas: '0x0',
  //     gasPrice: '0x3DFB2E',
  //   };

  //   this.addTransaction({ ...params, ...payload }, 'Contract Deploy');
  // }

  private async customMint(tokenUri: string) {
    console.log(tokenUri);
  }

  async raribleMint(tokenUri: string, royalties: any[]) {
    const { networkType, selectedAddress } = this.config;
    if (
      networkType !== MAINNET &&
      networkType !== RINKEBY &&
      networkType !== ROPSTEN
    ) {
      throw new Error(
        `Network ${networkType} not support by Rarible. Use mainnet, rinkeby or ropsten`,
      );
    }
    const creators: any[] = [{ account: selectedAddress, value: 10000 }];
    const collectionAddress = ERC721_RARIBLE_COLLECTIONS[networkType];
    const sdk = createRaribleSdk(
      new Web3Ethereum({ web3: this.web3 }),
      'rinkeby',
    );
    const nftCollection: any = await sdk.apis.nftCollection.getNftCollectionById(
      {
        collection: collectionAddress,
      },
    );

    console.log(Object.keys(sdk.apis));
    console.log(Object.keys(sdk.nft));

    const mintingTx = await sdk.nft.mint({
      collection: nftCollection,
      uri: tokenUri,
      creators,
      royalties,
      lazy: true,
    });
    console.log('mintingTx -> ', mintingTx);
    return mintingTx;
  }

  async mint(tokenUri: string, options: MintingOptions) {
    if (options.nftType === 'rarible') {
      await this.raribleMint(tokenUri, []);
    } else {
      await this.customMint(tokenUri);
    }
    this.addCollectible('', '');
    this.addTransaction({} as any);
  }

  /**
   * EventEmitter instance used to listen to specific transactional events
   */
  hub = new EventEmitter();

  /**
   * Name of this controller used during composition
   */
  name = 'CollectibleMintingController';

  private addCollectible: CollectiblesController['addCollectible'];

  private addTransaction: TransactionController['addTransaction'];

  private web3: any;

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
  constructor(
    {
      onNetworkStateChange,
      addCollectible,
      addTransaction,
    }: {
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      addCollectible: CollectiblesController['addCollectible'];
      addTransaction: TransactionController['addTransaction'];
    },
    config?: Partial<BaseConfig>,
    state?: Partial<CollectibleMintingController>,
  ) {
    super(config, state);
    this.defaultConfig = {
      networkType: MAINNET,
      selectedAddress: '',
      chainId: '',
      ipfsGateway: IPFS_DEFAULT_GATEWAY_URL,
      useIPFSSubdomains: true,
      provider: undefined,
    };

    this.defaultState = {
      minting: 'awaiting',
    };
    this.initialize();
    onNetworkStateChange(({ provider }) => {
      const { chainId } = provider;
      this.configure({ chainId });
    });
    this.addCollectible = addCollectible;
    this.addTransaction = addTransaction;
  }

  /**
   * Sets a new provider.
   *
   * @property provider - Provider used to create a new underlying Web3 instance
   */
  set provider(provider: any) {
    this.web3 = new Web3(provider);
  }

  get provider() {
    throw new Error('Property only used for setting');
  }
}

export default CollectibleMintingController;
