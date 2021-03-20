import { stub } from 'sinon';
import nock from 'nock';
import ComposableController from '../ComposableController';
import { PreferencesController } from '../user/PreferencesController';
import { NetworkController } from '../network/NetworkController';
import TokenRatesController, { Token } from './TokenRatesController';
import { AssetsController } from './AssetsController';
import { AssetsContractController } from './AssetsContractController';
import CurrencyRateController from './CurrencyRateController';

const COINGECKO_HOST = 'https://api.coingecko.com';
const COINGECKO_PATH = '/api/v3/simple/token_price/ethereum';

describe('TokenRatesController', () => {
  beforeEach(() => {
    nock(COINGECKO_HOST)
      .get(`${COINGECKO_PATH}?contract_addresses=0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359,0xfoO&vs_currencies=eth`)
      .reply(200, { '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359': { eth: 0.00561045 } })
      .get(`${COINGECKO_PATH}?contract_addresses=0xfoO&vs_currencies=eth`)
      .reply(200, {})
      .get(`${COINGECKO_PATH}?contract_addresses=bar&vs_currencies=eth`)
      .reply(200, {})
      .get(`${COINGECKO_PATH}?contract_addresses=0xfoO&vs_currencies=gno`)
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
    const controller = new TokenRatesController();
    expect(controller.state).toEqual({ contractExchangeRates: {} });
  });

  it('should initialize with the default config', () => {
    const controller = new TokenRatesController();
    expect(controller.config).toEqual({
      disabled: false,
      interval: 180000,
      nativeCurrency: 'eth',
      tokens: [],
    });
  });

  it('should throw when tokens property is accessed', () => {
    const controller = new TokenRatesController();
    expect(() => console.log(controller.tokens)).toThrow('Property only used for setting');
  });

  it('should poll and update rate in the right interval', () => {
    return new Promise<void>((resolve) => {
      const mock = stub(TokenRatesController.prototype, 'fetchExchangeRate');
      new TokenRatesController({
        interval: 10,
        tokens: [{ address: 'bar', decimals: 0, symbol: '' }],
      });
      expect(mock.called).toBe(true);
      expect(mock.calledTwice).toBe(false);
      setTimeout(() => {
        expect(mock.calledTwice).toBe(true);
        mock.restore();
        resolve();
      }, 15);
    });
  });

  it('should not update rates if disabled', async () => {
    const controller = new TokenRatesController({
      interval: 10,
    });
    controller.fetchExchangeRate = stub();
    controller.disabled = true;
    await controller.updateExchangeRates();
    expect((controller.fetchExchangeRate as any).called).toBe(false);
  });

  it('should clear previous interval', () => {
    const mock = stub(global, 'clearTimeout');
    const controller = new TokenRatesController({ interval: 1337 });
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        controller.poll(1338);
        expect(mock.called).toBe(true);
        mock.restore();
        resolve();
      }, 100);
    });
  });

  it('should update all rates', async () => {
    const assets = new AssetsController();
    const assetsContract = new AssetsContractController();
    const currencyRate = new CurrencyRateController();
    const controller = new TokenRatesController({ interval: 10 });
    const network = new NetworkController();
    const preferences = new PreferencesController();

    new ComposableController([controller, assets, assetsContract, currencyRate, network, preferences]);
    const address = '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359';
    const address2 = '0xfoO';
    expect(controller.state.contractExchangeRates).toEqual({});
    controller.tokens = [
      { address, decimals: 18, symbol: 'DAI' },
      { address: address2, decimals: 0, symbol: '' },
    ];
    await controller.updateExchangeRates();
    expect(Object.keys(controller.state.contractExchangeRates)).toContain(address);
    expect(controller.state.contractExchangeRates[address]).toBeGreaterThan(0);
    expect(Object.keys(controller.state.contractExchangeRates)).toContain(address2);
    expect(controller.state.contractExchangeRates[address2]).toEqual(0);
  });

  it('should handle balance not found in API', async () => {
    const controller = new TokenRatesController({ interval: 10 });
    stub(controller, 'fetchExchangeRate').throws({ error: 'Not Found', message: 'Not Found' });
    expect(controller.state.contractExchangeRates).toEqual({});
    controller.tokens = [{ address: 'bar', decimals: 0, symbol: '' }];
    const mock = stub(controller, 'updateExchangeRates');
    await controller.updateExchangeRates();
    expect(mock).not.toThrow();
  });

  it('should subscribe to new sibling assets controllers', async () => {
    const assets = new AssetsController();
    const assetsContract = new AssetsContractController();
    const currencyRate = new CurrencyRateController();
    const controller = new TokenRatesController();
    const network = new NetworkController();
    const preferences = new PreferencesController();

    new ComposableController([controller, assets, assetsContract, currencyRate, network, preferences]);
    await assets.addToken('0xfoO', 'FOO', 18);
    currencyRate.update({ nativeCurrency: 'gno' });
    const { tokens } = controller.context.AssetsController.state;
    const found = tokens.filter((token: Token) => token.address === '0xfoO');
    expect(found.length > 0).toBe(true);
    expect(controller.config.nativeCurrency).toEqual('gno');
  });
});
