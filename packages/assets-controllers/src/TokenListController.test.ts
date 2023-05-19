import * as sinon from 'sinon';
import nock from 'nock';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  NetworkControllerStateChangeEvent,
  NetworkState,
  NetworkStatus,
  ProviderConfig,
} from '@metamask/network-controller';
import {
  ChainId,
  NetworkType,
  convertHexToDecimal,
  toHex,
} from '@metamask/controller-utils';
import {
  TokenListController,
  TokenListStateChange,
  GetTokenListState,
  TokenListMap,
  TokenListState,
} from './TokenListController';
import { TOKEN_END_POINT_API } from './token-service';

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
      'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f.png',
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
      'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
      'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
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

const sampleWithDuplicateSymbols = [
  {
    address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
    symbol: 'BNT',
    decimals: 18,
    occurrences: 11,
    name: 'Bancor',
    iconUrl:
      'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
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

const sampleWithDuplicateSymbolsTokensChainsCache =
  sampleWithDuplicateSymbols.reduce((output, current) => {
    output[current.address] = current;
    return output;
  }, {} as TokenListMap);

const sampleWithLessThan3OccurencesResponse = [
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
    decimals: 18,
    occurrences: 2,
    name: 'Synthetix',
    iconUrl:
      'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f.png',
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
      'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
];

const sampleWith3OrMoreOccurrences =
  sampleWithLessThan3OccurencesResponse.reduce((output, token) => {
    if (token.occurrences >= 3) {
      output[token.address] = token;
    }
    return output;
  }, {} as TokenListMap);

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
      'https://static.metafi.codefi.network/api/v1/tokenIcons/56/0x7083609fce4d1d8dc0c979aab8c869ea2c873402.png',
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
      'https://static.metafi.codefi.network/api/v1/tokenIcons/56/0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3.png',
  },
];
const sampleSingleChainState = {
  tokenList: {
    '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': {
      address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
      symbol: 'SNX',
      decimals: 18,
      occurrences: 11,
      name: 'Synthetix',
      iconUrl:
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f.png',
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
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
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

const sampleBinanceTokensChainsCache = sampleBinanceTokenList.reduce(
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
        'https://static.metafi.codefi.network/api/v1/tokenIcons/56/0x7083609fce4d1d8dc0c979aab8c869ea2c873402.png',
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
        'https://static.metafi.codefi.network/api/v1/tokenIcons/56/0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3.png',
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
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
        'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
            'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
  GetTokenListState,
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
    allowedActions: [],
    allowedEvents: [
      'TokenListController:stateChange',
      'NetworkController:stateChange',
    ],
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
  return {
    providerConfig,
    networkId: '1',
    networkStatus: NetworkStatus.Available,
    networkDetails: {
      EIPS: {},
    },
    networkConfigurations: {},
  };
}

describe('TokenListController', () => {
  afterEach(() => {
    nock.cleanAll();
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
            'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${convertHexToDecimal(ChainId.mainnet)}`)
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
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${convertHexToDecimal(ChainId.mainnet)}`)
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
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${convertHexToDecimal(ChainId.mainnet)}`)
      .once()
      .reply(200, undefined);

    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${convertHexToDecimal(ChainId.mainnet)}`)
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

  it('should update token list after removing data with duplicate symbols', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${convertHexToDecimal(ChainId.mainnet)}`)
      .reply(200, sampleWithDuplicateSymbols)
      .persist();

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      messenger,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual({
      '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c': {
        address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
        symbol: 'BNT',
        decimals: 18,
        occurrences: 11,
        name: 'Bancor',
        iconUrl:
          'https://static.metafi.codefi.network/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
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
    });

    expect(
      controller.state.tokensChainsCache[ChainId.mainnet].data,
    ).toStrictEqual(sampleWithDuplicateSymbolsTokensChainsCache);
    controller.destroy();
  });

  it('should update token list after removing data less than 3 occurrences', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${convertHexToDecimal(ChainId.mainnet)}`)
      .reply(200, sampleWithLessThan3OccurencesResponse)
      .persist();

    const controllerMessenger = getControllerMessenger();
    const messenger = getRestrictedMessenger(controllerMessenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      preventPollingOnNetworkRestart: false,
      messenger,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual(
      sampleWith3OrMoreOccurrences,
    );

    expect(
      controller.state.tokensChainsCache[ChainId.mainnet].data,
    ).toStrictEqual(sampleWith3OrMoreOccurrences);
    controller.destroy();
  });

  it('should update token list when the token property changes', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${convertHexToDecimal(ChainId.mainnet)}`)
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
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${convertHexToDecimal(ChainId.mainnet)}`)
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
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${convertHexToDecimal(ChainId.mainnet)}`)
      .reply(200, sampleMainnetTokenList)
      .get(`/tokens/${convertHexToDecimal(ChainId.goerli)}`)
      .reply(200, { error: 'ChainId 5 is not supported' })
      .get(`/tokens/56`)
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
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${convertHexToDecimal(ChainId.mainnet)}`)
      .reply(200, sampleMainnetTokenList)
      .get(`/tokens/${convertHexToDecimal(ChainId.goerli)}`)
      .reply(200, { error: 'ChainId 5 is not supported' })
      .get(`/tokens/56`)
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
        }),
        [],
      );
    });
  });
});
