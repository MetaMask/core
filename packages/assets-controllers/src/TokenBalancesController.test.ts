import * as sinon from 'sinon';
import { BN } from 'ethereumjs-util';
import { ControllerMessenger } from '@metamask/base-controller';
import { PreferencesController } from '@metamask/preferences-controller';
import {
  NetworkController,
  NetworkControllerMessenger,
} from '@metamask/network-controller';
import { TokensController } from './TokensController';
import { Token } from './TokenRatesController';
import { AssetsContractController } from './AssetsContractController';
import {
  BN as exportedBn,
  TokenBalancesController,
} from './TokenBalancesController';

const stubCreateEthers = (ctrl: TokensController, res: boolean) => {
  return sinon.stub(ctrl, '_createEthersContract').callsFake(() => {
    return {
      supportsInterface: sinon.stub().returns(res),
    } as any;
  });
};

describe('TokenBalancesController', () => {
  const getToken = (
    tokenBalances: TokenBalancesController,
    address: string,
  ) => {
    const { tokens } = tokenBalances.config;
    return tokens.find((token) => token.address === address);
  };

  afterEach(() => {
    sinon.restore();
  });

  it('should re-export BN', () => {
    expect(exportedBn).toStrictEqual(BN);
  });

  it('should set default state', () => {
    const tokenBalances = new TokenBalancesController({
      onTokensStateChange: sinon.stub(),
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: sinon.stub(),
    });
    expect(tokenBalances.state).toStrictEqual({ contractBalances: {} });
  });

  it('should set default config', () => {
    const tokenBalances = new TokenBalancesController({
      onTokensStateChange: sinon.stub(),
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: sinon.stub(),
    });
    expect(tokenBalances.config).toStrictEqual({
      interval: 180000,
      tokens: [],
    });
  });

  it('should poll and update balances in the right interval', async () => {
    await new Promise<void>((resolve) => {
      const mock = sinon.stub(
        TokenBalancesController.prototype,
        'updateBalances',
      );
      new TokenBalancesController(
        {
          onTokensStateChange: sinon.stub(),
          getSelectedAddress: () => '0x1234',
          getERC20BalanceOf: sinon.stub(),
        },
        { interval: 10 },
      );
      expect(mock.called).toBe(true);
      expect(mock.calledTwice).toBe(false);
      setTimeout(() => {
        expect(mock.calledTwice).toBe(true);
        resolve();
      }, 15);
    });
  });

  it('should not update rates if disabled', async () => {
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: sinon.stub(),
        getSelectedAddress: () => '0x1234',
        getERC20BalanceOf: sinon.stub(),
      },
      {
        disabled: true,
        interval: 10,
      },
    );
    const mock = sinon.stub(tokenBalances, 'update');
    await tokenBalances.updateBalances();
    expect(mock.called).toBe(false);
  });

  it('should clear previous interval', async () => {
    const mock = sinon.stub(global, 'clearTimeout');
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: sinon.stub(),
        getSelectedAddress: () => '0x1234',
        getERC20BalanceOf: sinon.stub(),
      },
      { interval: 1337 },
    );
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        tokenBalances.poll(1338);
        expect(mock.called).toBe(true);
        resolve();
      }, 100);
    });
  });

  const setupControllers = () => {
    const messenger: NetworkControllerMessenger =
      new ControllerMessenger().getRestricted({
        name: 'NetworkController',
        allowedEvents: ['NetworkController:stateChange'],
        allowedActions: [],
      });

    new NetworkController({
      messenger,
      infuraProjectId: 'potato',
    });
    const preferences = new PreferencesController();
    return { messenger, preferences };
  };

  it('should update all balances', async () => {
    const { messenger, preferences } = setupControllers();
    const assets = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) =>
        messenger.subscribe('NetworkController:stateChange', listener),
    });
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: (listener) => assets.subscribe(listener),
        getSelectedAddress: () => preferences.state.selectedAddress,
        getERC20BalanceOf: sinon.stub().returns(new BN(1)),
      },
      {
        interval: 1337,
        tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
      },
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

    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should handle `getERC20BalanceOf` error case', async () => {
    const { messenger, preferences } = setupControllers();
    const assets = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) =>
        messenger.subscribe('NetworkController:stateChange', listener),
    });
    const errorMsg = 'Failed to get balance';
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const getERC20BalanceOfStub = sinon
      .stub()
      .returns(Promise.reject(new Error(errorMsg)));
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: (listener) => assets.subscribe(listener),
        getSelectedAddress: () => preferences.state.selectedAddress,
        getERC20BalanceOf: getERC20BalanceOfStub,
      },
      {
        interval: 1337,
        tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
      },
    );

    expect(tokenBalances.state.contractBalances).toStrictEqual({});
    await tokenBalances.updateBalances();
    const mytoken = getToken(tokenBalances, address);
    expect(mytoken?.balanceError).toBeInstanceOf(Error);
    expect(mytoken?.balanceError).toHaveProperty('message', errorMsg);
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

    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should subscribe to new sibling assets controllers', async () => {
    const { messenger, preferences } = setupControllers();
    const assetsContract = new AssetsContractController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) =>
        messenger.subscribe('NetworkController:stateChange', listener),
    });
    const tokensController = new TokensController({
      onPreferencesStateChange: (listener) => preferences.subscribe(listener),
      onNetworkStateChange: (listener) =>
        messenger.subscribe('NetworkController:stateChange', listener),
    });

    const stub = stubCreateEthers(tokensController, false);

    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: (listener) => tokensController.subscribe(listener), // needs to be unsubbed?
        getSelectedAddress: () => preferences.state.selectedAddress,
        getERC20BalanceOf:
          assetsContract.getERC20BalanceOf.bind(assetsContract),
      },
      { interval: 1337 },
    );
    const updateBalances = sinon.stub(tokenBalances, 'updateBalances');
    await tokensController.addToken('0x00', 'FOO', 18);
    const { tokens } = tokensController.state;
    const found = tokens.filter((token: Token) => token.address === '0x00');
    expect(found.length > 0).toBe(true);
    expect(updateBalances.called).toBe(true);

    stub.restore();
    messenger.clearEventSubscriptions('NetworkController:stateChange');
  });

  it('should update token balances when detected tokens are added', async () => {
    let tokenStateChangeListener: (state: any) => void;
    const onTokensStateChange = sinon.stub().callsFake((listener) => {
      tokenStateChangeListener = listener;
    });
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange,
        getSelectedAddress: () => '0x1234',
        getERC20BalanceOf: sinon.stub().returns(new BN(1)),
      },
      {
        interval: 1337,
      },
    );

    expect(tokenBalances.state.contractBalances).toStrictEqual({});

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    tokenStateChangeListener!({
      detectedTokens: [
        {
          address: '0x02',
          decimals: 18,
          image: undefined,
          symbol: 'bar',
          isERC721: false,
        },
      ],
      tokens: [],
    });

    await tokenBalances.updateBalances();

    expect(tokenBalances.state.contractBalances).toStrictEqual({
      '0x02': new BN(1),
    });
  });
});
