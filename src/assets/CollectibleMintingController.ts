import { EventEmitter } from 'events';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import { MAINNET, IPFS_DEFAULT_GATEWAY_URL } from '../constants';
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

export class CollectibleMintingController extends BaseController<
  CollectibleMintingControllerConfig,
  CollectibleMintingControllerState
> {
  private async customMint(collectible: CollectibleMintingMetaData) {
    console.log(collectible);
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

  private async raribleMint(collectible: CollectibleMintingMetaData) {
    console.log(collectible);
    // Prepare data

    // Mint
    this.addTransaction({
      from: '',
    });

    const result: Promise<string> = new Promise((resolve, reject) => {
      this.hub.once(`tx.id:finished`, () => {
        // if succesful
        this.addCollectible('test', 'test');
        return resolve('success');
        // else show error
        return reject(new Error());
      });
    });

    return result;
  }

  /**
   * 
   * @param collectible - object containing collectibe metadata
   * @param options - options for minting collectible
   */
  async mint(collectible: CollectibleMintingMetaData, options: MintingOptions) {
    if (options.nftType === 'rarible') {
      await this.raribleMint(collectible);
    } else {
      await this.customMint(collectible);
    }
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
}

export default CollectibleMintingController;
