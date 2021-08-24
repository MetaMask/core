import { createSandbox, SinonStub, stub } from 'sinon';
import nock from 'nock';
import { BN } from 'ethereumjs-util';
import {
  NetworkController,
  NetworksChainId,
} from '../network/NetworkController';
import { PreferencesController } from '../user/PreferencesController';
import { ControllerMessenger } from '../ControllerMessenger';
import { TokensController } from './TokensController';
import { CollectiblesController } from './CollectiblesController';
import { AssetsContractController } from './AssetsContractController';
import { AssetsDetectionController } from './AssetsDetectionController';
import {
  TokenListController,
  GetTokenListState,
  TokenListStateChange,
} from './TokenListController';

const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';
const ROPSTEN = 'ropsten';
const TOKENS = [{ address: '0xfoO', symbol: 'bar', decimals: 2 }];
const OPEN_SEA_HOST = 'https://api.opensea.io';
const OPEN_SEA_PATH = '/api/v1';
const TOKEN_END_POINT_API = 'https://token-api.metaswap.codefi.network';
const sampleTokenList = [
  {
    address: '0x514910771af9ca656af840dff83e8264ecf986ca',
    symbol: 'LINK',
    decimals: 18,
    occurrences: 11,
    aggregators: [
      'paraswap',
      'pmm',
      'airswapLight',
      'zeroEx',
      'bancor',
      'coinGecko',
      'zapper',
      'kleros',
      'zerion',
      'cmc',
      'oneInch',
    ],
    name: 'Chainlink',
  },
  {
    address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
    symbol: 'BNT',
    decimals: 18,
    occurrences: 11,
    aggregators: [
      'paraswap',
      'pmm',
      'airswapLight',
      'zeroEx',
      'bancor',
      'coinGecko',
      'zapper',
      'kleros',
      'zerion',
      'cmc',
      'oneInch',
    ],
    name: 'Bancor',
  },
  {
    address: '0x6810e776880c02933d47db1b9fc05908e5386b96',
    symbol: 'GNO',
    name: 'Gnosis',
    decimals: 18,
    occurrences: 10,
    aggregators: [
      'paraswap',
      'airswapLight',
      'zeroEx',
      'bancor',
      'coinGecko',
      'zapper',
      'kleros',
      'zerion',
      'cmc',
      'oneInch',
    ],
  },
];
function getTokenListMessenger() {
  const controllerMessenger = new ControllerMessenger<
    GetTokenListState,
    TokenListStateChange
  >();
  const messenger = controllerMessenger.getRestricted<
    'TokenListController',
    never,
    never
  >({
    name: 'TokenListController',
  });
  return messenger;
}

describe('AssetsDetectionController', () => {
  let assetsDetection: AssetsDetectionController;
  let preferences: PreferencesController;
  let network: NetworkController;
  let tokensController: TokensController;
  let collectiblesController: CollectiblesController;
  let tokenList: TokenListController;
  let assetsContract: AssetsContractController;
  let getBalancesInSingleCall: SinonStub<
    Parameters<AssetsContractController['getBalancesInSingleCall']>,
    ReturnType<AssetsContractController['getBalancesInSingleCall']>
  >;
  const sandbox = createSandbox();

  beforeEach(async () => {
    preferences = new PreferencesController();
    network = new NetworkController();
    assetsContract = new AssetsContractController();
    tokensController = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
    });
    collectiblesController = new CollectiblesController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
      getAssetName: assetsContract.getAssetName.bind(assetsContract),
      getAssetSymbol: assetsContract.getAssetSymbol.bind(assetsContract),
      getCollectibleTokenURI: assetsContract.getCollectibleTokenURI.bind(
        assetsContract,
      ),
    });
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleTokenList)
      .persist();
    const messenger = getTokenListMessenger();
    tokenList = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      messenger,
    });
    await tokenList.start();
    getBalancesInSingleCall = sandbox.stub();
    assetsDetection = new AssetsDetectionController({
      onTokensStateChange: (listener) => tokensController.subscribe(listener),
      onCollectiblesStateChange: (listener) =>
        collectiblesController.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
      getOpenSeaApiKey: () => collectiblesController.openSeaApiKey,
      getBalancesInSingleCall: (getBalancesInSingleCall as unknown) as AssetsContractController['getBalancesInSingleCall'],
      addTokens: tokensController.addTokens.bind(tokensController),
      addCollectible: collectiblesController.addCollectible.bind(
        collectiblesController,
      ),
      getTokensState: () => tokensController.state,
      getTokenListState: () => tokenList.state,
      getCollectiblesState: () => collectiblesController.state,
    });

    nock(OPEN_SEA_HOST)
      .get(`${OPEN_SEA_PATH}/assets?owner=0x2&offset=0&limit=50`)
      .reply(200, {
        assets: [
          {
            asset_contract: {
              address: '0x1d963688fe2209a98db35c67a041524822cf04ff',
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
      })
      .get(
        `${OPEN_SEA_PATH}/asset_contract/0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD`,
      )
      .reply(200, {
        description: 'Description HH',
        image_url: 'url HH',
        name: 'Name HH',
        symbol: 'HH',
        total_supply: 10,
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
            },
            description: 'Description 2577',
            image_url: 'image/2577.png',
            name: 'ID 2577',
            token_id: '2577',
          },
          {
            asset_contract: {
              address: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
            },
            description: 'Description 2578',
            image_url: 'image/2578.png',
            name: 'ID 2578',
            token_id: '2578',
          },
          {
            asset_contract: {
              address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
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
    stub(tokensController, '_detectIsERC721').callsFake(() =>
      Promise.resolve(false),
    );
  });

  afterEach(() => {
    nock.cleanAll();
    sandbox.reset();
    tokenList.destroy();
  });

  it('should set default config', () => {
    expect(assetsDetection.config).toStrictEqual({
      interval: DEFAULT_INTERVAL,
      networkType: 'mainnet',
      selectedAddress: '',
      tokens: [],
    });
  });

  it('should poll and detect assets on interval while on mainnet', async () => {
    await new Promise((resolve) => {
      const mockTokens = stub(
        AssetsDetectionController.prototype,
        'detectTokens',
      );
      const mockCollectibles = stub(
        AssetsDetectionController.prototype,
        'detectCollectibles',
      );
      new AssetsDetectionController(
        {
          onTokensStateChange: (listener) =>
            tokensController.subscribe(listener),
          onCollectiblesStateChange: (listener) =>
            collectiblesController.subscribe(listener),
          onPreferencesStateChange: (listener) =>
            preferences.subscribe(listener),
          onNetworkStateChange: (listener) => network.subscribe(listener),
          getOpenSeaApiKey: () => collectiblesController.openSeaApiKey,
          getBalancesInSingleCall: assetsContract.getBalancesInSingleCall.bind(
            assetsContract,
          ),
          addTokens: tokensController.addTokens.bind(tokensController),
          addCollectible: collectiblesController.addCollectible.bind(
            collectiblesController,
          ),
          getTokensState: () => tokensController.state,
          getTokenListState: () => tokenList.state,
          getCollectiblesState: () => collectiblesController.state,
        },
        { interval: 10 },
      );
      expect(mockTokens.calledOnce).toBe(true);
      expect(mockCollectibles.calledOnce).toBe(true);
      setTimeout(() => {
        expect(mockTokens.calledTwice).toBe(true);
        expect(mockCollectibles.calledTwice).toBe(true);
        mockTokens.restore();
        mockCollectibles.restore();
        resolve('');
      }, 15);
    });
  });

  it('should detect mainnet correctly', () => {
    assetsDetection.configure({ networkType: MAINNET });
    expect(assetsDetection.isMainnet()).toStrictEqual(true);
    assetsDetection.configure({ networkType: ROPSTEN });
    expect(assetsDetection.isMainnet()).toStrictEqual(false);
  });

  it('should not autodetect while not on mainnet', async () => {
    await new Promise((resolve) => {
      const mockTokens = stub(
        AssetsDetectionController.prototype,
        'detectTokens',
      );
      const mockCollectibles = stub(
        AssetsDetectionController.prototype,
        'detectCollectibles',
      );
      new AssetsDetectionController(
        {
          onTokensStateChange: (listener) =>
            tokensController.subscribe(listener),
          onCollectiblesStateChange: (listener) =>
            collectiblesController.subscribe(listener),
          onPreferencesStateChange: (listener) =>
            preferences.subscribe(listener),
          onNetworkStateChange: (listener) => network.subscribe(listener),
          getOpenSeaApiKey: () => collectiblesController.openSeaApiKey,
          getBalancesInSingleCall: assetsContract.getBalancesInSingleCall.bind(
            assetsContract,
          ),
          addTokens: tokensController.addTokens.bind(tokensController),
          addCollectible: collectiblesController.addCollectible.bind(
            collectiblesController,
          ),
          getTokensState: () => tokensController.state,
          getTokenListState: () => tokenList.state,
          getCollectiblesState: () => collectiblesController.state,
        },
        { interval: 10, networkType: ROPSTEN },
      );
      expect(mockTokens.called).toBe(false);
      expect(mockCollectibles.called).toBe(false);
      mockTokens.restore();
      mockCollectibles.restore();
      resolve('');
    });
  });

  it('should detect and add collectibles correctly', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x1' });
    await assetsDetection.detectCollectibles();
    expect(collectiblesController.state.collectibles).toStrictEqual([
      {
        address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
        description: 'Description 2574',
        image: 'image/2574.png',
        name: 'ID 2574',
        tokenId: 2574,
      },
    ]);
  });

  it('should detect, add collectibles and do nor remove not detected collectibles correctly', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x1' });
    await collectiblesController.addCollectible(
      '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
      2573,
      {
        description: 'Description 2573',
        image: 'image/2573.png',
        name: 'ID 2573',
      },
    );
    await assetsDetection.detectCollectibles();
    expect(collectiblesController.state.collectibles).toStrictEqual([
      {
        address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
        description: 'Description 2573',
        image: 'image/2573.png',
        name: 'ID 2573',
        tokenId: 2573,
      },
      {
        address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
        description: 'Description 2574',
        image: 'image/2574.png',
        name: 'ID 2574',
        tokenId: 2574,
      },
    ]);
  });

  it('should not autodetect collectibles that exist in the ignoreList', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x2' });
    await assetsDetection.detectCollectibles();
    expect(collectiblesController.state.collectibles).toHaveLength(1);
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(0);
    collectiblesController.removeAndIgnoreCollectible(
      '0x1d963688fe2209a98db35c67a041524822cf04ff',
      2577,
    );
    await assetsDetection.detectCollectibles();
    expect(collectiblesController.state.collectibles).toHaveLength(0);
    expect(collectiblesController.state.ignoredCollectibles).toHaveLength(1);
  });

  it('should not detect and add collectibles if there is no selectedAddress', async () => {
    assetsDetection.configure({ networkType: MAINNET });
    await assetsDetection.detectCollectibles();
    expect(collectiblesController.state.collectibles).toStrictEqual([]);
  });

  it('should not detect and add collectibles to the wrong selectedAddress', async () => {
    assetsDetection.configure({
      networkType: MAINNET,
      selectedAddress: '0x9',
    });
    collectiblesController.configure({ selectedAddress: '0x9' });
    assetsDetection.detectCollectibles();
    assetsDetection.configure({ selectedAddress: '0x12' });
    collectiblesController.configure({ selectedAddress: '0x12' });
    await new Promise((res) => setTimeout(() => res(true), 1000));
    expect(assetsDetection.config.selectedAddress).toStrictEqual('0x12');
    expect(collectiblesController.state.collectibles).toStrictEqual([]);
  });

  it('should not add collectible if collectible or collectible contract has no information to display', async () => {
    const collectibleHH2574 = {
      address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
      description: 'Description 2574',
      image: 'image/2574.png',
      name: 'ID 2574',
      tokenId: 2574,
    };
    const collectibleGG2574 = {
      address: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
      description: 'Description 2574',
      image: 'image/2574.png',
      name: 'ID 2574',
      tokenId: 2574,
    };
    const collectibleII2577 = {
      address: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
      description: 'Description 2577',
      image: 'image/2577.png',
      name: 'ID 2577',
      tokenId: 2577,
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
    assetsDetection.configure({ selectedAddress: '0x1', networkType: MAINNET });
    await assetsDetection.detectCollectibles();
    // First fetch to API, only gets information from contract ending in HH
    expect(collectiblesController.state.collectibles).toStrictEqual([
      collectibleHH2574,
    ]);
    expect(collectiblesController.state.collectibleContracts).toStrictEqual([
      collectibleContractHH,
    ]);
    // During next call of assets detection, API succeds returning contract ending in gg information

    nock(OPEN_SEA_HOST)
      .get(
        `${OPEN_SEA_PATH}/asset_contract/0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc`,
      )
      .reply(200, {
        description: 'Description GG',
        image_url: 'url GG',
        name: 'Name GG',
        symbol: 'GG',
        total_supply: 10,
      })
      .get(
        `${OPEN_SEA_PATH}/asset_contract/0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d`,
      )
      .reply(200, {
        description: 'Description II',
        image_url: 'url II',
        name: 'Name II',
        symbol: 'II',
        total_supply: 10,
      })
      .get(`${OPEN_SEA_PATH}/assets?owner=0x1&offset=0&limit=50`)
      .reply(200, {
        assets: [
          {
            asset_contract: {
              address: '0x0B0fa4fF58D28A88d63235bd0756EDca69e49e6d',
            },
            description: 'Description 2577',
            image_url: 'image/2577.png',
            name: 'ID 2577',
            token_id: '2577',
          },
          {
            asset_contract: {
              address: '0xCE7ec4B2DfB30eB6c0BB5656D33aAd6BFb4001Fc',
            },
            description: 'Description 2574',
            image_url: 'image/2574.png',
            name: 'ID 2574',
            token_id: '2574',
          },
          {
            asset_contract: {
              address: '0xebE4e5E773AFD2bAc25De0cFafa084CFb3cBf1eD',
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
    await assetsDetection.detectCollectibles();
    expect(collectiblesController.state.collectibleContracts).toStrictEqual([
      collectibleContractHH,
      collectibleContractII,
      collectibleContractGG,
    ]);
    expect(collectiblesController.state.collectibles).toStrictEqual([
      collectibleHH2574,
      collectibleII2577,
      collectibleGG2574,
    ]);
  });

  it('should detect tokens correctly', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x1' });
    getBalancesInSingleCall.resolves({
      '0x6810e776880c02933d47db1b9fc05908e5386b96': new BN(1),
    });
    await assetsDetection.detectTokens();
    expect(tokensController.state.tokens).toStrictEqual([
      {
        address: '0x6810e776880C02933D47DB1b9fc05908e5386b96',
        symbol: 'GNO',
        decimals: 18,
        image: undefined,
        isERC721: false,
      },
    ]);
  });

  it('should update the tokens list when new tokens are detected', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x1' });
    getBalancesInSingleCall.resolves({
      '0x6810e776880c02933d47db1b9fc05908e5386b96': new BN(1),
    });
    await assetsDetection.detectTokens();
    expect(tokensController.state.tokens).toStrictEqual([
      {
        address: '0x6810e776880C02933D47DB1b9fc05908e5386b96',
        decimals: 18,
        image: undefined,
        symbol: 'GNO',
        isERC721: false,
      },
    ]);
    getBalancesInSingleCall.resolves({
      '0x514910771af9ca656af840dff83e8264ecf986ca': new BN(1),
    });
    await assetsDetection.detectTokens();
    expect(tokensController.state.tokens).toStrictEqual([
      {
        address: '0x6810e776880C02933D47DB1b9fc05908e5386b96',
        decimals: 18,
        image: undefined,
        symbol: 'GNO',
        isERC721: false,
      },
      {
        address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        symbol: 'LINK',
        decimals: 18,
        image: undefined,
        isERC721: false,
      },
    ]);
  });

  it('should not add ignoredTokens to the tokens list if detected with balance', async () => {
    stub(tokensController, '_instantiateNewEthersProvider').callsFake(
      () => null,
    );

    preferences.setSelectedAddress('0x0001');
    network.update({
      provider: {
        type: 'mainnet',
        chainId: NetworksChainId.mainnet,
      },
    });

    await tokensController.addToken(
      '0x59Ec8e68D9cAa87f6B5BC4013172c20E85ccdaD0',
      'BAR',
      5,
    );
    await tokensController.addToken(
      '0x588047365df5ba589f923604aac23d673555c623',
      'FOO',
      6,
    );
    await tokensController.removeAndIgnoreToken(
      '0x59Ec8e68D9cAa87f6B5BC4013172c20E85ccdaD0',
    );

    getBalancesInSingleCall.resolves({
      '0x59Ec8e68D9cAa87f6B5BC4013172c20E85ccdaD0': new BN(1),
    });
    await assetsDetection.detectTokens();
    expect(tokensController.state.tokens).toStrictEqual([
      {
        address: '0x588047365dF5BA589F923604AAC23d673555c623',
        decimals: 6,
        image: undefined,
        symbol: 'FOO',
        isERC721: false,
      },
    ]);
  });

  it('should add a token when detected with a balance even if it is ignored on another account', async () => {
    stub(tokensController, '_instantiateNewEthersProvider').callsFake(
      () => null,
    );

    preferences.setSelectedAddress('0x0001');
    network.update({
      provider: {
        type: 'mainnet',
        chainId: NetworksChainId.mainnet,
      },
    });

    await tokensController.addToken(
      '0x514910771AF9Ca656af840dff83E8264EcF986CA',
      'LINK',
      18,
    );
    await tokensController.addToken(
      '0x588047365df5ba589f923604aac23d673555c623',
      'FOO',
      6,
    );
    await tokensController.removeAndIgnoreToken(
      '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    );

    await preferences.setSelectedAddress('0x0002');

    getBalancesInSingleCall.resolves({
      '0x514910771AF9Ca656af840dff83E8264EcF986CA': new BN(1),
    });
    await assetsDetection.detectTokens();
    expect(tokensController.state.tokens).toStrictEqual([
      {
        address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        decimals: 18,
        image: undefined,
        symbol: 'LINK',
        isERC721: false,
      },
    ]);
  });

  it('should call getBalancesInSingle with token address that is not present on the asset state', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x1' });
    getBalancesInSingleCall.resolves({
      '0x6810e776880c02933d47db1b9fc05908e5386b96': new BN(1),
    });
    const tokensToDetect: string[] = Object.keys(tokenList.state.tokenList);
    await assetsDetection.detectTokens();
    expect(
      getBalancesInSingleCall
        .getCall(0)
        .calledWithExactly('0x1', tokensToDetect),
    ).toBe(true);
    getBalancesInSingleCall.resolves({
      '0x514910771af9ca656af840dff83e8264ecf986ca': new BN(1),
    });
    const updatedTokensToDetect = tokensToDetect.filter(
      (address) => address !== '0x6810e776880c02933d47db1b9fc05908e5386b96',
    );
    await assetsDetection.detectTokens();
    expect(
      getBalancesInSingleCall
        .getCall(1)
        .calledWithExactly('0x1', updatedTokensToDetect),
    ).toBe(true);
  });

  it('should not autodetect tokens that exist in the ignoreList', async () => {
    assetsDetection.configure({ networkType: MAINNET, selectedAddress: '0x1' });
    getBalancesInSingleCall.resolves({
      '0x514910771af9ca656af840dff83e8264ecf986ca': new BN(1),
    });
    await assetsDetection.detectTokens();

    tokensController.removeAndIgnoreToken(
      '0x514910771af9ca656af840dff83e8264ecf986ca',
    );
    await assetsDetection.detectTokens();
    expect(tokensController.state.tokens).toStrictEqual([]);
  });

  it('should not detect tokens if there is no selectedAddress set', async () => {
    assetsDetection.configure({ networkType: MAINNET });
    getBalancesInSingleCall.resolves({
      '0x514910771af9ca656af840dff83e8264ecf986ca': new BN(1),
    });
    await assetsDetection.detectTokens();
    expect(tokensController.state.tokens).toStrictEqual([]);
  });

  it('should subscribe to new sibling detecting assets when account changes', async () => {
    stub(tokensController, '_instantiateNewEthersProvider').callsFake(
      () => null,
    );
    const firstNetworkType = 'rinkeby';
    const secondNetworkType = 'mainnet';
    const firstAddress = '0x123';
    const secondAddress = '0x321';
    const detectAssets = sandbox.stub(assetsDetection, 'detectAssets');
    preferences.update({ selectedAddress: secondAddress });
    preferences.update({ selectedAddress: secondAddress });
    expect(preferences.state.selectedAddress).toStrictEqual(secondAddress);
    expect(detectAssets.calledTwice).toBe(false);
    preferences.update({ selectedAddress: firstAddress });
    expect(preferences.state.selectedAddress).toStrictEqual(firstAddress);
    network.update({
      provider: {
        type: secondNetworkType,
        chainId: NetworksChainId[secondNetworkType],
      },
    });
    expect(network.state.provider.type).toStrictEqual(secondNetworkType);
    network.update({
      provider: {
        type: firstNetworkType,
        chainId: NetworksChainId[firstNetworkType],
      },
    });
    expect(network.state.provider.type).toStrictEqual(firstNetworkType);
    tokensController.update({ tokens: TOKENS });
    expect(assetsDetection.config.tokens).toStrictEqual(TOKENS);
  });
});
