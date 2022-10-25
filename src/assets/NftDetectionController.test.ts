import sinon from 'sinon';
import nock from 'nock';
import {
  NetworkController,
  NetworkControllerMessenger,
} from '../network/NetworkController';
import { PreferencesController } from '../user/PreferencesController';
import { OPENSEA_PROXY_URL } from '../constants';
import { ControllerMessenger } from '../ControllerMessenger';
import { NftController } from './NftController';
import { AssetsContractController } from './AssetsContractController';
import { NftDetectionController } from './NftDetectionController';

const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';
const ROPSTEN = 'ropsten';

describe('NftDetectionController', () => {
  let nftDetection: NftDetectionController;
  let preferences: PreferencesController;
  let nftController: NftController;
  let assetsContract: AssetsContractController;
  let messenger: NetworkControllerMessenger;

  const getOpenSeaApiKeyStub = jest.fn();
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(async () => {
    messenger = new ControllerMessenger().getRestricted({
      name: 'NetworkController',
      allowedEvents: ['NetworkController:stateChange'],
      allowedActions: [],
    });

    new NetworkController({
      messenger,
      infuraProjectId: 'potato',
    });
    preferences = new PreferencesController();
    assetsContract = new AssetsContractController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) =>
        messenger.subscribe('NetworkController:stateChange', listener),
    });

    nftController = new NftController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) =>
        messenger.subscribe('NetworkController:stateChange', listener),
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
      onNftAdded: jest.fn(),
    });

    nftDetection = new NftDetectionController({
      onNftsStateChange: (listener) => nftController.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) =>
        messenger.subscribe('NetworkController:stateChange', listener),
      getOpenSeaApiKey: getOpenSeaApiKeyStub,
      addNft: nftController.addNft.bind(nftController),
      getNftState: () => nftController.state,
    });

    nftController.configure({ chainId: '1', selectedAddress: '0x1' });
    preferences.setOpenSeaEnabled(true);
    preferences.setUseNftDetection(true);

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
    preferences.setUseNftDetection(false);
    expect(nftDetection.config).toStrictEqual({
      interval: DEFAULT_INTERVAL,
      networkType: 'mainnet',
      chainId: '1',
      selectedAddress: '',
      disabled: true,
    });
  });

  it('should poll and detect NFTs on interval while on mainnet', async () => {
    await new Promise((resolve) => {
      const mockNfts = sinon.stub(
        NftDetectionController.prototype,
        'detectNfts',
      );
      const nftsDetectionController = new NftDetectionController(
        {
          onNftsStateChange: (listener) => nftController.subscribe(listener),
          onPreferencesStateChange: (listener) =>
            preferences.subscribe(listener),
          onNetworkStateChange: (listener) =>
            messenger.subscribe('NetworkController:stateChange', listener),
          getOpenSeaApiKey: () => nftController.openSeaApiKey,
          addNft: nftController.addNft.bind(nftController),
          getNftState: () => nftController.state,
        },
        { interval: 10 },
      );
      nftsDetectionController.configure({ disabled: false });
      nftsDetectionController.start();
      expect(mockNfts.calledOnce).toBe(true);
      setTimeout(() => {
        expect(mockNfts.calledTwice).toBe(true);
        resolve('');
      }, 15);
    });
  });

  it('should detect mainnet correctly', () => {
    nftDetection.configure({ networkType: MAINNET });
    expect(nftDetection.isMainnet()).toStrictEqual(true);
    nftDetection.configure({ networkType: ROPSTEN });
    expect(nftDetection.isMainnet()).toStrictEqual(false);
  });

  it('should not autodetect while not on mainnet', async () => {
    await new Promise((resolve) => {
      const mockNfts = sinon.stub(
        NftDetectionController.prototype,
        'detectNfts',
      );
      new NftDetectionController(
        {
          onNftsStateChange: (listener) => nftController.subscribe(listener),
          onPreferencesStateChange: (listener) =>
            preferences.subscribe(listener),
          onNetworkStateChange: (listener) =>
            messenger.subscribe('NetworkController:stateChange', listener),
          getOpenSeaApiKey: () => nftController.openSeaApiKey,
          addNft: nftController.addNft.bind(nftController),
          getNftState: () => nftController.state,
        },
        { interval: 10, networkType: ROPSTEN },
      );
      expect(mockNfts.called).toBe(false);
      resolve('');
    });
  });

  it('should detect and add NFTs correctly', async () => {
    const selectedAddress = '0x1';

    nftDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });

    nftController.configure({
      networkType: MAINNET,
      selectedAddress,
    });
    const { chainId } = nftDetection.config;

    await nftDetection.detectNfts();

    const nfts = nftController.state.allNfts[selectedAddress][chainId];
    expect(nfts).toStrictEqual([
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

  it('should detect, add NFTs and do nor remove not detected NFTs correctly', async () => {
    const selectedAddress = '0x1';
    nftDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });
    nftController.configure({ selectedAddress });

    const { chainId } = nftDetection.config;

    await nftController.addNft(
      '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
      '2573',
      {
        description: 'Description 2573',
        image: 'image/2573.png',
        name: 'ID 2573',
        standard: 'ERC721',
      },
    );

    await nftDetection.detectNfts();

    const nfts = nftController.state.allNfts[selectedAddress][chainId];

    expect(nfts).toStrictEqual([
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

  it('should not autodetect NFTs that exist in the ignoreList', async () => {
    const selectedAddress = '0x2';
    nftDetection.configure({
      networkType: MAINNET,
      selectedAddress: '0x2',
    });
    nftController.configure({ selectedAddress });

    const { chainId } = nftDetection.config;

    await nftDetection.detectNfts();
    expect(nftController.state.allNfts[selectedAddress][chainId]).toHaveLength(
      1,
    );
    expect(nftController.state.ignoredNfts).toHaveLength(0);
    nftController.removeAndIgnoreNft(
      '0x1d963688FE2209A98dB35C67A041524822Cf04ff',
      '2577',
    );

    expect(nftController.state.ignoredNfts).toHaveLength(1);
    await nftDetection.detectNfts();
    expect(nftController.state.allNfts[selectedAddress][chainId]).toHaveLength(
      0,
    );
  });

  it('should not detect and add NFTs if there is no selectedAddress', async () => {
    const selectedAddress = '';
    nftDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });
    const { chainId } = nftDetection.config;
    await nftDetection.detectNfts();
    const { allNfts } = nftController.state;
    expect(allNfts[selectedAddress]?.[chainId]).toBeUndefined();
  });

  it('should not detect and add NFTs to the wrong selectedAddress', async () => {
    nftDetection.configure({
      networkType: MAINNET,
      selectedAddress: '0x9',
    });
    const { chainId } = nftDetection.config;

    nftController.configure({ selectedAddress: '0x9' });
    nftDetection.detectNfts();
    nftDetection.configure({ selectedAddress: '0x12' });
    nftController.configure({ selectedAddress: '0x12' });
    await new Promise((res) => setTimeout(() => res(true), 1000));
    expect(nftDetection.config.selectedAddress).toStrictEqual('0x12');

    expect(
      nftController.state.allNfts[nftDetection.config.selectedAddress]?.[
        chainId
      ],
    ).toBeUndefined();
  });

  it('should not detect and add NFTs if preferences controller useNftDetection is set to false', async () => {
    preferences.setUseNftDetection(false);
    const selectedAddress = '0x9';
    nftDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });
    const { chainId } = nftController.config;
    nftDetection.detectNfts();
    expect(
      nftController.state.allNfts[selectedAddress]?.[chainId],
    ).toBeUndefined();
  });

  it('should not detect and add NFTs if preferences controller openSeaEnabled is set to false', async () => {
    preferences.setOpenSeaEnabled(false);
    const selectedAddress = '0x9';
    nftDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });
    const { chainId } = nftController.config;
    nftDetection.detectNfts();
    expect(
      nftController.state.allNfts[selectedAddress]?.[chainId],
    ).toBeUndefined();
  });

  it('should not add NFT if NFT or NFT contract has no information to display', async () => {
    const nftHH2574 = {
      address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
      description: 'Description 2574',
      image: 'image/2574.png',
      name: 'ID 2574',
      tokenId: '2574',
      standard: 'ERC721',
      favorite: false,
      isCurrentlyOwned: true,
    };
    const nftGG2574 = {
      address: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
      description: 'Description 2574',
      image: 'image/2574.png',
      name: 'ID 2574',
      tokenId: '2574',
      standard: 'ERC721',
      favorite: false,
      isCurrentlyOwned: true,
    };
    const nftII2577 = {
      address: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
      description: 'Description 2577',
      image: 'image/2577.png',
      name: 'ID 2577',
      tokenId: '2577',
      standard: 'ERC721',
      favorite: false,
      isCurrentlyOwned: true,
    };
    const nftContractHH = {
      address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
      description: 'Description HH',
      logo: 'url HH',
      name: 'Name HH',
      symbol: 'HH',
      totalSupply: 10,
    };
    const nftContractGG = {
      address: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
      description: 'Description GG',
      logo: 'url GG',
      name: 'Name GG',
      symbol: 'GG',
      totalSupply: 10,
    };
    const nftContractII = {
      address: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
      description: 'Description II',
      logo: 'url II',
      name: 'Name II',
      symbol: 'II',
      totalSupply: 10,
    };

    const selectedAddress = '0x1';
    nftDetection.configure({
      selectedAddress,
      networkType: MAINNET,
    });

    nftController.configure({
      selectedAddress,
      networkType: MAINNET,
    });

    const { chainId } = nftDetection.config;
    await nftDetection.detectNfts();
    // First fetch to API, only gets information from contract ending in HH
    expect(nftController.state.allNfts[selectedAddress][chainId]).toStrictEqual(
      [nftHH2574],
    );

    expect(
      nftController.state.allNftContracts[selectedAddress][chainId],
    ).toStrictEqual([nftContractHH]);
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

    // Now user should have respective NFTs
    await nftDetection.detectNfts();
    expect(
      nftController.state.allNftContracts[selectedAddress][chainId],
    ).toStrictEqual([nftContractHH, nftContractII, nftContractGG]);

    expect(nftController.state.allNfts[selectedAddress][chainId]).toStrictEqual(
      [nftHH2574, nftII2577, nftGG2574],
    );
  });

  it('should fallback to use OpenSea API directly when the OpenSea proxy server is down or responds with a failure', async () => {
    const selectedAddress = '0x3';

    getOpenSeaApiKeyStub.mockImplementation(() => 'FAKE API KEY');
    nftController.setApiKey('FAKE API KEY');

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

    nftDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });

    nftController.configure({
      networkType: MAINNET,
      selectedAddress,
    });

    const { chainId } = nftDetection.config;

    await nftDetection.detectNfts();

    const nfts = nftController.state.allNfts[selectedAddress][chainId];
    expect(nfts).toStrictEqual([
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

    nftDetection.configure({
      networkType: MAINNET,
      selectedAddress,
    });

    nftController.configure({
      networkType: MAINNET,
      selectedAddress,
    });

    await expect(() => nftDetection.detectNfts()).rejects.toThrow(
      'UNEXPECTED ERROR',
    );
  });
});
