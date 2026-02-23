import { deriveStateFromMetadata } from '@metamask/base-controller';
import {
  ChainId,
  NetworkType,
  convertHexToDecimal,
  toHex,
  InfuraNetworkType,
} from '@metamask/controller-utils';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import type { NetworkState } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import nock from 'nock';

import * as tokenService from './token-service';
import type {
  TokenListMap,
  TokenListState,
  TokenListControllerMessenger,
  DataCache,
} from './TokenListController';
import { TokenListController } from './TokenListController';
import { jestAdvanceTime } from '../../../tests/helpers';
import {
  buildCustomNetworkClientConfiguration,
  buildInfuraNetworkClientConfiguration,
  buildMockGetNetworkClientById,
} from '../../network-controller/tests/helpers';

const namespace = 'TokenListController';
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

const sampleMainnetTokensChainsCache =
  sampleMainnetTokenList.reduce<TokenListMap>((output, current) => {
    output[current.address] = current;
    return output;
  }, {});

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

const sampleBinanceTokensChainsCache =
  sampleBinanceTokenList.reduce<TokenListMap>((output, current) => {
    output[current.address] = current;
    return output;
  }, {});

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

const sampleSepoliaTokensChainCache =
  sampleSepoliaTokenList.reduce<TokenListMap>((output, current) => {
    output[current.address] = current;
    return output;
  }, {});

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
};

const expiredCacheExistingState: TokenListState = {
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
};

type AllTokenListControllerActions =
  MessengerActions<TokenListControllerMessenger>;

type AllTokenListControllerEvents =
  MessengerEvents<TokenListControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllTokenListControllerActions,
  AllTokenListControllerEvents
>;

// Mock storage for StorageService
const mockStorage = new Map<string, unknown>();

const getMessenger = (): RootMessenger => {
  const messenger = new Messenger({ namespace: MOCK_ANY_NAMESPACE });

  // Register StorageService mock handlers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (messenger as any).registerActionHandler(
    'StorageService:getItem',
    (controllerNamespace: string, key: string) => {
      const storageKey = `${controllerNamespace}:${key}`;
      const value = mockStorage.get(storageKey);
      return value ? { result: value } : {};
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (messenger as any).registerActionHandler(
    'StorageService:setItem',
    (controllerNamespace: string, key: string, value: unknown) => {
      const storageKey = `${controllerNamespace}:${key}`;
      mockStorage.set(storageKey, value);
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (messenger as any).registerActionHandler(
    'StorageService:getAllKeys',
    (controllerNamespace: string) => {
      const keys: string[] = [];
      const prefix = `${controllerNamespace}:`;
      mockStorage.forEach((_value, key) => {
        // Only include keys for this namespace
        if (key.startsWith(prefix)) {
          const keyWithoutNamespace = key.substring(prefix.length);
          keys.push(keyWithoutNamespace);
        }
      });
      return keys;
    },
  );

  return messenger;
};

const getRestrictedMessenger = (
  messenger: RootMessenger,
): TokenListControllerMessenger => {
  const tokenListControllerMessenger = new Messenger<
    typeof namespace,
    AllTokenListControllerActions,
    AllTokenListControllerEvents,
    RootMessenger
  >({
    namespace,
    parent: messenger,
  });
  messenger.delegate({
    messenger: tokenListControllerMessenger,
    actions: [
      'NetworkController:getNetworkClientById',
      'StorageService:getItem',
      'StorageService:setItem',
      'StorageService:getAllKeys',
    ],
    events: ['NetworkController:stateChange'],
  });
  return tokenListControllerMessenger;
};

describe('TokenListController', () => {
  beforeEach(() => {
    // Clear mock storage between tests
    mockStorage.clear();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should set default state', async () => {
    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      messenger: restrictedMessenger,
    });

    expect(controller.state).toStrictEqual({
      tokensChainsCache: {},
    });

    controller.destroy();
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should initialize with initial state', () => {
    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      messenger: restrictedMessenger,
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
    });

    controller.destroy();
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should not poll before being started', async () => {
    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      interval: 100,
      messenger: restrictedMessenger,
    });

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));

    expect(controller.state.tokensChainsCache).toStrictEqual({});
    controller.destroy();
  });

  it('should update tokensChainsCache state when network updates are passed via onNetworkStateChange callback', async () => {
    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleMainnetTokenList)
      .persist();

    jest.spyOn(Date, 'now').mockImplementation(() => 100);
    const selectedNetworkClientId = 'selectedNetworkClientId';
    const messenger = getMessenger();
    const getNetworkClientById = buildMockGetNetworkClientById({
      [selectedNetworkClientId]: buildCustomNetworkClientConfiguration({
        chainId: toHex(1337),
      }),
    });
    messenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      getNetworkClientById,
    );
    const restrictedMessenger = getRestrictedMessenger(messenger);
    let onNetworkStateChangeCallback!: (state: NetworkState) => void;
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      onNetworkStateChange: (cb) => (onNetworkStateChangeCallback = cb),
      interval: 100,
      messenger: restrictedMessenger,
    });
    // TODO: Either fix this lint violation or explain why it's necessary to ignore.
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    controller.start();
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    onNetworkStateChangeCallback({
      selectedNetworkClientId,
      networkConfigurationsByChainId: {},
      networksMetadata: {},
      // @ts-expect-error This property isn't used and will get removed later.
      providerConfig: {},
    });
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 500));

    expect(controller.state.tokensChainsCache).toStrictEqual({
      '0x1': {
        timestamp: 100,
        data: {
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
      },
      '0x539': { timestamp: 100, data: {} },
    });
    controller.destroy();
  });

  it('should poll and update rate in the right interval', async () => {
    const tokenListMock = jest
      .spyOn(TokenListController.prototype, 'fetchTokenList')
      .mockImplementation();

    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      interval: 100,
      messenger: restrictedMessenger,
    });
    await controller.start();

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(tokenListMock).toHaveBeenCalled();
    expect(tokenListMock).toHaveBeenCalledTimes(1);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(tokenListMock).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('should not poll after being stopped', async () => {
    const tokenListMock = jest
      .spyOn(TokenListController.prototype, 'fetchTokenList')
      .mockImplementation();

    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      interval: 100,
      messenger: restrictedMessenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(tokenListMock).toHaveBeenCalled();
    expect(tokenListMock).toHaveBeenCalledTimes(1);

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(tokenListMock).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('should poll correctly after being started, stopped, and started again', async () => {
    const tokenListMock = jest
      .spyOn(TokenListController.prototype, 'fetchTokenList')
      .mockImplementation();

    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);

    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      interval: 100,
      messenger: restrictedMessenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(tokenListMock).toHaveBeenCalled();
    expect(tokenListMock).toHaveBeenCalledTimes(1);

    await controller.start();

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(tokenListMock).toHaveBeenCalledTimes(2);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(tokenListMock).toHaveBeenCalledTimes(3);
    controller.destroy();
  });

  it('should call fetchTokenList on network that supports token detection', async () => {
    const tokenListMock = jest
      .spyOn(TokenListController.prototype, 'fetchTokenList')
      .mockImplementation();

    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      interval: 100,
      messenger: restrictedMessenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(tokenListMock).toHaveBeenCalled();
    controller.destroy();
  });

  it('should not call fetchTokenList on network that does not support token detection', async () => {
    const tokenListMock = jest
      .spyOn(TokenListController.prototype, 'fetchTokenList')
      .mockImplementation();

    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.sepolia,
      interval: 100,
      messenger: restrictedMessenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(tokenListMock).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('should update tokensChainsCache from api', async () => {
    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleMainnetTokenList)
      .persist();

    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      messenger: restrictedMessenger,
      interval: 750,
    });
    await controller.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));

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

    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      messenger: restrictedMessenger,
      interval: 100,
      state: existingState,
    });
    const pollingToken = controller.startPolling({ chainId: ChainId.mainnet });
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(controller.state.tokensChainsCache[toHex(1)].data).toStrictEqual(
      sampleSingleChainState.tokensChainsCache[toHex(1)].data,
    );
    controller.stopPollingByPollingToken(pollingToken);
  });

  it('should update token list when the token property changes', async () => {
    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleMainnetTokenList)
      .persist();

    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      messenger: restrictedMessenger,
      state: outdatedExistingState,
    });
    expect(controller.state).toStrictEqual(outdatedExistingState);
    await controller.start();

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

    const messenger = getMessenger();
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      messenger: restrictedMessenger,
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

  it('should update tokensChainsCache when the chainId change', async () => {
    nock(tokenService.TOKEN_END_POINT_API)
      .get(getTokensPath(ChainId.mainnet))
      .reply(200, sampleMainnetTokenList)
      .get(getTokensPath(ChainId.sepolia))
      .reply(200, {
        error: `ChainId ${convertHexToDecimal(
          ChainId.sepolia,
        )} is not supported`,
      })
      .get(getTokensPath(toHex(56)))
      .reply(200, sampleBinanceTokenList)
      .persist();
    const selectedCustomNetworkClientId = 'selectedCustomNetworkClientId';
    const messenger = getMessenger();
    const getNetworkClientById = buildMockGetNetworkClientById({
      [InfuraNetworkType.sepolia]: buildInfuraNetworkClientConfiguration(
        InfuraNetworkType.sepolia,
      ),
      [selectedCustomNetworkClientId]: buildCustomNetworkClientConfiguration({
        chainId: toHex(56),
      }),
    });
    messenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      getNetworkClientById,
    );
    const restrictedMessenger = getRestrictedMessenger(messenger);
    const controller = new TokenListController({
      chainId: ChainId.mainnet,
      messenger: restrictedMessenger,
      state: existingState,
      interval: 100,
    });
    expect(controller.state).toStrictEqual(existingState);
    await controller.start();

    expect(
      controller.state.tokensChainsCache[ChainId.mainnet].data,
    ).toStrictEqual(
      sampleTwoChainState.tokensChainsCache[ChainId.mainnet].data,
    );

    messenger.publish(
      'NetworkController:stateChange',
      {
        selectedNetworkClientId: InfuraNetworkType.sepolia,
        networkConfigurationsByChainId: {},
        networksMetadata: {},
        // @ts-expect-error This property isn't used and will get removed later.
        providerConfig: {},
      },
      [],
    );

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 500));

    expect(
      controller.state.tokensChainsCache[ChainId.mainnet].data,
    ).toStrictEqual(
      sampleTwoChainState.tokensChainsCache[ChainId.mainnet].data,
    );

    messenger.publish(
      'NetworkController:stateChange',
      {
        selectedNetworkClientId: selectedCustomNetworkClientId,
        networkConfigurationsByChainId: {},
        networksMetadata: {},
        // @ts-expect-error This property isn't used and will get removed later.
        providerConfig: {},
      },
      [],
    );

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 500));

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

  describe('startPolling', () => {
    const pollingIntervalTime = 1000;
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
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
      const messenger = getMessenger();
      messenger.registerActionHandler(
        'NetworkController:getNetworkClientById',
        jest.fn().mockReturnValue({
          configuration: {
            type: NetworkType.sepolia,
            chainId: ChainId.sepolia,
          },
        }),
      );
      const restrictedMessenger = getRestrictedMessenger(messenger);
      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
        state: expiredCacheExistingState,
        interval: pollingIntervalTime,
      });

      controller.startPolling({ chainId: ChainId.sepolia });
      await jestAdvanceTime({ duration: 0 });

      expect(fetchTokenListByChainIdSpy.mock.calls[0]).toStrictEqual(
        expect.arrayContaining([ChainId.sepolia]),
      );
    });

    it('should update tokenList state and tokensChainsCache', async () => {
      const startingState: TokenListState = {
        tokensChainsCache: {},
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

      const messenger = getMessenger();
      messenger.registerActionHandler(
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
      const restrictedMessenger = getRestrictedMessenger(messenger);
      const controller = new TokenListController({
        chainId: ChainId.sepolia,
        messenger: restrictedMessenger,
        state: startingState,
        interval: pollingIntervalTime,
      });

      expect(controller.state).toStrictEqual(startingState);

      // start polling for sepolia
      const pollingToken = controller.startPolling({
        chainId: ChainId.sepolia,
      });

      // wait a polling interval
      await jestAdvanceTime({ duration: pollingIntervalTime });

      expect(fetchTokenListByChainIdSpy).toHaveBeenCalledTimes(1);

      expect(controller.state.tokensChainsCache).toStrictEqual({
        [ChainId.sepolia]: {
          timestamp: expect.any(Number),
          data: sampleSepoliaTokensChainCache,
        },
      });
      controller.stopPollingByPollingToken(pollingToken);

      // start polling for binance
      controller.startPolling({
        chainId: '0x38',
      });
      await jestAdvanceTime({ duration: pollingIntervalTime });

      // expect fetchTokenListByChain to be called for binance, but not for sepolia
      // because the cache for the recently fetched sepolia token list is still valid
      expect(fetchTokenListByChainIdSpy).toHaveBeenCalledTimes(2);

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

  describe('metadata', () => {
    it('includes expected state in debug snapshots', () => {
      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: getRestrictedMessenger(getMessenger()),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        ),
      ).toMatchInlineSnapshot(`
        {
          "tokensChainsCache": {},
        }
      `);
    });

    it('includes expected state in state logs', () => {
      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: getRestrictedMessenger(getMessenger()),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('persists expected state', () => {
      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: getRestrictedMessenger(getMessenger()),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        ),
      ).toMatchInlineSnapshot(`{}`);
    });

    it('exposes expected state to UI', () => {
      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: getRestrictedMessenger(getMessenger()),
      });

      expect(
        deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        ),
      ).toMatchInlineSnapshot(`
        {
          "tokensChainsCache": {},
        }
      `);
    });
  });

  describe('StorageService migration', () => {
    // State changes after construction trigger debounced persistence
    it('should persist state changes to StorageService via debounced subscription', async () => {
      const messenger = getMessenger();
      const restrictedMessenger = getRestrictedMessenger(messenger);

      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
      });

      // Initialize the controller
      await controller.initialize();

      // Fetch tokens to trigger state change (which triggers persistence)
      nock(tokenService.TOKEN_END_POINT_API)
        .get(getTokensPath(ChainId.mainnet))
        .reply(200, sampleMainnetTokenList);

      await controller.fetchTokenList(ChainId.mainnet);

      // Wait for debounced persistence to complete (500ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 600));

      const chainStorageKey = `tokensChainsCache:${ChainId.mainnet}`;
      const { result } = await messenger.call(
        'StorageService:getItem',
        'TokenListController',
        chainStorageKey,
      );

      expect(result).toBeDefined();
      const resultCache = result as DataCache;
      expect(resultCache.data).toBeDefined();
      expect(resultCache.timestamp).toBeDefined();

      controller.destroy();
    });

    it('should not overwrite StorageService if it already has data', async () => {
      const messenger = getMessenger();
      const restrictedMessenger = getRestrictedMessenger(messenger);

      // Pre-populate StorageService with existing data (per-chain file)
      const existingChainData: DataCache = {
        data: sampleMainnetTokensChainsCache,
        timestamp: Date.now(),
      };
      const chainStorageKey = `tokensChainsCache:${ChainId.mainnet}`;
      await messenger.call(
        'StorageService:setItem',
        'TokenListController',
        chainStorageKey,
        existingChainData,
      );

      // Initialize with different state data
      const stateWithDifferentData = {
        tokensChainsCache: {
          [ChainId.mainnet]: {
            data: sampleMainnetTokensChainsCache,
            timestamp: Date.now(),
          },
        },
      };

      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
        state: stateWithDifferentData,
      });

      // Initialize the controller to trigger storage migration logic
      await controller.initialize();

      // Verify StorageService still has original data (not overwritten)
      const { result } = await messenger.call(
        'StorageService:getItem',
        'TokenListController',
        chainStorageKey,
      );

      expect(result).toStrictEqual(existingChainData);
      const resultCache = result as DataCache;
      expect(resultCache.data).toStrictEqual(existingChainData.data);

      controller.destroy();
    });

    it('should not migrate when state has empty tokensChainsCache', async () => {
      const messenger = getMessenger();
      const restrictedMessenger = getRestrictedMessenger(messenger);

      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
        state: { tokensChainsCache: {} },
      });

      // Initialize the controller to trigger migration logic
      await controller.initialize();

      // Verify nothing was saved to StorageService (check no per-chain files)
      const allKeys = await messenger.call(
        'StorageService:getAllKeys',
        'TokenListController',
      );
      const cacheKeys = allKeys.filter((key) =>
        key.startsWith('tokensChainsCache:'),
      );

      expect(cacheKeys).toHaveLength(0);

      controller.destroy();
    });

    it('should save and load tokensChainsCache from StorageService', async () => {
      const messenger = getMessenger();
      const restrictedMessenger = getRestrictedMessenger(messenger);

      // Create controller and fetch tokens (which saves to storage)
      const controller1 = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
      });
      await controller1.initialize();

      nock(tokenService.TOKEN_END_POINT_API)
        .get(getTokensPath(ChainId.mainnet))
        .reply(200, sampleMainnetTokenList);

      await controller1.fetchTokenList(ChainId.mainnet);
      const savedCache = controller1.state.tokensChainsCache;

      // Wait for debounced persistence to complete (500ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 600));

      controller1.destroy();

      // Verify data is in StorageService (per-chain file)
      const chainStorageKey = `tokensChainsCache:${ChainId.mainnet}`;
      const { result } = await messenger.call(
        'StorageService:getItem',
        'TokenListController',
        chainStorageKey,
      );

      expect(result).toBeDefined();
      expect(result).toStrictEqual(savedCache[ChainId.mainnet]);
    });

    it('should save tokensChainsCache to StorageService when fetching tokens', async () => {
      const messenger = getMessenger();
      const restrictedMessenger = getRestrictedMessenger(messenger);

      nock(tokenService.TOKEN_END_POINT_API)
        .get(getTokensPath(ChainId.mainnet))
        .reply(200, sampleMainnetTokenList);

      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
      });
      await controller.initialize();

      await controller.fetchTokenList(ChainId.mainnet);

      // Wait for debounced persistence to complete (500ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Verify data was saved to StorageService (per-chain file)
      const chainStorageKey = `tokensChainsCache:${ChainId.mainnet}`;
      const { result } = await messenger.call(
        'StorageService:getItem',
        'TokenListController',
        chainStorageKey,
      );

      expect(result).toBeDefined();
      const resultCache = result as DataCache;
      expect(resultCache.data).toBeDefined();
      expect(resultCache.timestamp).toBeDefined();

      controller.destroy();
    });

    it('should not save to StorageService before initialization', async () => {
      const messenger = getMessenger();
      const restrictedMessenger = getRestrictedMessenger(messenger);

      // Create controller and fetch tokens
      const controller1 = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
      });
      // skip initialization

      nock(tokenService.TOKEN_END_POINT_API)
        .get(getTokensPath(ChainId.mainnet))
        .reply(200, sampleMainnetTokenList);

      await controller1.fetchTokenList(ChainId.mainnet);
      expect(
        controller1.state.tokensChainsCache[ChainId.mainnet],
      ).toBeDefined();

      // Wait for debounced persistence to complete (500ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 600));

      controller1.destroy();

      // Verify data is in StorageService (per-chain file)
      const chainStorageKey = `tokensChainsCache:${ChainId.mainnet}`;
      const { result } = await messenger.call(
        'StorageService:getItem',
        'TokenListController',
        chainStorageKey,
      );

      expect(result).toBeUndefined();
    });

    it('should save data updated before initialization to StorageService', async () => {
      // Setup stale mainnet data in storage
      const validChainData: DataCache = {
        data: sampleMainnetTokensChainsCache,
        timestamp: 1,
      };
      mockStorage.set(
        `TokenListController:tokensChainsCache:${ChainId.mainnet}`,
        validChainData,
      );
      const messenger = getMessenger();
      const restrictedMessenger = getRestrictedMessenger(messenger);

      // Create controller with delayed initialization, and fetch tokens
      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
      });

      nock(tokenService.TOKEN_END_POINT_API)
        .get(getTokensPath(ChainId.mainnet))
        .reply(200, sampleMainnetTokenList);
      nock(tokenService.TOKEN_END_POINT_API)
        .get(getTokensPath(toHex(56)))
        .reply(200, sampleBinanceTokenList);

      await controller.fetchTokenList(ChainId.mainnet);
      await controller.fetchTokenList(toHex(56));
      const savedCache = controller.state.tokensChainsCache;
      expect(savedCache[ChainId.mainnet]).toBeDefined();
      expect(savedCache[toHex(56)]).toBeDefined();
      await controller.initialize();

      // Wait for debounced persistence to complete (500ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 600));

      controller.destroy();

      // Verify data is in StorageService (per-chain file)
      const mainnetStorageKey = `tokensChainsCache:${ChainId.mainnet}`;
      const { result: mainnetResult } = await messenger.call(
        'StorageService:getItem',
        'TokenListController',
        mainnetStorageKey,
      );
      const binanceStorageKey = `tokensChainsCache:${toHex(56)}`;
      const { result: binanceResult } = await messenger.call(
        'StorageService:getItem',
        'TokenListController',
        binanceStorageKey,
      );

      // Confirm fresh results overwrite stale
      expect(mainnetResult).toBeDefined();
      expect(mainnetResult).toStrictEqual(savedCache[ChainId.mainnet]);
      // Confirm results not in storage previously are persisted
      expect(binanceResult).toBeDefined();
      expect(binanceResult).toStrictEqual(savedCache[toHex(56)]);
    });

    it('should handle errors when loading individual chain cache files', async () => {
      // Pre-populate storage with two chains
      const validChainData: DataCache = {
        data: sampleMainnetTokensChainsCache,
        timestamp: Date.now(),
      };
      const binanceChainData: DataCache = {
        data: sampleBinanceTokensChainsCache,
        timestamp: Date.now(),
      };

      mockStorage.set(
        `TokenListController:tokensChainsCache:${ChainId.mainnet}`,
        validChainData,
      );
      mockStorage.set(
        `TokenListController:tokensChainsCache:${ChainId.goerli}`,
        binanceChainData,
      );

      // Create messenger with getItem that returns error for goerli
      const messengerWithErrors = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      // Register getItem handler that returns error for goerli
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messengerWithErrors as any).registerActionHandler(
        'StorageService:getItem',
        (controllerNamespace: string, key: string) => {
          if (key === `tokensChainsCache:${ChainId.goerli}`) {
            return { error: 'Failed to load chain data' };
          }
          const storageKey = `${controllerNamespace}:${key}`;
          const value = mockStorage.get(storageKey);
          return value ? { result: value } : {};
        },
      );

      // Register other handlers normally
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messengerWithErrors as any).registerActionHandler(
        'StorageService:setItem',
        (controllerNamespace: string, key: string, value: unknown) => {
          const storageKey = `${controllerNamespace}:${key}`;
          mockStorage.set(storageKey, value);
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messengerWithErrors as any).registerActionHandler(
        'StorageService:getAllKeys',
        (controllerNamespace: string) => {
          const keys: string[] = [];
          const prefix = `${controllerNamespace}:`;
          mockStorage.forEach((_value, key) => {
            // Only include keys for this namespace
            if (key.startsWith(prefix)) {
              const keyWithoutNamespace = key.substring(prefix.length);
              keys.push(keyWithoutNamespace);
            }
          });
          return keys;
        },
      );

      const restrictedMessenger = getRestrictedMessenger(messengerWithErrors);

      // Mock console.error to verify it's called for the error case
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
      });

      // Initialize the controller to load from storage
      await controller.initialize();

      // Verify that mainnet chain loaded successfully
      expect(controller.state.tokensChainsCache[ChainId.mainnet]).toBeDefined();
      expect(
        controller.state.tokensChainsCache[ChainId.mainnet].data,
      ).toStrictEqual(sampleMainnetTokensChainsCache);

      // Verify that goerli chain is not in the cache (due to error)
      expect(
        controller.state.tokensChainsCache[ChainId.goerli],
      ).toBeUndefined();

      // Verify console.error was called with the error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `TokenListController: Error loading cache for ${ChainId.goerli}:`,
        'Failed to load chain data',
      );

      consoleErrorSpy.mockRestore();
      controller.destroy();
    });

    it('should handle StorageService errors when saving cache', async () => {
      // Create a messenger with setItem that throws errors
      const messengerWithErrors = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      // Register all handlers, but make setItem throw
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messengerWithErrors as any).registerActionHandler(
        'StorageService:getItem',
        (controllerNamespace: string, key: string) => {
          const storageKey = `${controllerNamespace}:${key}`;
          const value = mockStorage.get(storageKey);
          return value ? { result: value } : {};
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messengerWithErrors as any).registerActionHandler(
        'StorageService:setItem',
        () => {
          throw new Error('Storage write failed');
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messengerWithErrors as any).registerActionHandler(
        'StorageService:getAllKeys',
        (controllerNamespace: string) => {
          const keys: string[] = [];
          const prefix = `${controllerNamespace}:`;
          mockStorage.forEach((_value, key) => {
            // Only include keys for this namespace
            if (key.startsWith(prefix)) {
              const keyWithoutNamespace = key.substring(prefix.length);
              keys.push(keyWithoutNamespace);
            }
          });
          return keys;
        },
      );

      const restrictedMessenger = getRestrictedMessenger(messengerWithErrors);

      // Mock console.error to verify it's called for save errors
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
      });

      // Initialize the controller
      await controller.initialize();

      // Try to fetch tokens - this should trigger save which will fail
      nock(tokenService.TOKEN_END_POINT_API)
        .get(getTokensPath(ChainId.mainnet))
        .reply(200, sampleMainnetTokenList);

      await controller.fetchTokenList(ChainId.mainnet);

      // Wait for debounced persistence to attempt (and fail)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Verify console.error was called with the save error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `TokenListController: Failed to save cache for ${ChainId.mainnet}:`,
        expect.any(Error),
      );

      // Verify state was still updated even though save failed
      expect(controller.state.tokensChainsCache[ChainId.mainnet]).toBeDefined();

      consoleErrorSpy.mockRestore();
      controller.destroy();
    });

    it('should handle errors during debounced persistence', async () => {
      // Create messenger where setItem throws to cause persistence to fail
      const messengerWithErrors = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      // Register getItem to return empty
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messengerWithErrors as any).registerActionHandler(
        'StorageService:getItem',
        () => {
          return {};
        },
      );

      // Register setItem to throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messengerWithErrors as any).registerActionHandler(
        'StorageService:setItem',
        () => {
          throw new Error('Failed to save to storage');
        },
      );

      // Register getAllKeys normally
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (messengerWithErrors as any).registerActionHandler(
        'StorageService:getAllKeys',
        () => [],
      );

      const restrictedMessenger = getRestrictedMessenger(messengerWithErrors);

      // Mock console.error to verify it's called for persistence errors
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
      });

      // Initialize the controller
      await controller.initialize();

      // Fetch tokens to trigger state change (which triggers persistence)
      nock(tokenService.TOKEN_END_POINT_API)
        .get(getTokensPath(ChainId.mainnet))
        .reply(200, sampleMainnetTokenList);

      await controller.fetchTokenList(ChainId.mainnet);

      // Wait for debounced persistence to attempt (and fail)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Verify console.error was called with the save error (from #saveChainCacheToStorage)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        `TokenListController: Failed to save cache for ${ChainId.mainnet}:`,
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
      controller.destroy();
    });

    it('should only load cache from storage once even when fetchTokenList is called multiple times', async () => {
      // Pre-populate storage with cached data
      const chainData: DataCache = {
        data: sampleMainnetTokensChainsCache,
        timestamp: Date.now(),
      };
      mockStorage.set(
        `TokenListController:tokensChainsCache:${ChainId.mainnet}`,
        chainData,
      );

      // Track how many times getItem is called
      let getItemCallCount = 0;
      let getAllKeysCallCount = 0;

      const trackingMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trackingMessenger as any).registerActionHandler(
        'StorageService:getItem',
        (controllerNamespace: string, key: string) => {
          getItemCallCount += 1;
          const storageKey = `${controllerNamespace}:${key}`;
          const value = mockStorage.get(storageKey);
          return value ? { result: value } : {};
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trackingMessenger as any).registerActionHandler(
        'StorageService:setItem',
        (controllerNamespace: string, key: string, value: unknown) => {
          const storageKey = `${controllerNamespace}:${key}`;
          mockStorage.set(storageKey, value);
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trackingMessenger as any).registerActionHandler(
        'StorageService:getAllKeys',
        (controllerNamespace: string) => {
          getAllKeysCallCount += 1;
          const keys: string[] = [];
          const prefix = `${controllerNamespace}:`;
          mockStorage.forEach((_value, key) => {
            if (key.startsWith(prefix)) {
              const keyWithoutNamespace = key.substring(prefix.length);
              keys.push(keyWithoutNamespace);
            }
          });
          return keys;
        },
      );

      const restrictedMessenger = getRestrictedMessenger(trackingMessenger);

      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
      });

      // Initialize the controller
      await controller.initialize();

      // Record call counts after initialization
      const getItemCallsAfterInit = getItemCallCount;
      const getAllKeysCallsAfterInit = getAllKeysCallCount;

      // getAllKeys should be called once during init (for loading cache)
      expect(getAllKeysCallsAfterInit).toBe(1);
      // getItem should be called once for the cached chain during load
      expect(getItemCallsAfterInit).toBe(1);

      // Now call fetchTokenList multiple times
      nock(tokenService.TOKEN_END_POINT_API)
        .get(getTokensPath(ChainId.mainnet))
        .reply(200, sampleMainnetTokenList)
        .persist();

      await controller.fetchTokenList(ChainId.mainnet);
      await controller.fetchTokenList(ChainId.mainnet);
      await controller.fetchTokenList(ChainId.mainnet);

      // Verify getAllKeys was NOT called again after initialization
      // (getItem may be called for other reasons, but getAllKeys is only used in load/migrate)
      expect(getAllKeysCallCount).toBe(getAllKeysCallsAfterInit);

      controller.destroy();
    });

    it('should NOT re-persist data loaded from storage during initialization', async () => {
      // Pre-populate storage with cached data
      const chainData: DataCache = {
        data: sampleMainnetTokensChainsCache,
        timestamp: Date.now(),
      };
      mockStorage.set(
        `TokenListController:tokensChainsCache:${ChainId.mainnet}`,
        chainData,
      );

      // Track how many times setItem is called
      let setItemCallCount = 0;

      const trackingMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trackingMessenger as any).registerActionHandler(
        'StorageService:getItem',
        (controllerNamespace: string, key: string) => {
          const storageKey = `${controllerNamespace}:${key}`;
          const value = mockStorage.get(storageKey);
          return value ? { result: value } : {};
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trackingMessenger as any).registerActionHandler(
        'StorageService:setItem',
        (controllerNamespace: string, key: string, value: unknown) => {
          setItemCallCount += 1;
          const storageKey = `${controllerNamespace}:${key}`;
          mockStorage.set(storageKey, value);
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trackingMessenger as any).registerActionHandler(
        'StorageService:getAllKeys',
        (controllerNamespace: string) => {
          const keys: string[] = [];
          const prefix = `${controllerNamespace}:`;
          mockStorage.forEach((_value, key) => {
            if (key.startsWith(prefix)) {
              const keyWithoutNamespace = key.substring(prefix.length);
              keys.push(keyWithoutNamespace);
            }
          });
          return keys;
        },
      );

      const restrictedMessenger = getRestrictedMessenger(trackingMessenger);

      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
      });

      // Initialize the controller - this should load from storage
      await controller.initialize();

      // Verify data was loaded correctly
      expect(controller.state.tokensChainsCache[ChainId.mainnet]).toBeDefined();
      expect(
        controller.state.tokensChainsCache[ChainId.mainnet].data,
      ).toStrictEqual(sampleMainnetTokensChainsCache);

      // Wait longer than the debounce delay (500ms) to ensure any scheduled
      // persistence would have executed
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Verify setItem was NOT called - loaded data should not be re-persisted
      expect(setItemCallCount).toBe(0);

      controller.destroy();
    });

    it('should persist initial state chains when storage has different chains', async () => {
      // Pre-populate storage with data for chain B (different from initial state)
      const chainBData: DataCache = {
        data: sampleBinanceTokensChainsCache,
        timestamp: Date.now() - 1000, // Older timestamp
      };
      mockStorage.set(
        `TokenListController:tokensChainsCache:${ChainId['bsc-mainnet']}`,
        chainBData,
      );

      // Track setItem calls and which chains are persisted
      const persistedChains: string[] = [];

      const trackingMessenger = new Messenger({
        namespace: MOCK_ANY_NAMESPACE,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trackingMessenger as any).registerActionHandler(
        'StorageService:getItem',
        (controllerNamespace: string, key: string) => {
          const storageKey = `${controllerNamespace}:${key}`;
          const value = mockStorage.get(storageKey);
          return value ? { result: value } : {};
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trackingMessenger as any).registerActionHandler(
        'StorageService:setItem',
        (controllerNamespace: string, key: string, value: unknown) => {
          persistedChains.push(key);
          const storageKey = `${controllerNamespace}:${key}`;
          mockStorage.set(storageKey, value);
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (trackingMessenger as any).registerActionHandler(
        'StorageService:getAllKeys',
        (controllerNamespace: string) => {
          const keys: string[] = [];
          const prefix = `${controllerNamespace}:`;
          mockStorage.forEach((_value, key) => {
            if (key.startsWith(prefix)) {
              const keyWithoutNamespace = key.substring(prefix.length);
              keys.push(keyWithoutNamespace);
            }
          });
          return keys;
        },
      );

      const restrictedMessenger = getRestrictedMessenger(trackingMessenger);

      // Create initial state with chain A (mainnet) - NOT in storage
      const chainAData: DataCache = {
        data: sampleMainnetTokensChainsCache,
        timestamp: Date.now(),
      };

      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
        state: {
          tokensChainsCache: {
            [ChainId.mainnet]: chainAData,
          },
        },
      });

      // Initialize - this should load chain B from storage AND schedule chain A for persistence
      await controller.initialize();

      // Verify both chains are in state
      expect(controller.state.tokensChainsCache[ChainId.mainnet]).toBeDefined();
      expect(
        controller.state.tokensChainsCache[ChainId['bsc-mainnet']],
      ).toBeDefined();

      // Wait for debounced persistence to complete (500ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Verify chain A (mainnet) was persisted since it was in initial state but not in storage
      expect(persistedChains).toContain(`tokensChainsCache:${ChainId.mainnet}`);

      // Verify chain B (bsc-mainnet) was NOT re-persisted since it was loaded from storage
      expect(persistedChains).not.toContain(
        `tokensChainsCache:${ChainId['bsc-mainnet']}`,
      );

      controller.destroy();
    });
  });
  describe('deprecated methods', () => {
    it('should restart polling when restart() is called', async () => {
      const messenger = getMessenger();
      const restrictedMessenger = getRestrictedMessenger(messenger);

      const controller = new TokenListController({
        chainId: ChainId.mainnet,
        messenger: restrictedMessenger,
        interval: 100,
      });

      nock(tokenService.TOKEN_END_POINT_API)
        .get(getTokensPath(ChainId.mainnet))
        .reply(200, sampleMainnetTokenList)
        .persist();

      // Start initial polling
      await controller.start();

      // Wait for first fetch
      await new Promise((resolve) => setTimeout(resolve, 150));

      const initialCache = { ...controller.state.tokensChainsCache };
      expect(initialCache[ChainId.mainnet]).toBeDefined();

      // Restart polling
      await controller.restart();

      // Wait for another fetch
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify polling continued
      expect(controller.state.tokensChainsCache[ChainId.mainnet]).toBeDefined();

      controller.destroy();
    });
  });
});

/**
 * Construct the path used to fetch tokens that we can pass to `nock`.
 *
 * @param chainId - The chain ID.
 * @returns The constructed path.
 */
function getTokensPath(chainId: Hex): string {
  return `/tokens/${convertHexToDecimal(
    chainId,
  )}?occurrenceFloor=3&includeNativeAssets=false&includeTokenFees=false&includeAssetType=false&includeERC20Permit=false&includeStorage=false&includeRwaData=true`;
}
