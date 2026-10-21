import type { AccountsControllerGetStateAction } from '@metamask/accounts-controller';
import { getDefaultAssetsControllerState } from '@metamask/assets-controller';
import type { AssetsControllerGetStateAction } from '@metamask/assets-controller';
import type { KeyringControllerGetStateAction } from '@metamask/keyring-controller';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type { NetworkControllerGetNetworkClientByIdAction } from '@metamask/network-controller';
import type { NetworkControllerFindNetworkClientIdByChainIdAction } from '@metamask/network-controller';
import type { NetworkControllerGetNetworkConfigurationByChainIdAction } from '@metamask/network-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import type { SentinelApiServiceSimulateTransactionsAction } from '@metamask/sentinel-api-service';
import type {
  TransactionControllerAddTransactionAction,
  TransactionControllerAddTransactionBatchAction,
  TransactionControllerEstimateGasAction,
  TransactionControllerEstimateGasBatchAction,
  TransactionControllerGetGasFeeTokensAction,
  TransactionControllerGetStateAction,
} from '@metamask/transaction-controller';
import type { TransactionControllerUpdateTransactionAction } from '@metamask/transaction-controller';
import { vi } from 'vitest';
import type { MockedFunction } from 'vitest';

import type { TransactionPayControllerMessenger } from '../src/index.js';
import type {
  TransactionPayControllerGetDelegationTransactionAction,
  TransactionPayControllerGetFiatOptionsAction,
  TransactionPayControllerGetPaymentOverrideDataAction,
  TransactionPayControllerGetStrategyAction,
  TransactionPayControllerPolymarketGetDepositWalletAddressAction,
  TransactionPayControllerPolymarketSubmitDepositWalletBatchAction,
} from '../src/TransactionPayController-method-action-types.js';
import type { TransactionPayControllerGetStateAction } from '../src/types.js';

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
// TS2742: The inferred type of 'getMessengerMock' cannot be named without a
// reference to '../../../../node_modules/@metamask/transaction-controller/dist/utils/gas.js'.
// This is likely not portable. A type annotation is necessary.
export function getMessengerMock({
  skipRegister,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}: { skipRegister?: boolean } = {}): any {
  const getControllerStateMock: MockedFunction<
    TransactionPayControllerGetStateAction['handler']
  > = vi.fn();

  const getStrategyMock: MockedFunction<
    TransactionPayControllerGetStrategyAction['handler']
  > = vi.fn();

  const getTransactionControllerStateMock: MockedFunction<
    TransactionControllerGetStateAction['handler']
  > = vi.fn();

  const addTransactionMock: MockedFunction<
    TransactionControllerAddTransactionAction['handler']
  > = vi.fn();

  const addTransactionBatchMock: MockedFunction<
    TransactionControllerAddTransactionBatchAction['handler']
  > = vi.fn();

  const findNetworkClientIdByChainIdMock: MockedFunction<
    NetworkControllerFindNetworkClientIdByChainIdAction['handler']
  > = vi.fn();

  const getRemoteFeatureFlagControllerStateMock: MockedFunction<
    RemoteFeatureFlagControllerGetStateAction['handler']
  > = vi.fn();

  const getGasFeeControllerStateMock = vi.fn();

  const updateTransactionMock: MockedFunction<
    TransactionControllerUpdateTransactionAction['handler']
  > = vi.fn();

  const getAccountsControllerStateMock: MockedFunction<
    AccountsControllerGetStateAction['handler']
  > = vi.fn().mockReturnValue({
    accountIdByAddress: {},
    internalAccounts: { accounts: {}, selectedAccount: '' },
  });

  const getAssetsControllerStateMock: MockedFunction<
    AssetsControllerGetStateAction['handler']
  > = vi.fn().mockReturnValue(getDefaultAssetsControllerState());

  const getNetworkClientByIdMock: MockedFunction<
    NetworkControllerGetNetworkClientByIdAction['handler']
  > = vi.fn() as MockedFunction<
    NetworkControllerGetNetworkClientByIdAction['handler']
  >;

  const getNetworkConfigurationByChainIdMock: MockedFunction<
    NetworkControllerGetNetworkConfigurationByChainIdAction['handler']
  > = vi.fn();

  const getDelegationTransactionMock: MockedFunction<
    TransactionPayControllerGetDelegationTransactionAction['handler']
  > = vi.fn();

  const getFiatOptionsMock: MockedFunction<
    TransactionPayControllerGetFiatOptionsAction['handler']
  > = vi.fn();

  const getPaymentOverrideDataMock: MockedFunction<
    TransactionPayControllerGetPaymentOverrideDataAction['handler']
  > = vi.fn().mockResolvedValue({ calls: [] });

  const polymarketGetDepositWalletAddressMock: MockedFunction<
    TransactionPayControllerPolymarketGetDepositWalletAddressAction['handler']
  > = vi.fn();

  const polymarketSubmitDepositWalletBatchMock: MockedFunction<
    TransactionPayControllerPolymarketSubmitDepositWalletBatchAction['handler']
  > = vi.fn();

  const getGasFeeTokensMock: MockedFunction<
    TransactionControllerGetGasFeeTokensAction['handler']
  > = vi.fn();

  const estimateGasMock: MockedFunction<
    TransactionControllerEstimateGasAction['handler']
  > = vi.fn();

  const estimateGasBatchMock: MockedFunction<
    TransactionControllerEstimateGasBatchAction['handler']
  > = vi.fn();

  const simulateTransactionsMock: MockedFunction<
    SentinelApiServiceSimulateTransactionsAction['handler']
  > = vi.fn();

  const getKeyringControllerStateMock: MockedFunction<
    KeyringControllerGetStateAction['handler']
  > = vi.fn().mockReturnValue({
    isUnlocked: true,
    keyrings: [
      {
        type: 'HD Key Tree',
        accounts: ['0x1234567890123456789012345678901234567891'],
        metadata: { id: 'hd-keyring', name: 'HD Key Tree' },
      },
    ],
  });

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
      'RemoteFeatureFlagController:getState',
      getRemoteFeatureFlagControllerStateMock,
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
      'AccountsController:getState',
      getAccountsControllerStateMock,
    );

    messenger.registerActionHandler(
      'NetworkController:getNetworkClientById',
      getNetworkClientByIdMock,
    );

    messenger.registerActionHandler(
      'NetworkController:getNetworkConfigurationByChainId',
      getNetworkConfigurationByChainIdMock,
    );

    messenger.registerActionHandler(
      'TransactionPayController:getDelegationTransaction',
      getDelegationTransactionMock,
    );

    messenger.registerActionHandler(
      'TransactionPayController:getFiatOptions',
      getFiatOptionsMock,
    );

    messenger.registerActionHandler(
      'TransactionPayController:getPaymentOverrideData',
      getPaymentOverrideDataMock,
    );

    messenger.registerActionHandler(
      'TransactionPayController:polymarketGetDepositWalletAddress',
      polymarketGetDepositWalletAddressMock,
    );

    messenger.registerActionHandler(
      'TransactionPayController:polymarketSubmitDepositWalletBatch',
      polymarketSubmitDepositWalletBatchMock,
    );

    messenger.registerActionHandler(
      'TransactionController:getGasFeeTokens',
      getGasFeeTokensMock,
    );

    messenger.registerActionHandler(
      'TransactionController:estimateGas',
      estimateGasMock,
    );

    messenger.registerActionHandler(
      'TransactionController:estimateGasBatch',
      estimateGasBatchMock,
    );

    messenger.registerActionHandler(
      'SentinelApiService:simulateTransactions',
      simulateTransactionsMock,
    );

    messenger.registerActionHandler(
      'AssetsController:getState',
      getAssetsControllerStateMock,
    );
  }

  messenger.registerActionHandler(
    'KeyringController:getState',
    getKeyringControllerStateMock,
  );

  const publish = messenger.publish.bind(messenger);

  return {
    addTransactionMock,
    getAccountsControllerStateMock,
    getAssetsControllerStateMock,
    addTransactionBatchMock,
    estimateGasMock,
    estimateGasBatchMock,
    findNetworkClientIdByChainIdMock,
    getControllerStateMock,
    getDelegationTransactionMock,
    getFiatOptionsMock,
    getPaymentOverrideDataMock,
    getGasFeeControllerStateMock,
    getGasFeeTokensMock,
    getKeyringControllerStateMock,
    getNetworkClientByIdMock,
    getNetworkConfigurationByChainIdMock,
    getRemoteFeatureFlagControllerStateMock,
    getStrategyMock,
    getTransactionControllerStateMock,
    messenger: messenger as TransactionPayControllerMessenger,
    polymarketGetDepositWalletAddressMock,
    polymarketSubmitDepositWalletBatchMock,
    publish,
    simulateTransactionsMock,
    updateTransactionMock,
  };
}
