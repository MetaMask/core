import { Messenger } from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import type { NetworkState } from '@metamask/network-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import { CHAIN_IDS } from '@metamask/transaction-controller';
import BN from 'bn.js';
import { useFakeTimers } from 'sinon';

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
import { advanceTime } from '../../../tests/helpers';
import { createMockInternalAccount } from '../../accounts-controller/src/tests/mocks';
import type { InternalAccount } from '../../transaction-controller/src/types';

const setupController = ({
  config,
  tokens = { allTokens: {}, allDetectedTokens: {} },
  listAccounts = [],
}: {
  config?: Partial<ConstructorParameters<typeof TokenBalancesController>[0]>;
  tokens?: Partial<TokensControllerState>;
  listAccounts?: InternalAccount[];
} = {}) => {
  const messenger = new Messenger<
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
      'AccountsController:listAccounts',
    ],
    allowedEvents: [
      'NetworkController:stateChange',
      'PreferencesController:stateChange',
      'TokensController:stateChange',
      'AccountsController:accountRemoved',
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

  const mockListAccounts = jest.fn().mockReturnValue(listAccounts);
  messenger.registerActionHandler(
    'AccountsController:listAccounts',
    mockListAccounts,
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
  const controller = new TokenBalancesController({
    messenger: tokenBalancesMessenger,
    ...config,
  });
  const updateSpy = jest.spyOn(controller, 'update' as never);

  return {
    controller,
    updateSpy,
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

    const { controller, messenger, updateSpy } = setupController({
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
        allDetectedTokens: {},
        allIgnoredTokens: {},
        allTokens: { [chainId]: {} },
      },
      [],
    );

    await advanceTime({ clock, duration: 1 });

    // Verify balance was removed
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {}, // Empty balances object
      },
    });
  });
  it('skips removing balances when incoming chainIds are not in the current chainIds list for tokenBalances', async () => {
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

    const { controller, messenger, updateSpy } = setupController({
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
        allDetectedTokens: {},
        allIgnoredTokens: {},
        allTokens: { [CHAIN_IDS.BASE]: {} },
      },
      [],
    );

    await advanceTime({ clock, duration: 1 });

    // Verify initial balances are still there
    expect(updateSpy).toHaveBeenCalledTimes(1); // should be called only once when we first updated the balances and not twice
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [tokenAddress]: toHex(balance),
        },
      },
    });
  });

  it('skips removing balances when state change with tokens that are already in tokenBalances state', async () => {
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

    const { controller, messenger, updateSpy } = setupController({
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
        allDetectedTokens: {},
        allIgnoredTokens: {},
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, symbol: 's', decimals: 0 },
            ],
          },
        },
      },
      [],
    );

    await advanceTime({ clock, duration: 1 });

    // Verify initial balances are still there
    expect(updateSpy).toHaveBeenCalledTimes(1); // should be called only once when we first updated the balances and not twice
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [tokenAddress]: toHex(balance),
        },
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

  it('does not update balances when multi-account balances is enabled and all returned values did not change', async () => {
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

    const { controller, messenger, updateSpy } = setupController({ tokens });

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

    await controller._executePoll({ chainId });

    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('updates balances when multi-account balances is enabled and some returned values changed', async () => {
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

    const { controller, messenger, updateSpy } = setupController({ tokens });

    // Enable multi account balances
    messenger.publish(
      'PreferencesController:stateChange',
      { isMultiAccountBalancesEnabled: true } as PreferencesState,
      [],
    );

    const balance1 = 100;
    const balance2 = 200;
    const balance3 = 300;
    jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValueOnce([
      { success: true, value: new BN(balance1) },
      { success: true, value: new BN(balance2) },
    ]);
    jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValueOnce([
      { success: true, value: new BN(balance1) },
      { success: true, value: new BN(balance3) },
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

    await controller._executePoll({ chainId });

    expect(controller.state.tokenBalances).toStrictEqual({
      [account1]: {
        [chainId]: {
          [tokenAddress]: toHex(balance1),
        },
      },
      [account2]: {
        [chainId]: {
          [tokenAddress]: toHex(balance3),
        },
      },
    });

    expect(updateSpy).toHaveBeenCalledTimes(2);
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

  it('removes balances when networks are deleted', async () => {
    const chainId = '0x1';
    const accountAddress = '0x0000000000000000000000000000000000000000';
    const tokenAddress = '0x0000000000000000000000000000000000000001';

    // Start with a token balance
    const initialState = {
      tokenBalances: {
        [accountAddress]: {
          [chainId]: {
            [tokenAddress]: toHex(123456),
          },
        },
      },
    };

    const { controller, messenger } = setupController({
      config: { state: initialState },
    });

    // Verify initial state matches
    expect(controller.state.tokenBalances).toStrictEqual(
      initialState.tokenBalances,
    );

    // Simulate network deletion by publishing a network state change
    messenger.publish(
      'NetworkController:stateChange',
      {
        networkConfigurationsByChainId: {},
      } as NetworkState,
      [
        {
          op: 'remove',
          path: ['networkConfigurationsByChainId', chainId],
        },
      ],
    );

    // Verify the balances for the deleted network were removed
    expect(
      controller.state.tokenBalances[accountAddress][chainId],
    ).toBeUndefined();
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

  describe('when accountRemoved is published', () => {
    it('does not update state if account removed is not in the list of accounts', async () => {
      const { controller, messenger, updateSpy } = setupController();

      messenger.publish(
        'AccountsController:accountRemoved',
        '0x0000000000000000000000000000000000000000',
      );

      expect(controller.state.tokenBalances).toStrictEqual({});
      expect(updateSpy).toHaveBeenCalledTimes(0);
    });
    it('removes the balances for the removed account', async () => {
      const chainId = '0x1';
      const accountAddress = '0x0000000000000000000000000000000000000000';
      const accountAddress2 = '0x0000000000000000000000000000000000000002';
      const tokenAddress = '0x0000000000000000000000000000000000000001';
      const tokenAddress2 = '0x0000000000000000000000000000000000000022';
      const account = createMockInternalAccount({
        address: accountAddress,
      });
      const account2 = createMockInternalAccount({
        address: accountAddress2,
      });

      const tokens = {
        allDetectedTokens: {},
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, symbol: 's', decimals: 0 },
            ],
            [accountAddress2]: [
              { address: tokenAddress2, symbol: 't', decimals: 0 },
            ],
          },
        },
      };

      const { controller, messenger } = setupController({
        tokens,
        listAccounts: [account, account2],
      });
      // Enable multi account balances
      messenger.publish(
        'PreferencesController:stateChange',
        { isMultiAccountBalancesEnabled: true } as PreferencesState,
        [],
      );
      expect(controller.state.tokenBalances).toStrictEqual({});

      const balance = 123456;
      const balance2 = 200;
      jest.spyOn(multicall, 'multicallOrFallback').mockResolvedValue([
        {
          success: true,
          value: new BN(balance),
        },
        { success: true, value: new BN(balance2) },
      ]);

      await controller._executePoll({ chainId });

      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress]: {
          [chainId]: {
            [tokenAddress]: toHex(balance),
          },
        },
        [accountAddress2]: {
          [chainId]: {
            [tokenAddress2]: toHex(balance2),
          },
        },
      });

      messenger.publish('AccountsController:accountRemoved', account.id);

      await advanceTime({ clock, duration: 1 });

      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress2]: {
          [chainId]: {
            [tokenAddress2]: toHex(balance2),
          },
        },
      });
    });
  });
});
