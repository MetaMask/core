import * as sinon from 'sinon';
import nock from 'nock';
import { BN } from 'ethereumjs-util';
import {
  NetworkController,
  NetworkControllerMessenger,
  NetworkControllerProviderConfigChangeEvent,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import { NetworksChainId, MAINNET } from '@metamask/controller-utils';
import { PreferencesController } from '@metamask/preferences-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import { TokensController } from './TokensController';
import { TokenDetectionController } from './TokenDetectionController';
import {
  TokenListController,
  GetTokenListState,
  TokenListStateChange,
  TokenListToken,
} from './TokenListController';
import { AssetsContractController } from './AssetsContractController';
import {
  formatAggregatorNames,
  isTokenDetectionSupportedForNetwork,
  SupportedTokenDetectionNetworks,
} from './assetsUtil';
import { Token } from './TokenRatesController';
import { TOKEN_END_POINT_API } from './token-service';

const DEFAULT_INTERVAL = 180000;

const sampleAggregators = [
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
];
const formattedSampleAggregators = formatAggregatorNames(sampleAggregators);
const sampleTokenList: TokenListToken[] = [
  {
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    symbol: 'LINK',
    decimals: 18,
    iconUrl: '',
    occurrences: 11,
    aggregators: sampleAggregators,
    name: 'Chainlink',
  },
  {
    address: '0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C',
    symbol: 'BNT',
    decimals: 18,
    iconUrl: '',
    occurrences: 11,
    aggregators: sampleAggregators,
    name: 'Bancor',
  },
];
const [tokenAFromList, tokenBFromList] = sampleTokenList;
const sampleTokenA: Token = {
  address: tokenAFromList.address,
  symbol: tokenAFromList.symbol,
  decimals: tokenAFromList.decimals,
  image:
    'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
  isERC721: false,
  aggregators: formattedSampleAggregators,
};
const sampleTokenB: Token = {
  address: tokenBFromList.address,
  symbol: tokenBFromList.symbol,
  decimals: tokenBFromList.decimals,
  image:
    'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
  isERC721: false,
  aggregators: formattedSampleAggregators,
};

type MainControllerMessenger = ControllerMessenger<
  GetTokenListState,
  | TokenListStateChange
  | NetworkControllerProviderConfigChangeEvent
  | NetworkControllerStateChangeEvent
>;

const getControllerMessenger = (): MainControllerMessenger => {
  return new ControllerMessenger();
};

const setupNetworkController = (
  controllerMessenger: MainControllerMessenger,
) => {
  const networkMessenger = controllerMessenger.getRestricted({
    name: 'NetworkController',
    allowedEvents: [
      'NetworkController:providerConfigChange',
      'NetworkController:stateChange',
    ],
    allowedActions: [],
  });

  const network = new NetworkController({
    messenger: networkMessenger,
    infuraProjectId: '123',
  });

  return { network, networkMessenger };
};

const setupTokenListController = (
  controllerMessenger: MainControllerMessenger,
) => {
  const tokenListMessenger = controllerMessenger.getRestricted({
    name: 'TokenListController',
    allowedActions: [],
    allowedEvents: [
      'TokenListController:stateChange',
      'NetworkController:providerConfigChange',
    ],
  });

  const tokenList = new TokenListController({
    chainId: NetworksChainId.mainnet,
    preventPollingOnNetworkRestart: false,
    messenger: tokenListMessenger,
  });

  return { tokenList, tokenListMessenger };
};

describe('TokenDetectionController', () => {
  let tokenDetection: TokenDetectionController;
  let preferences: PreferencesController;
  let network: NetworkController;
  let networkMessenger: NetworkControllerMessenger;
  let tokensController: TokensController;
  let tokenList: TokenListController;
  let controllerMessenger: MainControllerMessenger;
  let getBalancesInSingleCall: sinon.SinonStub<
    Parameters<AssetsContractController['getBalancesInSingleCall']>,
    ReturnType<AssetsContractController['getBalancesInSingleCall']>
  >;

  beforeEach(async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleTokenList)
      .get(
        `/token/${NetworksChainId.mainnet}?address=${tokenAFromList.address}`,
      )
      .reply(200, tokenAFromList)
      .get(
        `/token/${NetworksChainId.mainnet}?address=${tokenBFromList.address}`,
      )
      .reply(200, tokenBFromList)
      .persist();

    preferences = new PreferencesController({}, { useTokenDetection: true });
    controllerMessenger = getControllerMessenger();
    const networkSetup = setupNetworkController(controllerMessenger);
    network = networkSetup.network;
    networkMessenger = networkSetup.networkMessenger;
    tokensController = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) =>
        networkMessenger.subscribe('NetworkController:stateChange', listener),
    });
    const tokenListSetup = setupTokenListController(controllerMessenger);
    tokenList = tokenListSetup.tokenList;
    await tokenList.start();
    getBalancesInSingleCall = sinon.stub();
    tokenDetection = new TokenDetectionController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) =>
        networkMessenger.subscribe('NetworkController:stateChange', listener),
      onTokenListStateChange: (listener) =>
        tokenListSetup.tokenListMessenger.subscribe(
          `TokenListController:stateChange`,
          listener,
        ),
      getBalancesInSingleCall:
        getBalancesInSingleCall as unknown as AssetsContractController['getBalancesInSingleCall'],
      addDetectedTokens:
        tokensController.addDetectedTokens.bind(tokensController),
      getTokensState: () => tokensController.state,
      getTokenListState: () => tokenList.state,
      getNetworkState: () => network.state,
      getPreferencesState: () => preferences.state,
    });

    sinon
      .stub(tokensController, '_detectIsERC721')
      .callsFake(() => Promise.resolve(false));
  });

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
    tokenDetection.stop();
    tokenList.destroy();
    controllerMessenger.clearEventSubscriptions(
      'NetworkController:stateChange',
    );
  });

  it('should set default config', () => {
    expect(tokenDetection.config).toStrictEqual({
      interval: DEFAULT_INTERVAL,
      selectedAddress: '',
      disabled: true,
      chainId: NetworksChainId.mainnet,
      isDetectionEnabledForNetwork: true,
      isDetectionEnabledFromPreferences: true,
    });
  });

  it('should poll and detect tokens on interval while on supported networks', async () => {
    await new Promise(async (resolve) => {
      const mockTokens = sinon.stub(tokenDetection, 'detectTokens');
      tokenDetection.configure({
        interval: 10,
      });
      await tokenDetection.start();

      expect(mockTokens.calledOnce).toBe(true);
      setTimeout(() => {
        expect(mockTokens.calledTwice).toBe(true);
        resolve('');
      }, 15);
    });
  });

  it('should detect supported networks correctly', () => {
    tokenDetection.configure({
      chainId: SupportedTokenDetectionNetworks.mainnet,
    });

    expect(
      isTokenDetectionSupportedForNetwork(tokenDetection.config.chainId),
    ).toStrictEqual(true);
    tokenDetection.configure({ chainId: SupportedTokenDetectionNetworks.bsc });
    expect(
      isTokenDetectionSupportedForNetwork(tokenDetection.config.chainId),
    ).toStrictEqual(true);
    tokenDetection.configure({ chainId: NetworksChainId.ropsten });
    expect(
      isTokenDetectionSupportedForNetwork(tokenDetection.config.chainId),
    ).toStrictEqual(false);
  });

  it('should not autodetect while not on supported networks', async () => {
    tokenDetection.configure({
      selectedAddress: '0x1',
      chainId: NetworksChainId.goerli,
      isDetectionEnabledForNetwork: false,
    });

    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.start();
    expect(tokensController.state.detectedTokens).toStrictEqual([]);
  });

  it('should detect tokens correctly on supported networks', async () => {
    sinon
      .stub(tokensController, '_instantiateNewEthersProvider')
      .callsFake(() => null);

    preferences.update({ selectedAddress: '0x1' });
    network.setProviderType(MAINNET);

    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.start();
    expect(tokensController.state.detectedTokens).toStrictEqual([sampleTokenA]);
  });

  it('should update detectedTokens when new tokens are detected', async () => {
    sinon
      .stub(tokensController, '_instantiateNewEthersProvider')
      .callsFake(() => null);

    preferences.update({ selectedAddress: '0x1' });
    network.setProviderType(MAINNET);

    await tokenDetection.start();

    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([sampleTokenA]);

    getBalancesInSingleCall.resolves({
      [sampleTokenB.address]: new BN(1),
    });
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([
      sampleTokenA,
      sampleTokenB,
    ]);
  });

  it('should not add ignoredTokens to the tokens list if detected with balance', async () => {
    sinon
      .stub(tokensController, '_instantiateNewEthersProvider')
      .callsFake(() => null);

    preferences.setSelectedAddress('0x0001');

    network.setProviderType('mainnet');

    await tokenDetection.start();

    await tokensController.addToken(
      sampleTokenA.address,
      sampleTokenA.symbol,
      sampleTokenA.decimals,
    );

    await tokensController.addToken(
      sampleTokenB.address,
      sampleTokenB.symbol,
      sampleTokenB.decimals,
    );

    tokensController.ignoreTokens([sampleTokenA.address]);

    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.detectTokens();
    expect(tokensController.state.tokens).toStrictEqual([sampleTokenB]);

    expect(tokensController.state.ignoredTokens).toStrictEqual([
      sampleTokenA.address,
    ]);
  });

  it('should add a token when detected with a balance even if it is ignored on another account', async () => {
    sinon
      .stub(tokensController, '_instantiateNewEthersProvider')
      .callsFake(() => null);

    preferences.setSelectedAddress('0x0001');
    network.setProviderType('mainnet');

    await tokenDetection.start();

    await tokensController.addToken(
      sampleTokenA.address,
      sampleTokenA.symbol,
      sampleTokenA.decimals,
    );

    tokensController.ignoreTokens([sampleTokenA.address]);

    preferences.setSelectedAddress('0x0002');

    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([sampleTokenA]);
  });

  it('should not autodetect tokens that exist in the ignoreList', async () => {
    sinon
      .stub(tokensController, '_instantiateNewEthersProvider')
      .callsFake(() => null);

    preferences.update({ selectedAddress: '0x1' });
    network.setProviderType(MAINNET);

    await tokenDetection.start();

    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.detectTokens();

    expect(tokensController.state.detectedTokens).toStrictEqual([sampleTokenA]);

    tokensController.ignoreTokens([sampleTokenA.address]);
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([]);
  });

  it('should not detect tokens if there is no selectedAddress set', async () => {
    await tokenDetection.start();
    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([]);
  });

  it('should detect new tokens after switching between accounts', async () => {
    sinon
      .stub(tokensController, '_instantiateNewEthersProvider')
      .callsFake(() => null);

    preferences.setSelectedAddress('0x0001');
    network.setProviderType(MAINNET);

    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.start();
    expect(tokensController.state.detectedTokens).toStrictEqual([sampleTokenA]);

    preferences.setSelectedAddress('0x0002');
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([sampleTokenA]);
  });

  it('should not call getBalancesInSingleCall after stopping polling, and then switching between networks that support token detection', async () => {
    const polygonDecimalChainId = '137';
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${polygonDecimalChainId}`)
      .reply(200, sampleTokenList);

    sinon
      .stub(tokensController, '_instantiateNewEthersProvider')
      .callsFake(() => null);
    const stub = sinon.stub();
    const getBalancesInSingleCallMock = sinon.stub();
    let networkStateChangeListener: (state: any) => void;
    const onNetworkStateChange = sinon.stub().callsFake((listener) => {
      networkStateChangeListener = listener;
    });

    tokenDetection = new TokenDetectionController(
      {
        onTokenListStateChange: stub,
        onPreferencesStateChange: stub,
        onNetworkStateChange,
        getBalancesInSingleCall: getBalancesInSingleCallMock,
        addDetectedTokens: stub,
        getTokensState: () => tokensController.state,
        getTokenListState: () => tokenList.state,
        getNetworkState: () => network.state,
        getPreferencesState: () => preferences.state,
      },
      {
        disabled: false,
        isDetectionEnabledForNetwork: true,
        isDetectionEnabledFromPreferences: true,
        selectedAddress: '0x1',
        chainId: NetworksChainId.mainnet,
      },
    );

    await tokenDetection.start();

    expect(getBalancesInSingleCallMock.called).toBe(true);
    getBalancesInSingleCallMock.reset();

    tokenDetection.stop();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await networkStateChangeListener!({
      providerConfig: { chainId: polygonDecimalChainId },
    });

    expect(getBalancesInSingleCallMock.called).toBe(false);
  });

  it('should not call getBalancesInSingleCall if onTokenListStateChange is called with an empty token list', async () => {
    const stub = sinon.stub();
    const getBalancesInSingleCallMock = sinon.stub();
    let tokenListStateChangeListener: (state: any) => void;
    const onTokenListStateChange = sinon.stub().callsFake((listener) => {
      tokenListStateChangeListener = listener;
    });
    tokenDetection = new TokenDetectionController(
      {
        onTokenListStateChange,
        onPreferencesStateChange: stub,
        onNetworkStateChange: stub,
        getBalancesInSingleCall: getBalancesInSingleCallMock,
        addDetectedTokens: stub,
        getTokensState: stub,
        getTokenListState: stub,
        getNetworkState: () => network.state,
        getPreferencesState: () => preferences.state,
      },
      {
        disabled: false,
        isDetectionEnabledForNetwork: true,
        isDetectionEnabledFromPreferences: true,
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await tokenListStateChangeListener!({ tokenList: {} });

    expect(getBalancesInSingleCallMock.called).toBe(false);
  });

  it('should call getBalancesInSingleCall if onPreferencesStateChange is called with useTokenDetection being true and is changed', async () => {
    const stub = sinon.stub();
    const getBalancesInSingleCallMock = sinon.stub();
    let preferencesStateChangeListener: (state: any) => void;
    const onPreferencesStateChange = sinon.stub().callsFake((listener) => {
      preferencesStateChangeListener = listener;
    });
    tokenDetection = new TokenDetectionController(
      {
        onPreferencesStateChange,
        onTokenListStateChange: stub,
        onNetworkStateChange: stub,
        getBalancesInSingleCall: getBalancesInSingleCallMock,
        addDetectedTokens: stub,
        getTokensState: () => tokensController.state,
        getTokenListState: () => tokenList.state,
        getNetworkState: () => network.state,
        getPreferencesState: () => preferences.state,
      },
      {
        disabled: false,
        isDetectionEnabledForNetwork: true,
        isDetectionEnabledFromPreferences: false,
        selectedAddress: '0x1',
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await preferencesStateChangeListener!({
      selectedAddress: '0x1',
      useTokenDetection: true,
    });

    expect(getBalancesInSingleCallMock.called).toBe(true);
  });

  it('should call getBalancesInSingleCall if onNetworkStateChange is called with a chainId that supports token detection and is changed', async () => {
    const stub = sinon.stub();
    const getBalancesInSingleCallMock = sinon.stub();
    let networkStateChangeListener: (state: any) => void;
    const onNetworkStateChange = sinon.stub().callsFake((listener) => {
      networkStateChangeListener = listener;
    });
    tokenDetection = new TokenDetectionController(
      {
        onNetworkStateChange,
        onTokenListStateChange: stub,
        onPreferencesStateChange: stub,
        getBalancesInSingleCall: getBalancesInSingleCallMock,
        addDetectedTokens: stub,
        getTokensState: () => tokensController.state,
        getTokenListState: () => tokenList.state,
        getNetworkState: () => network.state,
        getPreferencesState: () => preferences.state,
      },
      {
        disabled: false,
        isDetectionEnabledFromPreferences: true,
        chainId: SupportedTokenDetectionNetworks.polygon,
        isDetectionEnabledForNetwork: true,
        selectedAddress: '0x1',
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await networkStateChangeListener!({
      providerConfig: { chainId: NetworksChainId.mainnet },
    });

    expect(getBalancesInSingleCallMock.called).toBe(true);
  });
});
