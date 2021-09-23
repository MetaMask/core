import { stub } from 'sinon';
import nock from 'nock';
import { PreferencesController } from '../user/PreferencesController';
import { NetworkController } from '../network/NetworkController';
import { TokenRatesController } from './TokenRatesController';
import { TokensController } from './TokensController';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const COINGECKO_ETH_PATH = '/simple/token_price/ethereum';
const COINGECKO_BSC_PATH = '/simple/token_price/binance-smart-chain';
const COINGECKO_MATIC_PATH = '/simple/token_price/polygon-pos-network';
const COINGECKO_ASSETS_PATH = '/asset_platforms';
const COINGECKO_SUPPORTED_CURRENCIES = '/simple/supported_vs_currencies';
const ADDRESS = '0x01';

describe('TokenRatesController', () => {
  beforeEach(() => {
    nock(COINGECKO_API)
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
      ])
      .get(
        `${COINGECKO_ETH_PATH}?contract_addresses=0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359,${ADDRESS}&vs_currencies=eth`,
      )
      .reply(200, {
        '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359': { eth: 0.00561045 },
      })
      .get(
        `${COINGECKO_ETH_PATH}?contract_addresses=${ADDRESS}&vs_currencies=eth`,
      )
      .reply(200, {})
      .get(`${COINGECKO_ETH_PATH}?contract_addresses=bar&vs_currencies=eth`)
      .reply(200, {})
      .get(
        `${COINGECKO_ETH_PATH}?contract_addresses=${ADDRESS}&vs_currencies=gno`,
      )
      .reply(200, {})
      .get(
        `${COINGECKO_BSC_PATH}?contract_addresses=0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359,${ADDRESS}&vs_currencies=eth`,
      )
      .reply(200, {
        '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359': { eth: 0.00561045 },
      })
      .get(`${COINGECKO_BSC_PATH}?contract_addresses=0xfoO&vs_currencies=eth`)
      .reply(200, {})
      .get(`${COINGECKO_BSC_PATH}?contract_addresses=bar&vs_currencies=eth`)
      .reply(200, {})
      .get(`${COINGECKO_BSC_PATH}?contract_addresses=0xfoO&vs_currencies=gno`)
      .reply(200, {})
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
      ])
      .persist();

    nock('https://min-api.cryptocompare.com')
      .get('/data/price?fsym=ETH&tsyms=USD')
      .reply(200, { USD: 179.63 })
      .persist();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should set default state', () => {
    const controller = new TokenRatesController({
      onTokensStateChange: stub(),
      onCurrencyRateStateChange: stub(),
      onNetworkStateChange: stub(),
    });
    expect(controller.state).toStrictEqual({
      contractExchangeRates: {},
    });
  });

  it('should initialize with the default config', () => {
    const controller = new TokenRatesController({
      onTokensStateChange: stub(),
      onCurrencyRateStateChange: stub(),
      onNetworkStateChange: stub(),
    });
    expect(controller.config).toStrictEqual({
      disabled: false,
      interval: 180000,
      nativeCurrency: 'eth',
      chainId: '',
      tokens: [],
      threshold: 21600000,
    });
  });

  it('should throw when tokens property is accessed', () => {
    const controller = new TokenRatesController({
      onTokensStateChange: stub(),
      onCurrencyRateStateChange: stub(),
      onNetworkStateChange: stub(),
    });
    expect(() => console.log(controller.tokens)).toThrow(
      'Property only used for setting',
    );
  });

  it('should poll and update rate in the right interval', async () => {
    const pollSpy = jest.spyOn(TokenRatesController.prototype, 'poll');
    const interval = 100;
    const times = 5;
    new TokenRatesController(
      {
        onTokensStateChange: jest.fn(),
        onCurrencyRateStateChange: jest.fn(),
        onNetworkStateChange: jest.fn(),
      },
      {
        interval,
        tokens: [{ address: 'bar', decimals: 0, symbol: '' }],
      },
    );

    expect(pollSpy).toHaveBeenCalledTimes(1);
    expect(pollSpy).not.toHaveBeenCalledTimes(times);
    await new Promise((resolve) => {
      setTimeout(resolve, interval * (times - 0.5));
    });
    expect(pollSpy).toHaveBeenCalledTimes(times);
    pollSpy.mockClear();
  });

  it('should not update rates if disabled', async () => {
    const controller = new TokenRatesController(
      {
        onTokensStateChange: stub(),
        onCurrencyRateStateChange: stub(),
        onNetworkStateChange: stub(),
      },
      {
        interval: 10,
      },
    );
    controller.fetchExchangeRate = stub();
    controller.disabled = true;
    await controller.updateExchangeRates();
    expect((controller.fetchExchangeRate as any).called).toBe(false);
  });

  it('should clear previous interval', async () => {
    const mock = stub(global, 'clearTimeout');
    const controller = new TokenRatesController(
      {
        onTokensStateChange: stub(),
        onCurrencyRateStateChange: stub(),
        onNetworkStateChange: stub(),
      },
      { interval: 1337 },
    );
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        controller.poll(1338);
        expect(mock.called).toBe(true);
        mock.restore();
        resolve();
      }, 100);
    });
  });

  it('should update all rates', async () => {
    const network = new NetworkController();
    const preferences = new PreferencesController();
    const tokensController = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
    });
    const controller = new TokenRatesController(
      {
        onTokensStateChange: (listener) => tokensController.subscribe(listener),
        onCurrencyRateStateChange: stub(),
        onNetworkStateChange: (listener) => network.subscribe(listener),
      },
      { interval: 10, chainId: '1' },
    );
    const address = '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359';
    expect(controller.state.contractExchangeRates).toStrictEqual({});
    controller.tokens = [
      { address, decimals: 18, symbol: 'DAI' },
      { address: ADDRESS, decimals: 0, symbol: '' },
    ];
    await controller.updateExchangeRates();
    expect(Object.keys(controller.state.contractExchangeRates)).toContain(
      address,
    );
    expect(controller.state.contractExchangeRates[address]).toBeGreaterThan(0);
    expect(Object.keys(controller.state.contractExchangeRates)).toContain(
      ADDRESS,
    );
    expect(controller.state.contractExchangeRates[ADDRESS]).toStrictEqual(0);
  });

  it('should handle balance not found in API', async () => {
    const controller = new TokenRatesController(
      {
        onTokensStateChange: stub(),
        onCurrencyRateStateChange: stub(),
        onNetworkStateChange: stub(),
      },
      { interval: 10 },
    );
    stub(controller, 'fetchExchangeRate').throws({
      error: 'Not Found',
      message: 'Not Found',
    });
    expect(controller.state.contractExchangeRates).toStrictEqual({});
    controller.tokens = [{ address: 'bar', decimals: 0, symbol: '' }];
    const mock = stub(controller, 'updateExchangeRates');
    await controller.updateExchangeRates();
    expect(mock).not.toThrow();
  });

  it('should update exchange rates when tokens change', async () => {
    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });
    const onCurrencyRateStateChange = stub();
    const onNetworkStateChange = stub();
    const controller = new TokenRatesController(
      {
        onTokensStateChange,
        onCurrencyRateStateChange,
        onNetworkStateChange,
      },
      { interval: 10 },
    );

    const updateExchangeRatesStub = stub(controller, 'updateExchangeRates');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    tokenStateChangeListener!({ tokens: [] });
    // FIXME: This is now being called twice
    expect(updateExchangeRatesStub.callCount).toStrictEqual(2);
  });

  it('should update exchange rates when native currency changes', async () => {
    let currencyRateStateChangeListener: (state: any) => void;
    const onTokensStateChange = stub();
    const onCurrencyRateStateChange = stub().callsFake((listener) => {
      currencyRateStateChangeListener = listener;
    });
    const onNetworkStateChange = stub();
    const controller = new TokenRatesController(
      {
        onTokensStateChange,
        onCurrencyRateStateChange,
        onNetworkStateChange,
      },
      { interval: 10 },
    );

    const updateExchangeRatesStub = stub(controller, 'updateExchangeRates');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    currencyRateStateChangeListener!({ nativeCurrency: 'dai' });
    // FIXME: This is now being called twice
    expect(updateExchangeRatesStub.callCount).toStrictEqual(2);
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
      })
      .persist();

    nock('https://min-api.cryptocompare.com')
      .get('/data/price?fsym=ETH&tsyms=MATIC')
      .reply(200, { MATIC: 0.5 }) // .5 eth to 1 matic
      .persist();

    const expectedExchangeRates = {
      '0x02': 0.0005, // token value in terms of matic = (token value in eth) * (eth value in matic) = .001 * .5
      '0x03': 0.001,
    };

    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });

    const onNetworkStateChange = stub();
    const controller = new TokenRatesController(
      {
        onTokensStateChange,
        onCurrencyRateStateChange: stub(),
        onNetworkStateChange,
      },
      { interval: 10 },
    );
    await controller.configure({ chainId: '137', nativeCurrency: 'MATIC' });

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
      })
      .persist();

    let networkChangeListener: (state: any) => void;
    const onNetworkStateChange = stub().callsFake((listener) => {
      networkChangeListener = listener;
    });

    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });

    const controller = new TokenRatesController(
      {
        onTokensStateChange,
        onNetworkStateChange,
        onCurrencyRateStateChange: stub(),
      },
      { interval: 10 },
    );

    await controller.configure({ chainId: '1', nativeCurrency: 'ETH' });

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
    });

    await controller.updateExchangeRates();

    expect(controller.state.contractExchangeRates).toStrictEqual({
      '0x02': 0.001,
      '0x03': 0.002,
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await networkChangeListener!({
      provider: { chainId: '4' },
    });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await tokenStateChangeListener!({
      tokens: [],
    });

    expect(controller.state.contractExchangeRates).toStrictEqual({});
  });
});
