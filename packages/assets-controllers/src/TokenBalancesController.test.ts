import { ControllerMessenger } from '@metamask/base-controller';
import BN from 'bn.js';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import * as multicall from './multicall';
import type {
  AllowedActions,
  AllowedEvents,
  TokenBalancesControllerActions,
  TokenBalancesControllerEvents,
  TokenBalancesControllerMessenger,
  TokenBalancesControllerState,
} from './TokenBalancesController';
import { TokenBalancesController } from './TokenBalancesController';

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
      let chainId;
      if (networkClientId === 'mainnet') {
        chainId = '0x1';
      } else if (networkClientId === 'sepolia') {
        chainId = '0xaa36a7';
      } else {
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

    controller.startPolling({
      networkClientId: 'mainnet',
      tokensPerAccount: {},
    });

    await advanceTime({ clock, duration: 1 });
    expect(pollSpy).toHaveBeenCalled();
    expect(pollSpy).not.toHaveBeenCalledTimes(2);

    await advanceTime({ clock, duration: interval * 1.5 });
    expect(pollSpy).toHaveBeenCalledTimes(2);
  });

  it('should update balances on success', async () => {
    const controller = setupController({});
    expect(controller.state.tokenBalances).toStrictEqual({});

    jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValue([
      {
        success: true,
        value: new BN(2),
      },
    ]);

    const accountAddresss = '0x0000000000000000000000000000000000000000';
    const tokenAddress = '0x0000000000000000000000000000000000000001';

    await controller._executePoll({
      networkClientId: 'mainnet',
      tokensPerAccount: {
        [accountAddresss]: [tokenAddress],
      },
    });

    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddresss]: {
        '0x1': {
          [tokenAddress]: '0x2',
        },
      },
    });
  });

  it('should update balances when they change', async () => {
    const controller = setupController({});
    expect(controller.state.tokenBalances).toStrictEqual({});

    const accountAddresss = '0x0000000000000000000000000000000000000000';
    const tokenAddress = '0x0000000000000000000000000000000000000001';

    for (let i = 0; i < 10; i++) {
      jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValue([
        {
          success: true,
          value: new BN(i),
        },
      ]);

      await controller._executePoll({
        networkClientId: 'mainnet',
        tokensPerAccount: {
          [accountAddresss]: [tokenAddress],
        },
      });

      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddresss]: {
          '0x1': {
            [tokenAddress]: `0x${i}`,
          },
        },
      });
    }
  });

  it('should not update balances on failure', async () => {
    const controller = setupController({});

    const accountAddresss = '0x0000000000000000000000000000000000000000';
    const tokenAddress = '0x0000000000000000000000000000000000000001';

    // Initial successfull call
    jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValue([
      {
        success: true,
        value: new BN(2),
      },
    ]);

    await controller._executePoll({
      networkClientId: 'mainnet',
      tokensPerAccount: {
        [accountAddresss]: [tokenAddress],
      },
    });

    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddresss]: {
        '0x1': {
          [tokenAddress]: '0x2',
        },
      },
    });

    // Failed call
    jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValue([
      {
        success: false,
        value: '',
      },
    ]);

    // State should not change
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddresss]: {
        '0x1': {
          [tokenAddress]: '0x2',
        },
      },
    });
  });

  describe('resetState', () => {
    it('resets the state to default state', () => {
      const initialState: TokenBalancesControllerState = {
        contractBalances: {
          '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
        },
      };

      const { controller } = setupController({
        config: {
          state: initialState,
          disabled: true,
        },
        mock: {
          selectedAccount: createMockInternalAccount({ address: '0x1234' }),
        },
      });

      expect(controller.state).toStrictEqual(initialState);

      controller.resetState();

      expect(controller.state).toStrictEqual({
        contractBalances: {},
      });
    });
  });
});
