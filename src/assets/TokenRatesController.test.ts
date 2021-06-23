import { stub } from 'sinon';
import nock from 'nock';
import { PreferencesController } from '../user/PreferencesController';
import { NetworkController } from '../network/NetworkController';
import TokenRatesController from './TokenRatesController';
import { AssetsController } from './AssetsController';
import { AssetsContractController } from './AssetsContractController';

const COINGECKO_HOST = 'https://api.coingecko.com';
const COINGECKO_ETH_PATH = '/api/v3/simple/token_price/ethereum';
const COINGECKO_BSC_PATH = '/api/v3/simple/token_price/binance-smart-chain';
const COINGECKO_ASSETS_PATH = '/api/v3/asset_platforms';
const ADDRESS = '0x01';

describe('TokenRatesController', () => {
  beforeEach(() => {
    nock(COINGECKO_HOST)
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
      onAssetsStateChange: stub(),
      onCurrencyRateStateChange: stub(),
      onNetworkStateChange: stub(),
    });
    expect(controller.state).toStrictEqual({
      contractExchangeRates: {},
      supportedChains: {
        data: null,
        timestamp: 0,
      },
    });
  });

  it('should initialize with the default config', () => {
    const controller = new TokenRatesController({
      onAssetsStateChange: stub(),
      onCurrencyRateStateChange: stub(),
      onNetworkStateChange: stub(),
    });
    expect(controller.config).toStrictEqual({
      disabled: false,
      interval: 180000,
      nativeCurrency: 'eth',
      chainId: '',
      tokens: [],
      threshold: 60000,
    });
  });

  it('should throw when tokens property is accessed', () => {
    const controller = new TokenRatesController({
      onAssetsStateChange: stub(),
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
        onAssetsStateChange: jest.fn(),
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
        onAssetsStateChange: stub(),
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
        onAssetsStateChange: stub(),
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
    const assetsContract = new AssetsContractController();
    const network = new NetworkController();
    const preferences = new PreferencesController();
    const assets = new AssetsController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
      getAssetName: assetsContract.getAssetName.bind(assetsContract),
      getAssetSymbol: assetsContract.getAssetSymbol.bind(assetsContract),
      getCollectibleTokenURI: assetsContract.getCollectibleTokenURI.bind(
        assetsContract,
      ),
    });
    const controller = new TokenRatesController(
      {
        onAssetsStateChange: (listener) => assets.subscribe(listener),
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
        onAssetsStateChange: stub(),
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

  it('should update exchange rates when assets change', async () => {
    let assetStateChangeListener: (state: any) => void;
    const onAssetsStateChange = stub().callsFake((listener) => {
      assetStateChangeListener = listener;
    });
    const onCurrencyRateStateChange = stub();
    const onNetworkStateChange = stub();
    const controller = new TokenRatesController(
      {
        onAssetsStateChange,
        onCurrencyRateStateChange,
        onNetworkStateChange,
      },
      { interval: 10 },
    );

    const updateExchangeRatesStub = stub(controller, 'updateExchangeRates');
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    assetStateChangeListener!({ tokens: [] });
    // FIXME: This is now being called twice
    expect(updateExchangeRatesStub.callCount).toStrictEqual(2);
  });

  it('should update exchange rates when native currency changes', async () => {
    let currencyRateStateChangeListener: (state: any) => void;
    const onAssetsStateChange = stub();
    const onCurrencyRateStateChange = stub().callsFake((listener) => {
      currencyRateStateChangeListener = listener;
    });
    const onNetworkStateChange = stub();
    const controller = new TokenRatesController(
      {
        onAssetsStateChange,
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
});
