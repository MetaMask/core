import { createSandbox, stub } from 'sinon';
import ComposableController from '../src/ComposableController';
import TokenBalancesController from '../src/assets/TokenBalancesController';
import { AssetsController } from '../src/assets/AssetsController';
import { Token } from '../src/assets/TokenRatesController';
import { AssetsContractController } from '../src/assets/AssetsContractController';
import { NetworkController } from '../src/network/NetworkController';
import { PreferencesController } from '../src/user/PreferencesController';

const { BN } = require('ethereumjs-util');
const HttpProvider = require('ethjs-provider-http');

const MAINNET_PROVIDER = new HttpProvider('https://mainnet.infura.io');

describe('TokenBalancesController', () => {
  let tokenBalances: TokenBalancesController;
  const sandbox = createSandbox();

  beforeEach(() => {
    tokenBalances = new TokenBalancesController();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should set default state', () => {
    expect(tokenBalances.state).toEqual({ contractBalances: {} });
  });

  it('should set default config', () => {
    expect(tokenBalances.config).toEqual({
      interval: 180000,
      tokens: [],
    });
  });

  it('should poll and update balances in the right interval', () => {
    return new Promise((resolve) => {
      const mock = stub(TokenBalancesController.prototype, 'updateBalances');
      new TokenBalancesController({ interval: 10 });
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
    const controller = new TokenBalancesController({
      disabled: true,
      interval: 10,
    });
    const mock = stub(controller, 'update');
    await controller.updateBalances();
    expect(mock.called).toBe(false);
  });

  it('should clear previous interval', () => {
    const mock = stub(global, 'clearTimeout');
    const controller = new TokenBalancesController({ interval: 1337 });
    return new Promise((resolve) => {
      setTimeout(() => {
        controller.poll(1338);
        expect(mock.called).toBe(true);
        mock.restore();
        resolve();
      }, 100);
    });
  });

  it('should update all balances', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    expect(tokenBalances.state.contractBalances).toEqual({});
    tokenBalances.configure({ tokens: [{ address, decimals: 18, symbol: 'EOS' }] });
    const assets = new AssetsController();
    const assetsContract = new AssetsContractController();
    const network = new NetworkController();
    const preferences = new PreferencesController();

    new ComposableController([assets, assetsContract, network, preferences, tokenBalances]);
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    stub(assetsContract, 'getBalanceOf').returns(new BN(1));
    await tokenBalances.updateBalances();
    expect(Object.keys(tokenBalances.state.contractBalances)).toContain(address);
    expect(tokenBalances.state.contractBalances[address].toNumber()).toBeGreaterThan(0);
  });

  it('should handle error case', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    expect(tokenBalances.state.contractBalances).toEqual({});
    tokenBalances.configure({ tokens: [{ address, decimals: 18, symbol: 'EOS' }] });
    const assets = new AssetsController();
    const assetsContract = new AssetsContractController();
    const network = new NetworkController();
    const preferences = new PreferencesController();

    new ComposableController([assets, assetsContract, network, preferences, tokenBalances]);
    assetsContract.configure({ provider: MAINNET_PROVIDER });
    stub(assetsContract, 'getBalanceOf').returns(Promise.reject());
    await tokenBalances.updateBalances();
    expect(Object.keys(tokenBalances.state.contractBalances)).toContain(address);
    expect(tokenBalances.state.contractBalances[address].message).toBe('Failed to get balance');
  });

  it('should subscribe to new sibling assets controllers', async () => {
    const assets = new AssetsController();
    const assetsContract = new AssetsContractController();
    const network = new NetworkController();
    const preferences = new PreferencesController();

    new ComposableController([assets, assetsContract, network, preferences, tokenBalances]);
    const updateBalances = sandbox.stub(tokenBalances, 'updateBalances');
    await assets.addToken('0xfoO', 'FOO', 18);
    const { tokens } = tokenBalances.context.AssetsController.state;
    const found = tokens.filter((token: Token) => token.address === '0xfoO');
    expect(found.length > 0).toBe(true);
    expect(updateBalances.called).toBe(true);
  });
});
