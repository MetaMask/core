import sinon from 'sinon';
import nock from 'nock';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  NetworkController,
  NetworksChainId,
} from '../network/NetworkController';
import {
  TokenListController,
  TokenListStateChange,
  GetTokenListState,
  TokenListMap,
  TokenListState,
} from './TokenListController';

const name = 'TokenListController';
const TOKEN_END_POINT_API = 'https://token-api.metaswap.codefi.network';
const timestamp = Date.now();

const sampleMainnetTokenList = [
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
    decimals: 18,
    occurrences: 11,
    name: 'Synthetix',
    iconUrl:
      'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f.png',
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
      'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
      'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
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
      'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
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
      'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f.png',
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
      'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
      'https://static.metaswap.codefi.network/api/v1/tokenIcons/56/0x7083609fce4d1d8dc0c979aab8c869ea2c873402.png',
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
      'https://static.metaswap.codefi.network/api/v1/tokenIcons/56/0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3.png',
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
        'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f.png',
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
        'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
        'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
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
    '1': {
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
        'https://static.metaswap.codefi.network/api/v1/tokenIcons/56/0x7083609fce4d1d8dc0c979aab8c869ea2c873402.png',
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
        'https://static.metaswap.codefi.network/api/v1/tokenIcons/56/0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3.png',
    },
  },
  tokensChainsCache: {
    '1': {
      timestamp,
      data: sampleMainnetTokensChainsCache,
    },
    '56': {
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
        'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
    '1': {
      timestamp,
      data: sampleMainnetTokensChainsCache,
    },
  },
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
        'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
    '1': {
      timestamp,
      data: sampleMainnetTokensChainsCache,
    },
  },
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
        'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
    '1': {
      timestamp: timestamp - 86400000,
      data: {
        '0x514910771af9ca656af840dff83e8264ecf986ca': {
          address: '0x514910771af9ca656af840dff83e8264ecf986ca',
          symbol: 'LINK',
          decimals: 18,
          occurrences: 11,
          name: 'Chainlink',
          iconUrl:
            'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
};

/**
 * Get a TokenListController restricted controller messenger.
 *
 * @returns A restricted controller messenger for the TokenListController.
 */
function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger<
    GetTokenListState,
    TokenListStateChange
  >();
  const messenger = controllerMessenger.getRestricted<
    'TokenListController',
    never,
    never
  >({
    name,
  });
  return messenger;
}

describe('TokenListController', () => {
  let network: NetworkController;
  beforeEach(() => {
    network = new NetworkController();
  });

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
  });

  it('should set default state', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      messenger,
    });

    expect(controller.state).toStrictEqual({
      tokenList: {},
      tokensChainsCache: {},
    });

    controller.destroy();
  });

  it('should initialize with initial state', () => {
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
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
            'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x514910771af9ca656af840dff83e8264ecf986ca.png',
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
        '1': {
          timestamp,
          data: sampleMainnetTokensChainsCache,
        },
      },
    });

    controller.destroy();
  });

  it('should not poll before being started', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      interval: 100,
      messenger,
    });

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(controller.state.tokenList).toStrictEqual({});

    controller.destroy();
  });

  it('should poll and update rate in the right interval', async () => {
    const tokenListMock = sinon.stub(
      TokenListController.prototype,
      'fetchTokenList',
    );

    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
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

    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
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

    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
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

    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      interval: 100,
      messenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(tokenListMock.called).toBe(true);

    controller.destroy();
    tokenListMock.restore();
  });

  it('should not call fetchTokenList on network that does not support token detection', async () => {
    const tokenListMock = sinon.stub(
      TokenListController.prototype,
      'fetchTokenList',
    );

    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.localhost,
      onNetworkStateChange: (listener) => network.subscribe(listener),
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
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleMainnetTokenList)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      messenger,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );

    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(
      sampleSingleChainState.tokensChainsCache[NetworksChainId.mainnet].data,
    );

    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].timestamp,
    ).toBeGreaterThanOrEqual(
      sampleSingleChainState.tokensChainsCache[NetworksChainId.mainnet]
        .timestamp,
    );
    controller.destroy();
  });

  it('should update the cache before threshold time if the current data is undefined', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .once()
      .reply(200, undefined);

    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleMainnetTokenList)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      messenger,
      interval: 100,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual({});
    expect(controller.state.tokensChainsCache.data).toBeUndefined();
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );

    expect(controller.state.tokensChainsCache['1'].data).toStrictEqual(
      sampleSingleChainState.tokensChainsCache['1'].data,
    );
    controller.destroy();
  });

  it('should update token list from cache before reaching the threshold time', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      messenger,
      state: existingState,
    });
    expect(controller.state).toStrictEqual(existingState);
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );

    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(
      sampleSingleChainState.tokensChainsCache[NetworksChainId.mainnet].data,
    );
    controller.destroy();
  });

  it('should update token list after removing data with duplicate symbols', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleWithDuplicateSymbols)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
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
          'https://static.metaswap.codefi.network/api/v1/tokenIcons/1/0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c.png',
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
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(sampleWithDuplicateSymbolsTokensChainsCache);
    controller.destroy();
  });

  it('should update token list after removing data less than 3 occurrences', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleWithLessThan3OccurencesResponse)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      messenger,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual(
      sampleWith3OrMoreOccurrences,
    );

    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(sampleWith3OrMoreOccurrences);
    controller.destroy();
  });

  it('should update token list when the token property changes', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleMainnetTokenList)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      messenger,
      state: outdatedExistingState,
    });
    expect(controller.state).toStrictEqual(outdatedExistingState);
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );

    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(
      sampleSingleChainState.tokensChainsCache[NetworksChainId.mainnet].data,
    );
    controller.destroy();
  });

  it('should update the cache when the timestamp expires', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleMainnetTokenList)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      messenger,
      state: expiredCacheExistingState,
    });
    expect(controller.state).toStrictEqual(expiredCacheExistingState);
    await controller.start();
    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].timestamp,
    ).toBeGreaterThan(
      sampleSingleChainState.tokensChainsCache[NetworksChainId.mainnet]
        .timestamp,
    );

    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(
      sampleSingleChainState.tokensChainsCache[NetworksChainId.mainnet].data,
    );
    controller.destroy();
  });

  it('should update token list when the chainId change', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleMainnetTokenList)
      .get(`/tokens/${NetworksChainId.ropsten}`)
      .reply(200, { error: 'ChainId 3 is not supported' })
      .get(`/tokens/56`)
      .reply(200, sampleBinanceTokenList)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      onNetworkStateChange: (listener) => network.subscribe(listener),
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
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(
      sampleTwoChainState.tokensChainsCache[NetworksChainId.mainnet].data,
    );

    network.update({
      provider: {
        type: 'ropsten',
        chainId: NetworksChainId.ropsten,
      },
    });
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 10));
    expect(controller.state.tokenList).toStrictEqual({});
    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(
      sampleTwoChainState.tokensChainsCache[NetworksChainId.mainnet].data,
    );

    network.update({
      provider: {
        type: 'rpc',
        chainId: '56',
      },
    });
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 10));
    expect(controller.state.tokenList).toStrictEqual(
      sampleTwoChainState.tokenList,
    );

    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(
      sampleTwoChainState.tokensChainsCache[NetworksChainId.mainnet].data,
    );

    expect(controller.state.tokensChainsCache['56'].data).toStrictEqual(
      sampleTwoChainState.tokensChainsCache['56'].data,
    );

    controller.destroy();
  });
});
