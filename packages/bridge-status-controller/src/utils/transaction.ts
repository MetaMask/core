/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { ChainId, formatChainIdToHex } from '@metamask/bridge-controller';
import type {
  QuoteMetadata,
  QuoteResponse,
  TxData,
} from '@metamask/bridge-controller';
import { toHex } from '@metamask/controller-utils';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type {
  BatchTransactionParams,
  TransactionController,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { TransactionBatchSingleRequest } from '@metamask/transaction-controller';
import { createProjectLogger } from '@metamask/utils';

import { getAccountByAddress } from './accounts';
import { calculateGasFees } from './gas';
import { getNetworkClientIdByChainId } from './network';
import { APPROVAL_DELAY_MS } from '../constants';
import type { BridgeStatusControllerMessenger } from '../types';

export const generateActionId = () => (Date.now() + Math.random()).toString();

export const getStatusRequestParams = (quoteResponse: QuoteResponse) => {
  return {
    bridgeId: quoteResponse.quote.bridgeId,
    bridge: quoteResponse.quote.bridges[0],
    srcChainId: quoteResponse.quote.srcChainId,
    destChainId: quoteResponse.quote.destChainId,
    quote: quoteResponse.quote,
    refuel: Boolean(quoteResponse.quote.refuel),
  };
};

export const handleApprovalDelay = async (
  srcChainId: QuoteResponse['quote']['srcChainId'],
) => {
  if ([ChainId.LINEA, ChainId.BASE].includes(srcChainId)) {
    const debugLog = createProjectLogger('bridge');
    debugLog(
      'Delaying submitting bridge tx to make Linea and Base confirmation more likely',
    );
    const waitPromise = new Promise((resolve) =>
      setTimeout(resolve, APPROVAL_DELAY_MS),
    );
    await waitPromise;
  }
};

/**
 * Adds a delay for hardware wallet transactions on mobile to fix an issue
 * where the Ledger does not get prompted for the 2nd approval.
 * Extension does not have this issue.
 *
 * @param requireApproval - Whether the delay should be applied
 */
export const handleMobileHardwareWalletDelay = async (
  requireApproval: boolean,
) => {
  if (requireApproval) {
    const mobileHardwareWalletDelay = new Promise((resolve) =>
      setTimeout(resolve, 1000),
    );
    await mobileHardwareWalletDelay;
  }
};

export const waitForTxConfirmation = async (
  messenger: BridgeStatusControllerMessenger,
  txId: string,
  {
    timeoutMs = 5 * 60_000,
    pollMs = 3_000,
  }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<TransactionMeta> => {
  const start = Date.now();
  while (true) {
    const { transactions } = messenger.call('TransactionController:getState');
    const meta = transactions.find((tx: TransactionMeta) => tx.id === txId);

    if (meta) {
      if (meta.status === TransactionStatus.confirmed) {
        return meta;
      }
      if (
        meta.status === TransactionStatus.failed ||
        meta.status === TransactionStatus.dropped ||
        meta.status === TransactionStatus.rejected
      ) {
        throw new Error('Approval transaction did not confirm');
      }
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for approval confirmation');
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
};

export const toBatchTxParams = (
  skipGasFields: boolean,
  { chainId, gasLimit, ...trade }: TxData,
  {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gas,
  }: { maxFeePerGas?: string; maxPriorityFeePerGas?: string; gas?: string },
): BatchTransactionParams => {
  const params = {
    ...trade,
    data: trade.data as `0x${string}`,
    to: trade.to as `0x${string}`,
    value: trade.value as `0x${string}`,
  };
  if (skipGasFields) {
    return params;
  }

  return {
    ...params,
    gas: toHex(gas ?? 0),
    maxFeePerGas: toHex(maxFeePerGas ?? 0),
    maxPriorityFeePerGas: toHex(maxPriorityFeePerGas ?? 0),
  };
};

export const getAddTransactionBatchParams = async ({
  messenger,
  isBridgeTx,
  approval,
  resetApproval,
  trade,
  quoteResponse: {
    quote: {
      feeData: { txFee },
      gasIncluded,
      gasIncluded7702,
      gasSponsored,
    },
    sentAmount,
    toTokenAmount,
  },
  requireApproval = false,
  isDelegatedAccount = false,
}: {
  messenger: BridgeStatusControllerMessenger;
  isBridgeTx: boolean;
  trade: TxData;
  quoteResponse: Omit<QuoteResponse, 'approval' | 'trade'> &
    Partial<QuoteMetadata>;
  approval?: TxData;
  resetApproval?: TxData;
  requireApproval?: boolean;
  isDelegatedAccount?: boolean;
}) => {
  const isGasless = gasIncluded || gasIncluded7702;
  const selectedAccount = getAccountByAddress(messenger, trade.from);
  if (!selectedAccount) {
    throw new Error(
      'Failed to submit cross-chain swap batch transaction: unknown account in trade data',
    );
  }
  const hexChainId = formatChainIdToHex(trade.chainId);
  const networkClientId = getNetworkClientIdByChainId(messenger, hexChainId);

  // Gas fields should be omitted only when gas is sponsored via 7702
  const skipGasFields = gasIncluded7702 === true;
  // Enable 7702 batching when the quote includes gasless 7702 support,
  // or when the account is already delegated (to avoid the in-flight
  // transaction limit for delegated accounts)
  const disable7702 = !skipGasFields && !isDelegatedAccount;
  const transactions: TransactionBatchSingleRequest[] = [];
  if (resetApproval) {
    const gasFees = await calculateGasFees(
      skipGasFields,
      messenger,
      resetApproval,
      networkClientId,
      hexChainId,
      isGasless ? txFee : undefined,
    );
    transactions.push({
      type: isBridgeTx
        ? TransactionType.bridgeApproval
        : TransactionType.swapApproval,
      params: toBatchTxParams(skipGasFields, resetApproval, gasFees),
    });
  }
  if (approval) {
    const gasFees = await calculateGasFees(
      skipGasFields,
      messenger,
      approval,
      networkClientId,
      hexChainId,
      isGasless ? txFee : undefined,
    );
    transactions.push({
      type: isBridgeTx
        ? TransactionType.bridgeApproval
        : TransactionType.swapApproval,
      params: toBatchTxParams(skipGasFields, approval, gasFees),
    });
  }
  const gasFees = await calculateGasFees(
    skipGasFields,
    messenger,
    trade,
    networkClientId,
    hexChainId,
    isGasless ? txFee : undefined,
  );
  transactions.push({
    type: isBridgeTx ? TransactionType.bridge : TransactionType.swap,
    params: toBatchTxParams(skipGasFields, trade, gasFees),
    assetsFiatValues: {
      sending: sentAmount?.valueInCurrency?.toString(),
      receiving: toTokenAmount?.valueInCurrency?.toString(),
    },
  });
  const transactionParams: Parameters<
    TransactionController['addTransactionBatch']
  >[0] = {
    disable7702,
    isGasFeeIncluded: Boolean(gasIncluded7702),
    isGasFeeSponsored: Boolean(gasSponsored),
    networkClientId,
    requireApproval,
    origin: 'metamask',
    from: trade.from as `0x${string}`,
    transactions,
  };

  return transactionParams;
};

export const findAndUpdateTransactionsInBatch = ({
  messenger,
  batchId,
  txDataByType,
}: {
  messenger: BridgeStatusControllerMessenger;
  batchId: string;
  txDataByType: { [key in TransactionType]?: string };
}) => {
  const txs = messenger.call('TransactionController:getState').transactions;
  const txBatch: {
    approvalMeta?: TransactionMeta;
    tradeMeta?: TransactionMeta;
  } = {
    approvalMeta: undefined,
    tradeMeta: undefined,
  };

  // This is a workaround to update the tx type after the tx is signed
  // TODO: remove this once the tx type for batch txs is preserved in the tx controller
  Object.entries(txDataByType).forEach(([txType, txData]) => {
    // Skip types not present in the batch (e.g. swap entry is undefined for bridge txs)
    if (txData === undefined) {
      return;
    }

    // Find transaction by batchId and either matching data or delegation characteristics
    const txMeta = txs.find((tx: TransactionMeta) => {
      if (tx.batchId !== batchId) {
        return false;
      }

      // For 7702 delegated transactions, check for delegation-specific fields
      // These transactions might have authorizationList or delegationAddress
      const is7702Transaction =
        (Array.isArray(tx.txParams.authorizationList) &&
          tx.txParams.authorizationList.length > 0) ||
        Boolean(tx.delegationAddress);

      if (is7702Transaction) {
        // For 7702 transactions, we need to match based on transaction type
        // since the data field might be different (batch execute call)
        if (
          (txType === TransactionType.swap ||
            txType === TransactionType.bridge) &&
          tx.type === TransactionType.batch
        ) {
          return true;
        }
        // Also check if it's an approval transaction for 7702
        if (
          (txType === TransactionType.swapApproval ||
            txType === TransactionType.bridgeApproval) &&
          tx.txParams.data === txData
        ) {
          return true;
        }
      }

      // Default matching logic for non-7702 transactions
      return tx.txParams.data === txData;
    });

    if (txMeta) {
      const updatedTx = { ...txMeta, type: txType as TransactionType };
      messenger.call(
        'TransactionController:updateTransaction',
        updatedTx,
        `Update tx type to ${txType}`,
      );
      txBatch[
        [TransactionType.bridgeApproval, TransactionType.swapApproval].includes(
          txType as TransactionType,
        )
          ? 'approvalMeta'
          : 'tradeMeta'
      ] = updatedTx;
    }
  });

  return txBatch;
};
