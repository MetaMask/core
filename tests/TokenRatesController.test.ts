import { stub } from 'sinon';
import { get } from 'fetch-mock';
import ComposableController from '../src/ComposableController';
import TokenRatesController, { Token } from '../src/assets/TokenRatesController';
import { AssetsController } from '../src/assets/AssetsController';
import { NetworkController } from '../src/network/NetworkController';
import { AssetsContractController } from '../src/assets/AssetsContractController';
import { publish } from '../src/controller-messaging-system';
import { CURRENCY_RATE_STATE_CHANGED } from '../src/assets/CurrencyRateController';

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/token_price/ethereum?';

describe('TokenRatesController', () => {
  beforeEach(() => {
    get(
      `${COINGECKO_API}contract_addresses=0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359,0xfoO&vs_currencies=eth`,
      () => ({
        body: JSON.stringify({ '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359': { eth: 0.00561045 } }),
      }),
      { overwriteRoutes: true, method: 'GET' },
    );
    get(`${COINGECKO_API}contract_addresses=0xfoO&vs_currencies=eth`, () => ({ body: '{}' }), {
      method: 'GET',
      overwriteRoutes: true,
    });
    get(`${COINGECKO_API}contract_addresses=bar&vs_currencies=eth`, () => ({ body: '{}' }), {
      method: 'GET',
      overwriteRoutes: true,
    });
    get(`${COINGECKO_API}contract_addresses=0xfoO&vs_currencies=gno`, () => ({ body: '{}' }), {
      method: 'GET',
      overwriteRoutes: true,
    });
    get(
      'https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=USD',
      () => ({
        body: JSON.stringify({ USD: 179.63 }),
      }),
      { overwriteRoutes: true, method: 'GET' },
    );
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
    const controller = new TokenRatesController({ interval: 10 });
    const network = new NetworkController();

    new ComposableController([controller, assets, assetsContract, network]);
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
    stub(controller, 'fetchExchangeRate').returns({ error: 'Not Found', message: 'Not Found' });
    expect(controller.state.contractExchangeRates).toEqual({});
    controller.tokens = [{ address: 'bar', decimals: 0, symbol: '' }];
    const mock = stub(controller, 'updateExchangeRates');
    await controller.updateExchangeRates();
    expect(mock).not.toThrow();
  });

  it('should subscribe to new sibling assets controllers', async () => {
    const assets = new AssetsController();
    const assetsContract = new AssetsContractController();
    const controller = new TokenRatesController();
    const network = new NetworkController();

    new ComposableController([controller, assets, assetsContract, network]);
    await assets.addToken('0xfoO', 'FOO', 18);
    publish(CURRENCY_RATE_STATE_CHANGED, {
      nativeCurrency: 'gno',
    });
    const { tokens } = controller.context.AssetsController.state;
    const found = tokens.filter((token: Token) => token.address === '0xfoO');
    expect(found.length > 0).toBe(true);
    expect(controller.config.nativeCurrency).toEqual('gno');
  });
});
