import { ControllerMessenger } from '@metamask/base-controller';
import {
  ChainId,
  NetworkType,
  NetworksTicker,
  convertHexToDecimal,
  toHex,
} from '@metamask/controller-utils';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerStateChangeEvent,
  NetworkState,
  ProviderConfig,
} from '@metamask/network-controller';
import { NetworkStatus } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import nock from 'nock';
import * as sinon from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import * as tokenService from './token-service';
import type {
  TokenListStateChange,
  GetTokenListState,
  TokenListMap,
  TokenListState,
} from './TokenListController';
import { TokenListController } from './TokenListController';

const name = 'TokenListController';
const timestamp = Date.now();

const sampleMainnetTokenList = [
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
    decimals: 18,
    occurrences: 11,
    name: 'Synthetix',
    iconUrl:
      'https://static.cx.metamask.io/api/v1/tokenIcons/1/0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f.png',
    aggregators: [
      'Aave',
      'Bancor',
      'CMC',
      'Crypto.com',
      'CoinGecko',
      '1inch',
      'Paraswap',
      'PMM',
      'Synthetix',
      'Zapper',
      'Zerion',
      '0x',
    ],
  },
  {
    address: '0x514910771af9ca656af840dff83e8264ecf986ca',
    symbol: 'LINK',
    decimals: 18,
    occurrences: 11,
    name: 'Chainlink',
    iconUrl:
      'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
    aggregators: [
      'Aave',
      'Bancor',
      'CMC',
      'Crypto.com',
      'CoinGecko',
      '1inch',
      'Paraswap',
      'PMM',
      'Zapper',
      'Zerion',
      '0x',
    ],
  },
  {
    address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
    symbol: 'BNT',
    decimals: 18,
    occurrences: 11,
    name: 'Bancor',
    iconUrl:
      'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
    aggregators: [
      'Bancor',
      'CMC',
      'CoinGecko',
      '1inch',
      'Paraswap',
      'PMM',
      'Zapper',
      'Zerion',
      '0x',
    ],
  },
];

const sampleMainnetTokensChainsCache = sampleMainnetTokenList.reduce(
  (output, current) => {
    output[current.address] = current;
    return output;
  },
  {} as TokenListMap,
);

const sampleBinanceTokenList = [
  {
    address: '0x7083609fce4d1d8dc0c979aab8c869ea2c873402',
    symbol: 'DOT',
    decimals: 18,
    name: 'PolkadotBEP2',
    occurrences: 5,
    aggregators: [
      'BinanceDex',
      '1inch',
      'PancakeExtended',
      'ApeSwap',
      'Paraswap',
    ],
    iconUrl:
      'https://static.cx.metamask.io/api/v1/tokenIcons/56/0x7083609fce4d1d8dc0c979aab8c869ea2c873402.png',
  },
  {
    address: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3',
    symbol: 'DAI',
    decimals: 18,
    name: 'DaiBEP2',
    occurrences: 5,
    aggregators: [
      'BinanceDex',
      '1inch',
      'PancakeExtended',
      'ApeSwap',
      '0x',
      'Paraswap',
    ],
    iconUrl:
      'https://static.cx.metamask.io/api/v1/tokenIcons/56/0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3.png',
  },
];

const sampleBinanceTokensChainsCache = sampleBinanceTokenList.reduce(
  (output, current) => {
    output[current.address] = current;
    return output;
  },
  {} as TokenListMap,
);

const sampleSingleChainState = {
  tokenList: {
    '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': {
      address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
      symbol: 'SNX',
      decimals: 18,
      occurrences: 11,
      name: 'Synthetix',
      iconUrl:
        'https://static.cx.metamask.io/api/v1/tokenIcons/1/0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f.png',
      aggregators: [
        'Aave',
        'Bancor',
        'CMC',
        'Crypto.com',
        'CoinGecko',
        '1inch',
        'Paraswap',
        'PMM',
        'Synthetix',
        'Zapper',
        'Zerion',
        '0x',
      ],
    },
    '0x514910771af9ca656af840dff83e8264ecf986ca': {
      address: '0x514910771af9ca656af840dff83e8264ecf986ca',
      symbol: 'LINK',
      decimals: 18,
      occurrences: 11,
      name: 'Chainlink',
      iconUrl:
        'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
      aggregators: [
        'Aave',
        'Bancor',
        'CMC',
        'Crypto.com',
        'CoinGecko',
        '1inch',
        'Paraswap',
        'PMM',
        'Zapper',
        'Zerion',
        '0x',
      ],
    },
    '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c': {
      address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
      symbol: 'BNT',
      decimals: 18,
      occurrences: 11,
      name: 'Bancor',
      iconUrl:
        'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
      aggregators: [
        'Bancor',
        'CMC',
        'CoinGecko',
        '1inch',
        'Paraswap',
        'PMM',
        'Zapper',
        'Zerion',
        '0x',
      ],
    },
  },
  tokensChainsCache: {
    [toHex(1)]: {
      timestamp,
      data: sampleMainnetTokensChainsCache,
    },
  },
};

const sampleSepoliaTokenList = [
  {
    address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    symbol: 'WBTC',
    decimals: 8,
    name: 'Wrapped BTC',
    iconUrl:
      'https://static.cx.metamask.io/api/v1/tokenIcons/11155111/0x2260fac5e5542a773aa44fbcfedf7c193bc2c599.png',
    type: 'erc20',
    aggregators: [
      'Metamask',
      'Aave',
      'Bancor',
      'Cmc',
      'Cryptocom',
      'CoinGecko',
      'OneInch',
      'Pmm',
      'Sushiswap',
      'Zerion',
      'Lifi',
      'Openswap',
      'Sonarwatch',
      'UniswapLabs',
      'Coinmarketcap',
    ],
    occurrences: 15,
    fees: {},
    storage: {
      balance: 0,
    },
  },
  {
    address: '0x04fa0d235c4abf4bcf4787af4cf447de572ef828',
    symbol: 'UMA',
    decimals: 18,
    name: 'UMA',
    iconUrl:
      'https://static.cx.metamask.io/api/v1/tokenIcons/11155111/0x04fa0d235c4abf4bcf4787af4cf447de572ef828.png',
    type: 'erc20',
    aggregators: [
      'Metamask',
      'Bancor',
      'CMC',
      'Crypto.com',
      'CoinGecko',
      '1inch',
      'PMM',
      'Sushiswap',
      'Zerion',
      'Openswap',
      'Sonarwatch',
      'UniswapLabs',
      'Coinmarketcap',
    ],
    occurrences: 13,
    fees: {},
  },
  {
    address: '0x6810e776880c02933d47db1b9fc05908e5386b96',
    symbol: 'GNO',
    decimals: 18,
    name: 'Gnosis Token',
    iconUrl:
      'https://static.cx.metamask.io/api/v1/tokenIcons/11155111/0x6810e776880c02933d47db1b9fc05908e5386b96.png',
    type: 'erc20',
    aggregators: [
      'Metamask',
      'Bancor',
      'CMC',
      'CoinGecko',
      '1inch',
      'Sushiswap',
      'Zerion',
      'Lifi',
      'Openswap',
      'Sonarwatch',
      'UniswapLabs',
      'Coinmarketcap',
    ],
    occurrences: 12,
    fees: {},
  },
];

const sampleSepoliaTokensChainCache = sampleSepoliaTokenList.reduce(
  (output, current) => {
    output[current.address] = current;
    return output;
  },
  {} as TokenListMap,
);

const sampleTwoChainState = {
  tokenList: {
    '0x7083609fce4d1d8dc0c979aab8c869ea2c873402': {
      address: '0x7083609fce4d1d8dc0c979aab8c869ea2c873402',
      symbol: 'DOT',
      decimals: 18,
      name: 'PolkadotBEP2',
      occurrences: 5,
      aggregators: [
        'BinanceDex',
        '1inch',
        'PancakeExtended',
        'ApeSwap',
        'Paraswap',
      ],
      iconUrl:
        'https://static.cx.metamask.io/api/v1/tokenIcons/56/0x7083609fce4d1d8dc0c979aab8c869ea2c873402.png',
    },
    '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3': {
      address: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3',
      symbol: 'DAI',
      decimals: 18,
      name: 'DaiBEP2',
      occurrences: 5,
      aggregators: [
        'BinanceDex',
        '1inch',
        'PancakeExtended',
        'ApeSwap',
        '0x',
        'Paraswap',
      ],
      iconUrl:
        'https://static.cx.metamask.io/api/v1/tokenIcons/56/0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3.png',
    },
  },
  tokensChainsCache: {
    [toHex(1)]: {
      timestamp,
      data: sampleMainnetTokensChainsCache,
    },
    [toHex(56)]: {
      timestamp: timestamp + 150,
      data: sampleBinanceTokensChainsCache,
    },
  },
};

const existingState = {
  tokenList: {
    '0x514910771af9ca656af840dff83e8264ecf986ca': {
      address: '0x514910771af9ca656af840dff83e8264ecf986ca',
      symbol: 'LINK',
      decimals: 18,
      occurrences: 11,
      name: 'Chainlink',
      iconUrl:
        'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
      aggregators: [
        'Aave',
        'Bancor',
        'CMC',
        'Crypto.com',
        'CoinGecko',
        '1inch',
        'Paraswap',
        'PMM',
        'Zapper',
        'Zerion',
        '0x',
      ],
    },
  },
  tokensChainsCache: {
    [toHex(1)]: {
      timestamp,
      data: sampleMainnetTokensChainsCache,
    },
  },
  preventPollingOnNetworkRestart: false,
};

const outdatedExistingState = {
  tokenList: {
    '0x514910771af9ca656af840dff83e8264ecf986ca': {
      address: '0x514910771af9ca656af840dff83e8264ecf986ca',
      symbol: 'LINK',
      decimals: 18,
      occurrences: 11,
      name: 'Chainlink',
      iconUrl:
        'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
      aggregators: [
        'Aave',
        'Bancor',
        'CMC',
        'Crypto.com',
        'CoinGecko',
        '1inch',
        'Paraswap',
        'PMM',
        'Zapper',
        'Zerion',
        '0x',
      ],
    },
  },
  tokensChainsCache: {
    [toHex(1)]: {
      timestamp,
      data: sampleMainnetTokensChainsCache,
    },
  },
  preventPollingOnNetworkRestart: false,
};

const expiredCacheExistingState: TokenListState = {
  tokenList: {
    '0x514910771af9ca656af840dff83e8264ecf986ca': {
      address: '0x514910771af9ca656af840dff83e8264ecf986ca',
      symbol: 'LINK',
      decimals: 18,
      occurrences: 9,
      name: 'Chainlink',
      iconUrl:
        'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
      aggregators: [
        'Aave',
        'Bancor',
        'CMC',
        'Crypto.com',
        'CoinGecko',
        '1inch',
        'Paraswap',
        'PMM',
        'Zapper',
        'Zerion',
        '0x',
      ],
    },
  },
  tokensChainsCache: {
    [toHex(1)]: {
      timestamp: timestamp - 86400000,
      data: {
        '0x514910771af9ca656af840dff83e8264ecf986ca': {
          address: '0x514910771af9ca656af840dff83e8264ecf986ca',
          symbol: 'LINK',
          decimals: 18,
          occurrences: 11,
          name: 'Chainlink',
          iconUrl:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
          aggregators: [
            'Aave',
            'Bancor',
            'CMC',
            'Crypto.com',
            'CoinGecko',
            '1inch',
            'Paraswap',
            'PMM',
            'Zapper',
            'Zerion',
            '0x',
          ],
        },
      },
    },
  },
  preventPollingOnNetworkRestart: false,
};

type MainControllerMessenger = ControllerMessenger<
  GetTokenListState | NetworkControllerGetNetworkClientByIdAction,
  TokenListStateChange | NetworkControllerStateChangeEvent
>;

const getControllerMessenger = (): MainControllerMessenger => {
  return new ControllerMessenger();
};

const getRestrictedMessenger = (
  controllerMessenger: MainControllerMessenger,
) => {
  const messenger = controllerMessenger.getRestricted({
    name,
    allowedActions: ['NetworkController:getNetworkClientById'],
    allowedEvents: ['NetworkController:stateChange'],
  });

  return messenger;
};

/**
 * Builds an object that satisfies the NetworkState shape using the given
 * provider config. This can be used to return a complete value for the
 * `NetworkController:stateChange` event.
 *
 * @param providerConfig - The provider config to use.
 * @returns A complete state object for NetworkController.
 */
function buildNetworkControllerStateWithProviderConfig(
  providerConfig: ProviderConfig,
): NetworkState {
  const selectedNetworkClientId = providerConfig.type || 'uuid-1';
  return {
    selectedNetworkClientId,
    providerConfig,
    networksMetadata: {
      [selectedNetworkClientId]: {
        EIPS: {},
        status: NetworkStatus.Available,
      },
    },
    networkConfigurations: {},
  };
}

describe('TokenListController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
    sinon.restore();
  });

  it('should set default state', async () => {
    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      messenger,
    });

    expect(controller.state).toStrictEqual({
      tokenList: {},
      tokensChainsCache: {},
      preventPollingOnNetworkRestart: false,
    });

    controller.destroy();
    controllerMessenger.clearEventSubscriptions(
      'NetworkController:stateChange',
    );
  });

  it('should initialize with initial state', () => {
    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      messenger,
      state: existingState,
    });
    expect(controller.state).toStrictEqual({
      tokenList: {
        '0x514910771af9ca656af840dff83e8264ecf986ca': {
          address: '0x514910771af9ca656af840dff83e8264ecf986ca',
          symbol: 'LINK',
          decimals: 18,
          occurrences: 11,
          name: 'Chainlink',
          iconUrl:
            'https://static.cx.metamask.io/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
          aggregators: [
            'Aave',
            'Bancor',
            'CMC',
            'Crypto.com',
            'CoinGecko',
            '1inch',
            'Paraswap',
            'PMM',
            'Zapper',
            'Zerion',
            '0x',
          ],
        },
      },
      tokensChainsCache: {
        [toHex(1)]: {
          timestamp,
          data: sampleMainnetTokensChainsCache,
        },
      },
      preventPollingOnNetworkRestart: false,
    });

    controller.destroy();
    controllerMessenger.clearEventSubscriptions(
      'NetworkController:stateChange',
    );
  });

  it('should initiate without preventPollingOnNetworkRestart', async () => {
    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      messenger,
    });

    expect(controller.state).toStrictEqual({
      tokenList: {},
      tokensChainsCache: {},
      preventPollingOnNetworkRestart: false,
    });

    controller.destroy();
  });

  it('should not poll before being started', async () => {
    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      interval: 100,
      messenger,
    });

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(controller.state.tokenList).toStrictEqual({});

    controller.destroy();
  });

  it('should update tokenList state when network updates are passed via onNetworkStateChange callback', async () => {
    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleMainnetTokenList)
      .persist();

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    let onNetworkStateChangeCallback!: (state: NetworkState) => void;
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      onNetworkStateChange: (cb) => (onNetworkStateChangeCallback = cb),
      preventPollingOnNetworkRestart: false,
      interval: 100,
      messenger,
    });
    controller.start();
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );
    onNetworkStateChangeCallback(
      buildNetworkControllerStateWithProviderConfig({
        chainId: ChainId.goerli,
        type: NetworkType.goerli,
        ticker: NetworksTicker.goerli,
      }),
    );
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 500));

    expect(controller.state.tokenList).toStrictEqual({});
    controller.destroy();
  });

  it('should poll and update rate in the right interval', async () => {
    const tokenListMock = sinon.stub(
      TokenListController.prototype,
      'fetchTokenList',
    );

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      interval: 100,
      messenger,
    });
    await controller.start();

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(tokenListMock.called).toBe(true);
    expect(tokenListMock.calledTwice).toBe(false);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(tokenListMock.calledTwice).toBe(true);

    controller.destroy();
  });

  it('should not poll after being stopped', async () => {
    const tokenListMock = sinon.stub(
      TokenListController.prototype,
      'fetchTokenList',
    );

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      interval: 100,
      messenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(tokenListMock.called).toBe(true);
    expect(tokenListMock.calledTwice).toBe(false);

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(tokenListMock.calledTwice).toBe(false);

    controller.destroy();
  });

  it('should poll correctly after being started, stopped, and started again', async () => {
    const tokenListMock = sinon.stub(
      TokenListController.prototype,
      'fetchTokenList',
    );

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);

    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      interval: 100,
      messenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(tokenListMock.called).toBe(true);
    expect(tokenListMock.calledTwice).toBe(false);

    await controller.start();

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(tokenListMock.calledTwice).toBe(true);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(tokenListMock.calledThrice).toBe(true);
    controller.destroy();
  });

  it('should call fetchTokenList on network that supports token detection', async () => {
    const tokenListMock = sinon.stub(
      TokenListController.prototype,
      'fetchTokenList',
    );

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      interval: 100,
      messenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(tokenListMock.called).toBe(true);
    controller.destroy();
  });

  it('should not call fetchTokenList on network that does not support token detection', async () => {
    const tokenListMock = sinon.stub(
      TokenListController.prototype,
      'fetchTokenList',
    );

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.sepolia,
      preventPollingOnNetworkRestart: false,
      interval: 100,
      messenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(tokenListMock.called).toBe(false);

    controller.destroy();
    tokenListMock.restore();
  });

  it('should update token list from api', async () => {
    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleMainnetTokenList)
      .persist();

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      messenger,
      interval: 750,
    });
    await controller.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(controller.state.tokenList).toStrictEqual(
        sampleSingleChainState.tokenList,
      );

      expect(
        controller.state.tokensChainsCache[ChainId.mainnet].data,
      ).toStrictEqual(
        sampleSingleChainState.tokensChainsCache[ChainId.mainnet].data,
      );

      expect(
        controller.state.tokensChainsCache[ChainId.mainnet].timestamp,
      ).toBeGreaterThanOrEqual(
        sampleSingleChainState.tokensChainsCache[ChainId.mainnet].timestamp,
      );
      controller.destroy();
    } finally {
      controller.destroy();
    }
  });

  it('should update the cache before threshold time if the current data is undefined', async () => {
    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .once()
      .reply(200, undefined);

    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleMainnetTokenList)
      .persist();

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      messenger,
      interval: 100,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual({});
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );

    expect(controller.state.tokensChainsCache[toHex(1)].data).toStrictEqual(
      sampleSingleChainState.tokensChainsCache[toHex(1)].data,
    );
    controller.destroy();
  });

  it('should update token list from cache before reaching the threshold time', async () => {
    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      messenger,
      state: existingState,
    });
    expect(controller.state).toStrictEqual(existingState);
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );

    expect(
      controller.state.tokensChainsCache[ChainId.mainnet].data,
    ).toStrictEqual(
      sampleSingleChainState.tokensChainsCache[ChainId.mainnet].data,
    );
    controller.destroy();
  });

  it('should update token list when the token property changes', async () => {
    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleMainnetTokenList)
      .persist();

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      messenger,
      state: outdatedExistingState,
    });
    expect(controller.state).toStrictEqual(outdatedExistingState);
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );

    expect(
      controller.state.tokensChainsCache[ChainId.mainnet].data,
    ).toStrictEqual(
      sampleSingleChainState.tokensChainsCache[ChainId.mainnet].data,
    );
    controller.destroy();
  });

  it('should update the cache when the timestamp expires', async () => {
    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleMainnetTokenList)
      .persist();

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      messenger,
      state: expiredCacheExistingState,
    });
    expect(controller.state).toStrictEqual(expiredCacheExistingState);
    await controller.start();
    expect(
      controller.state.tokensChainsCache[ChainId.mainnet].timestamp,
    ).toBeGreaterThan(
      sampleSingleChainState.tokensChainsCache[ChainId.mainnet].timestamp,
    );

    expect(
      controller.state.tokensChainsCache[ChainId.mainnet].data,
    ).toStrictEqual(
      sampleSingleChainState.tokensChainsCache[ChainId.mainnet].data,
    );
    controller.destroy();
  });

  it('should update token list when the chainId change', async () => {
    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleMainnetTokenList)
      .get(getTokensPath(ChainId.goerli))
      .reply(200, { error: 'ChainId 5 is not supported' })
      .get(getTokensPath(toHex(56)))
      .reply(200, sampleBinanceTokenList)
      .persist();

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      messenger,
      state: existingState,
      interval: 100,
    });
    expect(controller.state).toStrictEqual(existingState);
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );

    expect(
      controller.state.tokensChainsCache[ChainId.mainnet].data,
    ).toStrictEqual(
      sampleTwoChainState.tokensChainsCache[ChainId.mainnet].data,
    );

    controllerMessenger.publish(
      'NetworkController:stateChange',
      buildNetworkControllerStateWithProviderConfig({
        type: NetworkType.goerli,
        chainId: ChainId.goerli,
        ticker: NetworksTicker.goerli,
      }),
      [],
    );

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 500));

    expect(controller.state.tokenList).toStrictEqual({});
    expect(
      controller.state.tokensChainsCache[ChainId.mainnet].data,
    ).toStrictEqual(
      sampleTwoChainState.tokensChainsCache[ChainId.mainnet].data,
    );

    controllerMessenger.publish(
      'NetworkController:stateChange',
      buildNetworkControllerStateWithProviderConfig({
        type: NetworkType.rpc,
        chainId: toHex(56),
        rpcUrl: 'http://localhost:8545',
        ticker: 'TEST',
      }),
      [],
    );

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 500));
    expect(controller.state.tokenList).toStrictEqual(
      sampleTwoChainState.tokenList,
    );

    expect(
      controller.state.tokensChainsCache[ChainId.mainnet].data,
    ).toStrictEqual(
      sampleTwoChainState.tokensChainsCache[ChainId.mainnet].data,
    );

    expect(controller.state.tokensChainsCache[toHex(56)].data).toStrictEqual(
      sampleTwoChainState.tokensChainsCache[toHex(56)].data,
    );

    controller.destroy();
  });

  it('should clear the tokenList and tokensChainsCache', async () => {
    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      messenger,
      state: existingState,
    });
    expect(controller.state).toStrictEqual(existingState);
    controller.clearingTokenListData();

    expect(controller.state.tokenList).toStrictEqual({});
    expect(controller.state.tokensChainsCache).toStrictEqual({});

    controller.destroy();
  });

  it('should update preventPollingOnNetworkRestart and restart the polling on network restart', async () => {
    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleMainnetTokenList)
      .get(getTokensPath(ChainId.goerli))
      .reply(200, { error: 'ChainId 5 is not supported' })
      .get(getTokensPath(toHex(56)))
      .reply(200, sampleBinanceTokenList)
      .persist();

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.goerli,
      preventPollingOnNetworkRestart: true,
      messenger,
      interval: 100,
    });
    await controller.start();
    controllerMessenger.publish(
      'NetworkController:stateChange',
      buildNetworkControllerStateWithProviderConfig({
        type: NetworkType.mainnet,
        chainId: ChainId.mainnet,
        ticker: NetworksTicker.mainnet,
      }),
      [],
    );

    expect(controller.state).toStrictEqual({
      tokenList: {},
      tokensChainsCache: {},
      preventPollingOnNetworkRestart: true,
    });
    controller.updatePreventPollingOnNetworkRestart(false);
    expect(controller.state).toStrictEqual({
      tokenList: {},
      tokensChainsCache: {},
      preventPollingOnNetworkRestart: false,
    });

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new Promise((resolve: any) => {
      messenger.subscribe('TokenListController:stateChange', (_, patch) => {
        const tokenListChanged = patch.find(
          (p) => Object.keys(p.value.tokenList).length !== 0,
        );
        if (!tokenListChanged) {
          return;
        }

        expect(controller.state.tokenList).toStrictEqual(
          sampleTwoChainState.tokenList,
        );

        expect(
          controller.state.tokensChainsCache[toHex(56)].data,
        ).toStrictEqual(sampleTwoChainState.tokensChainsCache[toHex(56)].data);
        messenger.clearEventSubscriptions('TokenListController:stateChange');
        controller.destroy();
        controllerMessenger.clearEventSubscriptions(
          'NetworkController:stateChange',
        );
        resolve();
      });

      controllerMessenger.publish(
        'NetworkController:stateChange',
        buildNetworkControllerStateWithProviderConfig({
          type: NetworkType.rpc,
          chainId: toHex(56),
          rpcUrl: 'http://localhost:8545',
          ticker: 'TEST',
        }),
        [],
      );
    });
  });

  describe('startPollingByNetworkClient', () => {
    let clock: sinon.SinonFakeTimers;
    const pollingIntervalTime = 1000;
    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => {
      clock.restore();
    });

    it('should call fetchTokenListByChainId with the correct chainId', async () => {
      nock(tokenService.TOKEN_END_POINT_API)
        .get(getTokensPath(ChainId.sepolia))
        .reply(200, sampleSepoliaTokenList)
        .persist();

      const fetchTokenListByChainIdSpy = jest.spyOn(
        tokenService,
        'fetchTokenListByChainId',
      );
      const controllerMessenger = getControllerMessenger();
      controllerMessenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        jest.fn().mockReturnValue({
          configuration: {
            type: NetworkType.sepolia,
            chainId: ChainId.sepolia,
          },
        }),
      );
      const messenger = getRestrictedMessenger(controllerMessenger);
      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        preventPollingOnNetworkRestart: false,
        messenger,
        state: expiredCacheExistingState,
        interval: pollingIntervalTime,
      });
      expect(controller.state.tokenList).toStrictEqual(
        expiredCacheExistingState.tokenList,
      );

      controller.startPollingByNetworkClientId('sepolia');
      await advanceTime({ clock, duration: 0 });

      expect(fetchTokenListByChainIdSpy.mock.calls[0]).toStrictEqual(
        expect.arrayContaining([ChainId.sepolia]),
      );
    });

    it('should start polling against the token list API at the interval passed to the constructor', async () => {
      const fetchTokenListByChainIdSpy = jest.spyOn(
        tokenService,
        'fetchTokenListByChainId',
      );

      const controllerMessenger = getControllerMessenger();
      controllerMessenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        jest.fn().mockReturnValue({
          configuration: {
            type: NetworkType.goerli,
            chainId: ChainId.goerli,
          },
        }),
      );
      const messenger = getRestrictedMessenger(controllerMessenger);
      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        preventPollingOnNetworkRestart: false,
        messenger,
        state: expiredCacheExistingState,
        interval: pollingIntervalTime,
      });
      expect(controller.state.tokenList).toStrictEqual(
        expiredCacheExistingState.tokenList,
      );

      controller.startPollingByNetworkClientId('goerli');
      await advanceTime({ clock, duration: 0 });

      expect(fetchTokenListByChainIdSpy).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: pollingIntervalTime / 2 });

      expect(fetchTokenListByChainIdSpy).toHaveBeenCalledTimes(1);
      await advanceTime({ clock, duration: pollingIntervalTime / 2 });

      expect(fetchTokenListByChainIdSpy).toHaveBeenCalledTimes(2);
      await advanceTime({ clock, duration: pollingIntervalTime });

      expect(fetchTokenListByChainIdSpy).toHaveBeenCalledTimes(3);
    });

    it('should update tokenList state and tokensChainsCache', async () => {
      const startingState: TokenListState = {
        tokenList: {},
        tokensChainsCache: {},
        preventPollingOnNetworkRestart: false,
      };

      const fetchTokenListByChainIdSpy = jest
        .spyOn(tokenService, 'fetchTokenListByChainId')
        .mockImplementation(async (chainId) => {
          switch (chainId) {
            case ChainId.sepolia:
              return sampleSepoliaTokenList;
            case toHex(56):
              return sampleBinanceTokenList;
            default:
              throw new Error('Invalid chainId');
          }
        });
      const controllerMessenger = getControllerMessenger();
      controllerMessenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        jest.fn().mockImplementation((networkClientId) => {
          switch (networkClientId) {
            case 'sepolia':
              return {
                configuration: {
                  type: NetworkType.sepolia,
                  chainId: ChainId.sepolia,
                },
              };
            case 'binance-network-client-id':
              return {
                configuration: {
                  type: NetworkType.rpc,
                  chainId: toHex(56),
                },
              };
            default:
              throw new Error('Invalid networkClientId');
          }
        }),
      );
      const messenger = getRestrictedMessenger(controllerMessenger);
      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        preventPollingOnNetworkRestart: false,
        messenger,
        state: startingState,
        interval: pollingIntervalTime,
      });

      expect(controller.state).toStrictEqual(startingState);

      // start polling for sepolia
      const pollingToken = controller.startPollingByNetworkClientId('sepolia');
      // wait a polling interval
      await advanceTime({ clock, duration: pollingIntervalTime });

      expect(fetchTokenListByChainIdSpy).toHaveBeenCalledTimes(1);
      // expect the state to be updated with the sepolia token list
      expect(controller.state.tokenList).toStrictEqual(
        sampleSepoliaTokensChainCache,
      );
      expect(controller.state.tokensChainsCache).toStrictEqual({
        [ChainId.sepolia]: {
          timestamp: expect.any(Number),
          data: sampleSepoliaTokensChainCache,
        },
      });
      controller.stopPollingByPollingToken(pollingToken);

      // start polling for binance
      controller.startPollingByNetworkClientId('binance-network-client-id');
      await advanceTime({ clock, duration: pollingIntervalTime });

      // expect fetchTokenListByChain to be called for binance, but not for sepolia
      // because the cache for the recently fetched sepolia token list is still valid
      expect(fetchTokenListByChainIdSpy).toHaveBeenCalledTimes(2);

      // expect tokenList to be updated with the binance token list
      // and the cache to now contain both the binance token list and the sepolia token list
      expect(controller.state.tokenList).toStrictEqual(
        sampleBinanceTokensChainsCache,
      );
      // once we adopt this polling pattern we should no longer access the root tokenList state
      // but rather access from the cache with a chainId selector.
      expect(controller.state.tokensChainsCache).toStrictEqual({
        [toHex(56)]: {
          timestamp: expect.any(Number),
          data: sampleBinanceTokensChainsCache,
        },
        [ChainId.sepolia]: {
          timestamp: expect.any(Number),
          data: sampleSepoliaTokensChainCache,
        },
      });
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
  )}?occurrenceFloor=3&includeNativeAssets=false&includeDuplicateSymbolAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false`;
}
