import type { AddApprovalRequest } from '@metamask/approval-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  ChainId,
  NetworkType,
  NetworksTicker,
  convertHexToDecimal,
  toHex,
} from '@metamask/controller-utils';
import { defaultState as defaultNetworkState } from '@metamask/network-controller';
import type {
  NetworkState,
  ProviderConfig,
} from '@metamask/network-controller';
import { PreferencesController } from '@metamask/preferences-controller';
import type { Hex } from '@metamask/utils';
import { BN } from 'ethereumjs-util';
import nock from 'nock';
import * as sinon from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import type { AssetsContractController } from './AssetsContractController';
import {
  formatAggregatorNames,
  SupportedTokenDetectionNetworks,
} from './assetsUtil';
import { TOKEN_END_POINT_API } from './token-service';
import type {
  AllowedActions,
  AllowedEvents,
  TokenDetectionControllerMessenger,
} from './TokenDetectionController';
import {
  TokenDetectionController,
  controllerName,
} from './TokenDetectionController';
import { TokenListController } from './TokenListController';
import type { TokenListToken } from './TokenListController';
import type { Token } from './TokenRatesController';
import type { TokensControllerMessenger } from './TokensController';
import { TokensController } from './TokensController';

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
    'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
  isERC721: false,
  aggregators: formattedSampleAggregators,
  name: 'Chainlink',
};
const sampleTokenB: Token = {
  address: tokenBFromList.address,
  symbol: tokenBFromList.symbol,
  decimals: tokenBFromList.decimals,
  image:
    'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
  isERC721: false,
  aggregators: formattedSampleAggregators,
  name: 'Bancor',
};

type MainControllerMessenger = ControllerMessenger<
  AllowedActions | AddApprovalRequest,
  AllowedEvents
>;

/**
 * Returns a new `MainControllerMessenger` instance that can be used to create restricted messengers.
 * @returns The new `MainControllerMessenger` instance.
 */
function getControllerMessenger(): MainControllerMessenger {
  return new ControllerMessenger();
}

/**
 * Sets up a `TokenListController` and its restricted messenger.
 * @param controllerMessenger - The main controller messenger.
 * @returns An object containing the TokenListController and its restricted messenger.
 */
function setupTokenListController(
  controllerMessenger: MainControllerMessenger,
) {
  const tokenListMessenger = controllerMessenger.getRestricted({
    name: 'TokenListController',
    allowedActions: [],
    allowedEvents: ['NetworkController:stateChange'],
  });

  const tokenList = new TokenListController({
    chainId: ChainId.mainnet,
    preventPollingOnNetworkRestart: false,
    messenger: tokenListMessenger,
  });

  return { tokenList, tokenListMessenger };
}

/**
 * Builds a messenger that `TokenDetectionController` can use to communicate with other controllers.
 * @param controllerMessenger - The main controller messenger.
 * @returns The restricted messenger.
 */
function buildTokenDetectionControllerMessenger(
  controllerMessenger: MainControllerMessenger = getControllerMessenger(),
): TokenDetectionControllerMessenger {
  return controllerMessenger.getRestricted({
    name: controllerName,
    allowedActions: [
      'NetworkController:getNetworkClientById',
      'TokensController:getState',
      'TokensController:addDetectedTokens',
      'TokenListController:getState',
    ],
    allowedEvents: [
      'NetworkController:stateChange',
      'NetworkController:networkDidChange',
      'TokenListController:stateChange',
    ],
  });
}

describe('TokenDetectionController', () => {
  let tokenDetection: TokenDetectionController;
  let preferences: PreferencesController;
  let tokensController: TokensController;
  let tokenList: TokenListController;
  let controllerMessenger: MainControllerMessenger;
  let getBalancesInSingleCall: sinon.SinonStub<
    Parameters<AssetsContractController['getBalancesInSingleCall']>,
    ReturnType<AssetsContractController['getBalancesInSingleCall']>
  >;

  const onNetworkDidChangeListeners: ((state: NetworkState) => void)[] = [];
  const getNetworkClientByIdHandler = jest.fn();
  const changeNetwork = (providerConfig: ProviderConfig) => {
    controllerMessenger.publish('NetworkController:networkDidChange', {
      ...defaultNetworkState,
      providerConfig,
      selectedNetworkClientId: providerConfig.type,
    });

    getNetworkClientByIdHandler.mockReturnValue({
      configuration: {
        chainId: providerConfig.chainId,
      },
      provider: {},
      blockTracker: {},
      destroy: jest.fn(),
    });
  };
  const mainnet = {
    chainId: ChainId.mainnet,
    type: NetworkType.mainnet,
    ticker: NetworksTicker.mainnet,
  };
  const goerli = {
    chainId: ChainId.goerli,
    type: NetworkType.goerli,
    ticker: NetworksTicker.goerli,
  };

  beforeEach(async () => {
    nock(TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleTokenList)
      .get(
        `/token/${convertHexToDecimal(ChainId.mainnet)}?address=${
          tokenAFromList.address
        }`,
      )
      .reply(200, tokenAFromList)
      .get(
        `/token/${convertHexToDecimal(ChainId.mainnet)}?address=${
          tokenBFromList.address
        }`,
      )
      .reply(200, tokenBFromList)
      .persist();

    preferences = new PreferencesController({}, { useTokenDetection: true });
    controllerMessenger = getControllerMessenger();
    sinon
      .stub(TokensController.prototype, '_createEthersContract')
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .callsFake(() => null as any);

    controllerMessenger.registerActionHandler(
      `NetworkController:getNetworkClientById`,
      getNetworkClientByIdHandler.mockReturnValue({
        configuration: {
          chainId: ChainId.mainnet,
        },
        provider: {},
        blockTracker: {},
        destroy: jest.fn(),
      }),
    );

    tokensController = new TokensController({
      chainId: ChainId.mainnet,
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkDidChange: (listener) =>
        onNetworkDidChangeListeners.push(listener),
      onTokenListStateChange: sinon.stub(),
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      getNetworkClientById: sinon.stub() as any,
      messenger: undefined as unknown as TokensControllerMessenger,
    });

    controllerMessenger.registerActionHandler(
      `TokensController:getState`,
      () => tokensController.state,
    );
    controllerMessenger.registerActionHandler(
      `TokensController:addDetectedTokens`,
      tokensController.addDetectedTokens.bind(tokensController),
    );

    const tokenListSetup = setupTokenListController(controllerMessenger);
    tokenList = tokenListSetup.tokenList;
    await tokenList.start();

    getBalancesInSingleCall = sinon.stub();
    tokenDetection = new TokenDetectionController({
      networkClientId: NetworkType.mainnet,
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      getBalancesInSingleCall:
        getBalancesInSingleCall as unknown as AssetsContractController['getBalancesInSingleCall'],
      getPreferencesState: () => preferences.state,
      messenger: buildTokenDetectionControllerMessenger(controllerMessenger),
    });

    sinon
      .stub(tokensController, '_detectIsERC721')
      .callsFake(() => Promise.resolve(false));
  });

  afterEach(() => {
    sinon.restore();
    tokenDetection.stop();
    tokenList.destroy();
  });

  it('should poll and detect tokens on interval while on supported networks', async () => {
    await new Promise(async (resolve) => {
      const mockTokens = sinon.stub(tokenDetection, 'detectTokens');
      tokenDetection.setIntervalLength(10);
      await tokenDetection.start();

      expect(mockTokens.calledOnce).toBe(true);
      setTimeout(() => {
        expect(mockTokens.calledTwice).toBe(true);
        resolve('');
      }, 15);
    });
  });

  it('should not autodetect while not on supported networks', async () => {
    changeNetwork(goerli);
    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.start();
    expect(tokensController.state.detectedTokens).toStrictEqual([]);
  });

  it('should detect tokens correctly on supported networks', async () => {
    preferences.update({ selectedAddress: '0x1' });
    changeNetwork(mainnet);

    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.start();
    expect(tokensController.state.detectedTokens).toStrictEqual([sampleTokenA]);
  });

  it('should detect tokens correctly on the Polygon network', async () => {
    preferences.update({ selectedAddress: '0x2' });
    changeNetwork({
      chainId: SupportedTokenDetectionNetworks.polygon,
      type: NetworkType.rpc,
      ticker: NetworksTicker.rpc,
    });

    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.start();
    expect(tokensController.state.detectedTokens).toStrictEqual([sampleTokenA]);
  });

  it('should update detectedTokens when new tokens are detected', async () => {
    preferences.update({ selectedAddress: '0x1' });
    changeNetwork(mainnet);

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
    preferences.setSelectedAddress('0x0001');
    changeNetwork(mainnet);

    await tokensController.addToken({
      address: sampleTokenA.address,
      symbol: sampleTokenA.symbol,
      decimals: sampleTokenA.decimals,
    });

    await tokensController.addToken({
      address: sampleTokenB.address,
      symbol: sampleTokenB.symbol,
      decimals: sampleTokenB.decimals,
      name: sampleTokenB.name,
    });

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
    preferences.setSelectedAddress('0x0001');
    changeNetwork(mainnet);

    await tokensController.addToken({
      address: sampleTokenA.address,
      symbol: sampleTokenA.symbol,
      decimals: sampleTokenA.decimals,
    });

    tokensController.ignoreTokens([sampleTokenA.address]);

    preferences.setSelectedAddress('0x0002');

    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([sampleTokenA]);
  });

  it('should not autodetect tokens that exist in the ignoreList', async () => {
    preferences.update({ selectedAddress: '0x1' });
    changeNetwork(mainnet);

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
    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([]);
  });

  it('should detect new tokens after switching between accounts', async () => {
    preferences.setSelectedAddress('0x0001');
    changeNetwork(mainnet);

    getBalancesInSingleCall.resolves({
      [sampleTokenA.address]: new BN(1),
    });
    await tokenDetection.start();
    expect(tokensController.state.detectedTokens).toStrictEqual([sampleTokenA]);

    preferences.setSelectedAddress('0x0002');
    await tokenDetection.detectTokens();
    expect(tokensController.state.detectedTokens).toStrictEqual([sampleTokenA]);
  });

  describe('getBalancesInSingleCall', () => {
    let stub: sinon.SinonStub;
    let getBalancesInSingleCallMock: sinon.SinonStub<
      Parameters<AssetsContractController['getBalancesInSingleCall']>,
      ReturnType<AssetsContractController['getBalancesInSingleCall']>
    >;
    beforeEach(async () => {
      stub = sinon.stub();
      getBalancesInSingleCallMock = sinon.stub();

      controllerMessenger = getControllerMessenger();
      controllerMessenger.registerActionHandler(
        `NetworkController:getNetworkClientById`,
        getNetworkClientByIdHandler.mockReturnValue({
          configuration: {
            chainId: ChainId.mainnet,
          },
          provider: {},
          blockTracker: {},
          destroy: jest.fn(),
        }),
      );
      controllerMessenger.registerActionHandler(
        `TokensController:getState`,
        () => tokensController.state,
      );
      controllerMessenger.registerActionHandler(
        `TokensController:addDetectedTokens`,
        tokensController.addDetectedTokens.bind(tokensController),
      );

      const tokenListSetup = setupTokenListController(controllerMessenger);
      tokenList = tokenListSetup.tokenList;
      await tokenList.start();
    });

    it('should not be called after stopping polling, and then switching between networks that support token detection', async () => {
      const polygonDecimalChainId = '137';
      nock(TOKEN_END_POINT_API)
        .get(getTokensPath(toHex(polygonDecimalChainId)))
        .reply(200, sampleTokenList);

      tokenDetection = new TokenDetectionController({
        networkClientId: NetworkType.mainnet,
        selectedAddress: '0x1',
        onPreferencesStateChange: stub,
        getBalancesInSingleCall: getBalancesInSingleCallMock,
        getPreferencesState: () => preferences.state,
        messenger: buildTokenDetectionControllerMessenger(controllerMessenger),
      });
      await tokenDetection.start();

      expect(getBalancesInSingleCallMock.called).toBe(true);
      getBalancesInSingleCallMock.reset();

      tokenDetection.stop();
      changeNetwork({
        chainId: toHex(polygonDecimalChainId),
        type: NetworkType.rpc,
        ticker: 'MATIC',
      });
      expect(getBalancesInSingleCallMock.called).toBe(false);
    });

    it('should not be called if TokenListController is updated to have an empty token list', async () => {
      tokenDetection = new TokenDetectionController({
        networkClientId: NetworkType.mainnet,
        onPreferencesStateChange: stub,
        getBalancesInSingleCall: getBalancesInSingleCallMock,
        getPreferencesState: () => preferences.state,
        messenger: buildTokenDetectionControllerMessenger(controllerMessenger),
      });

      tokenList.clearingTokenListData();
      expect(getBalancesInSingleCallMock.called).toBe(false);
    });

    it('should be called if onPreferencesStateChange is called with useTokenDetection being true and selectedAddress is changed', async () => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let preferencesStateChangeListener: (state: any) => void;
      const onPreferencesStateChange = sinon.stub().callsFake((listener) => {
        preferencesStateChangeListener = listener;
      });

      tokenDetection = new TokenDetectionController({
        networkClientId: NetworkType.mainnet,
        selectedAddress: '0x1',
        onPreferencesStateChange,
        getBalancesInSingleCall: getBalancesInSingleCallMock,
        getPreferencesState: () => preferences.state,
        messenger: buildTokenDetectionControllerMessenger(controllerMessenger),
      });

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      preferencesStateChangeListener!({
        selectedAddress: '0x2',
        useTokenDetection: true,
      });
      expect(getBalancesInSingleCallMock.calledOnce).toBe(true);
    });

    it('should be called if network is changed to a chainId that supports token detection', async () => {
      tokenDetection = new TokenDetectionController({
        networkClientId: 'polygon',
        selectedAddress: '0x1',
        onPreferencesStateChange: stub,
        getBalancesInSingleCall: getBalancesInSingleCallMock,
        getPreferencesState: () => preferences.state,
        messenger: buildTokenDetectionControllerMessenger(controllerMessenger),
      });
      getNetworkClientByIdHandler.mockReturnValue({
        configuration: {
          chainId: SupportedTokenDetectionNetworks.polygon,
        },
        provider: {},
        blockTracker: {},
        destroy: jest.fn(),
      });

      changeNetwork(mainnet);
      expect(getBalancesInSingleCallMock.calledOnce).toBe(true);
    });
  });

  describe('startPollingByNetworkClientId', () => {
    let clock: sinon.SinonFakeTimers;
    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
    });

    it('should call detect tokens with networkClientId and address params', async () => {
      const spy = jest
        .spyOn(tokenDetection, 'detectTokens')
        .mockImplementation(() => {
          return Promise.resolve();
        });
      tokenDetection.startPollingByNetworkClientId('mainnet', {
        address: '0x1',
      });
      tokenDetection.startPollingByNetworkClientId('sepolia', {
        address: '0xdeadbeef',
      });
      tokenDetection.startPollingByNetworkClientId('goerli', {
        address: '0x3',
      });

      await advanceTime({ clock, duration: 0 });
      expect(spy.mock.calls).toMatchObject([
        [{ networkClientId: 'mainnet', accountAddress: '0x1' }],
        [{ networkClientId: 'sepolia', accountAddress: '0xdeadbeef' }],
        [{ networkClientId: 'goerli', accountAddress: '0x3' }],
      ]);
      await advanceTime({ clock, duration: DEFAULT_INTERVAL });
      expect(spy.mock.calls).toMatchObject([
        [{ networkClientId: 'mainnet', accountAddress: '0x1' }],
        [{ networkClientId: 'sepolia', accountAddress: '0xdeadbeef' }],
        [{ networkClientId: 'goerli', accountAddress: '0x3' }],
        [{ networkClientId: 'mainnet', accountAddress: '0x1' }],
        [{ networkClientId: 'sepolia', accountAddress: '0xdeadbeef' }],
        [{ networkClientId: 'goerli', accountAddress: '0x3' }],
      ]);
      tokenDetection.stopAllPolling();
      spy.mockRestore();
    });
  });

  describe('detectTokens', () => {
    it('should detect and add tokens by networkClientId correctly', async () => {
      const selectedAddress = '0x2';
      getBalancesInSingleCall.resolves({
        [sampleTokenA.address]: new BN(1),
      });
      await tokenDetection.detectTokens({
        networkClientId: NetworkType.mainnet,
        accountAddress: selectedAddress,
      });
      const tokens =
        tokensController.state.allDetectedTokens[ChainId.mainnet][
          selectedAddress
        ];
      expect(tokens).toStrictEqual([sampleTokenA]);
    });
  });
});

/**
 * Construct the path used to fetch tokens that we can pass to `nock`.
 *
 * @param chainId - The chain ID.
 * @returns The constructed path.
 */
function getTokensPath(chainId: Hex) {
  return `/tokens/${convertHexToDecimal(
    chainId,
  )}?occurrenceFloor=3&includeNativeAssets=false&includeDuplicateSymbolAssets=false&includeTokenFees=false&includeAssetType=false`;
}
