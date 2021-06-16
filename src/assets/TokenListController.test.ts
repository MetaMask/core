import { stub } from 'sinon';
import nock from 'nock';
import { ControllerMessenger } from '../ControllerMessenger';
import { NetworksChainId } from '../network/NetworkController';
import {
  TokenListController,
  TokenListStateChange,
  GetTokenListState,
} from './TokenListController';

const name = 'TokenListController';
const TOKEN_END_POINT_API = 'https://token-api.airswap-prod.codefi.network';

const sampleState = {
  tokens: {
    '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f': {
      address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
      symbol: 'SNX',
      decimals: 18,
      occurances: 11,
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
    },
    '0x514910771af9ca656af840dff83e8264ecf986ca': {
      address: '0x514910771af9ca656af840dff83e8264ecf986ca',
      symbol: 'LINK',
      decimals: 18,
      occurances: 11,
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
    },
    '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c': {
      address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
      symbol: 'BNT',
      decimals: 18,
      occurances: 11,
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
    },
  },
};
const sampleTokenList = [
  {
    address: '0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f',
    symbol: 'SNX',
    decimals: 18,
    occurances: 11,
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
  },
  {
    address: '0x514910771af9ca656af840dff83e8264ecf986ca',
    symbol: 'LINK',
    decimals: 18,
    occurances: 11,
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
  },
  {
    address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
    symbol: 'BNT',
    decimals: 18,
    occurances: 11,
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
  },
];

const sampleTokenMetaData = {
  address: '0x514910771af9ca656af840dff83e8264ecf986ca',
  symbol: 'LINK',
  decimals: 18,
  occurances: 11,
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
};
const existingState = {
  tokens: {
    '0x514910771af9ca656af840dff83e8264ecf986ca': {
      address: '0x514910771af9ca656af840dff83e8264ecf986ca',
      symbol: 'LINK',
      decimals: 18,
      occurances: 11,
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
    },
  },
};
const outdatedExistingState = {
  tokens: {
    '0x514910771af9ca656af840dff83e8264ecf986ca': {
      address: '0x514910771af9ca656af840dff83e8264ecf986ca',
      symbol: 'LINK',
      decimals: 18,
      occurances: 9,
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
  afterEach(() => {
    nock.cleanAll();
  });

  it('should set default state', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      messenger,
    });

    expect(controller.state).toStrictEqual({
      tokens: {},
    });

    controller.destroy();
  });

  it('should initialize with initial state', () => {
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      messenger,
      state: existingState,
    });
    expect(controller.state).toStrictEqual({
      tokens: {
        '0x514910771af9ca656af840dff83e8264ecf986ca': {
          address: '0x514910771af9ca656af840dff83e8264ecf986ca',
          symbol: 'LINK',
          decimals: 18,
          occurances: 11,
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
        },
      },
    });

    controller.destroy();
  });

  it('should not poll before being started', async () => {
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      interval: 100,
      messenger,
    });

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(controller.state.tokens).toStrictEqual({});

    controller.destroy();
  });

  it('should poll and update rate in the right interval', async () => {
    const tokenListMock = stub(TokenListController.prototype, 'fetchTokenList');

    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
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

  it('should update token list', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleTokenList)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      messenger,
      state: existingState,
    });
    expect(controller.state).toStrictEqual(existingState);
    await controller.start();
    expect(controller.state).toStrictEqual(sampleState);
    controller.destroy();
  });

  it('should update token list when the token property changes', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/tokens/${NetworksChainId.mainnet}`)
      .reply(200, sampleTokenList)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      messenger,
      state: outdatedExistingState,
    });
    expect(controller.state).toStrictEqual(outdatedExistingState);
    await controller.start();
    expect(controller.state).toStrictEqual(sampleState);
    controller.destroy();
  });
  it('should call syncTokens to update the token list in the backend and returns nothing', async () => {
    nock(TOKEN_END_POINT_API)
      .get(`/sync/${NetworksChainId.mainnet}`)
      .reply(200)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      messenger,
    });
    expect(await controller.syncTokens()).toBeUndefined();
    controller.destroy();
  });
  it('should return the metadata for a tokenAddress provided', async () => {
    nock(TOKEN_END_POINT_API)
      .get(
        `/tokens/${NetworksChainId.mainnet}?address=0x514910771af9ca656af840dff83e8264ecf986ca`,
      )
      .reply(200, sampleTokenMetaData)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      chainId: NetworksChainId.mainnet,
      messenger,
    });
    const tokenMeta = await controller.fetchTokenMetadata(
      '0x514910771af9ca656af840dff83e8264ecf986ca',
    );
    expect(tokenMeta).toStrictEqual(sampleTokenMetaData);

    controller.destroy();
  });
});
