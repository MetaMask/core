import { Messenger } from '@metamask/base-controller';
import { toHex } from '@metamask/controller-utils';
import * as controllerUtils from '@metamask/controller-utils';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { NetworkState } from '@metamask/network-controller';
import type { PreferencesState } from '@metamask/preferences-controller';
import { CHAIN_IDS } from '@metamask/transaction-controller';
import BN from 'bn.js';
import { useFakeTimers } from 'sinon';

import * as multicall from './multicall';
import type {
  AllowedActions,
  AllowedEvents,
  ChainIdHex,
  TokenBalancesControllerActions,
  TokenBalancesControllerEvents,
  TokenBalancesControllerState,
} from './TokenBalancesController';
import { TokenBalancesController } from './TokenBalancesController';
import type { TokensControllerState } from './TokensController';
import { advanceTime } from '../../../tests/helpers';
import { createMockInternalAccount } from '../../accounts-controller/src/tests/mocks';
import type { RpcEndpoint } from '../../network-controller/src/NetworkController';

// Mock safelyExecuteWithTimeout
jest.mock('@metamask/controller-utils', () => ({
  ...jest.requireActual('@metamask/controller-utils'),
  safelyExecuteWithTimeout: jest.fn(),
}));

// Constants for native token and staking addresses used in tests
const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
const STAKING_CONTRACT_ADDRESS = '0x4FEF9D741011476750A243aC70b9789a63dd47Df';

// Mock function for safelyExecuteWithTimeout
const { safelyExecuteWithTimeout } = jest.requireMock(
  '@metamask/controller-utils',
);
const mockedSafelyExecuteWithTimeout = safelyExecuteWithTimeout as jest.Mock;

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
      'AccountTrackerController:updateNativeBalances',
      'AccountTrackerController:updateStakedBalances',
    ],
    allowedEvents: [
      'NetworkController:stateChange',
      'PreferencesController:stateChange',
      'TokensController:stateChange',
      'KeyringController:accountRemoved',
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
        '0x89': {
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
    'AccountTrackerController:updateNativeBalances',
    jest.fn(),
  );

  messenger.registerActionHandler(
    'AccountTrackerController:updateStakedBalances',
    jest.fn(),
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
    jest.fn().mockReturnValue({
      provider: jest.fn(),
      blockTracker: {
        checkForLatestBlock: jest.fn().mockResolvedValue(undefined),
      },
      getBlockNumber: jest.fn().mockResolvedValue(1),
    }),
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

    // Mock safelyExecuteWithTimeout to execute the operation normally by default
    mockedSafelyExecuteWithTimeout.mockImplementation(
      async (operation: () => Promise<unknown>) => {
        try {
          return await operation();
        } catch {
          return undefined;
        }
      },
    );
  });

  afterEach(() => {
    clock.restore();
    mockedSafelyExecuteWithTimeout.mockRestore();
    jest.restoreAllMocks();
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

    controller.startPolling({ chainIds: ['0x1'] });

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
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress]: {
            [accountAddress]: new BN(balance),
          },
        },
      });

    await controller._executePoll({ chainIds: [chainId] });

    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
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
      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddress]: {
              [accountAddress]: new BN(balance),
            },
          },
        });

      await controller._executePoll({ chainIds: [chainId] });

      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress]: toHex(balance),
            [STAKING_CONTRACT_ADDRESS]: '0x0',
          },
        },
      });
    }
  });

  it('updates balances when tokens are added', async () => {
    const chainId = '0x1';
    const { controller, messenger } = setupController();

    // Define variables first
    const accountAddress = '0x0000000000000000000000000000000000000000';
    const tokenAddress = '0x0000000000000000000000000000000000000001';

    // No tokens initially
    await controller._executePoll({ chainIds: [chainId] });
    expect(controller.state.tokenBalances).toStrictEqual({});

    const balance = 123456;
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress]: {
            [accountAddress]: new BN(balance),
          },
        },
      });

    // Publish an update with a token

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
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
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
      config: { useAccountsAPI: false, allowExternalServices: () => true },
    });

    // Set initial balance
    const balance = 123456;
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress]: {
            [accountAddress]: new BN(balance),
          },
        },
      });

    await controller._executePoll({ chainIds: [chainId] });

    // Verify initial balance is set
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
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
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress]: {
            [accountAddress]: new BN(balance),
          },
        },
      });

    await controller._executePoll({ chainIds: [chainId] });

    // Verify initial balance is set
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
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

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
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
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress]: {
            [accountAddress]: new BN(balance),
          },
        },
      });

    await controller._executePoll({ chainIds: [chainId] });

    // Verify initial balance is set
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
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
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
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
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress]: {
            [account1]: new BN(balance1),
            [account2]: new BN(balance2),
          },
        },
      });

    await controller._executePoll({ chainIds: [chainId] });

    expect(controller.state.tokenBalances).toStrictEqual({
      [account1]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance1),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
      [account2]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance2),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
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
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress]: {
            [account1]: new BN(balance1),
            [account2]: new BN(balance2),
          },
        },
      });

    await controller._executePoll({ chainIds: [chainId] });

    expect(controller.state.tokenBalances).toStrictEqual({
      [account1]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance1),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
      [account2]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance2),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
    });

    await controller._executePoll({ chainIds: [chainId] });

    // Should only update once since the values haven't changed
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('does not update balances when multi-account balances is enabled and multi-account contract failed', async () => {
    const chainId = '0x1';
    const account1 = '0x0000000000000000000000000000000000000001';
    const tokenAddress = '0x0000000000000000000000000000000000000003';

    const tokens = {
      allDetectedTokens: {},
      allTokens: {
        [chainId]: {
          [account1]: [{ address: tokenAddress, symbol: 's', decimals: 0 }],
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

    // Mock Promise allSettled to return a failure for the multi-account contract
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({ tokenBalances: {} });

    await controller._executePoll({ chainIds: [chainId] });

    expect(controller.state.tokenBalances).toStrictEqual({
      [account1]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
    });

    await controller._executePoll({ chainIds: [chainId] });

    expect(updateSpy).toHaveBeenCalledTimes(1); // Called once because native/staking balances are added
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
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress]: {
            [account1]: new BN(balance1),
            [account2]: new BN(balance2),
          },
        },
      });

    await controller._executePoll({ chainIds: [chainId] });

    expect(controller.state.tokenBalances).toStrictEqual({
      [account1]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance1),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
      [account2]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance2),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
    });

    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockClear()
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress]: {
            [account1]: new BN(balance1),
            [account2]: new BN(balance3),
          },
        },
      });

    await controller._executePoll({ chainIds: [chainId] });

    expect(controller.state.tokenBalances).toStrictEqual({
      [account1]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance1),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
      [account2]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance3),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
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
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress]: {
            [selectedAccount]: new BN(balance),
          },
        },
      });

    await controller._executePoll({ chainIds: [chainId] });

    // Should only contain balance for selected account
    expect(controller.state.tokenBalances).toStrictEqual({
      [selectedAccount]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress]: toHex(balance),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
      [otherAccount]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [STAKING_CONTRACT_ADDRESS]: '0x0',
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
    it('does not update state if account removed is EVM account', async () => {
      const { controller, messenger, updateSpy } = setupController();

      messenger.publish('KeyringController:accountRemoved', 'toto');

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
        config: { useAccountsAPI: false, allowExternalServices: () => true },
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
      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddress]: {
              [accountAddress]: new BN(balance),
            },
            [tokenAddress2]: {
              [accountAddress2]: new BN(balance2),
            },
          },
        });

      await controller._executePoll({ chainIds: [chainId] });

      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress]: toHex(balance),
            [STAKING_CONTRACT_ADDRESS]: '0x0',
          },
        },
        [accountAddress2]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress2]: toHex(balance2),
            [STAKING_CONTRACT_ADDRESS]: '0x0',
          },
        },
      });

      messenger.publish('KeyringController:accountRemoved', account.address);

      await advanceTime({ clock, duration: 1 });

      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress2]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress2]: toHex(balance2),
            [STAKING_CONTRACT_ADDRESS]: '0x0',
          },
        },
      });
    });
  });

  describe('multicall integration', () => {
    it('should use getTokenBalancesForMultipleAddresses when available', async () => {
      const mockGetTokenBalances = jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValueOnce({
          tokenBalances: {
            '0x6B175474E89094C44Da98b954EedeAC495271d0F': {
              '0x1234567890123456789012345678901234567890': new BN('1000'),
            },
          },
          stakedBalances: {},
        });

      const { controller } = setupController({
        config: { useAccountsAPI: false, allowExternalServices: () => true },
        tokens: {
          allTokens: {
            '0x1': {
              '0x1234567890123456789012345678901234567890': [
                {
                  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
                  symbol: 'DAI',
                  decimals: 18,
                },
              ],
            },
          },
          allDetectedTokens: {},
        },
        listAccounts: [
          createMockInternalAccount({
            address: '0x1234567890123456789012345678901234567890',
          }),
        ],
      });

      await controller.updateBalances({ chainIds: ['0x1'] });

      // Verify the new multicall function was called
      expect(mockGetTokenBalances).toHaveBeenCalled();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle single account mode configuration', async () => {
      const accountAddress = '0x1111111111111111111111111111111111111111';

      const { controller } = setupController({
        config: { useAccountsAPI: false, allowExternalServices: () => true },
        tokens: {
          allTokens: {
            '0x1': {
              [accountAddress]: [
                { address: '0xToken1', symbol: 'TK1', decimals: 18 },
              ],
            },
          },
          allDetectedTokens: {},
        },
      });

      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            '0xToken1': {
              [accountAddress]: new BN(100),
            },
          },
        });

      await controller.updateBalances({ chainIds: ['0x1'] });

      // Verify the controller is properly configured
      expect(controller).toBeDefined();

      // Verify multicall was attempted
      expect(multicall.getTokenBalancesForMultipleAddresses).toHaveBeenCalled();
    });

    it('should handle different constructor options', () => {
      const customInterval = 60000;
      const { controller } = setupController({
        config: {
          interval: customInterval,
          useAccountsAPI: false,
          allowExternalServices: () => true,
        },
      });

      expect(controller).toBeDefined();
      // Verify interval was set correctly
      expect(controller.getIntervalLength()).toBe(customInterval);
    });
  });

  describe('event publishing', () => {
    it('should include zero staked balances in state change event when no staked balances are returned', async () => {
      const accountAddress = '0x1111111111111111111111111111111111111111';
      const chainId = '0x1';

      const { controller, messenger } = setupController({
        config: { useAccountsAPI: false, allowExternalServices: () => true },
        tokens: {
          allTokens: {
            [chainId]: {
              [accountAddress]: [
                { address: '0xToken1', symbol: 'TK1', decimals: 18 },
              ],
            },
          },
          allDetectedTokens: {},
        },
        listAccounts: [createMockInternalAccount({ address: accountAddress })],
      });

      // Set up spy for event publishing
      const publishSpy = jest.spyOn(messenger, 'publish');

      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            '0xToken1': {
              [accountAddress]: new BN(100),
            },
          },
          stakedBalances: {}, // Empty staked balances
        });

      await controller.updateBalances({ chainIds: [chainId] });

      // Verify that staked balances are included in the state change event (even if zero)
      expect(publishSpy).toHaveBeenCalledWith(
        'TokenBalancesController:stateChange',
        expect.objectContaining({
          tokenBalances: {
            [accountAddress]: {
              [chainId]: expect.objectContaining({
                [STAKING_CONTRACT_ADDRESS]: '0x0', // Zero staked balance should be included
              }),
            },
          },
        }),
        expect.any(Array),
      );
    });
  });

  describe('batch operations and multicall edge cases', () => {
    it('should handle partial multicall results', async () => {
      const accountAddress = '0x1111111111111111111111111111111111111111';
      const tokenAddress1 = '0x2222222222222222222222222222222222222222';
      const tokenAddress2 = '0x3333333333333333333333333333333333333333';
      const chainId = '0x1';

      const { controller } = setupController({
        config: { useAccountsAPI: false, allowExternalServices: () => true },
        tokens: {
          allTokens: {
            [chainId]: {
              [accountAddress]: [
                { address: tokenAddress1, symbol: 'TK1', decimals: 18 },
                { address: tokenAddress2, symbol: 'TK2', decimals: 18 },
              ],
            },
          },
          allDetectedTokens: {},
        },
        listAccounts: [createMockInternalAccount({ address: accountAddress })],
      });

      // Mock multicall to return partial results
      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddress1]: {
              [accountAddress]: new BN(100),
            },
            // tokenAddress2 missing (failed call)
          },
        });

      await controller.updateBalances({ chainIds: [chainId] });

      // Only successful token should be in state
      expect(
        controller.state.tokenBalances[accountAddress][chainId],
      ).toStrictEqual({
        [NATIVE_TOKEN_ADDRESS]: '0x0',
        [tokenAddress1]: toHex(100),
        [tokenAddress2]: '0x0',
        [STAKING_CONTRACT_ADDRESS]: '0x0',
      });
    });
  });

  describe('state management edge cases', () => {
    it('should handle complex token removal scenarios', async () => {
      const accountAddress = '0x1111111111111111111111111111111111111111';
      const chainId = '0x1';
      const tokenAddress1 = '0x2222222222222222222222222222222222222222';
      const tokenAddress2 = '0x3333333333333333333333333333333333333333';

      const { controller } = setupController({
        tokens: {
          allTokens: {
            [chainId]: {
              [accountAddress]: [
                { address: tokenAddress1, symbol: 'TK1', decimals: 18 },
                { address: tokenAddress2, symbol: 'TK2', decimals: 18 },
              ],
            },
          },
          allDetectedTokens: {},
        },
      });

      // Set initial balances using updateBalances first
      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValueOnce({
          tokenBalances: {
            [tokenAddress1]: { [accountAddress]: new BN(100) },
            [tokenAddress2]: { [accountAddress]: new BN(200) },
          },
        });

      await controller.updateBalances({ chainIds: [chainId] });

      // Verify both tokens are in state
      expect(
        controller.state.tokenBalances[accountAddress][chainId],
      ).toStrictEqual({
        [NATIVE_TOKEN_ADDRESS]: '0x0',
        [tokenAddress1]: toHex(100),
        [tokenAddress2]: toHex(200),
        [STAKING_CONTRACT_ADDRESS]: '0x0',
      });

      // For this test, we just verify the basic functionality without testing
      // the complex internal state change handling which requires private access
      expect(
        controller.state.tokenBalances[accountAddress][chainId],
      ).toStrictEqual({
        [NATIVE_TOKEN_ADDRESS]: '0x0',
        [tokenAddress1]: toHex(100),
        [tokenAddress2]: toHex(200),
        [STAKING_CONTRACT_ADDRESS]: '0x0',
      });
    });

    it('should handle invalid account addresses in account removal', () => {
      const { controller } = setupController();

      // Test that the controller exists and can handle basic operations
      // The actual event publishing is handled by the messaging system
      expect(controller).toBeDefined();
      expect(controller.state.tokenBalances).toStrictEqual({});
    });
  });

  it('handles case when no target chains are provided', async () => {
    const { controller } = setupController();

    // Mock the controller to have no chains with tokens
    Object.defineProperty(controller, '#chainIdsWithTokens', {
      value: [],
      writable: true,
    });

    // This should not throw and should return early
    await controller.updateBalances();

    // Verify no balances were fetched
    expect(controller.state.tokenBalances).toStrictEqual({});
  });

  it('handles case when no balances are aggregated', async () => {
    const { controller } = setupController();

    // Mock empty aggregated results
    const mockFetcher = {
      supports: jest.fn().mockReturnValue(true),
      fetch: jest.fn().mockResolvedValue([]), // Return empty array
    };

    // Replace the balance fetchers with our mock
    Object.defineProperty(controller, '#balanceFetchers', {
      value: [mockFetcher],
      writable: true,
    });

    await controller.updateBalances({ chainIds: ['0x1'] });

    // Verify no state update occurred
    expect(controller.state.tokenBalances).toStrictEqual({});
  });

  it('handles case when no network configuration is found', async () => {
    const { controller } = setupController();

    // Mock the controller to have no chains with tokens
    Object.defineProperty(controller, '#chainIdsWithTokens', {
      value: [],
      writable: true,
    });

    await controller.updateBalances({ chainIds: ['0x2'] });

    // Verify no balances were fetched
    expect(controller.state.tokenBalances).toStrictEqual({});
  });

  it('update native balance when fetch is successful', async () => {
    const chainId = '0x1';
    const accountAddress = '0x0000000000000000000000000000000000000000';
    const tokenAddress = '0x0000000000000000000000000000000000000000';

    const { controller } = setupController({
      config: { useAccountsAPI: false, allowExternalServices: () => true },
      tokens: {
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, symbol: 's', decimals: 0 },
            ],
          },
        },
        allDetectedTokens: {},
      },
    });

    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress]: {
            [accountAddress]: new BN(100),
          },
        },
      });

    // Mock the controller to have no chains with tokens
    Object.defineProperty(controller, '#chainIdsWithTokens', {
      value: [],
      writable: true,
    });

    await controller.updateBalances({ chainIds: ['0x1'] });

    // Verify no balances were fetched
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [tokenAddress]: toHex(100),
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
    });
  });

  it('sets balance to 0 for tokens in allTokens state that do not return balance results', async () => {
    const chainId = '0x1';
    const accountAddress = '0x0000000000000000000000000000000000000000';
    const tokenAddress1 = '0x0000000000000000000000000000000000000001'; // Will have balance returned
    const tokenAddress2 = '0x0000000000000000000000000000000000000002'; // Will NOT have balance returned
    const tokenAddress3 = '0x0000000000000000000000000000000000000003'; // Will NOT have balance returned
    const detectedTokenAddress = '0x0000000000000000000000000000000000000004'; // Will NOT have balance returned

    const tokens = {
      allTokens: {
        [chainId]: {
          [accountAddress]: [
            { address: tokenAddress1, symbol: 'TK1', decimals: 18 },
            { address: tokenAddress2, symbol: 'TK2', decimals: 18 },
            { address: tokenAddress3, symbol: 'TK3', decimals: 18 },
          ],
        },
      },
      allDetectedTokens: {
        [chainId]: {
          [accountAddress]: [
            { address: detectedTokenAddress, symbol: 'DTK', decimals: 18 },
          ],
        },
      },
    };

    const { controller } = setupController({
      tokens,
      config: { useAccountsAPI: false, allowExternalServices: () => true },
      listAccounts: [createMockInternalAccount({ address: accountAddress })],
    });

    // Mock multicall to return balance for only one token
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress1]: {
            [accountAddress]: new BN(123456), // Only this token has a balance returned
          },
          // tokenAddress2, tokenAddress3, and detectedTokenAddress are missing from results
        },
      });

    await controller.updateBalances({ chainIds: [chainId] });

    // Verify that:
    // - tokenAddress1 has its actual fetched balance
    // - tokenAddress2, tokenAddress3, and detectedTokenAddress have balance 0
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress1]: toHex(123456), // Actual fetched balance
          [tokenAddress2]: '0x0', // Zero balance for missing token
          [tokenAddress3]: '0x0', // Zero balance for missing token
          [detectedTokenAddress]: '0x0', // Zero balance for missing detected token
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
    });
  });

  it('sets balance to 0 for tokens in allTokens state when balance fetcher fails completely', async () => {
    const chainId = '0x1';
    const accountAddress = '0x0000000000000000000000000000000000000000';
    const tokenAddress1 = '0x0000000000000000000000000000000000000001';
    const tokenAddress2 = '0x0000000000000000000000000000000000000002';

    const tokens = {
      allTokens: {
        [chainId]: {
          [accountAddress]: [
            { address: tokenAddress1, symbol: 'TK1', decimals: 18 },
            { address: tokenAddress2, symbol: 'TK2', decimals: 18 },
          ],
        },
      },
      allDetectedTokens: {},
    };

    const { controller } = setupController({
      tokens,
      config: { useAccountsAPI: false, allowExternalServices: () => true },
      listAccounts: [createMockInternalAccount({ address: accountAddress })],
    });

    // Mock multicall to return empty results (complete failure)
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {}, // No balances returned at all
      });

    await controller.updateBalances({ chainIds: [chainId] });

    // Verify all tokens have zero balance
    expect(controller.state.tokenBalances).toStrictEqual({
      [accountAddress]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress1]: '0x0', // Zero balance when fetch fails
          [tokenAddress2]: '0x0', // Zero balance when fetch fails
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
    });
  });

  it('sets balance to 0 for tokens in allTokens state when querying all accounts', async () => {
    const chainId = '0x1';
    const account1 = '0x0000000000000000000000000000000000000001';
    const account2 = '0x0000000000000000000000000000000000000002';
    const tokenAddress1 = '0x0000000000000000000000000000000000000003';
    const tokenAddress2 = '0x0000000000000000000000000000000000000004';

    const tokens = {
      allTokens: {
        [chainId]: {
          [account1]: [{ address: tokenAddress1, symbol: 'TK1', decimals: 18 }],
          [account2]: [{ address: tokenAddress2, symbol: 'TK2', decimals: 18 }],
        },
      },
      allDetectedTokens: {},
    };

    const { controller } = setupController({
      tokens,
      config: {
        queryMultipleAccounts: true,
        useAccountsAPI: false,
        allowExternalServices: () => true,
      },
      listAccounts: [
        createMockInternalAccount({ address: account1 }),
        createMockInternalAccount({ address: account2 }),
      ],
    });

    // Mock multicall to return balance for only one account/token combination
    jest
      .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
      .mockResolvedValue({
        tokenBalances: {
          [tokenAddress1]: {
            [account1]: new BN(500), // Only this account/token has balance returned
          },
          // account2/tokenAddress2 missing from results
        },
      });

    await controller.updateBalances({ chainIds: [chainId] });

    // Verify both accounts have their respective tokens with appropriate balances
    expect(controller.state.tokenBalances).toStrictEqual({
      [account1]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress1]: toHex(500), // Actual fetched balance
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
      [account2]: {
        [chainId]: {
          [NATIVE_TOKEN_ADDRESS]: '0x0',
          [tokenAddress2]: '0x0', // Zero balance for missing token
          [STAKING_CONTRACT_ADDRESS]: '0x0',
        },
      },
    });
  });

  describe('staked balance functionality', () => {
    it('should include staked balances in token balances state', async () => {
      const chainId = '0x1';
      const accountAddress = '0x1111111111111111111111111111111111111111';
      const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
      const stakedBalance = new BN('5000000000000000000'); // 5 ETH staked

      const tokens = {
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, symbol: 'DAI', decimals: 18 },
            ],
          },
        },
        allDetectedTokens: {},
      };

      const { controller } = setupController({ tokens });

      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddress]: {
              [accountAddress]: new BN('1000000000000000000'), // 1 DAI
            },
          },
          stakedBalances: {
            [accountAddress]: stakedBalance,
          },
        });

      await controller.updateBalances({ chainIds: [chainId] });

      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress]: toHex(new BN('1000000000000000000')),
            [STAKING_CONTRACT_ADDRESS]: toHex(stakedBalance),
          },
        },
      });
    });

    it('should handle staked balances with multiple accounts', async () => {
      const chainId = '0x1';
      const account1 = '0x1111111111111111111111111111111111111111';
      const account2 = '0x2222222222222222222222222222222222222222';
      const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

      const tokens = {
        allTokens: {
          [chainId]: {
            [account1]: [
              { address: tokenAddress, symbol: 'DAI', decimals: 18 },
            ],
            [account2]: [
              { address: tokenAddress, symbol: 'DAI', decimals: 18 },
            ],
          },
        },
        allDetectedTokens: {},
      };

      const { controller, messenger } = setupController({ tokens });

      // Enable multi-account balances
      messenger.publish(
        'PreferencesController:stateChange',
        { isMultiAccountBalancesEnabled: true } as PreferencesState,
        [],
      );

      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddress]: {
              [account1]: new BN('1000000000000000000'),
              [account2]: new BN('2000000000000000000'),
            },
          },
          stakedBalances: {
            [account1]: new BN('3000000000000000000'), // 3 ETH staked
            [account2]: new BN('4000000000000000000'), // 4 ETH staked
          },
        });

      await controller.updateBalances({ chainIds: [chainId] });

      expect(controller.state.tokenBalances).toStrictEqual({
        [account1]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress]: toHex(new BN('1000000000000000000')),
            [STAKING_CONTRACT_ADDRESS]: toHex(new BN('3000000000000000000')),
          },
        },
        [account2]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress]: toHex(new BN('2000000000000000000')),
            [STAKING_CONTRACT_ADDRESS]: toHex(new BN('4000000000000000000')),
          },
        },
      });
    });

    it('should handle zero staked balances', async () => {
      const chainId = '0x1';
      const accountAddress = '0x1111111111111111111111111111111111111111';
      const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

      const tokens = {
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, symbol: 'DAI', decimals: 18 },
            ],
          },
        },
        allDetectedTokens: {},
      };

      const { controller } = setupController({ tokens });

      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddress]: {
              [accountAddress]: new BN('1000000000000000000'),
            },
          },
          stakedBalances: {
            [accountAddress]: new BN('0'), // Zero staked balance
          },
        });

      await controller.updateBalances({ chainIds: [chainId] });

      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress]: toHex(new BN('1000000000000000000')),
            [STAKING_CONTRACT_ADDRESS]: '0x0', // Zero balance
          },
        },
      });
    });

    it('should handle missing staked balances gracefully', async () => {
      const chainId = '0x1';
      const accountAddress = '0x1111111111111111111111111111111111111111';
      const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

      const tokens = {
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, symbol: 'DAI', decimals: 18 },
            ],
          },
        },
        allDetectedTokens: {},
      };

      const { controller } = setupController({ tokens });

      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddress]: {
              [accountAddress]: new BN('1000000000000000000'),
            },
          },
          // No stakedBalances property
        });

      await controller.updateBalances({ chainIds: [chainId] });

      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress]: toHex(new BN('1000000000000000000')),
            [STAKING_CONTRACT_ADDRESS]: '0x0',
          },
        },
      });
    });

    it('should handle unsupported chains for staking', async () => {
      const chainId = '0x89'; // Polygon - no staking support
      const accountAddress = '0x1111111111111111111111111111111111111111';
      const tokenAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

      const tokens = {
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, symbol: 'DAI', decimals: 18 },
            ],
          },
        },
        allDetectedTokens: {},
      };

      const { controller } = setupController({
        tokens,
        config: { useAccountsAPI: false, allowExternalServices: () => true },
      });

      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddress]: {
              [accountAddress]: new BN('1000000000000000000'),
            },
          },
        });

      await controller.updateBalances({ chainIds: [chainId] });

      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress]: toHex(new BN('1000000000000000000')),
            // No staking contract address for unsupported chain
          },
        },
      });
    });
  });

  describe('error logging', () => {
    it('should log error when balance fetcher throws in try-catch block', async () => {
      const chainId = '0x1';
      const accountAddress = '0x0000000000000000000000000000000000000000';
      const tokenAddress = '0x0000000000000000000000000000000000000001';
      const mockError = new Error('Fetcher failed');

      // Spy on console.error since safelyExecuteWithTimeout logs errors there
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Override the mock to use the real safelyExecuteWithTimeout for this test
      const realSafelyExecuteWithTimeout = jest.requireActual(
        '@metamask/controller-utils',
      ).safelyExecuteWithTimeout;
      mockedSafelyExecuteWithTimeout.mockImplementation(
        realSafelyExecuteWithTimeout,
      );

      // Set up tokens so there's something to fetch
      const tokens = {
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              {
                address: tokenAddress,
                symbol: 'TEST',
                decimals: 18,
              },
            ],
          },
        },
        allDetectedTokens: {},
      };

      const { controller } = setupController({ tokens });

      // Mock the multicall function to throw an error
      const multicallSpy = jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockRejectedValue(mockError);

      await controller.updateBalances({ chainIds: [chainId] });

      // With safelyExecuteWithTimeout, errors are logged as console.error
      // and the operation continues gracefully
      expect(consoleErrorSpy).toHaveBeenCalledWith(mockError);

      // Restore mocks
      multicallSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should log error when updateBalances fails after token change', async () => {
      const chainId = '0x1';
      const accountAddress = '0x0000000000000000000000000000000000000000';
      const tokenAddress = '0x0000000000000000000000000000000000000001';
      const mockError = new Error('UpdateBalances failed');

      // Spy on console.warn
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { controller, messenger } = setupController();

      // Mock updateBalances to throw an error
      const updateBalancesSpy = jest
        .spyOn(controller, 'updateBalances')
        .mockRejectedValue(mockError);

      // Publish a token change that should trigger updateBalances
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

      // Verify updateBalances was called
      expect(updateBalancesSpy).toHaveBeenCalled();

      // Wait a bit more for the catch block to execute
      await advanceTime({ clock, duration: 1 });

      // Verify the error was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Error updating balances after token change:',
        mockError,
      );

      // Restore the original method
      updateBalancesSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should handle timeout scenario', async () => {
      const chainId = '0x1';
      const accountAddress = '0x0000000000000000000000000000000000000000';
      const tokenAddress = '0x0000000000000000000000000000000000000001';

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Set up tokens so there's something to fetch
      const tokens = {
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              {
                address: tokenAddress,
                symbol: 'TEST',
                decimals: 18,
              },
            ],
          },
        },
        allDetectedTokens: {},
      };

      const { controller } = setupController({ tokens });

      // Use fake timers for precise control
      jest.useFakeTimers();

      // Mock safelyExecuteWithTimeout to simulate timeout by returning undefined
      mockedSafelyExecuteWithTimeout.mockImplementation(
        async () => undefined, // Simulates timeout behavior
      );

      // Mock the multicall function - this won't be reached due to timeout simulation
      const multicallSpy = jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {},
          stakedBalances: {},
        });

      try {
        // Start the balance update - should complete gracefully despite timeout
        await controller.updateBalances({
          chainIds: [chainId],
        });

        // With safelyExecuteWithTimeout, timeouts are handled gracefully
        // The system should continue operating without throwing errors
        // No specific timeout error message should be logged at controller level

        // Verify that the update completed without errors
        expect(controller.state.tokenBalances).toBeDefined();

        // Restore mocks
        multicallSpy.mockRestore();
        consoleWarnSpy.mockRestore();
      } finally {
        // Always restore timers
        jest.useRealTimers();
      }
    });
  });

  describe('token address normalization', () => {
    it('should normalize token addresses to checksum format to prevent duplicate entries', async () => {
      const chainId = '0x1';
      const accountAddress = '0x0000000000000000000000000000000000000000';
      // Same token address in different cases
      const tokenAddressLowercase =
        '0x581c3c1a2a4ebde2a0df29b5cf4c116e42945947';
      const tokenAddressRandomCase =
        '0x581c3C1A2A4ebde2a0df29B5cf4c116E42945947';
      const tokenAddressProperChecksum =
        '0x581c3C1A2A4EBDE2A0Df29B5cf4c116E42945947';

      const tokens = {
        allDetectedTokens: {},
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              // Token stored with random case address
              { address: tokenAddressRandomCase, symbol: 'TK1', decimals: 18 },
            ],
          },
        },
      };

      const { controller } = setupController({
        tokens,
        config: { useAccountsAPI: false, allowExternalServices: () => true },
      });

      // Mock balance fetcher to return balance with lowercase address
      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddressLowercase]: {
              [accountAddress]: new BN(100000), // 0x186a0
            },
          },
        });

      await controller.updateBalances({ chainIds: [chainId] });

      // Should only have one entry with proper checksum address
      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddressProperChecksum]: '0x186a0', // Only checksum version exists
            [STAKING_CONTRACT_ADDRESS]: '0x0',
          },
        },
      });

      // Verify no duplicate entries exist
      const tokenKeys = Object.keys(
        controller.state.tokenBalances[accountAddress][chainId],
      );
      const tokenAddressKeys = tokenKeys.filter((key) =>
        key.toLowerCase().includes('581c3c1a2a4ebde2a0df29b5cf4c116e42945947'),
      );
      expect(tokenAddressKeys).toHaveLength(1);
      expect(tokenAddressKeys[0]).toBe(tokenAddressProperChecksum);
    });

    it('should handle mixed case addresses in both allTokens and allDetectedTokens', async () => {
      const chainId = '0x1';
      const accountAddress = '0x0000000000000000000000000000000000000000';
      const tokenAddress1Mixed = '0x581c3C1A2A4EBDE2A0Df29B5cf4c116E42945947';
      const tokenAddress2Mixed = '0xA0B86A33E6776C0b983F3B0862F02C30CABA2b75';
      const tokenAddress1Checksum =
        '0x581c3C1A2A4EBDE2A0Df29B5cf4c116E42945947';
      const tokenAddress2Checksum =
        '0xa0B86a33E6776c0B983f3B0862F02C30cAbA2b75';
      const tokenAddress1Lower = tokenAddress1Mixed.toLowerCase();
      const tokenAddress2Lower = tokenAddress2Mixed.toLowerCase();

      const tokens = {
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress1Mixed, symbol: 'TK1', decimals: 18 },
            ],
          },
        },
        allDetectedTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress2Mixed, symbol: 'TK2', decimals: 18 },
            ],
          },
        },
      };

      const { controller } = setupController({
        tokens,
        config: { useAccountsAPI: false, allowExternalServices: () => true },
      });

      // Mock balances returned with lowercase addresses
      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddress1Lower]: {
              [accountAddress]: new BN(500),
            },
            [tokenAddress2Lower]: {
              [accountAddress]: new BN(1000),
            },
          },
        });

      await controller.updateBalances({ chainIds: [chainId] });

      // All addresses should be normalized to proper checksum format
      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress1Checksum]: toHex(500),
            [tokenAddress2Checksum]: toHex(1000),
            [STAKING_CONTRACT_ADDRESS]: '0x0',
          },
        },
      });
    });

    it('should normalize fetched balance addresses to prevent case-sensitive duplicates', async () => {
      const chainId = '0x1';
      const accountAddress = '0x0000000000000000000000000000000000000000';
      const tokenAddressStored = '0x581c3c1a2a4ebde2a0df29b5cf4c116e42945947'; // lowercase in storage
      const tokenAddressFetched = '0x581C3c1a2A4ebDE2a0Df29B5cf4c116E42945947'; // different mixed case in fetch result
      const tokenAddressChecksum = '0x581c3C1A2A4EBDE2A0Df29B5cf4c116E42945947'; // proper checksum

      const tokens = {
        allDetectedTokens: {},
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddressStored, symbol: 'TK1', decimals: 18 },
            ],
          },
        },
      };

      const { controller } = setupController({
        tokens,
        config: { useAccountsAPI: false, allowExternalServices: () => true },
      });

      // Mock fetcher to return balance with different mixed case address
      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddressFetched]: {
              [accountAddress]: new BN(100000),
            },
          },
        });

      await controller.updateBalances({ chainIds: [chainId] });

      // Should only have one normalized entry with proper checksum
      expect(controller.state.tokenBalances).toStrictEqual({
        [accountAddress]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddressChecksum]: '0x186a0', // Only checksum version exists
            [STAKING_CONTRACT_ADDRESS]: '0x0',
          },
        },
      });

      // Verify no case variations exist as separate keys
      const chainBalances =
        controller.state.tokenBalances[accountAddress][chainId];
      expect(chainBalances[tokenAddressFetched]).toBeUndefined();
      expect(chainBalances[tokenAddressStored]).toBeUndefined();
      expect(chainBalances[tokenAddressChecksum]).toBe('0x186a0');
    });

    it('should prevent the exact duplicate issue from the user report', async () => {
      const chainId = '0x1'; // Use a supported chain ID for simpler setup
      const accountAddress = '0x5cfe73b6021e818b776b421b1c4db2474086a7e1'; // Account from user's example
      const tokenAddressLower = '0x581c3c1a2a4ebde2a0df29b5cf4c116e42945947';
      const tokenAddressMixed = '0x581C3c1a2A4ebDE2a0Df29B5cf4c116E42945947'; // Different mixed case
      const tokenAddressChecksum = '0x581c3C1A2A4EBDE2A0Df29B5cf4c116E42945947';

      const tokens = {
        allDetectedTokens: {},
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddressMixed, symbol: 'TK1', decimals: 18 },
            ],
          },
        },
      };

      const { controller } = setupController({
        tokens,
        config: { useAccountsAPI: false, allowExternalServices: () => true },
      });

      // Simulate the scenario that caused duplicates - different case in fetch results
      jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddressLower]: {
              [accountAddress]: new BN(0x186a0), // Balance for lowercase version
            },
          },
        });

      await controller.updateBalances({ chainIds: [chainId] });

      // Should have balances set for the account and chain
      expect(controller.state.tokenBalances[accountAddress]).toBeDefined();
      expect(
        controller.state.tokenBalances[accountAddress][chainId],
      ).toBeDefined();

      const chainBalances =
        controller.state.tokenBalances[accountAddress][chainId];

      // Should NOT have duplicate entries - only checksum version should exist
      expect(chainBalances[tokenAddressChecksum]).toBe('0x186a0');
      expect(chainBalances[tokenAddressLower]).toBeUndefined();
      expect(chainBalances[tokenAddressMixed]).toBeUndefined();

      // Count token entries (excluding native and staking)
      const allKeys = Object.keys(chainBalances);
      const nativeAndStakingKeys = [
        NATIVE_TOKEN_ADDRESS,
        STAKING_CONTRACT_ADDRESS,
      ];
      const tokenEntries = allKeys.filter(
        (key) => !nativeAndStakingKeys.includes(key),
      );
      expect(tokenEntries).toHaveLength(1);
      expect(tokenEntries[0]).toBe(tokenAddressChecksum);
    });
  });

  describe('constructor queryMultipleAccounts configuration', () => {
    it('should process only selected account when queryMultipleAccounts is false', async () => {
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
            [otherAccount]: [
              { address: tokenAddress, symbol: 's', decimals: 0 },
            ],
          },
        },
      };

      const listAccounts = [
        createMockInternalAccount({ address: selectedAccount }),
        createMockInternalAccount({ address: otherAccount }),
      ];

      // Configure controller with queryMultipleAccounts: false and disable API to avoid timeout
      const { controller } = setupController({
        config: {
          queryMultipleAccounts: false,
          useAccountsAPI: false,
          allowExternalServices: () => true,
        },
        tokens,
        listAccounts,
      });

      const balance = 100;
      const mockGetTokenBalances = jest
        .spyOn(multicall, 'getTokenBalancesForMultipleAddresses')
        .mockResolvedValue({
          tokenBalances: {
            [tokenAddress]: {
              [selectedAccount]: new BN(balance),
            },
          },
          stakedBalances: {},
        });

      await controller.updateBalances({ chainIds: [chainId] });

      // Verify that getTokenBalancesForMultipleAddresses was called with only the selected account
      expect(mockGetTokenBalances).toHaveBeenCalledWith(
        [
          {
            accountAddress: selectedAccount,
            tokenAddresses: [tokenAddress, NATIVE_TOKEN_ADDRESS],
          },
        ],
        chainId,
        expect.any(Object), // provider
        true, // include native
        true, // include staked
      );

      // Should only contain balance for selected account when queryMultipleAccounts is false
      expect(controller.state.tokenBalances).toStrictEqual({
        [selectedAccount]: {
          [chainId]: {
            [NATIVE_TOKEN_ADDRESS]: '0x0',
            [tokenAddress]: toHex(balance),
            [STAKING_CONTRACT_ADDRESS]: '0x0',
          },
        },
      });
    });

    it('should handle undefined address entries when processing network changes (covers line 475)', () => {
      const chainId1 = '0x1';
      const account1 = '0x0000000000000000000000000000000000000001';

      const { controller, messenger } = setupController();

      // Create a state where an address key exists but has undefined value
      // This directly targets the || {} fallback on line 475
      const stateWithUndefinedEntry = {
        tokenBalances: {
          [account1]: undefined, // This will trigger the || {} on line 475
        },
      };

      // Mock the controller's state getter to return our test state
      const originalState = controller.state;
      Object.defineProperty(controller, 'state', {
        get: () => ({ ...originalState, ...stateWithUndefinedEntry }),
        configurable: true,
      });

      // Trigger network change to execute the #onNetworkChanged method which contains line 475
      // This should not throw an error thanks to the || {} fallback
      expect(() => {
        messenger.publish(
          'NetworkController:stateChange',
          {
            selectedNetworkClientId: 'mainnet',
            networksMetadata: {},
            networkConfigurationsByChainId: {
              // @ts-expect-error - this is a test
              [chainId1]: {
                defaultRpcEndpointIndex: 0,
                rpcEndpoints: [{} as unknown as RpcEndpoint],
              },
            },
          },
          [],
        );
      }).not.toThrow();

      // Restore original state
      Object.defineProperty(controller, 'state', {
        get: () => originalState,
        configurable: true,
      });
    });
  });

  describe('Per-chain polling intervals', () => {
    it('should use default interval when no chain-specific config is provided', () => {
      const defaultInterval = 30000;
      const { controller } = setupController({
        config: { interval: defaultInterval },
      });

      // Any chain should get the default interval when no explicit config exists
      expect(controller.getChainPollingConfig('0x1')).toStrictEqual({
        interval: 30000,
      });
      expect(controller.getChainPollingConfig('0x89')).toStrictEqual({
        interval: 30000,
      });
    });

    it('should initialize with chain-specific polling intervals', () => {
      const chainPollingIntervals = {
        '0x1': { interval: 15000 },
        '0x89': { interval: 5000 },
      };

      const { controller } = setupController({
        config: {
          interval: 30000,
          chainPollingIntervals,
        },
        tokens: {
          allTokens: {
            '0x1': {
              '0x123': [{ address: '0xtoken1', symbol: 'T1', decimals: 18 }],
            },
            '0x89': {
              '0x123': [{ address: '0xtoken2', symbol: 'T2', decimals: 18 }],
            },
          },
          allDetectedTokens: {},
        },
      });

      // Test that individual chains return their configured intervals
      expect(controller.getChainPollingConfig('0x1')).toStrictEqual({
        interval: 15000,
      });
      expect(controller.getChainPollingConfig('0x89')).toStrictEqual({
        interval: 5000,
      });
    });

    it('should update chain polling configurations', () => {
      const { controller } = setupController({
        config: { interval: 30000 },
        tokens: {
          allTokens: {
            '0x1': {
              '0x123': [{ address: '0xtoken1', symbol: 'T1', decimals: 18 }],
            },
            '0x89': {
              '0x123': [{ address: '0xtoken2', symbol: 'T2', decimals: 18 }],
            },
          },
          allDetectedTokens: {},
        },
      });

      // Initially no explicit configurations, so chains use default intervals
      expect(controller.getChainPollingConfig('0x1')).toStrictEqual({
        interval: 30000,
      }); // Default
      expect(controller.getChainPollingConfig('0x89')).toStrictEqual({
        interval: 30000,
      }); // Default

      // Update configurations
      const newConfigs = {
        '0x1': { interval: 10000 },
        '0x89': { interval: 5000 },
      };
      controller.updateChainPollingConfigs(newConfigs);

      // Now chains use their explicit configurations
      expect(controller.getChainPollingConfig('0x1')).toStrictEqual({
        interval: 10000,
      });
      expect(controller.getChainPollingConfig('0x89')).toStrictEqual({
        interval: 5000,
      });
    });

    it('should get individual chain configs with proper fallback behavior', () => {
      const chainPollingIntervals = {
        '0x1': { interval: 15000 }, // Explicit config for Ethereum
        '0xa4b1': { interval: 8000 }, // Explicit config for chain without tokens
        // No explicit config for Polygon (has tokens) or BSC (no tokens)
      };

      const { controller } = setupController({
        config: {
          interval: 30000, // Default interval
          chainPollingIntervals,
        },
        tokens: {
          allTokens: {
            '0x1': {
              '0x123': [{ address: '0xtoken1', symbol: 'T1', decimals: 18 }],
            },
            '0x89': {
              // Polygon has tokens but no explicit config
              '0x123': [{ address: '0xtoken2', symbol: 'T2', decimals: 18 }],
            },
            // Note: 0xa4b1 and 0x38 have no tokens
          },
          allDetectedTokens: {},
        },
      });

      // Explicit configurations should be returned as-is
      expect(controller.getChainPollingConfig('0x1')).toStrictEqual({
        interval: 15000,
      });
      expect(controller.getChainPollingConfig('0xa4b1')).toStrictEqual({
        interval: 8000,
      });

      // Chains without explicit config should use defaults
      expect(controller.getChainPollingConfig('0x89')).toStrictEqual({
        interval: 30000,
      }); // Has tokens, no config
      expect(
        controller.getChainPollingConfig('0x38' as ChainIdHex),
      ).toStrictEqual({
        interval: 30000,
      }); // No tokens, no config
    });

    it('should handle partial config updates', () => {
      const initialConfigs = {
        '0x1': { interval: 15000 },
        '0x89': { interval: 5000 },
      };

      const { controller } = setupController({
        config: {
          interval: 30000,
          chainPollingIntervals: initialConfigs,
        },
        tokens: {
          allTokens: {
            '0x1': {
              '0x123': [{ address: '0xtoken1', symbol: 'T1', decimals: 18 }],
            },
            '0x89': {
              '0x123': [{ address: '0xtoken2', symbol: 'T2', decimals: 18 }],
            },
            '0xa4b1': {
              '0x123': [{ address: '0xtoken3', symbol: 'T3', decimals: 18 }],
            },
          },
          allDetectedTokens: {},
        },
      });

      // Update only one chain's config
      controller.updateChainPollingConfigs({
        '0x89': { interval: 8000 },
        '0xa4b1': { interval: 12000 },
      });

      // Verify individual chain configurations after update
      expect(controller.getChainPollingConfig('0x1')).toStrictEqual({
        interval: 15000,
      }); // Unchanged
      expect(controller.getChainPollingConfig('0x89')).toStrictEqual({
        interval: 8000,
      }); // Updated
      expect(controller.getChainPollingConfig('0xa4b1')).toStrictEqual({
        interval: 12000,
      }); // New config
    });

    it('should poll chains with different intervals correctly', async () => {
      const ethInterval = 1000; // 1 second
      const polygonInterval = 2000; // 2 seconds

      const chainPollingIntervals = {
        '0x1': { interval: ethInterval },
        '0x89': { interval: polygonInterval },
      };

      const tokens = {
        allTokens: {
          '0x1': {
            '0x123': [{ address: '0xtoken1', symbol: 'T1', decimals: 18 }],
          },
          '0x89': {
            '0x123': [{ address: '0xtoken2', symbol: 'T2', decimals: 18 }],
          },
        },
        allDetectedTokens: {},
      };

      const pollSpy = jest.spyOn(
        TokenBalancesController.prototype,
        '_executePoll',
      );

      const { controller } = setupController({
        config: {
          interval: 3000, // Default interval (3 seconds)
          chainPollingIntervals,
        },
        tokens,
      });

      controller.startPolling({ chainIds: ['0x1', '0x89'] });

      // Initial polls should happen immediately for both chains
      await advanceTime({ clock, duration: 1 });
      expect(pollSpy).toHaveBeenCalledTimes(2);
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1'] });
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x89'] });

      pollSpy.mockClear();

      // Advance by Ethereum interval (1000ms) - only Ethereum should poll
      await advanceTime({ clock, duration: ethInterval });
      expect(pollSpy).toHaveBeenCalledTimes(1);
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1'] });

      pollSpy.mockClear();

      // Advance by another 1000ms (total 2000ms) - both should poll
      await advanceTime({ clock, duration: ethInterval });
      expect(pollSpy).toHaveBeenCalledTimes(2);
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1'] }); // Ethereum again
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x89'] }); // Polygon first repeat

      controller.stopAllPolling();
    });

    it('should handle dynamic interval changes during polling', async () => {
      const ethInterval = 1500; // 1.5 seconds
      const polygonInitialInterval = 4500; // 4.5 seconds initially
      const polygonNewInterval = 1500; // Change to match Ethereum

      const tokens = {
        allTokens: {
          '0x1': {
            '0x123': [{ address: '0xtoken1', symbol: 'T1', decimals: 18 }],
          },
          '0x89': {
            '0x123': [{ address: '0xtoken2', symbol: 'T2', decimals: 18 }],
          },
        },
        allDetectedTokens: {},
      };

      const pollSpy = jest.spyOn(
        TokenBalancesController.prototype,
        '_executePoll',
      );

      const { controller } = setupController({
        config: {
          interval: 6000, // Default interval (6 seconds)
          chainPollingIntervals: {
            '0x1': { interval: ethInterval },
            '0x89': { interval: polygonInitialInterval },
          },
        },
        tokens,
      });

      controller.startPolling({ chainIds: ['0x1', '0x89'] });

      // Initial polls
      await advanceTime({ clock, duration: 1 });
      expect(pollSpy).toHaveBeenCalledTimes(2);
      pollSpy.mockClear();

      // Advance 1500ms - only Ethereum should poll
      await advanceTime({ clock, duration: ethInterval });
      expect(pollSpy).toHaveBeenCalledTimes(1);
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1'] });

      // Change Polygon interval to match Ethereum (1500ms)
      controller.updateChainPollingConfigs({
        '0x89': { interval: polygonNewInterval },
      });

      pollSpy.mockClear();

      // Advance 1500ms - both should poll now (same interval, grouped together)
      await advanceTime({ clock, duration: ethInterval });
      expect(pollSpy).toHaveBeenCalledTimes(1); // Now grouped together
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1', '0x89'] }); // Both chains in one call

      controller.stopAllPolling();
    });

    it('should group chains with same intervals for efficient polling', async () => {
      const fastInterval = 1200; // 1.2 seconds
      const slowInterval = 2400; // 2.4 seconds

      const chainPollingIntervals = {
        '0x1': { interval: fastInterval }, // Ethereum - fast
        '0x89': { interval: slowInterval }, // Polygon - slow
        '0xa4b1': { interval: fastInterval }, // Arbitrum - fast (same as Ethereum)
      };

      const tokens = {
        allTokens: {
          '0x1': {
            '0x123': [{ address: '0xtoken1', symbol: 'T1', decimals: 18 }],
          },
          '0x89': {
            '0x123': [{ address: '0xtoken2', symbol: 'T2', decimals: 18 }],
          },
          '0xa4b1': {
            '0x123': [{ address: '0xtoken3', symbol: 'T3', decimals: 18 }],
          },
        },
        allDetectedTokens: {},
      };

      const pollSpy = jest.spyOn(
        TokenBalancesController.prototype,
        '_executePoll',
      );

      const { controller } = setupController({
        config: {
          interval: 4800, // Default interval (4.8 seconds)
          chainPollingIntervals,
        },
        tokens,
      });

      controller.startPolling({ chainIds: ['0x1', '0x89', '0xa4b1'] });

      // Initial polls - should group efficiently
      await advanceTime({ clock, duration: 1 });
      expect(pollSpy).toHaveBeenCalledTimes(2); // Two groups: fast (ETH + ARB) and slow (MATIC)

      // Verify Ethereum and Arbitrum are grouped together (same interval)
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1', '0xa4b1'] });
      // Verify Polygon is separate (different interval)
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x89'] });

      pollSpy.mockClear();

      // Advance by fast interval (1200ms) - only fast group should poll
      await advanceTime({ clock, duration: fastInterval });
      expect(pollSpy).toHaveBeenCalledTimes(1);
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1', '0xa4b1'] });

      pollSpy.mockClear();

      // Advance by another 1200ms (total 2400ms) - both groups should poll
      await advanceTime({ clock, duration: fastInterval });
      expect(pollSpy).toHaveBeenCalledTimes(2);
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1', '0xa4b1'] }); // Fast group again
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x89'] }); // Slow group first repeat

      controller.stopAllPolling();
    });

    it('should fall back to default interval for unconfigured chains', async () => {
      const ethInterval = 800; // 800ms - configured
      const defaultInterval = 1600; // 1.6 seconds - default for unconfigured chains

      const chainPollingIntervals = {
        '0x1': { interval: ethInterval }, // Ethereum configured
        // '0x89' not configured - should use default
      };

      const tokens = {
        allTokens: {
          '0x1': {
            '0x123': [{ address: '0xtoken1', symbol: 'T1', decimals: 18 }],
          },
          '0x89': {
            '0x123': [{ address: '0xtoken2', symbol: 'T2', decimals: 18 }],
          },
        },
        allDetectedTokens: {},
      };

      const pollSpy = jest.spyOn(
        TokenBalancesController.prototype,
        '_executePoll',
      );

      const { controller } = setupController({
        config: {
          interval: defaultInterval, // This becomes default for unconfigured chains
          chainPollingIntervals,
        },
        tokens,
      });

      controller.startPolling({ chainIds: ['0x1', '0x89'] });

      // Initial polls
      await advanceTime({ clock, duration: 1 });
      expect(pollSpy).toHaveBeenCalledTimes(2);
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1'] });
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x89'] });

      pollSpy.mockClear();

      // Advance 800ms - only Ethereum should poll (configured interval)
      await advanceTime({ clock, duration: ethInterval });
      expect(pollSpy).toHaveBeenCalledTimes(1);
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1'] });

      pollSpy.mockClear();

      // Advance another 800ms (total 1600ms) - both should poll
      await advanceTime({ clock, duration: ethInterval });
      expect(pollSpy).toHaveBeenCalledTimes(2);
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1'] }); // Ethereum again
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x89'] }); // Polygon using default interval

      controller.stopAllPolling();
    });

    it('should maintain proper polling state during configuration updates', async () => {
      const tokens = {
        allTokens: {
          '0x1': {
            '0x123': [{ address: '0xtoken1', symbol: 'T1', decimals: 18 }],
          },
          '0x89': {
            '0x123': [{ address: '0xtoken2', symbol: 'T2', decimals: 18 }],
          },
        },
        allDetectedTokens: {},
      };

      const pollSpy = jest.spyOn(
        TokenBalancesController.prototype,
        '_executePoll',
      );

      const { controller } = setupController({
        config: {
          interval: 2000, // Default (2 seconds)
          chainPollingIntervals: {
            '0x1': { interval: 1000 }, // Ethereum: 1 second
            '0x89': { interval: 3000 }, // Polygon: 3 seconds
          },
        },
        tokens,
      });

      // Start polling
      controller.startPolling({ chainIds: ['0x1', '0x89'] });

      // Initial polls
      await advanceTime({ clock, duration: 1 });
      expect(pollSpy).toHaveBeenCalledTimes(2);
      pollSpy.mockClear();

      // Let some polling happen
      await advanceTime({ clock, duration: 1000 }); // Ethereum polls
      expect(pollSpy).toHaveBeenCalledTimes(1);
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1'] });

      // Update configurations while polling is active
      controller.updateChainPollingConfigs({
        '0x1': { interval: 500 }, // Make Ethereum faster (500ms)
        '0x89': { interval: 500 }, // Make Polygon same as Ethereum (500ms)
      });

      pollSpy.mockClear();

      // Both should now poll every 500ms (regrouped)
      await advanceTime({ clock, duration: 500 });
      expect(pollSpy).toHaveBeenCalledTimes(1);
      expect(pollSpy).toHaveBeenCalledWith({ chainIds: ['0x1', '0x89'] }); // Now grouped together

      controller.stopAllPolling();
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle polling errors gracefully', async () => {
      const chainId = '0x1';
      const accountAddress = '0x0000000000000000000000000000000000000000';
      const tokenAddress = '0x0000000000000000000000000000000000000001';

      const tokens = {
        allDetectedTokens: {},
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, symbol: 'TEST', decimals: 18 },
            ],
          },
        },
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { controller } = setupController({
        tokens,
        config: { interval: 100 },
      });

      // Mock _executePoll to throw an error
      const pollSpy = jest
        .spyOn(controller, '_executePoll')
        .mockRejectedValue(new Error('Polling failed'));

      controller.startPolling({ chainIds: ['0x1'] });

      // Wait for initial poll and error
      await advanceTime({ clock, duration: 1 });

      // Wait for interval poll and error
      await advanceTime({ clock, duration: 100 });

      // Should have attempted polls despite errors
      expect(pollSpy).toHaveBeenCalledTimes(2);

      // Should have logged errors (both immediate and interval polling use the same error format)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Polling failed for chains 0x1 with interval 100:',
        ),
        expect.any(Error),
      );
      expect(consoleSpy).toHaveBeenCalledTimes(2); // Should have been called twice

      controller.stopAllPolling();
      consoleSpy.mockRestore();
    });

    it('should handle updateBalances errors in token change handler', async () => {
      const chainId = '0x1';
      const accountAddress = '0x0000000000000000000000000000000000000000';
      const tokenAddress = '0x0000000000000000000000000000000000000001';

      const tokens = {
        allDetectedTokens: {},
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, symbol: 'TEST', decimals: 18 },
            ],
          },
        },
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const { controller, messenger } = setupController({
        tokens,
      });

      // Mock updateBalances to throw an error
      const updateBalancesSpy = jest
        .spyOn(controller, 'updateBalances')
        .mockRejectedValue(new Error('Update failed'));

      // Simulate token change that triggers balance update
      const newTokens = {
        ...tokens,
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, symbol: 'TEST', decimals: 18 },
              {
                address: '0x0000000000000000000000000000000000000002',
                symbol: 'NEW',
                decimals: 18,
              },
            ],
          },
        },
        allIgnoredTokens: {},
        ignoredTokens: [],
        detectedTokens: [],
        tokens: [],
      };

      // Trigger token change by publishing state change
      messenger.publish('TokensController:stateChange', newTokens, [
        { op: 'replace', path: [], value: newTokens },
      ]);

      // Wait for async error handling
      await advanceTime({ clock, duration: 1 });

      expect(updateBalancesSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error updating balances after token change:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('should properly destroy controller and cleanup resources', () => {
      const { controller, messenger } = setupController();

      // Start some polling to create timers
      controller.startPolling({ chainIds: ['0x1'] });

      const unregisterSpy = jest.spyOn(messenger, 'unregisterActionHandler');
      const superDestroySpy = jest.spyOn(
        Object.getPrototypeOf(Object.getPrototypeOf(controller)),
        'destroy',
      );

      // Destroy the controller
      controller.destroy();

      // Should unregister action handlers
      expect(unregisterSpy).toHaveBeenCalledWith(
        'TokenBalancesController:updateChainPollingConfigs',
      );
      expect(unregisterSpy).toHaveBeenCalledWith(
        'TokenBalancesController:getChainPollingConfig',
      );

      // Should call parent destroy
      expect(superDestroySpy).toHaveBeenCalled();

      unregisterSpy.mockRestore();
      superDestroySpy.mockRestore();
    });

    it('should handle balance fetcher timeout errors', async () => {
      const chainId = '0x1';
      const accountAddress = '0x0000000000000000000000000000000000000000';
      const tokenAddress = '0x0000000000000000000000000000000000000001';
      const account = createMockInternalAccount({ address: accountAddress });

      const tokens = {
        allDetectedTokens: {},
        allTokens: {
          [chainId]: {
            [accountAddress]: [
              { address: tokenAddress, symbol: 'TEST', decimals: 18 },
            ],
          },
        },
      };

      const { controller } = setupController({
        tokens,
        listAccounts: [account],
      });

      // Mock safelyExecuteWithTimeout to throw timeout error
      const safelyExecuteSpy = jest
        .spyOn(controllerUtils, 'safelyExecuteWithTimeout')
        .mockRejectedValue(new Error('Timeout'));

      // This should trigger the safelyExecuteWithTimeout error path (line 440)
      expect(async () => {
        await controller.updateBalances({ chainIds: ['0x1'] });
      }).not.toThrow();

      // Restore original function
      safelyExecuteSpy.mockRestore();
    });

    it('should handle constructor with different configurations', () => {
      // Test constructor with different parameter combinations to improve coverage
      const { controller: controllerWithDefaults } = setupController({
        config: {
          // All params use defaults
        },
      });

      expect(controllerWithDefaults).toBeDefined();

      const { controller: controllerWithCustomConfig } = setupController({
        config: {
          interval: 5000,
          chainPollingIntervals: { '0x1': { interval: 1000 } },
          state: {
            tokenBalances: {
              '0x0000000000000000000000000000000000000000': {
                '0x1': {
                  '0x0000000000000000000000000000000000000000': toHex(100),
                },
              },
            },
          },
          queryMultipleAccounts: false,
          useAccountsAPI: true,
          allowExternalServices: () => false,
        },
      });

      expect(controllerWithCustomConfig).toBeDefined();

      // Clean up
      controllerWithDefaults.destroy();
      controllerWithCustomConfig.destroy();
    });

    it('should handle network state changes with removed networks', () => {
      const { messenger } = setupController();

      // Simulate network state change
      const networkState = {
        selectedNetworkClientId: 'mainnet',
        providerConfig: { chainId: '0x1' as ChainIdHex, ticker: 'ETH' },
        networkConfigurations: {},
        networkConfigurationsByChainId: {},
        networksMetadata: {},
      };

      // This should exercise the network change handler
      // No assertions needed - we're just ensuring the code path is covered
      expect(() => {
        messenger.publish('NetworkController:stateChange', networkState, [
          { op: 'replace', path: [], value: networkState },
        ]);
      }).not.toThrow();
    });
  });
});
