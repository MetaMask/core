import sinon from 'sinon';
import nock from 'nock';
import { BN } from 'ethereumjs-util';
import {
  NetworkController,
  NetworksChainId,
} from '../network/NetworkController';
import { PreferencesController } from '../user/PreferencesController';
import { ControllerMessenger } from '../ControllerMessenger';
import { TokensController } from './TokensController';
import { TokenDetectionController } from './TokenDetectionController';
import { NetworkType } from '..';
import {
  TokenListController,
  GetTokenListState,
  TokenListStateChange,
} from './TokenListController';
import { AssetsContractController } from './AssetsContractController';

const DEFAULT_INTERVAL = 180000;
const MAINNET = 'mainnet';
const ROPSTEN = 'ropsten';
const TOKENS = [
  { address: '0xfoO', symbol: 'bar', decimals: 2, aggregators: [] },
];

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

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
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
  return { messenger, controllerMessenger };
}

/**
 * Checks whether network is mainnet or not.
 *
 * @returns Whether current network is mainnet.
 */
function isMainnet(networkType: NetworkType): boolean {
  return networkType === MAINNET;
}

describe('TokenDetectionController', () => {
  let tokenDetection: TokenDetectionController;
  let preferences: PreferencesController;
  let network: NetworkController;
  let tokensController: TokensController;
  let tokenList: TokenListController;
  let assetsContract: AssetsContractController;
  let getBalancesInSingleCall: sinon.SinonStub<
    Parameters<AssetsContractController['getBalancesInSingleCall']>,
    ReturnType<AssetsContractController['getBalancesInSingleCall']>
  >;

  beforeEach(async () => {
    preferences = new PreferencesController({}, { useTokenDetection: true });
    network = new NetworkController();
    assetsContract = new AssetsContractController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
    });
    tokensController = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
    });

    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleTokenList)
      .persist();
    const { messenger, controllerMessenger } = getTokenListMessenger();
    tokenList = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      messenger,
    });
    await tokenList.start();
    getBalancesInSingleCall = sinon.stub();
    tokenDetection = new TokenDetectionController({
      onTokensStateChange: (listener) => tokensController.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onTokenListStateChange: (listener) =>
        controllerMessenger.subscribe(
          `TokenListController:stateChange`,
          listener,
        ),
      getBalancesInSingleCall: (getBalancesInSingleCall as unknown) as AssetsContractController['getBalancesInSingleCall'],
      addDetectedTokens: tokensController.addDetectedTokens.bind(
        tokensController,
      ),
      getTokensState: () => tokensController.state,
      getTokenListState: () => tokenList.state,
    });

    sinon
      .stub(tokensController, '_detectIsERC721')
      .callsFake(() => Promise.resolve(false));
  });

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
    tokenList.destroy();
  });

  it('should set default config', () => {
    expect(tokenDetection.config).toStrictEqual({
      interval: DEFAULT_INTERVAL,
      networkType: 'mainnet',
      selectedAddress: '',
      tokens: [],
      disabled: true,
      chainId: NetworksChainId.mainnet,
    });
  });

  it('should poll and detect tokens on interval while on mainnet', async () => {
    await new Promise((resolve) => {
      const mockTokens = sinon.stub(
        TokenDetectionController.prototype,
        'detectTokens',
      );
      const { controllerMessenger } = getTokenListMessenger();
      const tokenDetectionController = new TokenDetectionController(
        {
          onTokensStateChange: (listener) =>
            tokensController.subscribe(listener),
          onPreferencesStateChange: (listener) =>
            preferences.subscribe(listener),
          onNetworkStateChange: (listener) => network.subscribe(listener),
          onTokenListStateChange: (listener) =>
            controllerMessenger.subscribe(
              `TokenListController:stateChange`,
              listener,
            ),
          getBalancesInSingleCall: assetsContract.getBalancesInSingleCall.bind(
            assetsContract,
          ),
          addDetectedTokens: tokensController.addDetectedTokens.bind(
            tokensController,
          ),
          getTokensState: () => tokensController.state,
          getTokenListState: () => tokenList.state,
        },
        {
          interval: 10,
          networkType: MAINNET,
          chainId: NetworksChainId.mainnet,
          disabled: false,
        },
      );
      tokenDetectionController.start();

      expect(mockTokens.calledOnce).toBe(true);
      setTimeout(() => {
        expect(mockTokens.calledTwice).toBe(true);
        resolve('');
      }, 15);
    });
  });

  it('should detect mainnet correctly', () => {
    tokenDetection.configure({ networkType: MAINNET });
    expect(isMainnet(tokenDetection.config.networkType)).toStrictEqual(true);
    tokenDetection.configure({ networkType: ROPSTEN });
    expect(isMainnet(tokenDetection.config.networkType)).toStrictEqual(false);
  });

  it('should not autodetect while not on mainnet', async () => {
    await new Promise((resolve) => {
      const mockTokens = sinon.stub(
        TokenDetectionController.prototype,
        'detectTokens',
      );
      const { controllerMessenger } = getTokenListMessenger();
      new TokenDetectionController(
        {
          onTokensStateChange: (listener) =>
            tokensController.subscribe(listener),
          onPreferencesStateChange: (listener) =>
            preferences.subscribe(listener),
          onNetworkStateChange: (listener) => network.subscribe(listener),
          onTokenListStateChange: (listener) =>
            controllerMessenger.subscribe(
              `TokenListController:stateChange`,
              listener,
            ),
          getBalancesInSingleCall: assetsContract.getBalancesInSingleCall.bind(
            assetsContract,
          ),
          addDetectedTokens: tokensController.addDetectedTokens.bind(
            tokensController,
          ),
          getTokensState: () => tokensController.state,
          getTokenListState: () => tokenList.state,
        },
        {
          interval: 10,
          networkType: ROPSTEN,
          chainId: NetworksChainId.ropsten,
          disabled: true,
        },
      );
      expect(mockTokens.called).toBe(false);
      resolve('');
    });
  });

  it('should detect tokens correctly', async () => {
    tokenDetection.configure({
      networkType: MAINNET,
      selectedAddress: '0x1',
      chainId: NetworksChainId.mainnet,
      disabled: false,
    });
    getBalancesInSingleCall.resolves({
      '0x6810e776880c02933d47db1b9fc05908e5386b96': new BN(1),
    });
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([
      {
        address: '0x6810e776880C02933D47DB1b9fc05908e5386b96',
        decimals: 18,
        image: undefined,
        symbol: 'GNO',
        aggregators: [
          'Paraswap',
          'AirswapLight',
          '0x',
          'Bancor',
          'CoinGecko',
          'Zapper',
          'Kleros',
          'Zerion',
          'CMC',
          '1inch',
        ],
      },
    ]);
  });

  it('should update the tokens list when new tokens are detected', async () => {
    tokenDetection.configure({
      networkType: MAINNET,
      selectedAddress: '0x1',
      chainId: NetworksChainId.mainnet,
      disabled: false,
    });
    getBalancesInSingleCall.resolves({
      '0x6810e776880c02933d47db1b9fc05908e5386b96': new BN(1),
    });
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([
      {
        address: '0x6810e776880C02933D47DB1b9fc05908e5386b96',
        decimals: 18,
        image: undefined,
        symbol: 'GNO',
        aggregators: [
          'Paraswap',
          'AirswapLight',
          '0x',
          'Bancor',
          'CoinGecko',
          'Zapper',
          'Kleros',
          'Zerion',
          'CMC',
          '1inch',
        ],
      },
    ]);

    getBalancesInSingleCall.resolves({
      '0x514910771af9ca656af840dff83e8264ecf986ca': new BN(1),
    });
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([
      {
        address: '0x6810e776880C02933D47DB1b9fc05908e5386b96',
        decimals: 18,
        image: undefined,
        symbol: 'GNO',
        aggregators: [
          'Paraswap',
          'AirswapLight',
          '0x',
          'Bancor',
          'CoinGecko',
          'Zapper',
          'Kleros',
          'Zerion',
          'CMC',
          '1inch',
        ],
      },
      {
        address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        symbol: 'LINK',
        decimals: 18,
        image: undefined,
        aggregators: [
          'Paraswap',
          'PMM',
          'AirswapLight',
          '0x',
          'Bancor',
          'CoinGecko',
          'Zapper',
          'Kleros',
          'Zerion',
          'CMC',
          '1inch',
        ],
      },
    ]);
  });

  it('should not add ignoredTokens to the tokens list if detected with balance', async () => {
    sinon
      .stub(tokensController, '_instantiateNewEthersProvider')
      .callsFake(() => null);

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
    await tokenDetection.detectTokens();
    expect(tokensController.state.tokens).toStrictEqual([
      {
        address: '0x588047365dF5BA589F923604AAC23d673555c623',
        decimals: 6,
        image: undefined,
        symbol: 'FOO',
        isERC721: false,
        aggregators: [],
      },
    ]);
    expect(tokensController.state.detectedTokens).toStrictEqual([]);
  });

  it('should add a token when detected with a balance even if it is ignored on another account', async () => {
    tokenDetection.configure({
      networkType: MAINNET,
      chainId: NetworksChainId.mainnet,
      disabled: false,
    });

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
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([
      {
        address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
        decimals: 18,
        image: undefined,
        symbol: 'LINK',
        aggregators: [
          'Paraswap',
          'PMM',
          'AirswapLight',
          '0x',
          'Bancor',
          'CoinGecko',
          'Zapper',
          'Kleros',
          'Zerion',
          'CMC',
          '1inch',
        ],
      },
    ]);
  });

  it('should not autodetect tokens that exist in the ignoreList', async () => {
    tokenDetection.configure({
      networkType: MAINNET,
      selectedAddress: '0x1',
      chainId: NetworksChainId.mainnet,
      disabled: false,
    });
    getBalancesInSingleCall.resolves({
      '0x514910771af9ca656af840dff83e8264ecf986ca': new BN(1),
    });
    await tokenDetection.detectTokens();

    tokensController.removeAndIgnoreToken(
      '0x514910771af9ca656af840dff83e8264ecf986ca',
    );
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([]);
  });

  it('should not detect tokens if there is no selectedAddress set', async () => {
    tokenDetection.configure({
      networkType: MAINNET,
      chainId: NetworksChainId.mainnet,
      disabled: false,
    });
    getBalancesInSingleCall.resolves({
      '0x514910771af9ca656af840dff83e8264ecf986ca': new BN(1),
    });
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([]);
  });

  it('should subscribe to new sibling detecting tokens when account changes', async () => {
    sinon
      .stub(tokensController, '_instantiateNewEthersProvider')
      .callsFake(() => null);
    const firstNetworkType = 'rinkeby';
    const secondNetworkType = 'mainnet';
    const firstAddress = '0x123';
    const secondAddress = '0x321';
    const detectTokens = sinon.stub(tokenDetection, 'detectTokens');
    preferences.update({ selectedAddress: secondAddress });
    preferences.update({ selectedAddress: secondAddress });
    expect(preferences.state.selectedAddress).toStrictEqual(secondAddress);
    expect(detectTokens.calledTwice).toBe(false);
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
    expect(tokenDetection.config.tokens).toStrictEqual(TOKENS);
  });
});
