import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import { RampsOrderStatus } from '@metamask/ramps-controller';
import {
  TransactionController,
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHAIN_ID_MONAD,
  MUSD_MONAD_ADDRESS,
  TransactionPayStrategy,
} from '../src/constants.js';
import { submitDirectMusdAfterFiatCompletion } from '../src/strategy/fiat/fiat-direct-musd.js';
import { TransactionPayController } from '../src/TransactionPayController.js';
import { isPayTransactionResumable } from '../src/utils/resume.js';

vi.mock(
  import('../src/strategy/fiat/fiat-direct-musd.js'),
  async (importOriginal) => ({
    ...(await importOriginal()),
    submitDirectMusdAfterFiatCompletion: vi.fn(),
  }),
);

const WALLET_ADDRESS_MOCK: Hex = '0x1111111111111111111111111111111111111111';
const SECOND_LEG_HASH_MOCK: Hex = '0x2222';

type TestRootMessenger = {
  delegate: (options: {
    actions: string[];
    events?: string[];
    messenger: unknown;
  }) => void;
  registerActionHandler: (
    action: string,
    handler: (...args: unknown[]) => unknown,
  ) => void;
};

function getParentTransactionMock(): TransactionMeta {
  return {
    chainId: CHAIN_ID_MONAD,
    id: 'parent-tx',
    metamaskPay: {
      fiat: { orderId: 'order-1', provider: 'transak' },
      strategy: TransactionPayStrategy.Fiat,
    },
    status: TransactionStatus.approved,
    time: 0,
    txParams: {
      from: WALLET_ADDRESS_MOCK,
      to: '0x3333333333333333333333333333333333333333',
    },
    type: TransactionType.moneyAccountDeposit,
  } as TransactionMeta;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function setupControllers({ flags }: { flags: Record<string, unknown> }): {
  clientTriggerMock: ReturnType<typeof vi.fn>;
  payController: TransactionPayController;
  transactionController: TransactionController;
  waitForClientReadyMock: ReturnType<typeof vi.fn>;
} {
  const rootMessenger = new Messenger({ namespace: MOCK_ANY_NAMESPACE });
  const unrestrictedMessenger = rootMessenger as unknown as TestRootMessenger;
  const transactionControllerMessenger = new Messenger({
    namespace: 'TransactionController',
    parent: rootMessenger,
  });
  const payMessenger = new Messenger({
    namespace: 'TransactionPayController',
    parent: rootMessenger,
  });

  unrestrictedMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    () => ({ remoteFeatureFlags: flags }),
  );
  unrestrictedMessenger.registerActionHandler(
    'KeyringController:getState',
    () => ({
      isUnlocked: true,
    }),
  );
  unrestrictedMessenger.registerActionHandler(
    'RampsController:getOrder',
    () => ({
      cryptoCurrency: {
        assetId: `eip155:143/erc20:${MUSD_MONAD_ADDRESS}`,
        chainId: 'eip155:143',
      },
      status: RampsOrderStatus.Completed,
      txHash: '0xsettlement',
    }),
  );
  unrestrictedMessenger.registerActionHandler(
    'NetworkController:findNetworkClientIdByChainId',
    () => 'network-client-id',
  );
  unrestrictedMessenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    (): Record<string, never> => ({}),
  );
  unrestrictedMessenger.registerActionHandler(
    'NetworkController:getNetworkClientRegistry',
    () => ({}),
  );
  unrestrictedMessenger.registerActionHandler(
    'NetworkController:getState',
    (): Record<string, never> => ({}),
  );
  unrestrictedMessenger.registerActionHandler(
    'NetworkController:getEIP1559Compatibility',
    async () => false,
  );
  unrestrictedMessenger.registerActionHandler(
    'GasFeeController:fetchGasFeeEstimates',
    async (): Promise<Record<string, never>> => ({}),
  );
  unrestrictedMessenger.registerActionHandler(
    'KeyringController:signTransaction',
    async (): Promise<Record<string, never>> => ({}),
  );
  unrestrictedMessenger.registerActionHandler(
    'AccountsController:getSelectedAccount',
    (): undefined => undefined,
  );
  unrestrictedMessenger.registerActionHandler(
    'AccountsController:getState',
    (): Record<string, never> => ({}),
  );
  unrestrictedMessenger.registerActionHandler(
    'ApprovalController:addRequest',
    async (): Promise<Record<string, never>> => ({}),
  );
  unrestrictedMessenger.registerActionHandler(
    'SentinelApiService:simulateTransactions',
    async (): Promise<Record<string, never>> => ({}),
  );

  unrestrictedMessenger.delegate({
    messenger: transactionControllerMessenger,
    actions: [
      'AccountsController:getSelectedAccount',
      'AccountsController:getState',
      'ApprovalController:addRequest',
      'GasFeeController:fetchGasFeeEstimates',
      'KeyringController:signTransaction',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getEIP1559Compatibility',
      'NetworkController:getNetworkClientById',
      'NetworkController:getNetworkClientRegistry',
      'NetworkController:getState',
      'RemoteFeatureFlagController:getState',
      'SentinelApiService:simulateTransactions',
    ],
  });

  const transactionController = new TransactionController({
    disableSwaps: false,
    getPermittedAccounts: async (): Promise<Hex[]> => [WALLET_ADDRESS_MOCK],
    hooks: {
      isResumable: (transaction): boolean =>
        isPayTransactionResumable(transaction, flags),
    },
    messenger: transactionControllerMessenger,
    state: { transactions: [getParentTransactionMock()] },
  });

  unrestrictedMessenger.delegate({
    messenger: payMessenger,
    actions: [
      'AccountsController:getState',
      'AssetsController:getState',
      'GasFeeController:getState',
      'KeyringController:getState',
      'NetworkController:findNetworkClientIdByChainId',
      'NetworkController:getNetworkClientById',
      'NetworkController:getNetworkConfigurationByChainId',
      'RampsController:getOrder',
      'RampsController:getQuoteWithFees',
      'RemoteFeatureFlagController:getState',
      'SentinelApiService:simulateTransactions',
      'TransactionController:addTransaction',
      'TransactionController:addTransactionBatch',
      'TransactionController:estimateGas',
      'TransactionController:estimateGasBatch',
      'TransactionController:failTransaction',
      'TransactionController:finalizeResumedTransaction',
      'TransactionController:getGasFeeTokens',
      'TransactionController:getState',
      'TransactionController:updateTransaction',
    ],
    events: [
      'AssetsController:stateChange',
      'KeyringController:unlock',
      'TransactionController:stateChange',
      'TransactionController:unapprovedTransactionAdded',
    ],
  });

  const clientTriggerMock = vi.fn();
  const waitForClientReadyMock = vi.fn().mockResolvedValue(undefined);

  const payController = new TransactionPayController({
    getAmountData: clientTriggerMock,
    getDelegationTransaction: clientTriggerMock,
    messenger: payMessenger,
    waitForClientReady: waitForClientReadyMock,
  });

  return {
    clientTriggerMock,
    payController,
    transactionController,
    waitForClientReadyMock,
  };
}

describe('pay transaction resume integration', () => {
  const submitDirectMusdAfterFiatCompletionMock = vi.mocked(
    submitDirectMusdAfterFiatCompletion,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    submitDirectMusdAfterFiatCompletionMock.mockResolvedValue({
      transactionHash: SECOND_LEG_HASH_MOCK,
    });
  });

  it('resumes an approved fiat Money Account deposit parent transaction after construction', async () => {
    const { clientTriggerMock, transactionController, waitForClientReadyMock } =
      setupControllers({
        flags: {
          confirmations_pay_extended: {
            resume: { fiat: [TransactionType.moneyAccountDeposit] },
          },
        },
      });

    await vi.waitFor(() => {
      expect(transactionController.state.transactions[0]).toMatchObject({
        hash: SECOND_LEG_HASH_MOCK,
        status: TransactionStatus.submitted,
      });
    });

    expect(waitForClientReadyMock).toHaveBeenCalledTimes(1);
    expect(clientTriggerMock).not.toHaveBeenCalled();
  });

  it('fails the approved fiat parent transaction during boot cleanup when resume is disabled', async () => {
    const { transactionController } = setupControllers({ flags: {} });

    await flushPromises();

    expect(transactionController.state.transactions[0]).toMatchObject({
      error: expect.objectContaining({
        message: 'Transaction incomplete at startup',
      }),
      status: TransactionStatus.failed,
    });
  });
});
