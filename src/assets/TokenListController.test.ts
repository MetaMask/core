import { stub } from 'sinon';
import nock from 'nock';
import contractmap from '@metamask/contract-metadata';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  NetworkController,
  NetworksChainId,
} from '../network/NetworkController';
import { PreferencesController } from '../user/PreferencesController';
import {
  TokenListController,
  TokenListStateChange,
  GetTokenListState,
} from './TokenListController';

const name = 'TokenListController';
const TOKEN_END_POINT_API = 'https://token-api.airswap-prod.codefi.network';
const timestamp = Date.now();

const staticTokenList: any = {};
for (const tokenAddress in contractmap) {
  const { erc20, logo, ...token } = contractmap[tokenAddress];
  if (erc20) {
    staticTokenList[tokenAddress] = { ...token, iconUrl: logo };
  }
}
const sampleMainnetTokenList = [
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
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
    name: 'Synthetix',
    iconUrl: 'https://airswap-token-images.s3.amazonaws.com/SNX.png',
  },
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
    iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
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
    iconUrl: 'https://s3.amazonaws.com/airswap-token-images/BNT.png',
  },
];
const sampleWithDuplicateSymbols = [
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
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
    name: 'Synthetix',
    iconUrl: 'https://airswap-token-images.s3.amazonaws.com/SNX.png',
  },
  {
    address: '0x514910771af9ca656af840dff83e8264ecf986ca',
    symbol: 'SNX',
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
    iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
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
    iconUrl: 'https://s3.amazonaws.com/airswap-token-images/BNT.png',
  },
];
const sampleWithLessThan2Occurences = [
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
    decimals: 18,
    occurrences: 2,
    aggregators: ['paraswap', 'pmm'],
    name: 'Synthetix',
    iconUrl: 'https://airswap-token-images.s3.amazonaws.com/SNX.png',
  },
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
    iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
  },
  {
    address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
    symbol: 'BNT',
    decimals: 18,
    occurrences: 1,
    aggregators: ['paraswap'],
    name: 'Bancor',
    iconUrl: 'https://s3.amazonaws.com/airswap-token-images/BNT.png',
  },
];
const sampleBinanceTokenList = [
  {
    address: '0x7083609fce4d1d8dc0c979aab8c869ea2c873402',
    symbol: 'DOT',
    decimals: 18,
    name: 'PolkadotBEP2',
    aggregators: ['binanceDex', 'oneInch', 'pancake', 'swipe', 'venus'],
    occurrences: 5,
  },
  {
    address: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3',
    symbol: 'DAI',
    decimals: 18,
    name: 'DaiBEP2',
    aggregators: ['binanceDex', 'oneInch', 'pancake', 'swipe', 'venus'],
    occurrences: 5,
  },
];
const sampleSingleChainState = {
  tokenList: {
    '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': {
      address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
      symbol: 'SNX',
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
      name: 'Synthetix',
      iconUrl: 'https://airswap-token-images.s3.amazonaws.com/SNX.png',
    },
    '0x514910771af9ca656af840dff83e8264ecf986ca': {
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
      iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
    },
    '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c': {
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
      iconUrl: 'https://s3.amazonaws.com/airswap-token-images/BNT.png',
    },
  },
  tokensChainsCache: {
    '1': {
      timestamp,
      data: sampleMainnetTokenList,
    },
  },
};

const sampleTwoChainState = {
  tokenList: {
    '0x7083609fce4d1d8dc0c979aab8c869ea2c873402': {
      address: '0x7083609fce4d1d8dc0c979aab8c869ea2c873402',
      symbol: 'DOT',
      decimals: 18,
      name: 'PolkadotBEP2',
      aggregators: ['binanceDex', 'oneInch', 'pancake', 'swipe', 'venus'],
      occurrences: 5,
    },
    '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3': {
      address: '0x1af3f329e8be154074d8769d1ffa4ee058b1dbc3',
      symbol: 'DAI',
      decimals: 18,
      name: 'DaiBEP2',
      aggregators: ['binanceDex', 'oneInch', 'pancake', 'swipe', 'venus'],
      occurrences: 5,
    },
  },
  tokensChainsCache: {
    '1': {
      timestamp,
      data: sampleMainnetTokenList,
    },
    '56': {
      timestamp: timestamp + 150,
      data: sampleBinanceTokenList,
    },
  },
};

const sampleTokenMetaData = {
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
  iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
};

const existingState = {
  tokenList: {
    '0x514910771af9ca656af840dff83e8264ecf986ca': {
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
      iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
    },
  },
  tokensChainsCache: {
    '1': {
      timestamp,
      data: sampleMainnetTokenList,
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
      iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
    },
  },
  tokensChainsCache: {
    '1': {
      timestamp,
      data: sampleMainnetTokenList,
    },
  },
};

const expiredCacheExistingState = {
  tokenList: {
    '0x514910771af9ca656af840dff83e8264ecf986ca': {
      address: '0x514910771af9ca656af840dff83e8264ecf986ca',
      symbol: 'LINK',
      decimals: 18,
      occurrences: 9,
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
      ],
      name: 'Chainlink',
      iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
    },
  },
  tokensChainsCache: {
    '1': {
      timestamp: timestamp - 1800000,
      data: [
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
          iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
        },
      ],
    },
  },
};

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
  let preferences: PreferencesController;
  beforeEach(() => {
    network = new NetworkController();
    preferences = new PreferencesController();
  });
  afterEach(() => {
    nock.cleanAll();
  });

  it('should set default state', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
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
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
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
          iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
        },
      },
      tokensChainsCache: {
        '1': {
          timestamp,
          data: sampleMainnetTokenList,
        },
      },
    });

    controller.destroy();
  });

  it('should not poll before being started', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      interval: 100,
      messenger,
    });

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(controller.state.tokenList).toStrictEqual({});

    controller.destroy();
  });

  it('should poll and update rate in the right interval', async () => {
    const tokenListMock = stub(TokenListController.prototype, 'fetchTokenList');

    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
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
    tokenListMock.restore();
  });

  it('should not poll after being stopped', async () => {
    const tokenListMock = stub(TokenListController.prototype, 'fetchTokenList');

    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
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
    tokenListMock.restore();
  });

  it('should poll correctly after being started, stopped, and started again', async () => {
    const tokenListMock = stub(TokenListController.prototype, 'fetchTokenList');

    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
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
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
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
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
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
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      messenger,
      state: existingState,
    });
    expect(controller.state).toStrictEqual(existingState);
    await controller.start();
    expect(controller.state).toStrictEqual(sampleSingleChainState);
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
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      messenger,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual({
      '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c': {
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
        iconUrl: 'https://s3.amazonaws.com/airswap-token-images/BNT.png',
      },
    });
    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(sampleWithDuplicateSymbols);
    controller.destroy();
  });

  it('should update token list after removing data less than 2 occurrences', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleWithLessThan2Occurences)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      messenger,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual({
      '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': {
        address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
        symbol: 'SNX',
        decimals: 18,
        occurrences: 2,
        aggregators: ['paraswap', 'pmm'],
        name: 'Synthetix',
        iconUrl: 'https://airswap-token-images.s3.amazonaws.com/SNX.png',
      },
      '0x514910771af9ca656af840dff83e8264ecf986ca': {
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
        iconUrl: 'https://s3.amazonaws.com/airswap-token-images/LINK.png',
      },
    });
    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(sampleWithLessThan2Occurences);
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
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      messenger,
      state: outdatedExistingState,
    });
    expect(controller.state).toStrictEqual(outdatedExistingState);
    await controller.start();
    expect(controller.state).toStrictEqual(sampleSingleChainState);
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
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
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
      .get(`/tokens/56`)
      .reply(200, sampleBinanceTokenList)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      messenger,
      state: existingState,
      interval: 100,
    });
    expect(controller.state).toStrictEqual(existingState);
    await controller.start();
    expect(controller.state).toStrictEqual(sampleSingleChainState);
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

  it('should use static token list when useStaticTokenList flag is set to true', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: true,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      messenger,
      state: existingState,
      interval: 100,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual(staticTokenList);
    expect(controller.state.tokensChainsCache).toStrictEqual({});

    controller.destroy();
  });

  it('should switch between static and dynamic list based on the preference change', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleMainnetTokenList)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      messenger,
      interval: 100,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );

    preferences.update({
      useStaticTokenList: true,
    });
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 50));
    expect(controller.state.tokenList).toStrictEqual(staticTokenList);
    expect(controller.state.tokensChainsCache).toStrictEqual({});

    preferences.update({
      useStaticTokenList: false,
    });
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 50));
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );
    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(sampleMainnetTokenList);

    controller.destroy();
  });

  it('should switch between static and dynamic list when the preference change after network change', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleMainnetTokenList)
      .get(`/tokens/56`)
      .reply(200, sampleBinanceTokenList)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      messenger,
      interval: 100,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );
    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet].data,
    ).toStrictEqual(sampleMainnetTokenList);

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
    ).toStrictEqual(sampleMainnetTokenList);
    expect(controller.state.tokensChainsCache['56'].data).toStrictEqual(
      sampleBinanceTokenList,
    );

    preferences.update({
      useStaticTokenList: true,
    });
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 10));
    expect(controller.state.tokenList).toStrictEqual(staticTokenList);
    expect(controller.state.tokensChainsCache).toStrictEqual({});

    preferences.update({
      useStaticTokenList: false,
    });
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 10));
    expect(controller.state.tokenList).toStrictEqual(
      sampleTwoChainState.tokenList,
    );
    expect(
      controller.state.tokensChainsCache[NetworksChainId.mainnet],
    ).toBeUndefined();
    expect(controller.state.tokensChainsCache['56'].data).toStrictEqual(
      sampleBinanceTokenList,
    );

    controller.destroy();
  });

  it('should call syncTokens to update the token list in the backend and clears the cache for the next fetch', async () => {
    const tokenListBeforeSync = [
      {
        address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
        symbol: 'SNX',
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
        name: 'Synthetix',
        iconUrl: 'https://airswap-token-images.s3.amazonaws.com/SNX.png',
      },
    ];
    nock(TOKEN_END_POINT_API)
      .get(`/sync/${NetworksChainId.mainnet}`)
      .reply(200)
      .persist();

    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .once()
      .reply(200, tokenListBeforeSync);

    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleMainnetTokenList)
      .persist();

    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      messenger,
      interval: 200,
    });
    await controller.start();
    expect(controller.state.tokenList).toStrictEqual({
      '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': {
        address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
        symbol: 'SNX',
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
        name: 'Synthetix',
        iconUrl: 'https://airswap-token-images.s3.amazonaws.com/SNX.png',
      },
    });
    expect(await controller.syncTokens()).toBeUndefined();
    expect(controller.state.tokensChainsCache['1']).toStrictEqual({
      timestamp: 0,
      data: [],
    });
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 300));
    expect(controller.state.tokenList).toStrictEqual(
      sampleSingleChainState.tokenList,
    );
    controller.destroy();
  });

  it('should return the metadata for a tokenAddress provided', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .query({ address: '0x514910771af9ca656af840dff83e8264ecf986ca' })
      .reply(200, sampleTokenMetaData)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      useStaticTokenList: false,
      onNetworkStateChange: (listener) => network.subscribe(listener),
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      messenger,
    });
    const tokenMeta = await controller.fetchTokenMetadata(
      '0x514910771af9ca656af840dff83e8264ecf986ca',
    );
    expect(tokenMeta).toStrictEqual(sampleTokenMetaData);

    controller.destroy();
  });
});
