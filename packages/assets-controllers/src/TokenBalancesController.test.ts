import { BN } from 'ethereumjs-util';
import * as sinon from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import {
  BN as exportedBn,
  TokenBalancesController,
} from './TokenBalancesController';
import { getDefaultTokensState, type TokensState } from './TokensController';

describe('TokenBalancesController', () => {
  let clock: sinon.SinonFakeTimers;
  const getToken = (
    tokenBalances: TokenBalancesController,
    address: string,
  ) => {
    const { tokens } = tokenBalances.config;
    return tokens.find((token) => token.address === address);
  };
  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
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

    await advanceTime({ clock, duration: 15 });
    expect(mock.calledTwice).toBe(true);
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
    await tokenBalances.poll(1338);
    await advanceTime({ clock, duration: 1339 });
    expect(mock.called).toBe(true);
  });

  it('should update all balances', async () => {
    const selectedAddress = '0x0000000000000000000000000000000000000001';
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: jest.fn(),
        getSelectedAddress: () => selectedAddress,
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
  });

  it('should handle `getERC20BalanceOf` error case', async () => {
    const errorMsg = 'Failed to get balance';
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const getERC20BalanceOfStub = sinon
      .stub()
      .returns(Promise.reject(new Error(errorMsg)));
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: jest.fn(),
        getSelectedAddress: jest.fn(),
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
    expect(tokenBalances.state.contractBalances[address].toNumber()).toBe(0);

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

  it('should update balances when tokens change', async () => {
    const tokensStateChangeListeners: ((state: TokensState) => void)[] = [];
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: (listener) => {
          tokensStateChangeListeners.push(listener);
        },
        getSelectedAddress: jest.fn(),
        getERC20BalanceOf: jest.fn(),
      },
      { interval: 1337 },
    );
    const triggerTokensStateChange = (state: TokensState) => {
      for (const listener of tokensStateChangeListeners) {
        listener(state);
      }
    };
    const updateBalances = sinon.stub(tokenBalances, 'updateBalances');

    triggerTokensStateChange({
      ...getDefaultTokensState(),
      tokens: [
        {
          address: '0x00',
          symbol: 'FOO',
          decimals: 18,
        },
      ],
    });

    expect(updateBalances.called).toBe(true);
  });

  it('should update token balances when detected tokens are added', async () => {
    const tokensStateChangeListeners: ((state: TokensState) => void)[] = [];
    const tokenBalances = new TokenBalancesController(
      {
        onTokensStateChange: (listener) => {
          tokensStateChangeListeners.push(listener);
        },
        getSelectedAddress: () => '0x1234',
        getERC20BalanceOf: sinon.stub().returns(new BN(1)),
      },
      {
        interval: 1337,
      },
    );
    const triggerTokensStateChange = (state: TokensState) => {
      for (const listener of tokensStateChangeListeners) {
        listener(state);
      }
    };
    expect(tokenBalances.state.contractBalances).toStrictEqual({});

    triggerTokensStateChange({
      ...getDefaultTokensState(),
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
