import sinon from 'sinon';
import nock from 'nock';
import { NetworkController } from '@metamask/network-controller';
import { PreferencesController } from '@metamask/user-controllers';
import { OPENSEA_PROXY_URL } from '@metamask/controller-utils';
import { CollectiblesController } from './CollectiblesController';
import { AssetsContractController } from './AssetsContractController';
import { CollectibleDetectionController } from './CollectibleDetectionController';

const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';
const ROPSTEN = 'ropsten';

describe('CollectibleDetectionController', () => {
  let collectibleDetection: CollectibleDetectionController;
  let preferences: PreferencesController;
  let network: NetworkController;
  let collectiblesController: CollectiblesController;
  let assetsContract: AssetsContractController;

  const getOpenSeaApiKeyStub = jest.fn();
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(async () => {
    preferences = new PreferencesController();
    network = new NetworkController();
    assetsContract = new AssetsContractController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
    });

    collectiblesController = new CollectiblesController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
      getERC721AssetName:
        assetsContract.getERC721AssetName.bind(assetsContract),
      getERC721AssetSymbol:
        assetsContract.getERC721AssetSymbol.bind(assetsContract),
      getERC721TokenURI: assetsContract.getERC721TokenURI.bind(assetsContract),
      getERC721OwnerOf: assetsContract.getERC721OwnerOf.bind(assetsContract),
      getERC1155BalanceOf:
        assetsContract.getERC1155BalanceOf.bind(assetsContract),
      getERC1155TokenURI:
        assetsContract.getERC1155TokenURI.bind(assetsContract),
      onCollectibleAdded: jest.fn(),
    });

    collectibleDetection = new CollectibleDetectionController({
      onCollectiblesStateChange: (listener) =>
        collectiblesController.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
      getOpenSeaApiKey: getOpenSeaApiKeyStub,
      addCollectible: collectiblesController.addCollectible.bind(
        collectiblesController,
      ),
      getCollectiblesState: () => collectiblesController.state,
    });

    collectiblesController.configure({ chainId: '1', selectedAddress: '0x1' });
    preferences.setOpenSeaEnabled(true);
    preferences.setUseCollectibleDetection(true);

    nock(OPENSEA_PROXY_URL)
      .get(`/assets?owner=0x2&offset=0&limit=50`)
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
      .get(`/assets?owner=0x2&offset=50&limit=50`)
      .reply(200, {
        assets: [],
      })
      .persist();

    nock(OPENSEA_PROXY_URL)
      .get(`/asset_contract/0x1d963688FE2209A98dB35C67A041524822Cf04ff`)
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
      .get(`/asset_contract/0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD`)
      .reply(200, {
        description: 'Description HH',
        symbol: 'HH',
        total_supply: 10,
        collection: {
          image_url: 'url HH',
          name: 'Name HH',
        },
      })
      .get(`/asset_contract/0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc`)
      .replyWithError(new Error('Failed to fetch'))
      .get(`/asset_contract/0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d`)
      .replyWithError(new Error('Failed to fetch'))
      .get(`/assets?owner=0x1&offset=0&limit=50`)
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
      .get(`/assets?owner=0x1&offset=50&limit=50`)
      .reply(200, {
        assets: [],
      })
      .get(`/assets?owner=0x9&offset=0&limit=50`)
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
      .get(`/assets?owner=0x9&offset=50&limit=50`)
      .reply(200, {
        assets: [],
      });
  });

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
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
      const mockCollectibles = sinon.stub(
        CollectibleDetectionController.prototype,
        'detectCollectibles',
      );
      const collectiblesDetectionController =
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
          { interval: 10 },
        );
      collectiblesDetectionController.configure({ disabled: false });
      collectiblesDetectionController.start();
      expect(mockCollectibles.calledOnce).toBe(true);
      setTimeout(() => {
        expect(mockCollectibles.calledTwice).toBe(true);
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
      const mockCollectibles = sinon.stub(
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

    nock(OPENSEA_PROXY_URL)
      .get(`/asset_contract/0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc`)
      .reply(200, {
        description: 'Description GG',
        symbol: 'GG',
        total_supply: 10,
        collection: {
          image_url: 'url GG',
          name: 'Name GG',
        },
      })
      .get(`/asset_contract/0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d`)
      .reply(200, {
        description: 'Description II',
        symbol: 'II',
        total_supply: 10,
        collection: {
          image_url: 'url II',
          name: 'Name II',
        },
      })
      .get(`/assets?owner=0x1&offset=0&limit=50`)
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
      .get(`/assets?owner=0x1&offset=50&limit=50`)
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

  it('should fallback to use OpenSea API directly when the OpenSea proxy server is down or responds with a failure', async () => {
    const selectedAddress = '0x3';

    getOpenSeaApiKeyStub.mockImplementation(() => 'FAKE API KEY');
    collectiblesController.setApiKey('FAKE API KEY');

    nock('https://proxy.metaswap.codefi.network:443', {
      encodedQueryParams: true,
    })
      .get('/opensea/v1/api/v1/assets')
      .query({ owner: selectedAddress, offset: '0', limit: '50' })
      .replyWithError(new Error('Failed to fetch'));

    nock('https://proxy.metaswap.codefi.network:443', {
      encodedQueryParams: true,
    })
      .get('/opensea/v1/api/v1/assets')
      .query({ owner: selectedAddress, offset: '50', limit: '50' })
      .replyWithError(new Error('Failed to fetch'));

    nock('https://api.opensea.io:443', { encodedQueryParams: true })
      .get('/api/v1/assets')
      .query({ owner: selectedAddress, offset: '0', limit: '50' })
      .reply(200, {
        assets: [
          {
            asset_contract: {
              address: '0x1d963688fe2209a98db35c67a041524822cf04ff',
              schema_name: 'ERC721',
            },
            collection: {
              name: 'DIRECT FROM OPENSEA',
              image_url: 'URL',
            },
            description: 'DESCRIPTION: DIRECT FROM OPENSEA',
            image_original_url: 'DIRECT FROM OPENSEA.jpg',
            name: 'NAME: DIRECT FROM OPENSEA',
            token_id: '2577',
          },
        ],
      });

    nock('https://api.opensea.io:443', { encodedQueryParams: true })
      .get('/api/v1/assets')
      .query({ owner: selectedAddress, offset: '50', limit: '50' })
      .reply(200, {
        assets: [],
      });

    nock('https://api.opensea.io:443')
      .get(`/api/v1/asset_contract/0x1d963688FE2209A98dB35C67A041524822Cf04ff`)
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
      });

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
        address: '0x1d963688FE2209A98dB35C67A041524822Cf04ff',
        description: 'DESCRIPTION: DIRECT FROM OPENSEA',
        imageOriginal: 'DIRECT FROM OPENSEA.jpg',
        name: 'NAME: DIRECT FROM OPENSEA',
        standard: 'ERC721',
        tokenId: '2577',
        favorite: false,
        isCurrentlyOwned: true,
      },
    ]);
  });

  it('should rethrow error when OpenSea proxy server fails with error other than fetch failure', async () => {
    const selectedAddress = '0x4';
    nock('https://proxy.metaswap.codefi.network:443', {
      encodedQueryParams: true,
    })
      .get('/opensea/v1/api/v1/assets')
      .query({ owner: selectedAddress, offset: '0', limit: '50' })
      .replyWithError(new Error('UNEXPECTED ERROR'));

    collectibleDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });

    collectiblesController.configure({
      networkType: MAINNET,
      selectedAddress,
    });

    await expect(() =>
      collectibleDetection.detectCollectibles(),
    ).rejects.toThrow('UNEXPECTED ERROR');
  });
});
