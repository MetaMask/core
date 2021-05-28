import { stub } from 'sinon';
import nock from 'nock';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  TokenListController,
  TokenListStateChange,
  GetTokenListState,
} from './TokenListController';

const name = 'TokenListController';
const sampleState = {
  tokens: {
    '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd': {
      address: '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd',
      symbol: 'LRC',
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
    '0x408e41876cccdc0f92210600ef50372656052a38': {
      address: '0x408e41876cccdc0f92210600ef50372656052a38',
      symbol: 'REN',
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
    address: '0xbbbbca6a901c926f240b89eacb641d8aec7aeafd',
    symbol: 'LRC',
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
    address: '0x408e41876cccdc0f92210600ef50372656052a38',
    symbol: 'REN',
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
      interval: 100,
      messenger,
    });

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(controller.state.tokens).toStrictEqual({});

    controller.destroy();
  });

  it('should poll and update rate in the right interval', async () => {
    const mock = stub(TokenListController.prototype, 'fetchTokenList');

    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      interval: 100,
      messenger,
    });
    await controller.start();

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(mock.calledOnce).toBe(true);
    expect(mock.calledTwice).toBe(false);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(mock.calledTwice).toBe(true);

    controller.destroy();
    mock.restore();
  });

  it('should not poll after being stopped', async () => {
    const mock = stub(TokenListController.prototype, 'fetchTokenList');
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      interval: 100,
      messenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(mock.called).toBe(true);
    expect(mock.calledTwice).toBe(false);

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(mock.calledTwice).toBe(false);

    controller.destroy();
    mock.restore();
  });

  it('should poll correctly after being started, stopped, and started again', async () => {
    const mock = stub(TokenListController.prototype, 'fetchTokenList');
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      interval: 100,
      messenger,
    });
    await controller.start();
    controller.stop();

    // called once upon initial start
    expect(mock.called).toBe(true);
    expect(mock.calledTwice).toBe(false);

    await controller.start();

    await new Promise<void>((resolve) => setTimeout(() => resolve(), 1));
    expect(mock.calledTwice).toBe(true);
    expect(mock.calledThrice).toBe(false);
    await new Promise<void>((resolve) => setTimeout(() => resolve(), 150));
    expect(mock.calledThrice).toBe(true);

    controller.destroy();
    mock.restore();
  });

  it('should update token list', async () => {
    nock('https://metaswap-api.airswap-dev.codefi.network')
      .get('/tokens')
      .reply(200, sampleTokenList)
      .persist();
    const messenger = getRestrictedMessenger();
    const controller = new TokenListController({
      messenger,
      state: existingState,
    });
    expect(controller.state).toStrictEqual(existingState);
    await controller.start();
    expect(controller.state).toStrictEqual(sampleState);

    controller.destroy();
  });
});
