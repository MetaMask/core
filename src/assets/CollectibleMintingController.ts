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
import { handleFetch } from '../util';
import type { TransactionController } from '../transaction/TransactionController';
import type { PreferencesState } from '../user/PreferencesController';
import type { CollectiblesController } from './CollectiblesController';

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

  async customMintWithMMCollection(tokenUri: string) {
    // ipfs://QmRUA2oJUceyGLxh6yVYQodL5smkP2Xr1u9eHciTM2xLMd
    console.log(tokenUri);
    // // Logic to covert metadat to hex
    // 0x60806040526040518060400160405280600581526020017f2e6a736f6e000000000000000000000000000000000000000000000000000000815250600c90805190602001906200005192919062000de6565b5066470de4df820000600d55612710600e556001600f556000601060..
    // const txParams = {};
    // txParams.from = '0x260416FDEc04AB146464aF833E63835a704C4860';
    // txParams.value = '0x0';
    // txParams.gas = '0x3DFB2E';
    // txParams.data = data;
    // const { transactionMeta } = await TransactionController.addTransaction(
    //     txParams,
    //     'nft',
    //     WalletDevice.MM_MOBILE
    // );
    // await TransactionController.approveTransaction(transactionMeta.id);
  }

  async raribleMint(tokenUri: string, raribleProps: RaribleProps) {
    const { networkType, selectedAddress } = this.config;
    const { royalties, creatorProfitPercentage, lazy } = raribleProps;
    if (
      networkType !== MAINNET &&
      networkType !== RINKEBY &&
      networkType !== ROPSTEN
    ) {
      throw new Error(
        `Network ${networkType} not support by Rarible. Use mainnet, rinkeby or ropsten`,
      );
    }
    const creators: any[] = [
      { account: selectedAddress, value: creatorProfitPercentage },
    ];
    const collectionAddress = ERC721_RARIBLE_COLLECTIONS[networkType].address;
    const sdk = createRaribleSdk(
      new Web3Ethereum({ web3: this.web3 }),
      ERC721_RARIBLE_COLLECTIONS[networkType].env as any,
    );
    const nftCollection: any = await sdk.apis.nftCollection.getNftCollectionById(
      {
        collection: collectionAddress,
      },
    );

    return await sdk.nft.mint({
      collection: nftCollection,
      uri: tokenUri,
      creators,
      royalties,
      lazy,
    });
  }

  /**
   * Method to add and pin data to IPFS.
   *
   * @param data - data objects to be posted on IPFS
   * @returns IPFS response
   */
  async uploadDataToIpfs(data: NftMediaData | NftMetaData): Promise<Response> {
    const formData = new FormData();
    formData.append('file', JSON.stringify(data));

    const ipfsAddResponse = await handleFetch(
      'https://ipfs.infura.io:5001/api/v0/add',
      {
        method: 'POST',
        body: formData,
      },
    );

    return ipfsAddResponse;
  }

  async mint(
    tokenUri: string,
    options: MintingOptions,
    raribleProps?: RaribleProps,
  ) {
    if (options.nftType === 'rarible' && raribleProps) {
      await this.raribleMint(tokenUri, raribleProps);
    } else {
      await this.customMintWithMMCollection(tokenUri);
    }

    // REMOVE
    this.addCollectible('', '');
    this.addTransaction({} as any);
  }

  /**
   * Sets an Infura Project ID to POST collectible information.
   *
   * @param infuraProjectId - Infura Project ID
   */
  setInfuraProjectId(infuraProjectId: string) {
    this.infuraProjectId = infuraProjectId;
  }

  /**
   * Optional Infura Project ID to use with infura
   */
  infuraProjectId?: string;

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
   * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
   * @param options.addCollectible - Allows the controlelr to add a collectible to collectible controller.
   * @param options.addTransaction - Allows the controler to add a transaction to transaction controller.
   * @param config - Initial options used to configure this controller.
   * @param state - Initial state to set on this controller.
   */
  constructor(
    {
      onPreferencesStateChange,
      onNetworkStateChange,
      addCollectible,
      addTransaction,
    }: {
      onNetworkStateChange: (
        listener: (networkState: NetworkState) => void,
      ) => void;
      onPreferencesStateChange: (
        listener: (preferencesState: PreferencesState) => void,
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

    onPreferencesStateChange(({ selectedAddress }) => {
      this.configure({ selectedAddress });
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
    console.log('New provider created for provider: ', provider);
  }

  get provider() {
    throw new Error('Property only used for setting');
  }
}

export default CollectibleMintingController;
