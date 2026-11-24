import type { AccountTreeControllerSetSelectedAccountGroupByAccountIdAction } from '@metamask/account-tree-controller';
import type {
  AccountsControllerGetAccountByAddressAction,
  AccountsControllerGetSelectedAccountAction,
} from '@metamask/accounts-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { MessengerActions, MockAnyNamespace } from '@metamask/messenger';
import type { NetworkControllerFindNetworkClientIdByChainIdAction } from '@metamask/network-controller';
import type {
  PerpsControllerGetStateAction,
  PerpsControllerRefreshEligibilityAction,
} from '@metamask/perps-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { TransactionControllerAddTransactionAction } from '@metamask/transaction-controller';
import type { Json } from '@metamask/utils';
import { vi } from 'vitest';
import type { Mock } from 'vitest';

import type { TransactionPayMiddlewareMessenger } from '../types.js';

type AllActions = MessengerActions<TransactionPayMiddlewareMessenger>;

type Handler<Action extends { handler: (...args: never[]) => unknown }> = Mock<
  Action['handler']
>;

export type MessengerMocks = {
  messenger: TransactionPayMiddlewareMessenger;
  getRemoteFeatureFlagState: Handler<RemoteFeatureFlagControllerGetStateAction>;
  getPerpsState: Handler<PerpsControllerGetStateAction>;
  refreshEligibility: Handler<PerpsControllerRefreshEligibilityAction>;
  findNetworkClientIdByChainId: Handler<NetworkControllerFindNetworkClientIdByChainIdAction>;
  addTransaction: Handler<TransactionControllerAddTransactionAction>;
  getAccountByAddress: Handler<AccountsControllerGetAccountByAddressAction>;
  getSelectedAccount: Handler<AccountsControllerGetSelectedAccountAction>;
  setSelectedAccountGroupByAccountId: Handler<AccountTreeControllerSetSelectedAccountGroupByAccountIdAction>;
};

type InternalAccount = ReturnType<
  AccountsControllerGetSelectedAccountAction['handler']
>;

/**
 * Creates an internal account with the given id and address.
 *
 * @param id - The account id.
 * @param address - The account address.
 * @returns The account.
 */
export function createAccount(id: string, address: string): InternalAccount {
  return { id, address } as InternalAccount;
}

/**
 * Creates a middleware messenger backed by mock action handlers.
 *
 * @param options - Mock state.
 * @param options.remoteFeatureFlags - Remote feature flags.
 * @param options.eligibility - `isEligible` values, returned in order; the
 * last one repeats.
 * @param options.hash - Hash the added transaction resolves with.
 * @param options.accounts - Accounts known to the wallet. Defaults to accounts
 * for every address passed to `getAccountByAddress`.
 * @param options.selectedAccount - The selected account.
 * @returns The messenger and its mock handlers.
 */
export function createMessenger({
  remoteFeatureFlags = {},
  eligibility = [true],
  hash = '0xhash',
  accounts,
  selectedAccount = createAccount('selected-account', '0xselected'),
}: {
  remoteFeatureFlags?: Record<string, Json>;
  eligibility?: boolean[];
  hash?: string;
  accounts?: InternalAccount[];
  selectedAccount?: InternalAccount;
} = {}): MessengerMocks {
  const states = [...eligibility];

  const getRemoteFeatureFlagState: MessengerMocks['getRemoteFeatureFlagState'] =
    vi.fn(
      () =>
        ({ remoteFeatureFlags }) as ReturnType<
          RemoteFeatureFlagControllerGetStateAction['handler']
        >,
    );
  const getPerpsState: MessengerMocks['getPerpsState'] = vi.fn(
    () =>
      ({
        isEligible: states.length > 1 ? states.shift() : states[0],
      }) as ReturnType<PerpsControllerGetStateAction['handler']>,
  );
  const refreshEligibility: MessengerMocks['refreshEligibility'] = vi.fn(
    async () => undefined,
  );
  const findNetworkClientIdByChainId: MessengerMocks['findNetworkClientIdByChainId'] =
    vi.fn((_chainId) => 'arbitrum-mainnet');
  const addTransaction: MessengerMocks['addTransaction'] = vi.fn(
    async (_transactionParams, _options) =>
      ({ result: Promise.resolve(hash) }) as Awaited<
        ReturnType<TransactionControllerAddTransactionAction['handler']>
      >,
  );

  const getAccountByAddress: MessengerMocks['getAccountByAddress'] = vi.fn(
    (address) =>
      accounts
        ? accounts.find(
            (account) =>
              account.address.toLowerCase() === address.toLowerCase(),
          )
        : createAccount(`account-${address.toLowerCase()}`, address),
  );
  const getSelectedAccount: MessengerMocks['getSelectedAccount'] = vi.fn(
    () => selectedAccount,
  );
  const setSelectedAccountGroupByAccountId: MessengerMocks['setSelectedAccountGroupByAccountId'] =
    vi.fn((_accountId) => undefined);

  const rootMessenger = new Messenger<MockAnyNamespace, AllActions>({
    namespace: MOCK_ANY_NAMESPACE,
  });

  rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    getRemoteFeatureFlagState,
  );
  rootMessenger.registerActionHandler(
    'PerpsController:getState',
    getPerpsState,
  );
  rootMessenger.registerActionHandler(
    'PerpsController:refreshEligibility',
    refreshEligibility,
  );
  rootMessenger.registerActionHandler(
    'NetworkController:findNetworkClientIdByChainId',
    findNetworkClientIdByChainId,
  );
  rootMessenger.registerActionHandler(
    'TransactionController:addTransaction',
    addTransaction,
  );

  rootMessenger.registerActionHandler(
    'AccountsController:getAccountByAddress',
    getAccountByAddress,
  );
  rootMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    getSelectedAccount,
  );
  rootMessenger.registerActionHandler(
    'AccountTreeController:setSelectedAccountGroupByAccountId',
    setSelectedAccountGroupByAccountId,
  );

  const messenger: TransactionPayMiddlewareMessenger = new Messenger({
    namespace: 'TransactionPayMiddleware',
    parent: rootMessenger,
  });

  rootMessenger.delegate({
    messenger,
    actions: [
      'RemoteFeatureFlagController:getState',
      'PerpsController:getState',
      'PerpsController:refreshEligibility',
      'NetworkController:findNetworkClientIdByChainId',
      'TransactionController:addTransaction',
      'AccountsController:getAccountByAddress',
      'AccountsController:getSelectedAccount',
      'AccountTreeController:setSelectedAccountGroupByAccountId',
    ],
  });

  return {
    messenger,
    getRemoteFeatureFlagState,
    getPerpsState,
    refreshEligibility,
    findNetworkClientIdByChainId,
    addTransaction,
    getAccountByAddress,
    getSelectedAccount,
    setSelectedAccountGroupByAccountId,
  };
}
