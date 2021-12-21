import { createSandbox, stub } from 'sinon';
import nock from 'nock';
import { NetworkController } from '../network/NetworkController';
import { PreferencesController } from '../user/PreferencesController';
import { CollectiblesController } from './CollectiblesController';
import { AssetsContractController } from './AssetsContractController';
import { CollectibleDetectionController } from './CollectibleDetectionController';

const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';
const ROPSTEN = 'ropsten';
const OPEN_SEA_HOST = 'https://api.opensea.io';
const OPEN_SEA_PATH = '/api/v1';

describe('CollectibleDetectionController', () => {
  let collectibleDetection: CollectibleDetectionController;
  let preferences: PreferencesController;
  let network: NetworkController;
  let collectiblesController: CollectiblesController;
  let assetsContract: AssetsContractController;
  const sandbox = createSandbox();

  beforeEach(async () => {
    preferences = new PreferencesController();
    network = new NetworkController();
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

    collectibleDetection = new CollectibleDetectionController({
      onCollectiblesStateChange: (listener) =>
        collectiblesController.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
      getOpenSeaApiKey: () => collectiblesController.openSeaApiKey,
      addCollectible: collectiblesController.addCollectible.bind(
        collectiblesController,
      ),
      getCollectiblesState: () => collectiblesController.state,
    });

    collectiblesController.configure({ chainId: '1', selectedAddress: '0x1' });
    preferences.setOpenSeaEnabled(true);
    preferences.setUseCollectibleDetection(true);

    nock(OPEN_SEA_HOST)
      .get(`${OPEN_SEA_PATH}/assets?owner=0x2&offset=0&limit=50`)
      .reply(200, {
        assets: [
          {
            asset_contract: {
              address: '0x1d963688fe2209a98db35c67a041524822cf04ff',
              schema_name: 'ERC721',
            },
            collection: {
              name: 'Collection 2577',
              image_url: 'url',
            },
            description: 'Description 2577',
            image_original_url: 'image/2577.png',
            name: 'ID 2577',
            token_id: '2577',
          },
        ],
      })
      .get(`${OPEN_SEA_PATH}/assets?owner=0x2&offset=50&limit=50`)
      .reply(200, {
        assets: [],
      })
      .persist();

    nock(OPEN_SEA_HOST)
      .get(
        `${OPEN_SEA_PATH}/asset_contract/0x1d963688FE2209A98dB35C67A041524822Cf04ff`,
      )
      .reply(200, {
        description: 'Description',
        image_url: 'url',
        name: 'Name',
        symbol: 'FOO',
        total_supply: 0,
        collection: {
          image_url: 'url',
          name: 'Name',
        },
      })
      .get(
        `${OPEN_SEA_PATH}/asset_contract/0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD`,
      )
      .reply(200, {
        description: 'Description HH',
        symbol: 'HH',
        total_supply: 10,
        collection: {
          image_url: 'url HH',
          name: 'Name HH',
        },
      })
      .get(
        `${OPEN_SEA_PATH}/asset_contract/0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc`,
      )
      .replyWithError(new TypeError('Failed to fetch'))
      .get(
        `${OPEN_SEA_PATH}/asset_contract/0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d`,
      )
      .replyWithError(new TypeError('Failed to fetch'))
      .get(`${OPEN_SEA_PATH}/assets?owner=0x1&offset=0&limit=50`)
      .reply(200, {
        assets: [
          {
            asset_contract: {
              address: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
              schema_name: 'ERC721',
            },
            collection: {
              name: 'Collection 2577',
              image_url: 'url',
            },
            description: 'Description 2577',
            image_url: 'image/2577.png',
            name: 'ID 2577',
            token_id: '2577',
          },
          {
            asset_contract: {
              address: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
              schema_name: 'ERC721',
            },
            collection: {
              name: 'Collection 2577',
              image_url: 'url',
            },
            description: 'Description 2578',
            image_url: 'image/2578.png',
            name: 'ID 2578',
            token_id: '2578',
          },
          {
            asset_contract: {
              address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
              schema_name: 'ERC721',
            },
            collection: {
              name: 'Collection 2574',
              image_url: 'url',
            },
            description: 'Description 2574',
            image_url: 'image/2574.png',
            name: 'ID 2574',
            token_id: '2574',
          },
        ],
      })
      .get(`${OPEN_SEA_PATH}/assets?owner=0x1&offset=50&limit=50`)
      .reply(200, {
        assets: [],
      })
      .get(`${OPEN_SEA_PATH}/assets?owner=0x9&offset=50&limit=50`)
      .delay(800)
      .reply(200, {
        assets: [
          {
            asset_contract: {
              address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
              schema_name: 'ERC721',
            },
            collection: {
              name: 'Collection 2574',
              image_url: 'url',
            },
            description: 'Description 2574',
            image_url: 'image/2574.png',
            name: 'ID 2574',
            token_id: '2574',
          },
        ],
      })
      .get(`${OPEN_SEA_PATH}/assets?owner=0x9&offset=50&limit=50`)
      .reply(200, {
        assets: [],
      });
  });

  afterEach(() => {
    nock.cleanAll();
    sandbox.reset();
  });

  it('should set default config', () => {
    preferences.setUseCollectibleDetection(false);
    expect(collectibleDetection.config).toStrictEqual({
      interval: DEFAULT_INTERVAL,
      networkType: 'mainnet',
      chainId: '1',
      selectedAddress: '',
      disabled: true,
    });
  });

  it('should poll and detect collectibles on interval while on mainnet', async () => {
    await new Promise((resolve) => {
      const mockCollectibles = stub(
        CollectibleDetectionController.prototype,
        'detectCollectibles',
      );
      const collectiblesDetectionController = new CollectibleDetectionController(
        {
          onCollectiblesStateChange: (listener) =>
            collectiblesController.subscribe(listener),
          onPreferencesStateChange: (listener) =>
            preferences.subscribe(listener),
          onNetworkStateChange: (listener) => network.subscribe(listener),
          getOpenSeaApiKey: () => collectiblesController.openSeaApiKey,
          addCollectible: collectiblesController.addCollectible.bind(
            collectiblesController,
          ),
          getCollectiblesState: () => collectiblesController.state,
        },
        { interval: 10 },
      );
      collectiblesDetectionController.configure({ disabled: false });
      collectiblesDetectionController.start();
      expect(mockCollectibles.calledOnce).toBe(true);
      setTimeout(() => {
        expect(mockCollectibles.calledTwice).toBe(true);
        mockCollectibles.restore();
        resolve('');
      }, 15);
    });
  });

  it('should detect mainnet correctly', () => {
    collectibleDetection.configure({ networkType: MAINNET });
    expect(collectibleDetection.isMainnet()).toStrictEqual(true);
    collectibleDetection.configure({ networkType: ROPSTEN });
    expect(collectibleDetection.isMainnet()).toStrictEqual(false);
  });

  it('should not autodetect while not on mainnet', async () => {
    await new Promise((resolve) => {
      const mockCollectibles = stub(
        CollectibleDetectionController.prototype,
        'detectCollectibles',
      );
      new CollectibleDetectionController(
        {
          onCollectiblesStateChange: (listener) =>
            collectiblesController.subscribe(listener),
          onPreferencesStateChange: (listener) =>
            preferences.subscribe(listener),
          onNetworkStateChange: (listener) => network.subscribe(listener),
          getOpenSeaApiKey: () => collectiblesController.openSeaApiKey,
          addCollectible: collectiblesController.addCollectible.bind(
            collectiblesController,
          ),
          getCollectiblesState: () => collectiblesController.state,
        },
        { interval: 10, networkType: ROPSTEN },
      );
      expect(mockCollectibles.called).toBe(false);
      mockCollectibles.restore();
      resolve('');
    });
  });

  it('should detect and add collectibles correctly', async () => {
    const selectedAddress = '0x1';

    collectibleDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });

    collectiblesController.configure({
      networkType: MAINNET,
      selectedAddress,
    });
    const { chainId } = collectibleDetection.config;

    await collectibleDetection.detectCollectibles();

    const collectibles =
      collectiblesController.state.allCollectibles[selectedAddress][chainId];
    expect(collectibles).toStrictEqual([
      {
        address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
        description: 'Description 2574',
        image: 'image/2574.png',
        name: 'ID 2574',
        tokenId: '2574',
        standard: 'ERC721',
        favorite: false,
        isCurrentlyOwned: true,
      },
    ]);
  });

  it('should detect, add collectibles and do nor remove not detected collectibles correctly', async () => {
    const selectedAddress = '0x1';
    collectibleDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });
    collectiblesController.configure({ selectedAddress });

    const { chainId } = collectibleDetection.config;

    await collectiblesController.addCollectible(
      '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
      '2573',
      {
        description: 'Description 2573',
        image: 'image/2573.png',
        name: 'ID 2573',
        standard: 'ERC721',
      },
    );

    await collectibleDetection.detectCollectibles();

    const collectibles =
      collectiblesController.state.allCollectibles[selectedAddress][chainId];

    expect(collectibles).toStrictEqual([
      {
        address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
        description: 'Description 2573',
        image: 'image/2573.png',
        name: 'ID 2573',
        standard: 'ERC721',
        tokenId: '2573',
        favorite: false,
        isCurrentlyOwned: true,
      },
      {
        address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
        description: 'Description 2574',
        image: 'image/2574.png',
        name: 'ID 2574',
        tokenId: '2574',
        standard: 'ERC721',
        favorite: false,
        isCurrentlyOwned: true,
      },
    ]);
  });

  it('should not autodetect collectibles that exist in the ignoreList', async () => {
    const selectedAddress = '0x2';
    collectibleDetection.configure({
      networkType: MAINNET,
      selectedAddress: '0x2',
    });
    collectiblesController.configure({ selectedAddress });

    const { chainId } = collectibleDetection.config;

    await collectibleDetection.detectCollectibles();
    expect(
      collectiblesController.state.allCollectibles[selectedAddress][chainId],
    ).toHaveLength(1);
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(0);
    collectiblesController.removeAndIgnoreCollectible(
      '0x1d963688FE2209A98dB35C67A041524822Cf04ff',
      '2577',
    );

    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(1);
    await collectibleDetection.detectCollectibles();
    expect(
      collectiblesController.state.allCollectibles[selectedAddress][chainId],
    ).toHaveLength(0);
  });

  it('should not detect and add collectibles if there is no selectedAddress', async () => {
    const selectedAddress = '';
    collectibleDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });
    const { chainId } = collectibleDetection.config;
    await collectibleDetection.detectCollectibles();
    const { allCollectibles } = collectiblesController.state;
    expect(allCollectibles[selectedAddress]?.[chainId]).toBeUndefined();
  });

  it('should not detect and add collectibles to the wrong selectedAddress', async () => {
    collectibleDetection.configure({
      networkType: MAINNET,
      selectedAddress: '0x9',
    });
    const { chainId } = collectibleDetection.config;

    collectiblesController.configure({ selectedAddress: '0x9' });
    collectibleDetection.detectCollectibles();
    collectibleDetection.configure({ selectedAddress: '0x12' });
    collectiblesController.configure({ selectedAddress: '0x12' });
    await new Promise((res) => setTimeout(() => res(true), 1000));
    expect(collectibleDetection.config.selectedAddress).toStrictEqual('0x12');

    expect(
      collectiblesController.state.allCollectibles[
        collectibleDetection.config.selectedAddress
      ]?.[chainId],
    ).toBeUndefined();
  });

  it('should not detect and add collectibles if preferences controller useCollectibleDetection is set to false', async () => {
    preferences.setUseCollectibleDetection(false);
    const selectedAddress = '0x9';
    collectibleDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });
    const { chainId } = collectiblesController.config;
    collectibleDetection.detectCollectibles();
    expect(
      collectiblesController.state.allCollectibles[selectedAddress]?.[chainId],
    ).toBeUndefined();
  });

  it('should not detect and add collectibles if preferences controller openSeaEnabled is set to false', async () => {
    preferences.setOpenSeaEnabled(false);
    const selectedAddress = '0x9';
    collectibleDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });
    const { chainId } = collectiblesController.config;
    collectibleDetection.detectCollectibles();
    expect(
      collectiblesController.state.allCollectibles[selectedAddress]?.[chainId],
    ).toBeUndefined();
  });

  it('should not add collectible if collectible or collectible contract has no information to display', async () => {
    const collectibleHH2574 = {
      address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
      description: 'Description 2574',
      image: 'image/2574.png',
      name: 'ID 2574',
      tokenId: '2574',
      standard: 'ERC721',
      favorite: false,
      isCurrentlyOwned: true,
    };
    const collectibleGG2574 = {
      address: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
      description: 'Description 2574',
      image: 'image/2574.png',
      name: 'ID 2574',
      tokenId: '2574',
      standard: 'ERC721',
      favorite: false,
      isCurrentlyOwned: true,
    };
    const collectibleII2577 = {
      address: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
      description: 'Description 2577',
      image: 'image/2577.png',
      name: 'ID 2577',
      tokenId: '2577',
      standard: 'ERC721',
      favorite: false,
      isCurrentlyOwned: true,
    };
    const collectibleContractHH = {
      address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
      description: 'Description HH',
      logo: 'url HH',
      name: 'Name HH',
      symbol: 'HH',
      totalSupply: 10,
    };
    const collectibleContractGG = {
      address: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
      description: 'Description GG',
      logo: 'url GG',
      name: 'Name GG',
      symbol: 'GG',
      totalSupply: 10,
    };
    const collectibleContractII = {
      address: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
      description: 'Description II',
      logo: 'url II',
      name: 'Name II',
      symbol: 'II',
      totalSupply: 10,
    };

    const selectedAddress = '0x1';
    collectibleDetection.configure({
      selectedAddress,
      networkType: MAINNET,
    });

    collectiblesController.configure({
      selectedAddress,
      networkType: MAINNET,
    });

    const { chainId } = collectibleDetection.config;
    await collectibleDetection.detectCollectibles();
    // First fetch to API, only gets information from contract ending in HH
    expect(
      collectiblesController.state.allCollectibles[selectedAddress][chainId],
    ).toStrictEqual([collectibleHH2574]);

    expect(
      collectiblesController.state.allCollectibleContracts[selectedAddress][
        chainId
      ],
    ).toStrictEqual([collectibleContractHH]);
    // During next call of assets detection, API succeds returning contract ending in gg information

    nock(OPEN_SEA_HOST)
      .get(
        `${OPEN_SEA_PATH}/asset_contract/0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc`,
      )
      .reply(200, {
        description: 'Description GG',
        symbol: 'GG',
        total_supply: 10,
        collection: {
          image_url: 'url GG',
          name: 'Name GG',
        },
      })
      .get(
        `${OPEN_SEA_PATH}/asset_contract/0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d`,
      )
      .reply(200, {
        description: 'Description II',
        symbol: 'II',
        total_supply: 10,
        collection: {
          image_url: 'url II',
          name: 'Name II',
        },
      })
      .get(`${OPEN_SEA_PATH}/assets?owner=0x1&offset=0&limit=50`)
      .reply(200, {
        assets: [
          {
            asset_contract: {
              address: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
              schema_name: 'ERC721',
            },
            collection: {
              name: 'Collection 2577',
              image_url: 'url',
            },
            description: 'Description 2577',
            image_url: 'image/2577.png',
            name: 'ID 2577',
            token_id: '2577',
          },
          {
            asset_contract: {
              address: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
              schema_name: 'ERC721',
            },
            collection: {
              name: 'Collection 2574',
              image_url: 'url',
            },
            description: 'Description 2574',
            image_url: 'image/2574.png',
            name: 'ID 2574',
            token_id: '2574',
          },
          {
            asset_contract: {
              address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
              schema_name: 'ERC721',
            },
            collection: {
              name: 'Collection 2574',
              image_url: 'url',
            },
            description: 'Description 2574',
            image_url: 'image/2574.png',
            name: 'ID 2574',
            token_id: '2574',
          },
        ],
      })
      .get(`${OPEN_SEA_PATH}/assets?owner=0x1&offset=50&limit=50`)
      .reply(200, {
        assets: [],
      });

    // Now user should have respective collectibles
    await collectibleDetection.detectCollectibles();
    expect(
      collectiblesController.state.allCollectibleContracts[selectedAddress][
        chainId
      ],
    ).toStrictEqual([
      collectibleContractHH,
      collectibleContractII,
      collectibleContractGG,
    ]);

    expect(
      collectiblesController.state.allCollectibles[selectedAddress][chainId],
    ).toStrictEqual([collectibleHH2574, collectibleII2577, collectibleGG2574]);
  });
});
