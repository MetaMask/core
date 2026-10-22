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

import type { TransactionPayMiddlewareMessenger } from '../types.js';

type AllActions = MessengerActions<TransactionPayMiddlewareMessenger>;

type Handler<Action extends { handler: (...args: never[]) => unknown }> =
  jest.Mock<ReturnType<Action['handler']>, Parameters<Action['handler']>>;

export type MessengerMocks = {
  messenger: TransactionPayMiddlewareMessenger;
  getRemoteFeatureFlagState: Handler<RemoteFeatureFlagControllerGetStateAction>;
  getPerpsState: Handler<PerpsControllerGetStateAction>;
  refreshEligibility: Handler<PerpsControllerRefreshEligibilityAction>;
  findNetworkClientIdByChainId: Handler<NetworkControllerFindNetworkClientIdByChainIdAction>;
  addTransaction: Handler<TransactionControllerAddTransactionAction>;
};

/**
 * Creates a middleware messenger backed by mock action handlers.
 *
 * @param options - Mock state.
 * @param options.remoteFeatureFlags - Remote feature flags.
 * @param options.eligibility - `isEligible` values, returned in order; the
 * last one repeats.
 * @param options.hash - Hash the added transaction resolves with.
 * @returns The messenger and its mock handlers.
 */
export function createMessenger({
  remoteFeatureFlags = {},
  eligibility = [true],
  hash = '0xhash',
}: {
  remoteFeatureFlags?: Record<string, Json>;
  eligibility?: boolean[];
  hash?: string;
} = {}): MessengerMocks {
  const states = [...eligibility];

  const getRemoteFeatureFlagState: MessengerMocks['getRemoteFeatureFlagState'] =
    jest.fn(
      () =>
        ({ remoteFeatureFlags }) as ReturnType<
          RemoteFeatureFlagControllerGetStateAction['handler']
        >,
    );
  const getPerpsState: MessengerMocks['getPerpsState'] = jest.fn(
    () =>
      ({
        isEligible: states.length > 1 ? states.shift() : states[0],
      }) as ReturnType<PerpsControllerGetStateAction['handler']>,
  );
  const refreshEligibility: MessengerMocks['refreshEligibility'] = jest.fn(
    async () => undefined,
  );
  const findNetworkClientIdByChainId: MessengerMocks['findNetworkClientIdByChainId'] =
    jest.fn((_chainId) => 'arbitrum-mainnet');
  const addTransaction: MessengerMocks['addTransaction'] = jest.fn(
    async (_transactionParams, _options) =>
      ({ result: Promise.resolve(hash) }) as Awaited<
        ReturnType<TransactionControllerAddTransactionAction['handler']>
      >,
  );

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
    ],
  });

  return {
    messenger,
    getRemoteFeatureFlagState,
    getPerpsState,
    refreshEligibility,
    findNetworkClientIdByChainId,
    addTransaction,
  };
}
