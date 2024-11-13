import { ControllerMessenger } from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import type { PreferencesState } from '@metamask/preferences-controller';
import BN from 'bn.js';
import { useFakeTimers } from 'sinon';

import { advanceTime } from '../../../tests/helpers';
import * as multicall from './multicall';
import type {
  AllowedActions,
  AllowedEvents,
  TokenBalancesControllerActions,
  TokenBalancesControllerEvents,
  TokenBalancesControllerState,
} from './TokenBalancesController';
import { TokenBalancesController } from './TokenBalancesController';
import type { TokensControllerState } from './TokensController';

const setupController = ({
  config,
  tokens = { allTokens: {}, allDetectedTokens: {} },
}: {
  config?: Partial<ConstructorParameters<typeof TokenBalancesController>[0]>;
  tokens?: Partial<TokensControllerState>;
} = {}) => {
  const messenger = new ControllerMessenger<
    TokenBalancesControllerActions | AllowedActions,
    TokenBalancesControllerEvents | AllowedEvents
  >();

  const tokenBalancesMessenger = messenger.getRestricted({
    name: 'TokenBalancesController',
    allowedActions: [
      'NetworkController:getState',
      'NetworkController:getNetworkClientById',
      'PreferencesController:getState',
      'TokensController:getState',
      'AccountsController:getSelectedAccount',
    ],
    allowedEvents: [
      'NetworkController:stateChange',
      'PreferencesController:stateChange',
      'TokensController:stateChange',
    ],
  });

  messenger.registerActionHandler(
    'NetworkController:getState',
    jest.fn().mockImplementation(() => ({
      networkConfigurationsByChainId: {
        '0x1': {
          defaultRpcEndpointIndex: 0,
          rpcEndpoints: [{}],
        },
      },
    })),
  );

  messenger.registerActionHandler(
    'PreferencesController:getState',
    jest.fn().mockImplementation(() => ({})),
  );

  messenger.registerActionHandler(
    'TokensController:getState',
    jest.fn().mockImplementation(() => tokens),
  );

  messenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    jest.fn().mockImplementation(() => ({
      address: '0x0000000000000000000000000000000000000000',
    })),
  );

  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    jest.fn().mockReturnValue({ provider: jest.fn() }),
  );

  return {
    controller: new TokenBalancesController({
      messenger: tokenBalancesMessenger,
      ...config,
    }),
    messenger,
  };
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
    const { controller } = setupController();
    expect(controller.state).toStrictEqual({ tokenBalances: {} });
  });

  it('should poll and update balances in the right interval', async () => {
    const pollSpy = jest.spyOn(
      TokenBalancesController.prototype,
      '_executePoll',
    );

    const interval = 10;
    const { controller } = setupController({ config: { interval } });

    controller.startPolling({ chainId: '0x1' });

    await advanceTime({ clock, duration: 1 });
    expect(pollSpy).toHaveBeenCalled();
    expect(pollSpy).not.toHaveBeenCalledTimes(2);

    await advanceTime({ clock, duration: interval * 1.5 });
    expect(pollSpy).toHaveBeenCalledTimes(2);
  });

  it('should update balances on poll', async () => {
    const chainId = '0x1';
    const accountAddress = '0x0000000000000000000000000000000000000000';
    const tokenAddress = '0x0000000000000000000000000000000000000001';

    const tokens = {
      allDetectedTokens: {},
      allTokens: {
        [chainId]: {
          [accountAddress]: [
            { address: tokenAddress, symbol: 's', decimals: 0 },
          ],
        },
      },
    };

    const { controller } = setupController({ tokens });
    expect(controller.state.tokenBalances).toStrictEqual({});

    const balance = 123456;
    jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValue([
      {
        success: true,
        value: new BN(balance),
      },
    ]);

    await controller._executePoll({ chainId });

    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [tokenAddress]: toHex(balance),
        },
      },
    });
  });

  it('should update balances when they change', async () => {
    const chainId = '0x1';
    const accountAddress = '0x0000000000000000000000000000000000000000';
    const tokenAddress = '0x0000000000000000000000000000000000000001';

    const tokens = {
      allDetectedTokens: {},
      allTokens: {
        [chainId]: {
          [accountAddress]: [
            { address: tokenAddress, symbol: 's', decimals: 0 },
          ],
        },
      },
    };

    const { controller } = setupController({ tokens });
    expect(controller.state.tokenBalances).toStrictEqual({});

    for (let balance = 0; balance < 10; balance++) {
      jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValue([
        {
          success: true,
          value: new BN(balance),
        },
      ]);

      await controller._executePoll({ chainId });

      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress]: {
          [chainId]: {
            [tokenAddress]: toHex(balance),
          },
        },
      });
    }
  });

  it('updates balances when tokens are added', async () => {
    const chainId = '0x1';
    const { controller, messenger } = setupController();

    // No tokens initially
    await controller._executePoll({ chainId });
    expect(controller.state.tokenBalances).toStrictEqual({});

    const balance = 123456;
    jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValue([
      {
        success: true,
        value: new BN(balance),
      },
    ]);

    // Publish an update with a token
    const accountAddress = '0x0000000000000000000000000000000000000000';
    const tokenAddress = '0x0000000000000000000000000000000000000001';

    messenger.publish(
      'TokensController:stateChange',
      {
        tokens: [],
        detectedTokens: [],
        ignoredTokens: [],
        allDetectedTokens: {},
        allIgnoredTokens: {},
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, decimals: 0, symbol: 'S' },
            ],
          },
        },
      },
      [],
    );

    await advanceTime({ clock, duration: 1 });

    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [tokenAddress]: toHex(balance),
        },
      },
    });
  });

  it('removes balances when tokens are removed', async () => {
    const chainId = '0x1';
    const accountAddress = '0x0000000000000000000000000000000000000000';
    const tokenAddress = '0x0000000000000000000000000000000000000001';

    // Start with a token
    const initialTokens = {
      allDetectedTokens: {},
      allTokens: {
        [chainId]: {
          [accountAddress]: [
            { address: tokenAddress, symbol: 's', decimals: 0 },
          ],
        },
      },
    };

    const { controller, messenger } = setupController({
      tokens: initialTokens,
    });

    // Set initial balance
    const balance = 123456;
    jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValue([
      {
        success: true,
        value: new BN(balance),
      },
    ]);

    await controller._executePoll({ chainId });

    // Verify initial balance is set
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [tokenAddress]: toHex(balance),
        },
      },
    });

    // Publish an update with no tokens
    messenger.publish(
      'TokensController:stateChange',
      {
        tokens: [],
        detectedTokens: [],
        ignoredTokens: [],
        allDetectedTokens: {},
        allIgnoredTokens: {},
        allTokens: { [chainId]: {} },
      },
      [],
    );

    await advanceTime({ clock, duration: 1 });

    // Verify balance was removed
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {}, // Empty balances object
      },
    });
  });

  it('updates balances for all accounts when multi-account balances is enabled', async () => {
    const chainId = '0x1';
    const account1 = '0x0000000000000000000000000000000000000001';
    const account2 = '0x0000000000000000000000000000000000000002';
    const tokenAddress = '0x0000000000000000000000000000000000000003';

    const tokens = {
      allDetectedTokens: {},
      allTokens: {
        [chainId]: {
          [account1]: [{ address: tokenAddress, symbol: 's', decimals: 0 }],
          [account2]: [{ address: tokenAddress, symbol: 's', decimals: 0 }],
        },
      },
    };

    const { controller, messenger } = setupController({ tokens });

    // Enable multi account balances
    messenger.publish(
      'PreferencesController:stateChange',
      { isMultiAccountBalancesEnabled: true } as PreferencesState,
      [],
    );

    const balance1 = 100;
    const balance2 = 200;
    jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValue([
      { success: true, value: new BN(balance1) },
      { success: true, value: new BN(balance2) },
    ]);

    await controller._executePoll({ chainId });

    expect(controller.state.tokenBalances).toStrictEqual({
      [account1]: {
        [chainId]: {
          [tokenAddress]: toHex(balance1),
        },
      },
      [account2]: {
        [chainId]: {
          [tokenAddress]: toHex(balance2),
        },
      },
    });
  });

  it('only updates selected account balance when multi-account balances is disabled', async () => {
    const chainId = '0x1';
    const selectedAccount = '0x0000000000000000000000000000000000000000';
    const otherAccount = '0x0000000000000000000000000000000000000001';
    const tokenAddress = '0x0000000000000000000000000000000000000002';

    const tokens = {
      allDetectedTokens: {},
      allTokens: {
        [chainId]: {
          [selectedAccount]: [
            { address: tokenAddress, symbol: 's', decimals: 0 },
          ],
          [otherAccount]: [{ address: tokenAddress, symbol: 's', decimals: 0 }],
        },
      },
    };

    const { controller, messenger } = setupController({ tokens });

    // Disable multi-account balances
    messenger.publish(
      'PreferencesController:stateChange',
      { isMultiAccountBalancesEnabled: false } as PreferencesState,
      [],
    );

    const balance = 100;
    jest
      .spyOn(multicall, 'multicallOrFallback')
      .mockResolvedValue([{ success: true, value: new BN(balance) }]);

    await controller._executePoll({ chainId });

    // Should only contain balance for selected account
    expect(controller.state.tokenBalances).toStrictEqual({
      [selectedAccount]: {
        [chainId]: {
          [tokenAddress]: toHex(balance),
        },
      },
    });
  });

  describe('resetState', () => {
    it('resets the state to default state', () => {
      const initialState: TokenBalancesControllerState = {
        tokenBalances: {
          '0x0000000000000000000000000000000000000001': {
            '0x1': {
              '0x86fa049857e0209aa7d9e616f7eb3b3b78ecfdb0': toHex(new BN(1)),
            },
          },
        },
      };

      const { controller } = setupController({
        config: { state: initialState },
      });

      expect(controller.state).toStrictEqual(initialState);

      controller.resetState();

      expect(controller.state).toStrictEqual({
        tokenBalances: {},
      });
    });
  });
});
