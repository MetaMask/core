import type { TokensControllerGetStateAction } from '@metamask/assets-controllers';
import type { TokenBalancesControllerGetStateAction } from '@metamask/assets-controllers';
import type { TokenRatesControllerGetStateAction } from '@metamask/assets-controllers';
import type { AccountTrackerControllerGetStateAction } from '@metamask/assets-controllers';
import type { BridgeStatusControllerGetStateAction } from '@metamask/bridge-status-controller';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import type { NetworkControllerFindNetworkClientIdByChainIdAction } from '@metamask/network-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type {
  TransactionControllerAddTransactionAction,
  TransactionControllerAddTransactionBatchAction,
  TransactionControllerGetGasFeeTokensAction,
  TransactionControllerGetStateAction,
} from '@metamask/transaction-controller';
import type { TransactionControllerUpdateTransactionAction } from '@metamask/transaction-controller';

import type { TransactionPayControllerMessenger } from '..';
import type { BridgeStatusControllerSubmitTxAction } from '../../../bridge-status-controller/src/types';
import type {
  TransactionPayControllerGetDelegationTransactionAction,
  TransactionPayControllerGetStrategyAction,
} from '../types';
import type { TransactionPayControllerGetStateAction } from '../types';

type AllActions = MessengerActions<TransactionPayControllerMessenger>;
type AllEvents = MessengerEvents<TransactionPayControllerMessenger>;
type RootMessenger = Messenger<MockAnyNamespace, AllActions, AllEvents>;

/**
 * Creates a mock controller messenger for testing.
 *
 * @param options - Options for creating the messenger mock.
 * @param options.skipRegister - Whether to skip registering action handlers.
 * @returns The mock messenger and associated mock functions.
 */
export function getMessengerMock({
  skipRegister,
}: { skipRegister?: boolean } = {}) {
  const getControllerStateMock: jest.MockedFn<
    TransactionPayControllerGetStateAction['handler']
  > = jest.fn();

  const getStrategyMock: jest.MockedFn<
    TransactionPayControllerGetStrategyAction['handler']
  > = jest.fn();

  const getTransactionControllerStateMock: jest.MockedFn<
    TransactionControllerGetStateAction['handler']
  > = jest.fn();

  const addTransactionMock: jest.MockedFn<
    TransactionControllerAddTransactionAction['handler']
  > = jest.fn();

  const addTransactionBatchMock: jest.MockedFn<
    TransactionControllerAddTransactionBatchAction['handler']
  > = jest.fn();

  const findNetworkClientIdByChainIdMock: jest.MockedFn<
    NetworkControllerFindNetworkClientIdByChainIdAction['handler']
  > = jest.fn();

  const fetchQuotesMock = jest.fn();

  const getRemoteFeatureFlagControllerStateMock: jest.MockedFn<
    RemoteFeatureFlagControllerGetStateAction['handler']
  > = jest.fn();

  const getGasFeeControllerStateMock = jest.fn();

  const submitTransactionMock: jest.MockedFunction<
    BridgeStatusControllerSubmitTxAction['handler']
  > = jest.fn();

  const updateTransactionMock: jest.MockedFn<
    TransactionControllerUpdateTransactionAction['handler']
  > = jest.fn();

  const getBridgeStatusControllerStateMock: jest.MockedFn<
    BridgeStatusControllerGetStateAction['handler']
  > = jest.fn();

  const getTokensControllerStateMock: jest.MockedFn<
    TokensControllerGetStateAction['handler']
  > = jest.fn();

  const getTokenBalanceControllerStateMock: jest.MockedFn<
    TokenBalancesControllerGetStateAction['handler']
  > = jest.fn();

  const getTokenRatesControllerStateMock: jest.MockedFn<
    TokenRatesControllerGetStateAction['handler']
  > = jest.fn();

  const getCurrencyRateControllerStateMock = jest.fn();

  const getAccountTrackerControllerStateMock: jest.MockedFn<
    AccountTrackerControllerGetStateAction['handler']
  > = jest.fn();

  const getNetworkClientByIdMock: jest.MockedFn<
    NetworkControllerGetNetworkClientByIdAction['handler']
  > = jest.fn();

  const getDelegationTransactionMock: jest.MockedFn<
    TransactionPayControllerGetDelegationTransactionAction['handler']
  > = jest.fn();

  const getGasFeeTokensMock: jest.MockedFn<
    TransactionControllerGetGasFeeTokensAction['handler']
  > = jest.fn();

  const messenger: RootMessenger = new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });

  if (skipRegister !== true) {
    messenger.registerActionHandler(
      'TransactionPayController:getState',
      getControllerStateMock,
    );

    messenger.registerActionHandler(
      'TransactionPayController:getStrategy',
      getStrategyMock,
    );

    messenger.registerActionHandler(
      'TransactionController:getState',
      getTransactionControllerStateMock,
    );

    messenger.registerActionHandler(
      'TransactionController:addTransaction',
      addTransactionMock,
    );

    messenger.registerActionHandler(
      'TransactionController:addTransactionBatch',
      addTransactionBatchMock,
    );

    messenger.registerActionHandler(
      'NetworkController:findNetworkClientIdByChainId',
      findNetworkClientIdByChainIdMock,
    );

    messenger.registerActionHandler(
      'BridgeController:fetchQuotes',
      fetchQuotesMock,
    );

    messenger.registerActionHandler(
      'RemoteFeatureFlagController:getState',
      getRemoteFeatureFlagControllerStateMock,
    );

    messenger.registerActionHandler(
      'BridgeStatusController:submitTx',
      submitTransactionMock,
    );

    messenger.registerActionHandler(
      'GasFeeController:getState',
      getGasFeeControllerStateMock,
    );

    messenger.registerActionHandler(
      'TransactionController:updateTransaction',
      updateTransactionMock,
    );

    messenger.registerActionHandler(
      'BridgeStatusController:getState',
      getBridgeStatusControllerStateMock,
    );

    messenger.registerActionHandler(
      'TokensController:getState',
      getTokensControllerStateMock,
    );

    messenger.registerActionHandler(
      'TokenBalancesController:getState',
      getTokenBalanceControllerStateMock,
    );

    messenger.registerActionHandler(
      'TokenRatesController:getState',
      getTokenRatesControllerStateMock,
    );

    messenger.registerActionHandler(
      'AccountTrackerController:getState',
      getAccountTrackerControllerStateMock,
    );

    messenger.registerActionHandler(
      'CurrencyRateController:getState',
      getCurrencyRateControllerStateMock,
    );

    messenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      getNetworkClientByIdMock,
    );

    messenger.registerActionHandler(
      'TransactionPayController:getDelegationTransaction',
      getDelegationTransactionMock,
    );

    messenger.registerActionHandler(
      'TransactionController:getGasFeeTokens',
      getGasFeeTokensMock,
    );
  }

  const publish = messenger.publish.bind(messenger);

  return {
    addTransactionMock,
    addTransactionBatchMock,
    fetchQuotesMock,
    findNetworkClientIdByChainIdMock,
    getAccountTrackerControllerStateMock,
    getBridgeStatusControllerStateMock,
    getControllerStateMock,
    getCurrencyRateControllerStateMock,
    getDelegationTransactionMock,
    getGasFeeControllerStateMock,
    getGasFeeTokensMock,
    getNetworkClientByIdMock,
    getRemoteFeatureFlagControllerStateMock,
    getStrategyMock,
    getTokenBalanceControllerStateMock,
    getTokenRatesControllerStateMock,
    getTokensControllerStateMock,
    getTransactionControllerStateMock,
    messenger: messenger as TransactionPayControllerMessenger,
    publish,
    submitTransactionMock,
    updateTransactionMock,
  };
}
