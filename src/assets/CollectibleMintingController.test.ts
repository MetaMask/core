import HttpProvider from 'ethjs-provider-http';
import { TransactionController } from '../transaction/TransactionController';
import { NetworkController, NetworkType } from '../network/NetworkController';
import { PreferencesController } from '../user/PreferencesController';
import { CollectiblesController } from './CollectiblesController';
import { CollectibleMintingController } from './CollectibleMintingController';
import { AssetsContractController } from './AssetsContractController';

const MOCK_NETWORK = {
  getProvider: () =>
    new HttpProvider(
      'https://ropsten.infura.io/v3/341eacb578dd44a1a049cbc5f6fd4035',
    ),
  state: {
    network: '3',
    isCustomNetwork: false,
    properties: { isEIP1559Compatible: false },
    provider: {
      type: 'ropsten' as NetworkType,
      chainId: '3',
    },
  },
  subscribe: () => undefined,
};

describe('CollectiblesController', () => {
  let collectibleMintingController: CollectibleMintingController;
  let collectiblesController: CollectiblesController;
  let transactionControllerences: TransactionController;
  let network: NetworkController;
  let preferences: PreferencesController;
  let assetsContract: AssetsContractController;
  beforeEach(() => {
    network = new NetworkController();
    preferences = new PreferencesController();
    assetsContract = new AssetsContractController();
    collectiblesController = new CollectiblesController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
      getAssetName: assetsContract.getAssetName.bind(assetsContract),
      getAssetSymbol: assetsContract.getAssetSymbol.bind(assetsContract),
      getCollectibleTokenURI: assetsContract.getCollectibleTokenURI.bind(
        assetsContract,
      ),
      getOwnerOf: assetsContract.getOwnerOf.bind(assetsContract),
      balanceOfERC1155Collectible: assetsContract.balanceOfERC1155Collectible.bind(
        assetsContract,
      ),
      uriERC1155Collectible: assetsContract.uriERC1155Collectible.bind(
        assetsContract,
      ),
    });

    transactionControllerences = new TransactionController({
      getNetworkState: () => MOCK_NETWORK.state,
      onNetworkStateChange: MOCK_NETWORK.subscribe,
      getProvider: MOCK_NETWORK.getProvider,
    });

    collectibleMintingController = new CollectibleMintingController({
      onNetworkStateChange: (listener) => network.subscribe(listener),
      addCollectible: collectiblesController.addCollectible,
      addTransaction: transactionControllerences.addTransaction,
    });
  });

  it('should initialize', async () => {
    console.log(collectibleMintingController);
    expect(collectibleMintingController).toBeDefined();
    expect(collectibleMintingController.config.chainId).toBe('');
  });
});
