import type { AddApprovalRequest } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import { OPENSEA_PROXY_URL, ChainId, toHex } from '@metamask/controller-utils';
import { PreferencesController } from '@metamask/preferences-controller';
import nock from 'nock';
import * as sinon from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import { AssetsContractController } from './AssetsContractController';
import type { NftControllerMessenger } from './NftController';
import { NftController } from './NftController';
import { NftDetectionController } from './NftDetectionController';

const DEFAULT_INTERVAL = 180000;

type ApprovalActions = AddApprovalRequest;

const controllerName = 'NftController' as const;

describe('NftDetectionController', () => {
  let nftDetection: NftDetectionController;
  let preferences: PreferencesController;
  let nftController: NftController;
  let assetsContract: AssetsContractController;
  let clock: sinon.SinonFakeTimers;
  const networkStateChangeNoop = jest.fn();
  const networkDidChangeNoop = jest.fn();
  const getOpenSeaApiKeyStub = jest.fn();

  const messenger = new ControllerMessenger<
    ApprovalActions,
    never
  >().getRestricted<typeof controllerName, ApprovalActions['type'], never>({
    name: controllerName,
    allowedActions: ['ApprovalController:addRequest'],
  }) as NftControllerMessenger;

  beforeEach(async () => {
    clock = sinon.useFakeTimers();
    preferences = new PreferencesController();
    assetsContract = new AssetsContractController({
      chainId: ChainId.mainnet,
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkDidChange: networkDidChangeNoop,
      getNetworkClientById: jest.fn(),
    });
    const getNetworkClientById = jest.fn().mockImplementation(() => {
      return {
        configuration: {
          chainId: ChainId.mainnet,
        },
        provider: jest.fn(),
        blockTracker: jest.fn(),
        destroy: jest.fn(),
      };
    });

    nftController = new NftController({
      chainId: ChainId.mainnet,
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: networkStateChangeNoop,
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
      getNetworkClientById,
      messenger,
    });

    nftDetection = new NftDetectionController({
      chainId: ChainId.mainnet,
      onNftsStateChange: (listener) => nftController.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: networkStateChangeNoop,
      getOpenSeaApiKey: getOpenSeaApiKeyStub,
      addNft: nftController.addNft.bind(nftController),
      getNetworkClientById,
      getNftState: () => nftController.state,
    });

    nftController.configure({ selectedAddress: '0x1' });
    preferences.setOpenSeaEnabled(true);
    preferences.setUseNftDetection(true);

    nock(OPENSEA_PROXY_URL)
      .persist()
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

    nock(OPENSEA_PROXY_URL)
      .persist()
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
      .replyWithError(new Error('Failed to fetch'));
  });

  afterEach(() => {
    nftDetection.stopAllPolling();
    clock.restore();
    sinon.restore();
  });

  it('should set default config', () => {
    preferences.setUseNftDetection(false);
    expect(nftDetection.config).toStrictEqual({
      interval: DEFAULT_INTERVAL,
      chainId: toHex(1),
      selectedAddress: '',
      disabled: true,
    });
  });

  it('should poll and detect NFTs on interval while on mainnet', async () => {
    const mockNfts = sinon.stub(NftDetectionController.prototype, 'detectNfts');
    const nftsDetectionController = new NftDetectionController(
      {
        getNetworkClientById: jest.fn(),
        chainId: ChainId.mainnet,
        onNftsStateChange: (listener) => nftController.subscribe(listener),
        onPreferencesStateChange: (listener) => preferences.subscribe(listener),
        onNetworkStateChange: networkStateChangeNoop,
        getOpenSeaApiKey: () => nftController.openSeaApiKey,
        addNft: nftController.addNft.bind(nftController),
        getNftState: () => nftController.state,
      },
      { interval: 10 },
    );
    nftsDetectionController.configure({ disabled: false });
    await nftsDetectionController.start();
    await advanceTime({
      clock,
      duration: 0,
    });
    expect(mockNfts.calledOnce).toBe(true);
    await advanceTime({
      clock,
      duration: 10,
    });
    expect(mockNfts.calledTwice).toBe(true);
  });

  it('should poll and detect NFTs by networkClientId on interval while on mainnet', async () => {
    const getNetworkClientById = jest.fn().mockImplementation(() => {
      return {
        configuration: {
          chainId: ChainId.mainnet,
        },
        provider: {},
        blockTracker: {},
        destroy: jest.fn(),
      };
    });
    const testNftDetection = new NftDetectionController({
      chainId: ChainId.mainnet,
      onNftsStateChange: (listener) => nftController.subscribe(listener),
      onPreferencesStateChange: () => {
        // don't do anything
      },
      onNetworkStateChange: networkStateChangeNoop,
      getOpenSeaApiKey: getOpenSeaApiKeyStub,
      addNft: nftController.addNft.bind(nftController),
      getNetworkClientById,
      getNftState: () => nftController.state,
    });
    preferences.setUseNftDetection(true);
    const spy = jest
      .spyOn(testNftDetection, 'detectNfts')
      .mockImplementation(() => {
        return Promise.resolve();
      });

    testNftDetection.startPollingByNetworkClientId('mainnet', {
      address: '0x1',
    });

    await advanceTime({ clock, duration: 0 });
    expect(spy.mock.calls).toHaveLength(1);
    await advanceTime({
      clock,
      duration: DEFAULT_INTERVAL / 2,
    });
    expect(spy.mock.calls).toHaveLength(1);
    await advanceTime({
      clock,
      duration: DEFAULT_INTERVAL / 2,
    });
    expect(spy.mock.calls).toHaveLength(2);
    await advanceTime({ clock, duration: DEFAULT_INTERVAL });
    expect(spy.mock.calls).toMatchObject([
      [
        {
          networkClientId: 'mainnet',
          userAddress: '0x1',
        },
      ],
      [
        {
          networkClientId: 'mainnet',
          userAddress: '0x1',
        },
      ],
      [
        {
          networkClientId: 'mainnet',
          userAddress: '0x1',
        },
      ],
    ]);
    nftDetection.stopAllPolling();
  });

  it('should detect mainnet correctly', () => {
    nftDetection.configure({ chainId: ChainId.mainnet });
    expect(nftDetection.isMainnet()).toBe(true);
    nftDetection.configure({ chainId: ChainId.goerli });
    expect(nftDetection.isMainnet()).toBe(false);
  });

  it('should not autodetect while not on mainnet', async () => {
    await new Promise((resolve) => {
      const mockNfts = sinon.stub(
        NftDetectionController.prototype,
        'detectNfts',
      );
      new NftDetectionController(
        {
          getNetworkClientById: jest.fn(),
          chainId: ChainId.goerli,
          onNftsStateChange: (listener) => nftController.subscribe(listener),
          onPreferencesStateChange: (listener) =>
            preferences.subscribe(listener),
          onNetworkStateChange: networkStateChangeNoop,
          getOpenSeaApiKey: () => nftController.openSeaApiKey,
          addNft: nftController.addNft.bind(nftController),
          getNftState: () => nftController.state,
        },
        { interval: 10, chainId: ChainId.goerli },
      );
      expect(mockNfts.called).toBe(false);
      resolve('');
    });
  });

  it('should detect and add NFTs correctly', async () => {
    const selectedAddress = '0x1';

    nftDetection.configure({
      chainId: ChainId.mainnet,
      selectedAddress,
    });

    nftController.configure({
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

  it('should detect and add NFTs by networkClientId correctly', async () => {
    const selectedAddress = '0x1';

    await nftDetection.detectNfts({
      networkClientId: 'mainnet',
      userAddress: '0x1',
    });

    const nfts = nftController.state.allNfts[ChainId.mainnet][selectedAddress];
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
    nftDetection.stopAllPolling();
  });

  it('should not add nfts for which no contract information can be fetched', async () => {
    const selectedAddress = '0x1';

    nftDetection.configure({
      chainId: ChainId.mainnet,
      selectedAddress,
    });

    nftController.configure({
      selectedAddress,
    });

    sinon
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .stub(nftController, 'getNftContractInformationFromApi' as any)
      .returns(undefined);

    sinon
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .stub(nftController, 'getNftInformationFromApi' as any)
      .returns(undefined);

    await nftDetection.detectNfts();

    expect(nftController.state.allNfts).toStrictEqual({});
  });

  it('should detect, add NFTs and do nor remove not detected NFTs correctly', async () => {
    const selectedAddress = '0x1';
    nftDetection.configure({
      chainId: ChainId.mainnet,
      selectedAddress,
    });
    nftController.configure({ selectedAddress });

    const { chainId } = nftDetection.config;

    await nftController.addNft(
      '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
      '2573',
      {
        nftMetadata: {
          description: 'Description 2573',
          image: 'image/2573.png',
          name: 'ID 2573',
          standard: 'ERC721',
        },
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
    const selectedAddress = '0x1';
    nftDetection.configure({
      chainId: ChainId.mainnet,
      selectedAddress: '0x1',
    });
    nftController.configure({ selectedAddress });

    const { chainId } = nftDetection.config;

    await nftDetection.detectNfts();
    expect(nftController.state.allNfts[selectedAddress][chainId]).toHaveLength(
      1,
    );
    expect(nftController.state.ignoredNfts).toHaveLength(0);
    nftController.removeAndIgnoreNft(
      '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
      '2574',
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
      chainId: ChainId.mainnet,
      selectedAddress,
    });
    const { chainId } = nftDetection.config;
    await nftDetection.detectNfts();
    const { allNfts } = nftController.state;
    expect(allNfts[selectedAddress]?.[chainId]).toBeUndefined();
  });

  it('should not detect and add NFTs to the wrong selectedAddress', async () => {
    nftDetection.configure({
      chainId: ChainId.mainnet,
      selectedAddress: '0x9',
    });
    const { chainId } = nftDetection.config;

    nftController.configure({ selectedAddress: '0x9' });
    nftDetection.detectNfts();
    nftDetection.configure({ selectedAddress: '0x12' });
    nftController.configure({ selectedAddress: '0x12' });
    await advanceTime({ clock, duration: 1000 });
    expect(nftDetection.config.selectedAddress).toBe('0x12');

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
      chainId: ChainId.mainnet,
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
      chainId: ChainId.mainnet,
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
      chainId: ChainId.mainnet,
    });

    nftController.configure({
      selectedAddress,
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
    // During next call of assets detection, API succeeds returning contract ending in gg information
    nock.cleanAll();
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

  it('should not fallback to use OpenSea API directly when the OpenSea proxy server is down or responds with a failure', async () => {
    const selectedAddress = '0x3';

    getOpenSeaApiKeyStub.mockImplementation(() => 'FAKE API KEY');
    nftController.setApiKey('FAKE API KEY');

    nock('https://proxy.metafi.codefi.network:443', {
      encodedQueryParams: true,
    })
      .get('/opensea/v1/api/v1/assets')
      .query({ owner: selectedAddress, offset: '0', limit: '50' })
      .replyWithError(new Error('Failed to fetch'));

    nock('https://proxy.metafi.codefi.network:443', {
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
      chainId: ChainId.mainnet,
      selectedAddress,
    });

    nftController.configure({
      selectedAddress,
    });

    await nftDetection.detectNfts();

    expect(nftController.state.allNfts[selectedAddress]).toBeUndefined();
  });

  it('should rethrow error when OpenSea proxy server fails with error other than fetch failure', async () => {
    const selectedAddress = '0x4';
    nock('https://proxy.metafi.codefi.network:443', {
      encodedQueryParams: true,
    })
      .get('/opensea/v1/api/v1/assets')
      .query({ owner: selectedAddress, offset: '0', limit: '50' })
      .replyWithError(new Error('UNEXPECTED ERROR'));

    nftDetection.configure({
      chainId: ChainId.mainnet,
      selectedAddress,
    });

    nftController.configure({
      selectedAddress,
    });

    await expect(() => nftDetection.detectNfts()).rejects.toThrow(
      'UNEXPECTED ERROR',
    );
  });
});
