import { ControllerMessenger } from '@metamask/base-controller';
import { NetworkType, toHex } from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-api';
import BN from 'bn.js';
import { useFakeTimers } from 'sinon';

import { advanceTime, flushPromises } from '../../../tests/helpers';
import { createMockInternalAccount } from '../../accounts-controller/src/tests/mocks';
import * as multicall from './multicall';
import { multicallOrFallback } from './multicall';
import type {
  AllowedActions,
  AllowedEvents,
  TokenBalancesControllerActions,
  TokenBalancesControllerEvents,
  TokenBalancesControllerMessenger,
} from './TokenBalancesController';
import { TokenBalancesController } from './TokenBalancesController';
import type { Token } from './TokenRatesController';
import {
  getDefaultTokensState,
  type TokensControllerState,
} from './TokensController';

const setupController = ({
  config,
}: {
  config?: Partial<ConstructorParameters<typeof TokenBalancesController>[0]>;
}): TokenBalancesController => {
  const controllerMessenger = new ControllerMessenger<
    TokenBalancesControllerActions | AllowedActions,
    TokenBalancesControllerEvents | AllowedEvents
  >();

  const messenger = controllerMessenger.getRestricted({
    name: 'TokenBalancesController',
    allowedActions: ['NetworkController:getNetworkClientById'],
    allowedEvents: [],
  });

  controllerMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    jest.fn().mockImplementation((networkClientId) => {
      const chainId =
        networkClientId === 'mainnet'
          ? '0x1'
          : networkClientId === 'sepolia'
          ? '0xaa36a7'
          : undefined;

      if (!chainId) {
        throw new Error('unknown networkClientId');
      }

      return {
        configuration: { chainId },
        provider: jest.fn(),
      };
    }),
  );

  return new TokenBalancesController({ messenger, ...config });
};

describe('TokenBalancesController', () => {
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  it('should set default state', () => {
    const controller = setupController({});
    expect(controller.state).toStrictEqual({ tokenBalances: {} });
  });

  it('should poll and update balances in the right interval', async () => {
    const pollSpy = jest.spyOn(
      TokenBalancesController.prototype,
      '_executePoll',
    );

    const interval = 10;
    const controller = setupController({ config: { interval } });

    controller.startPollingByNetworkClientId('mainnet');

    await advanceTime({ clock, duration: 1 });
    expect(pollSpy).toHaveBeenCalled();
    expect(pollSpy).not.toHaveBeenCalledTimes(2);

    await advanceTime({ clock, duration: interval * 1.5 });
    expect(pollSpy).toHaveBeenCalledTimes(2);
  });

  it('should update balances', async () => {
    const controller = setupController({});

    jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValue([
      {
        success: true,
        value: new BN(1),
      },
    ]);

    const accountAddresss = '0x0000000000000000000000000000000000000000';
    const tokenAddress = '0x0000000000000000000000000000000000000001';

    await controller._executePoll('mainnet', {
      [accountAddresss]: [tokenAddress],
    });

    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddresss]: {
        '0x1': {
          [tokenAddress]: '0x1',
        },
      },
    });
  });

  // TODO: Consider more tests

  // it('should not update balances if disabled', async () => {
  //   const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
  //   const { controller } = setupController({
  //     config: {
  //       disabled: true,
  //       tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
  //       interval: 10,
  //     },
  //     mock: {
  //       selectedAccount: createMockInternalAccount({ address: '0x1234' }),
  //       getBalanceOf: new BN(1),
  //     },
  //   });

  //   await controller.updateBalances();

  //   expect(controller.state.contractBalances).toStrictEqual({});
  // });

  // it('should update balances if controller is manually enabled', async () => {
  //   const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
  //   const { controller } = setupController({
  //     config: {
  //       disabled: true,
  //       tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
  //       interval: 10,
  //     },
  //     mock: {
  //       selectedAccount: createMockInternalAccount({ address: '0x1234' }),
  //       getBalanceOf: new BN(1),
  //     },
  //   });

  //   await controller.updateBalances();

  //   expect(controller.state.contractBalances).toStrictEqual({});

  //   controller.enable();
  //   await controller.updateBalances();

  //   expect(controller.state.contractBalances).toStrictEqual({
  //     '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
  //   });
  // });

  // it('should not update balances if controller is manually disabled', async () => {
  //   const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
  //   const { controller } = setupController({
  //     config: {
  //       disabled: false,
  //       tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
  //       interval: 10,
  //     },
  //     mock: {
  //       selectedAccount: createMockInternalAccount({ address: '0x1234' }),
  //       getBalanceOf: new BN(1),
  //     },
  //   });

  //   await controller.updateBalances();

  //   expect(controller.state.contractBalances).toStrictEqual({
  //     '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
  //   });

  //   controller.disable();
  //   await controller.updateBalances();

  //   expect(controller.state.contractBalances).toStrictEqual({
  //     '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
  //   });
  // });

  // it('should update balances if tokens change and controller is manually enabled', async () => {
  //   const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
  //   const { controller, triggerTokensStateChange } = setupController({
  //     config: {
  //       disabled: true,
  //       tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
  //       interval: 10,
  //     },
  //     mock: {
  //       selectedAccount: createMockInternalAccount({ address: '0x1234' }),
  //       getBalanceOf: new BN(1),
  //     },
  //   });

  //   await controller.updateBalances();

  //   expect(controller.state.contractBalances).toStrictEqual({});

  //   controller.enable();
  //   await triggerTokensStateChange({
  //     ...getDefaultTokensState(),
  //     tokens: [
  //       {
  //         address: '0x00',
  //         symbol: 'FOO',
  //         decimals: 18,
  //       },
  //     ],
  //   });

  //   expect(controller.state.contractBalances).toStrictEqual({
  //     '0x00': toHex(new BN(1)),
  //   });
  // });

  // it('should not update balances if tokens change and controller is manually disabled', async () => {
  //   const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
  //   const { controller, triggerTokensStateChange } = setupController({
  //     config: {
  //       disabled: false,
  //       tokens: [{ address, decimals: 18, symbol: 'EOS', aggregators: [] }],
  //       interval: 10,
  //     },
  //     mock: {
  //       selectedAccount: createMockInternalAccount({ address: '0x1234' }),
  //       getBalanceOf: new BN(1),
  //     },
  //   });

  //   await controller.updateBalances();

  //   expect(controller.state.contractBalances).toStrictEqual({
  //     '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
  //   });

  //   controller.disable();
  //   await triggerTokensStateChange({
  //     ...getDefaultTokensState(),
  //     tokens: [
  //       {
  //         address: '0x00',
  //         symbol: 'FOO',
  //         decimals: 18,
  //       },
  //     ],
  //   });

  //   expect(controller.state.contractBalances).toStrictEqual({
  //     '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
  //   });
  // });

  // it('should clear previous interval', async () => {
  //   const { controller } = setupController({
  //     config: {
  //       interval: 1337,
  //     },
  //     mock: {
  //       selectedAccount: createMockInternalAccount({ address: '0x1234' }),
  //       getBalanceOf: new BN(1),
  //     },
  //   });

  //   const mockClearTimeout = jest.spyOn(global, 'clearTimeout');

  //   await controller.poll(1338);

  //   jest.advanceTimersByTime(1339);

  //   expect(mockClearTimeout).toHaveBeenCalled();
  // });

  // it('should update all balances', async () => {
  //   const selectedAddress = '0x0000000000000000000000000000000000000001';
  //   const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
  //   const tokens: Token[] = [
  //     {
  //       address,
  //       decimals: 18,
  //       symbol: 'EOS',
  //       aggregators: [],
  //     },
  //   ];
  //   const { controller } = setupController({
  //     config: {
  //       interval: 1337,
  //       tokens,
  //     },
  //     mock: {
  //       selectedAccount: createMockInternalAccount({
  //         address: selectedAddress,
  //       }),
  //       getBalanceOf: new BN(1),
  //     },
  //   });

  //   expect(controller.state.contractBalances).toStrictEqual({});

  //   await controller.updateBalances();

  //   expect(tokens[0].hasBalanceError).toBe(false);
  //   expect(Object.keys(controller.state.contractBalances)).toContain(address);
  //   expect(controller.state.contractBalances[address]).not.toBe(toHex(0));
  // });

  // it('should handle `getERC20BalanceOf` error case', async () => {
  //   const errorMsg = 'Failed to get balance';
  //   const address = '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0';
  //   const tokens: Token[] = [
  //     {
  //       address,
  //       decimals: 18,
  //       symbol: 'EOS',
  //       aggregators: [],
  //     },
  //   ];

  //   const { controller, mockGetERC20BalanceOf } = setupController({
  //     config: {
  //       interval: 1337,
  //       tokens,
  //     },
  //     mock: {
  //       selectedAccount: createMockInternalAccount({
  //         address,
  //       }),
  //     },
  //   });

  //   // @ts-expect-error Testing error case
  //   mockGetERC20BalanceOf.mockReturnValueOnce(new Error(errorMsg));

  //   expect(controller.state.contractBalances).toStrictEqual({});

  //   await controller.updateBalances();

  //   expect(tokens[0].hasBalanceError).toBe(true);
  //   expect(controller.state.contractBalances[address]).toBe(toHex(0));

  //   mockGetERC20BalanceOf.mockReturnValueOnce(new BN(1));
  //   await controller.updateBalances();

  //   expect(tokens[0].hasBalanceError).toBe(false);
  //   expect(Object.keys(controller.state.contractBalances)).toContain(address);
  //   expect(controller.state.contractBalances[address]).not.toBe(0);
  // });

  // it('should update balances when tokens change', async () => {
  //   const { controller, triggerTokensStateChange } = setupController({
  //     config: {
  //       interval: 1337,
  //     },
  //     mock: {
  //       selectedAccount: createMockInternalAccount({
  //         address: '0x1234',
  //       }),
  //       getBalanceOf: new BN(1),
  //     },
  //   });

  //   const updateBalancesSpy = jest.spyOn(controller, 'updateBalances');

  //   await triggerTokensStateChange({
  //     ...getDefaultTokensState(),
  //     tokens: [
  //       {
  //         address: '0x00',
  //         symbol: 'FOO',
  //         decimals: 18,
  //       },
  //     ],
  //   });

  //   expect(updateBalancesSpy).toHaveBeenCalled();
  // });

  // it('should update token balances when detected tokens are added', async () => {
  //   const { controller, triggerTokensStateChange } = setupController({
  //     config: {
  //       interval: 1337,
  //     },
  //     mock: {
  //       selectedAccount: createMockInternalAccount({
  //         address: '0x1234',
  //       }),
  //       getBalanceOf: new BN(1),
  //     },
  //   });

  //   expect(controller.state.contractBalances).toStrictEqual({});

  //   await triggerTokensStateChange({
  //     ...getDefaultTokensState(),
  //     detectedTokens: [
  //       {
  //         address: '0x02',
  //         decimals: 18,
  //         image: undefined,
  //         symbol: 'bar',
  //         isERC721: false,
  //       },
  //     ],
  //     tokens: [],
  //   });

  //   expect(controller.state.contractBalances).toStrictEqual({
  //     '0x02': toHex(new BN(1)),
  //   });
  // });
});
