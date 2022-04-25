import { createSandbox, stub } from 'sinon';
import { BN } from 'ethereumjs-util';
import { NetworkController } from '../network/NetworkController';
import { PreferencesController } from '../user/PreferencesController';
import { TokensController } from './TokensController';
import { Token } from './TokenRatesController';
import { AssetsContractController } from './AssetsContractController';
import {
  BN as exportedBn,
  TokenBalancesController,
} from './TokenBalancesController';

describe('TokenBalancesController', () => {
  const sandbox = createSandbox();

  const getToken = (
    tokenBalances: TokenBalancesController,
    address: string,
  ) => {
    const { tokens } = tokenBalances.config;
    return tokens.find((token) => token.address === address);
  };

  afterEach(() => {
    sandbox.restore();
  });

  it('should re-export BN', () => {
    expect(exportedBn).toStrictEqual(BN);
  });

  it('should set default state', () => {
    const tokenBalances = new TokenBalancesController({
      onTokensStateChange: stub(),
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: stub(),
    });
    expect(tokenBalances.state).toStrictEqual({ contractBalances: {} });
  });

  it('should set default config', () => {
    const tokenBalances = new TokenBalancesController({
      onTokensStateChange: stub(),
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: stub(),
    });
    expect(tokenBalances.config).toStrictEqual({
      interval: 180000,
      tokens: [],
    });
  });

  it('should poll and update balances in the right interval', async () => {
    await new Promise<void>((resolve) => {
      const mock = stub(TokenBalancesController.prototype, 'updateBalances');
      new TokenBalancesController(
        {
          onTokensStateChange: stub(),
          getSelectedAddress: () => '0x1234',
          getERC20BalanceOf: stub(),
        },
        { interval: 10 },
      );
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
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: stub(),
        getSelectedAddress: () => '0x1234',
        getERC20BalanceOf: stub(),
      },
      {
        disabled: true,
        interval: 10,
      },
    );
    const mock = stub(tokenBalances, 'update');
    await tokenBalances.updateBalances();
    expect(mock.called).toBe(false);
  });

  it('should clear previous interval', async () => {
    const mock = stub(global, 'clearTimeout');
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: stub(),
        getSelectedAddress: () => '0x1234',
        getERC20BalanceOf: stub(),
      },
      { interval: 1337 },
    );
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        tokenBalances.poll(1338);
        expect(mock.called).toBe(true);
        mock.restore();
        resolve();
      }, 100);
    });
  });

  it('should update all balances', async () => {
    const network = new NetworkController();
    const preferences = new PreferencesController();
    const assets = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
    });
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: (listener) => assets.subscribe(listener),
        getSelectedAddress: () => preferences.state.selectedAddress,
        getERC20BalanceOf: stub().returns(new BN(1)),
      },
      { interval: 1337, tokens: [{ address, decimals: 18, symbol: 'EOS' }] },
    );
    expect(tokenBalances.state.contractBalances).toStrictEqual({});

    await tokenBalances.updateBalances();
    const mytoken = getToken(tokenBalances, address);
    expect(mytoken?.balanceError).toBeNull();
    expect(Object.keys(tokenBalances.state.contractBalances)).toContain(
      address,
    );

    expect(
      tokenBalances.state.contractBalances[address].toNumber(),
    ).toBeGreaterThan(0);
  });

  it('should handle `getERC20BalanceOf` error case', async () => {
    const network = new NetworkController();
    const preferences = new PreferencesController();
    const assets = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
    });
    const errorMsg = 'Failed to get balance';
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const getERC20BalanceOfStub = stub().returns(
      Promise.reject(new Error(errorMsg)),
    );
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: (listener) => assets.subscribe(listener),
        getSelectedAddress: () => preferences.state.selectedAddress,
        getERC20BalanceOf: getERC20BalanceOfStub,
      },
      { interval: 1337, tokens: [{ address, decimals: 18, symbol: 'EOS' }] },
    );

    expect(tokenBalances.state.contractBalances).toStrictEqual({});
    await tokenBalances.updateBalances();
    const mytoken = getToken(tokenBalances, address);
    expect(mytoken?.balanceError).toBeInstanceOf(Error);
    expect(mytoken?.balanceError?.message).toBe(errorMsg);
    expect(
      tokenBalances.state.contractBalances[address].toNumber(),
    ).toStrictEqual(0);

    getERC20BalanceOfStub.returns(new BN(1));
    await tokenBalances.updateBalances();
    expect(mytoken?.balanceError).toBeNull();
    expect(Object.keys(tokenBalances.state.contractBalances)).toContain(
      address,
    );

    expect(
      tokenBalances.state.contractBalances[address].toNumber(),
    ).toBeGreaterThan(0);
  });

  it('should subscribe to new sibling assets controllers', async () => {
    const preferences = new PreferencesController();
    const assetsContract = new AssetsContractController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
    });
    const network = new NetworkController();
    const tokensController = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) => network.subscribe(listener),
    });

    const supportsInterfaceStub = stub().returns(Promise.resolve(false));

    stub(tokensController, '_createEthersContract').callsFake(() =>
      Promise.resolve({ supportsInterface: supportsInterfaceStub }),
    );

    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: (listener) => tokensController.subscribe(listener),
        getSelectedAddress: () => preferences.state.selectedAddress,
        getERC20BalanceOf:
          assetsContract.getERC20BalanceOf.bind(assetsContract),
      },
      { interval: 1337 },
    );
    const updateBalances = sandbox.stub(tokenBalances, 'updateBalances');
    await tokensController.addToken('0x00', 'FOO', 18);
    const { tokens } = tokensController.state;
    const found = tokens.filter((token: Token) => token.address === '0x00');
    expect(found.length > 0).toBe(true);
    expect(updateBalances.called).toBe(true);
  });
});
