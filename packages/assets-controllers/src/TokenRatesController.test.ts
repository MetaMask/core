import { NetworksTicker, toHex } from '@metamask/controller-utils';
import nock from 'nock';
import * as sinon from 'sinon';

import { TokenRatesController } from './TokenRatesController';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINGECKO_ETH_PATH = '/simple/token_price/ethereum';
const COINGECKO_MATIC_PATH = '/simple/token_price/polygon-pos-network';
const COINGECKO_ASSETS_PATH = '/asset_platforms';
const COINGECKO_SUPPORTED_CURRENCIES = '/simple/supported_vs_currencies';
const ADDRESS = '0x01';

describe('TokenRatesController', () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  beforeEach(() => {
    nock(COINGECKO_API)
      .get(COINGECKO_SUPPORTED_CURRENCIES)
      .reply(200, ['eth', 'usd'])
      .get(COINGECKO_ASSETS_PATH)
      .reply(200, [
        {
          id: 'binance-smart-chain',
          chain_identifier: 56,
          name: 'Binance Smart Chain',
          shortname: 'BSC',
        },
        {
          id: 'ethereum',
          chain_identifier: 1,
          name: 'Ethereum',
          shortname: '',
        },
        {
          id: 'polygon-pos-network',
          chain_identifier: 137,
          name: 'Polygon',
          shortname: 'MATIC',
        },
      ]);
  });

  afterEach(() => {
    nock.cleanAll();
    sinon.restore();
    jest.resetAllMocks();
  });

  it('should set default state', () => {
    const controller = new TokenRatesController({
      chainId: toHex(1),
      ticker: NetworksTicker.mainnet,
      onTokensStateChange: sinon.stub(),
      onNetworkStateChange: sinon.stub(),
    });
    expect(controller.state).toStrictEqual({
      contractExchangeRates: {},
    });
  });

  it('should initialize with the default config', () => {
    const controller = new TokenRatesController({
      chainId: toHex(1),
      ticker: NetworksTicker.mainnet,
      onTokensStateChange: sinon.stub(),
      onNetworkStateChange: sinon.stub(),
    });
    expect(controller.config).toStrictEqual({
      disabled: false,
      interval: 180000,
      nativeCurrency: NetworksTicker.mainnet,
      chainId: toHex(1),
      tokens: [],
      threshold: 21600000,
    });
  });

  it('should not poll by default', async () => {
    const clock = sinon.useFakeTimers({ now: Date.now() });
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
      },
      {
        interval: 100,
        tokens: [{ address: 'bar', decimals: 0, symbol: '', aggregators: [] }],
      },
    );

    await clock.tickAsync(500);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should poll and update rate in the right interval', async () => {
    const clock = sinon.useFakeTimers({ now: Date.now() });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Network error');
    });
    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });
    const interval = 100;
    const controller = new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange,
        onNetworkStateChange: jest.fn(),
      },
      {
        interval,
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await tokenStateChangeListener!({
      detectedTokens: [],
      tokens: [{ address: 'bar', decimals: 0, symbol: '', aggregators: [] }],
    });

    await controller.start();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await clock.tickAsync(interval);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await clock.tickAsync(interval);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('should stop polling', async () => {
    const clock = sinon.useFakeTimers({ now: Date.now() });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Network error');
    });
    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });
    const interval = 100;
    const controller = new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange,
        onNetworkStateChange: jest.fn(),
      },
      {
        interval,
      },
    );
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await tokenStateChangeListener!({
      detectedTokens: [],
      tokens: [{ address: 'bar', decimals: 0, symbol: '', aggregators: [] }],
    });

    await controller.start();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    controller.stop();

    await clock.tickAsync(interval);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('should not update rates if disabled', async () => {
    const controller = new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange: sinon.stub(),
        onNetworkStateChange: sinon.stub(),
      },
      {
        interval: 10,
      },
    );
    controller.fetchExchangeRate = sinon.stub();
    controller.disabled = true;
    await controller.updateExchangeRates();
    expect((controller.fetchExchangeRate as any).called).toBe(false);
  });

  it('should update all rates', async () => {
    nock(COINGECKO_API)
      .get(
        `${COINGECKO_ETH_PATH}?contract_addresses=0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359,${ADDRESS}&vs_currencies=eth`,
      )
      .reply(200, {
        '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359': { eth: 0.00561045 },
      });
    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });
    const controller = new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange,
        onNetworkStateChange: sinon.stub(),
      },
      { interval: 10 },
    );
    const address = '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359';
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await tokenStateChangeListener!({
      detectedTokens: [],
      tokens: [
        { address, decimals: 18, symbol: 'DAI', aggregators: [] },
        { address: ADDRESS, decimals: 0, symbol: '', aggregators: [] },
      ],
    });
    expect(controller.state.contractExchangeRates).toStrictEqual({});
    await controller.updateExchangeRates();
    expect(Object.keys(controller.state.contractExchangeRates)).toContain(
      address,
    );
    expect(controller.state.contractExchangeRates[address]).toBeGreaterThan(0);
    expect(Object.keys(controller.state.contractExchangeRates)).toContain(
      ADDRESS,
    );
    expect(controller.state.contractExchangeRates[ADDRESS]).toBe(0);
  });

  it('should handle balance not found in API', async () => {
    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });
    const controller = new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange,
        onNetworkStateChange: sinon.stub(),
      },
      { interval: 10 },
    );
    sinon.stub(controller, 'fetchExchangeRate').throws({
      error: 'Not Found',
      message: 'Not Found',
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await tokenStateChangeListener!({
      detectedTokens: [],
      tokens: [{ address: 'bar', decimals: 0, symbol: '', aggregators: [] }],
    });
    expect(controller.state.contractExchangeRates).toStrictEqual({});
    const mock = sinon.stub(controller, 'updateExchangeRates');
    await controller.updateExchangeRates();
    expect(mock).not.toThrow();
  });

  it('should update exchange rates when tokens change while polling is active', async () => {
    sinon.useFakeTimers({ now: Date.now() });
    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });
    const onNetworkStateChange = sinon.stub();
    const controller = new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange,
        onNetworkStateChange,
      },
      { interval: 10 },
    );
    await controller.start();
    const updateExchangeRatesStub = sinon.stub(
      controller,
      'updateExchangeRates',
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    tokenStateChangeListener!({ tokens: [], detectedTokens: [] });

    expect(updateExchangeRatesStub.callCount).toBe(1);
  });

  it('should not update exchange rates when tokens change while polling is inactive', async () => {
    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });
    const onNetworkStateChange = sinon.stub();
    const controller = new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange,
        onNetworkStateChange,
      },
      { interval: 10 },
    );
    const updateExchangeRatesStub = sinon.stub(
      controller,
      'updateExchangeRates',
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    tokenStateChangeListener!({ tokens: [], detectedTokens: [] });

    expect(updateExchangeRatesStub.callCount).toBe(0);
  });

  it('should update exchange rates when ticker changes while polling is active', async () => {
    sinon.useFakeTimers({ now: Date.now() });
    let networkStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub();
    const onNetworkStateChange = sinon.stub().callsFake((listener) => {
      networkStateChangeListener = listener;
    });
    const controller = new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange,
        onNetworkStateChange,
      },
      { interval: 10 },
    );
    await controller.start();
    const updateExchangeRatesStub = sinon.stub(
      controller,
      'updateExchangeRates',
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    networkStateChangeListener!({
      providerConfig: { chainId: toHex(1), ticker: 'dai' },
    });

    expect(updateExchangeRatesStub.callCount).toBe(1);
  });

  it('should not update exchange rates when ticker changes while polling is inactive', async () => {
    let networkStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub();
    const onNetworkStateChange = sinon.stub().callsFake((listener) => {
      networkStateChangeListener = listener;
    });
    const controller = new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange,
        onNetworkStateChange,
      },
      { interval: 10 },
    );
    const updateExchangeRatesStub = sinon.stub(
      controller,
      'updateExchangeRates',
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    networkStateChangeListener!({
      providerConfig: { chainId: toHex(1), ticker: 'dai' },
    });

    expect(updateExchangeRatesStub.callCount).toBe(0);
  });

  it('should update exchange rates when native currency is not supported by coingecko', async () => {
    nock(COINGECKO_API)
      .get(`${COINGECKO_MATIC_PATH}`)
      .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
      .reply(200, {
        '0x02': {
          eth: 0.001, // token value in terms of ETH
        },
        '0x03': {
          eth: 0.002,
        },
      });

    nock('https://min-api.cryptocompare.com')
      .get('/data/price?fsym=ETH&tsyms=MATIC')
      .reply(200, { MATIC: 0.5 }); // .5 eth to 1 matic

    const expectedExchangeRates = {
      '0x02': 0.0005, // token value in terms of matic = (token value in eth) * (eth value in matic) = .001 * .5
      '0x03': 0.001,
    };

    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });

    const onNetworkStateChange = sinon.stub();
    const controller = new TokenRatesController(
      {
        chainId: toHex(137),
        ticker: 'MATIC',
        onTokensStateChange,
        onNetworkStateChange,
      },
      { interval: 10 },
    );

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await tokenStateChangeListener!({
      tokens: [
        {
          address: '0x02',
          decimals: 18,
          image: undefined,
          symbol: 'bar',
          isERC721: false,
        },
        {
          address: '0x03',
          decimals: 18,
          image: undefined,
          symbol: 'bazz',
          isERC721: false,
        },
      ],
      detectedTokens: [],
    });

    await controller.updateExchangeRates();

    expect(controller.state.contractExchangeRates).toStrictEqual(
      expectedExchangeRates,
    );
  });

  it('should clear contractExchangeRates state when network is changed', async () => {
    nock(COINGECKO_API)
      .get(`${COINGECKO_ETH_PATH}`)
      .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
      .reply(200, {
        '0x02': {
          eth: 0.001, // token value in terms of ETH
        },
        '0x03': {
          eth: 0.002,
        },
      });

    let networkChangeListener: (state: any) => void;
    const onNetworkStateChange = sinon.stub().callsFake((listener) => {
      networkChangeListener = listener;
    });

    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });

    const controller = new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange,
        onNetworkStateChange,
      },
      { interval: 10 },
    );

    await controller.configure({ nativeCurrency: 'ETH' });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await tokenStateChangeListener!({
      tokens: [
        {
          address: '0x02',
          decimals: 18,
          image: undefined,
          symbol: 'bar',
          isERC721: false,
        },
        {
          address: '0x03',
          decimals: 18,
          image: undefined,
          symbol: 'bazz',
          isERC721: false,
        },
      ],
      detectedTokens: [],
    });

    await controller.updateExchangeRates();

    expect(controller.state.contractExchangeRates).toStrictEqual({
      '0x02': 0.001,
      '0x03': 0.002,
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await networkChangeListener!({
      providerConfig: { chainId: toHex(4) },
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await tokenStateChangeListener!({
      tokens: [],
      detectedTokens: [],
    });

    expect(controller.state.contractExchangeRates).toStrictEqual({});
  });

  it('should update exchange rates when detected tokens are added', async () => {
    nock(COINGECKO_API)
      .get(`${COINGECKO_ETH_PATH}`)
      .query({ contract_addresses: '0x02,0x03', vs_currencies: 'eth' })
      .reply(200, {
        '0x02': {
          eth: 0.001,
        },
        '0x03': {
          eth: 0.002,
        },
      });
    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });
    const controller = new TokenRatesController(
      {
        chainId: toHex(1),
        ticker: NetworksTicker.mainnet,
        onTokensStateChange,
        onNetworkStateChange: sinon.stub(),
      },
      { interval: 10 },
    );
    expect(controller.state.contractExchangeRates).toStrictEqual({});

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await tokenStateChangeListener!({
      detectedTokens: [
        {
          address: '0x02',
          decimals: 18,
          image: undefined,
          symbol: 'bar',
          isERC721: false,
        },
        {
          address: '0x03',
          decimals: 18,
          image: undefined,
          symbol: 'bazz',
          isERC721: false,
        },
      ],
      tokens: [],
    });
    await controller.updateExchangeRates();

    expect(controller.state.contractExchangeRates).toStrictEqual({
      '0x02': 0.001,
      '0x03': 0.002,
    });
  });
});
