import { ControllerMessenger } from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import { BN } from 'ethereumjs-util';

import { flushPromises } from '../../../tests/helpers';
import { TokenBalancesController } from './TokenBalancesController';
import type { Token } from './TokenRatesController';
import { getDefaultTokensState, type TokensState } from './TokensController';

const controllerName = 'TokenBalancesController';

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
function getMessenger() {
  return new ControllerMessenger().getRestricted<
    typeof controllerName,
    never,
    never
  >({
    name: controllerName,
  });
}

describe('TokenBalancesController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should set default state', () => {
    const controller = new TokenBalancesController({
      onTokensStateChange: jest.fn(),
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: jest.fn(),
      messenger: getMessenger(),
    });

    expect(controller.state).toStrictEqual({ contractBalances: {} });
  });

  it('should poll and update balances in the right interval', async () => {
    const updateBalancesSpy = jest.spyOn(
      TokenBalancesController.prototype,
      'updateBalances',
    );

    new TokenBalancesController({
      interval: 10,
      onTokensStateChange: jest.fn(),
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: jest.fn(),
      messenger: getMessenger(),
    });
    await flushPromises();

    expect(updateBalancesSpy).toHaveBeenCalled();
    expect(updateBalancesSpy).not.toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(15);

    expect(updateBalancesSpy).toHaveBeenCalledTimes(2);
  });

  it('should update balances if enabled', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const controller = new TokenBalancesController({
      disabled: false,
      tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
      interval: 10,
      onTokensStateChange: jest.fn(),
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: jest.fn().mockReturnValue(new BN(1)),
      messenger: getMessenger(),
    });

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });
  });

  it('should not update balances if disabled', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const controller = new TokenBalancesController({
      disabled: true,
      tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
      interval: 10,
      onTokensStateChange: jest.fn(),
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: jest.fn().mockReturnValue(new BN(1)),
      messenger: getMessenger(),
    });

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({});
  });

  it('should update balances if controller is manually enabled', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const controller = new TokenBalancesController({
      disabled: true,
      tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
      interval: 10,
      onTokensStateChange: jest.fn(),
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: jest.fn().mockReturnValue(new BN(1)),
      messenger: getMessenger(),
    });

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({});

    controller.enable();
    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });
  });

  it('should not update balances if controller is manually disabled', async () => {
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const controller = new TokenBalancesController({
      disabled: false,
      tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
      interval: 10,
      onTokensStateChange: jest.fn(),
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: jest.fn().mockReturnValue(new BN(1)),
      messenger: getMessenger(),
    });

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });

    controller.disable();
    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });
  });

  it('should update balances if tokens change and controller is manually enabled', async () => {
    const tokensStateChangeListeners: ((state: TokensState) => void)[] = [];
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const controller = new TokenBalancesController({
      disabled: true,
      tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
      interval: 10,
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: jest.fn().mockReturnValue(new BN(1)),
      onTokensStateChange: (listener) => {
        tokensStateChangeListeners.push(listener);
      },
      messenger: getMessenger(),
    });
    const triggerTokensStateChange = async (state: TokensState) => {
      for (const listener of tokensStateChangeListeners) {
        listener(state);
      }
    };

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({});

    controller.enable();
    await triggerTokensStateChange({
      ...getDefaultTokensState(),
      tokens: [
        {
          address: '0x00',
          symbol: 'FOO',
          decimals: 18,
        },
      ],
    });

    expect(controller.state.contractBalances).toStrictEqual({
      '0x00': toHex(new BN(1)),
    });
  });

  it('should not update balances if tokens change and controller is manually disabled', async () => {
    const tokensStateChangeListeners: ((state: TokensState) => void)[] = [];
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const controller = new TokenBalancesController({
      disabled: false,
      tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
      interval: 10,
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: jest.fn().mockReturnValue(new BN(1)),
      onTokensStateChange: (listener) => {
        tokensStateChangeListeners.push(listener);
      },
      messenger: getMessenger(),
    });
    const triggerTokensStateChange = async (state: TokensState) => {
      for (const listener of tokensStateChangeListeners) {
        listener(state);
      }
    };

    await controller.updateBalances();

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });

    controller.disable();
    await triggerTokensStateChange({
      ...getDefaultTokensState(),
      tokens: [
        {
          address: '0x00',
          symbol: 'FOO',
          decimals: 18,
        },
      ],
    });

    expect(controller.state.contractBalances).toStrictEqual({
      '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
    });
  });

  it('should clear previous interval', async () => {
    const controller = new TokenBalancesController({
      interval: 1337,
      onTokensStateChange: jest.fn(),
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: jest.fn(),
      messenger: getMessenger(),
    });

    const mockClearTimeout = jest.spyOn(global, 'clearTimeout');

    await controller.poll(1338);

    jest.advanceTimersByTime(1339);

    expect(mockClearTimeout).toHaveBeenCalled();
  });

  it('should update all balances', async () => {
    const selectedAddress = '0x0000000000000000000000000000000000000001';
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const tokens: Token[] = [
      {
        address,
        decimals: 18,
        symbol: 'EOS',
        aggregators: [],
      },
    ];
    const controller = new TokenBalancesController({
      interval: 1337,
      tokens,
      onTokensStateChange: jest.fn(),
      getSelectedAddress: () => selectedAddress,
      getERC20BalanceOf: jest.fn().mockReturnValue(new BN(1)),
      messenger: getMessenger(),
    });

    expect(controller.state.contractBalances).toStrictEqual({});

    await controller.updateBalances();

    expect(tokens[0].balanceError).toBeNull();
    expect(Object.keys(controller.state.contractBalances)).toContain(address);
    expect(controller.state.contractBalances[address]).not.toBe(toHex(0));
  });

  it('should handle `getERC20BalanceOf` error case', async () => {
    const errorMsg = 'Failed to get balance';
    const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
    const getERC20BalanceOfStub = jest
      .fn()
      .mockReturnValue(Promise.reject(new Error(errorMsg)));
    const tokens: Token[] = [
      {
        address,
        decimals: 18,
        symbol: 'EOS',
        aggregators: [],
      },
    ];
    const controller = new TokenBalancesController({
      interval: 1337,
      tokens,
      onTokensStateChange: jest.fn(),
      getSelectedAddress: jest.fn(),
      getERC20BalanceOf: getERC20BalanceOfStub,
      messenger: getMessenger(),
    });

    expect(controller.state.contractBalances).toStrictEqual({});

    await controller.updateBalances();

    expect(tokens[0].balanceError).toBeInstanceOf(Error);
    expect(tokens[0].balanceError).toHaveProperty('message', errorMsg);
    expect(controller.state.contractBalances[address]).toBe(toHex(0));

    getERC20BalanceOfStub.mockReturnValue(new BN(1));

    await controller.updateBalances();

    expect(tokens[0].balanceError).toBeNull();
    expect(Object.keys(controller.state.contractBalances)).toContain(address);
    expect(controller.state.contractBalances[address]).not.toBe(0);
  });

  it('should update balances when tokens change', async () => {
    const tokensStateChangeListeners: ((state: TokensState) => void)[] = [];
    const controller = new TokenBalancesController({
      onTokensStateChange: (listener) => {
        tokensStateChangeListeners.push(listener);
      },
      getSelectedAddress: jest.fn(),
      getERC20BalanceOf: jest.fn(),
      interval: 1337,
      messenger: getMessenger(),
    });
    const triggerTokensStateChange = async (state: TokensState) => {
      for (const listener of tokensStateChangeListeners) {
        listener(state);
      }
    };
    const updateBalancesSpy = jest.spyOn(controller, 'updateBalances');

    await triggerTokensStateChange({
      ...getDefaultTokensState(),
      tokens: [
        {
          address: '0x00',
          symbol: 'FOO',
          decimals: 18,
        },
      ],
    });

    expect(updateBalancesSpy).toHaveBeenCalled();
  });

  it('should update token balances when detected tokens are added', async () => {
    const tokensStateChangeListeners: ((state: TokensState) => void)[] = [];
    const controller = new TokenBalancesController({
      interval: 1337,
      onTokensStateChange: (listener) => {
        tokensStateChangeListeners.push(listener);
      },
      getSelectedAddress: () => '0x1234',
      getERC20BalanceOf: jest.fn().mockReturnValue(new BN(1)),
      messenger: getMessenger(),
    });
    const triggerTokensStateChange = async (state: TokensState) => {
      for (const listener of tokensStateChangeListeners) {
        listener(state);
      }
    };
    expect(controller.state.contractBalances).toStrictEqual({});

    await triggerTokensStateChange({
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

    expect(controller.state.contractBalances).toStrictEqual({
      '0x02': toHex(new BN(1)),
    });
  });
});
