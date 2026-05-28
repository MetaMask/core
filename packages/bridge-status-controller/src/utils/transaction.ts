/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  ChainId,
  formatChainIdToHex,
  BRIDGE_PREFERRED_GAS_ESTIMATE,
  isEvmTxData,
  FeeType,
} from '@metamask/bridge-controller';
import type {
  QuoteMetadata,
  QuoteResponse,
  SimulatedGasFeeLimits,
  Trade,
  TxData,
  TxFeeGasLimits,
} from '@metamask/bridge-controller';
import { toHex } from '@metamask/controller-utils';
import {
  GasFeeEstimateType,
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type {
  IsAtomicBatchSupportedResultEntry,
  TransactionController,
  TransactionMeta,
  TransactionBatchSingleRequest,
  BatchTransactionParams,
} from '@metamask/transaction-controller';
import { createProjectLogger } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { APPROVAL_DELAY_MS } from '../constants';
import type { BridgeStatusControllerMessenger } from '../types';
import type { QuoteAndTxMetadata } from '../types';
import { getAccountByAddress } from './accounts';
import { getNetworkClientIdByChainId } from './network';

export const isApprovalTx = (type: TransactionType) =>
  type === TransactionType.bridgeApproval ||
  type === TransactionType.swapApproval;
export const isTradeTx = (type: TransactionType) =>
  type === TransactionType.bridge || type === TransactionType.swap;
export const isCrossChainTx = (type: TransactionType) =>
  isTradeTx(type) || isApprovalTx(type);

/**
 * For 7702 delegated transactions, check for delegation-specific fields
 * These transactions might have authorizationList or delegationAddress
 *
 * @param tx - The transaction meta
 * @returns Whether the transaction is a 7702 transaction
 */
const is7702Tx = (tx: TransactionMeta) => {
  return (
    (Array.isArray(tx.txParams.authorizationList) &&
      tx.txParams.authorizationList.length > 0) ||
    Boolean(tx.delegationAddress)
  );
};

export const getGasFeeEstimates = async (
  messenger: BridgeStatusControllerMessenger,
  args: Parameters<TransactionController['estimateGasFee']>[0],
) => {
  const { estimates } = await messenger.call(
    'TransactionController:estimateGasFee',
    args,
  );

  if (estimates?.type === GasFeeEstimateType.FeeMarket) {
    return estimates[BRIDGE_PREFERRED_GAS_ESTIMATE];
  }

  return undefined;
};

export const getTransactions = (messenger: BridgeStatusControllerMessenger) => {
  return messenger.call('TransactionController:getState').transactions ?? [];
};

export const getTransactionMetaById = (
  messenger: BridgeStatusControllerMessenger,
  txId?: string,
) => {
  return getTransactions(messenger).find(
    (tx: TransactionMeta) => tx.id === txId,
  );
};

export const getTransactionMetaByHash = (
  messenger: BridgeStatusControllerMessenger,
  txHash?: string,
) => {
  return getTransactions(messenger).find(
    (tx: TransactionMeta) => tx.hash?.toLowerCase() === txHash?.toLowerCase(),
  );
};

export const updateTransaction = (
  messenger: BridgeStatusControllerMessenger,
  txMeta: TransactionMeta,
  txMetaUpdates: Partial<TransactionMeta>,
  note: string,
) => {
  return messenger.call(
    'TransactionController:updateTransaction',
    { ...txMeta, ...txMetaUpdates },
    note,
  );
};

export const checkIsDelegatedAccount = async (
  messenger: BridgeStatusControllerMessenger,
  fromAddress: Hex,
  chainIds: Hex[],
): Promise<boolean> => {
  try {
    const atomicBatchSupport = await messenger.call(
      'TransactionController:isAtomicBatchSupported',
      {
        address: fromAddress,
        chainIds,
      },
    );
    return atomicBatchSupport.some(
      (entry: IsAtomicBatchSupportedResultEntry) =>
        entry.isSupported && entry.delegationAddress,
    );
  } catch {
    return false;
  }
};

const waitForHashAndReturnFinalTxMeta = async (
  messenger: BridgeStatusControllerMessenger,
  hashPromise?: Awaited<
    ReturnType<TransactionController['addTransaction']>
  >['result'],
): Promise<TransactionMeta> => {
  const txHash = await hashPromise;
  const finalTransactionMeta = getTransactionMetaByHash(messenger, txHash);
  if (!finalTransactionMeta) {
    throw new Error(
      'Failed to submit cross-chain swap tx: txMeta for txHash was not found',
    );
  }
  return finalTransactionMeta;
};

export const addTransaction = async (
  messenger: BridgeStatusControllerMessenger,
  ...args: Parameters<TransactionController['addTransaction']>
) => {
  const { result } = await messenger.call(
    'TransactionController:addTransaction',
    ...args,
  );
  return await waitForHashAndReturnFinalTxMeta(messenger, result);
};

export const generateActionId = () => (Date.now() + Math.random()).toString();

/**
 * Adds a synthetic transaction to the TransactionController to display pending intent orders in the UI
 *
 * @param messenger - The messenger to use for the transaction
 * @param args - The arguments for the transaction
 * @returns The transaction meta
 */
export const addSyntheticTransaction = async (
  messenger: BridgeStatusControllerMessenger,
  ...args: Parameters<TransactionController['addTransaction']>
) => {
  const { transactionMeta } = await messenger.call(
    'TransactionController:addTransaction',
    args[0],
    {
      origin: 'metamask',
      actionId: generateActionId(),
      isStateOnly: true,
      isInternal: true,
      ...args[1],
    },
  );
  return transactionMeta;
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

/**
 * Waits until a given transaction (by id) reaches confirmed/finalized status or fails/times out.
 *
 * @deprecated use addTransaction util
 * @param messenger - the BridgeStatusControllerMessenger
 * @param txId - the transaction ID
 * @param options - the options for the timeout and poll
 * @param options.timeoutMs - the timeout in milliseconds
 * @param options.pollMs - the poll interval in milliseconds
 * @returns the transaction meta
 */
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
    const meta = getTransactionMetaById(messenger, txId);

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

export const toQuoteAndTxMetadata = ({
  quoteResponse,
  isBridgeTx,
}: {
  quoteResponse: QuoteResponse<Trade, Trade> & QuoteMetadata;
  isBridgeTx: boolean;
}) => {
  const tradeData: QuoteAndTxMetadata[] = [];

  const approvalTxType = isBridgeTx
    ? TransactionType.bridgeApproval
    : TransactionType.swapApproval;

  if (quoteResponse.resetApproval) {
    tradeData.push({
      quoteResponse,
      tx: quoteResponse.resetApproval,
      type: approvalTxType,
      txFee: quoteResponse.quote.feeData[FeeType.TX_FEE],
    });
  }
  if (quoteResponse.approval && isEvmTxData(quoteResponse.approval)) {
    tradeData.push({
      quoteResponse,
      tx: quoteResponse.approval,
      type: approvalTxType,
      txFee: quoteResponse.quote.feeData[FeeType.TX_FEE],
    });
  }
  tradeData.push({
    quoteResponse,
    tx: quoteResponse.trade as TxData,
    type: isBridgeTx ? TransactionType.bridge : TransactionType.swap,
    assetsFiatValues: {
      sending: quoteResponse.sentAmount?.valueInCurrency?.toString(),
      receiving: quoteResponse.toTokenAmount?.valueInCurrency?.toString(),
    },
    txFee: quoteResponse.quote.feeData[FeeType.TX_FEE],
  });

  return tradeData;
};

/**
 * Appends the gas fee estimates for a transaction and normalizes the trade data
 *
 * @param messenger - The messenger for the gas fee estimates
 * @param trade - the trade data to append gas fees to
 * @param trade.chainId - ignored, use chainId instead
 * @param trade.gasLimit - the gas limit to use for the gas fee estimates
 * @param networkClientId - the network client ID to use for the gas fee estimates
 * @param chainId - the chain ID to use for the gas fee estimates
 * @param simulatedGasFeeLimits - either the txFee from the quote or the simulated gas fee limits for the batch sell
 * @returns The gas fee estimates for the transaction
 */
export const toTransactionParams = async (
  messenger: BridgeStatusControllerMessenger,
  { chainId: tradeChainId, gasLimit, ...trade }: TxData,
  networkClientId: string,
  chainId: Hex,
  simulatedGasFeeLimits?: SimulatedGasFeeLimits | TxFeeGasLimits,
): Promise<BatchTransactionParams> => {
  const normalizedTrade = {
    ...trade,
    data: trade.data,
    to: trade.to,
    from: trade.from,
    value: trade.value,
  };
  const transactionParams = {
    ...normalizedTrade,
    // Only add gasLimit and gas if they're truthy
    gas: gasLimit ? toHex(gasLimit) : undefined,
  };

  // Use bridge-api's provided gas fee estimates
  if (simulatedGasFeeLimits) {
    return {
      ...transactionParams,
      maxFeePerGas: toHex(simulatedGasFeeLimits.maxFeePerGas),
      maxPriorityFeePerGas: toHex(simulatedGasFeeLimits.maxPriorityFeePerGas),
    };
  }

  // Get transaction's 1559 gas fee estimates
  const gasFeeEstimates = await getGasFeeEstimates(messenger, {
    transactionParams,
    networkClientId,
    chainId,
  });

  return {
    ...transactionParams,
    maxFeePerGas: gasFeeEstimates?.maxFeePerGas,
    maxPriorityFeePerGas: gasFeeEstimates?.maxPriorityFeePerGas,
  };
};

export const getAddTransactionBatchParams = async ({
  messenger,
  tradeData,
  requireApproval = false,
  isDelegatedAccount,
  ...addTransactionBatchParams
}: Partial<Parameters<TransactionController['addTransactionBatch']>[0]> & {
  messenger: BridgeStatusControllerMessenger;
  tradeData: QuoteAndTxMetadata[];
  requireApproval?: boolean;
  isDelegatedAccount?: boolean;
}): Promise<Parameters<TransactionController['addTransactionBatch']>[0]> => {
  const trade = tradeData[0].tx;
  const selectedAccount = getAccountByAddress(messenger, trade.from);
  if (!selectedAccount) {
    throw new Error(
      'Failed to submit cross-chain swap batch transaction: unknown account in trade data',
    );
  }
  const hexChainId = formatChainIdToHex(trade.chainId);
  const networkClientId = getNetworkClientIdByChainId(messenger, hexChainId);

  const transactions: TransactionBatchSingleRequest[] = await Promise.all(
    tradeData.map(async ({ tx, txFee, assetsFiatValues, type }) => ({
      params: await toTransactionParams(
        messenger,
        tx,
        networkClientId,
        hexChainId,
        txFee,
      ),
      assetsFiatValues,
      type,
    })),
  );

  return {
    networkClientId,
    requireApproval,
    origin: 'metamask',
    from: selectedAccount.address as Hex,
    isInternal: true,
    transactions,
    ...addTransactionBatchParams,
  };
};

export const findAllTransactionsInBatch = ({
  messenger,
  batchId,
  tradeData,
}: {
  messenger: BridgeStatusControllerMessenger;
  batchId: string;
  tradeData: QuoteAndTxMetadata[];
}): QuoteAndTxMetadata[] => {
  // Filter for transactions with batchId
  const txs = getTransactions(messenger).filter(
    (tx: TransactionMeta) => tx.batchId === batchId,
  );

  return tradeData.map((tradeWithMetadata) => {
    const { tx, type } = tradeWithMetadata;
    return {
      ...tradeWithMetadata,
      txMeta: txs.find((txMeta: TransactionMeta) => {
        if (is7702Tx(txMeta)) {
          // For 7702 transactions, we need to match based on transaction type
          // since the data field might be different (batch execute call)
          if (isTradeTx(type) && txMeta.type === TransactionType.batch) {
            return true;
          }
          // Also check if it's an approval transaction for 7702
          if (isApprovalTx(type) && txMeta.txParams.data === tx.data) {
            return true;
          }
        }
        // Default matching logic for non-7702 transactions
        if (txMeta.txParams.data === tx.data) {
          return true;
        }
        return false;
      }),
    };
  });
};

/**
 * This is a workaround to update the tx type after submission. Batch txs are submitted with
 * the "batch" type, but we need to update to swap/bridge for display purposes.
 *
 * @param params - The parameters for the transaction search
 * @param params.messenger - The messenger to use for the transaction
 * @param params.allTradesWithMetadata - The quote, tx data and type for each transaction in the batch
 * @returns A list of transaction metas for each trade in the batch]
 *
 * @example
 * [
 *   {...tradeData[0], tradeMeta: TransactionMeta}
 *   {...tradeData[1], tradeMeta: TransactionMeta}
 *   {...tradeData[2], tradeMeta: TransactionMeta}
 *   {...tradeData[3], tradeMeta: TransactionMeta}
 * ]
 */
export const updateTransactionsInBatch = ({
  messenger,
  allTradesWithMetadata,
}: {
  messenger: BridgeStatusControllerMessenger;
  allTradesWithMetadata: QuoteAndTxMetadata[];
}) => {
  return allTradesWithMetadata.map((tradeWithMetadata) => {
    const { txMeta, type } = tradeWithMetadata;

    if (txMeta) {
      // Update the tx type from batch to swap/bridge
      updateTransaction(
        messenger,
        txMeta,
        { type },
        `Update tx type to ${type}`,
      );
      const updatedTx = { ...txMeta, type };
      return { ...tradeWithMetadata, txMeta: updatedTx, type };
    }

    return tradeWithMetadata;
  });
};

export const addTransactionBatch = async (
  messenger: BridgeStatusControllerMessenger,
  addTransactionBatchFn: TransactionController['addTransactionBatch'],
  tradeData: QuoteAndTxMetadata[],
  transactionParams: Parameters<
    TransactionController['addTransactionBatch']
  >[0],
) => {
  const { batchId } = await addTransactionBatchFn(transactionParams);

  const quoteAndTxMetas = findAllTransactionsInBatch({
    messenger,
    batchId,
    tradeData,
  });

  const updatedQuoteAndTxMetas = updateTransactionsInBatch({
    messenger,
    allTradesWithMetadata: quoteAndTxMetas,
  });

  return {
    approvalMeta: updatedQuoteAndTxMetas.find(
      ({ type, txMeta }) => isApprovalTx(type) && txMeta,
    )?.txMeta,
    tradeMeta: updatedQuoteAndTxMetas.find(
      ({ type, txMeta }) => isTradeTx(type) && txMeta,
    )?.txMeta,
  };
};

/**
 * Submits an single EVM tx to the TransactionController and returns the txMeta
 *
 * @param params - The parameters for the transaction
 * @param params.transactionType - The type of transaction to submit
 * @param params.trade - The trade data to confirm
 * @param params.requireApproval - Whether to require approval for the transaction
 * @param params.txFee - Optional gas fee parameters from the quote (used when gasIncluded is true)
 * @param params.txFee.maxFeePerGas - The maximum fee per gas from the quote
 * @param params.txFee.maxPriorityFeePerGas - The maximum priority fee per gas from the quote
 * @param params.actionId - Optional actionId for pre-submission history (if not provided, one is generated)
 * @param params.messenger - The messenger to use for the transaction
 * @returns The transaction meta
 */
export const submitEvmTransaction = async ({
  messenger,
  trade,
  transactionType,
  requireApproval = false,
  txFee,
  // Use provided actionId (for pre-submission history) or generate one
  actionId = generateActionId(),
}: {
  messenger: BridgeStatusControllerMessenger;
  transactionType: TransactionType;
  trade: TxData;
  requireApproval?: boolean;
  txFee?: { maxFeePerGas: string; maxPriorityFeePerGas: string };
  actionId?: string;
}): Promise<TransactionMeta> => {
  const selectedAccount = getAccountByAddress(messenger, trade.from);
  if (!selectedAccount) {
    throw new Error(
      'Failed to submit cross-chain swap transaction: unknown account in trade data',
    );
  }
  const hexChainId = formatChainIdToHex(trade.chainId);
  const networkClientId = getNetworkClientIdByChainId(messenger, hexChainId);

  const requestOptions = {
    actionId,
    networkClientId,
    requireApproval,
    type: transactionType,
    origin: 'metamask',
    isInternal: true,
  };

  const transactionParamsWithMaxGas = await toTransactionParams(
    messenger,
    trade,
    networkClientId,
    hexChainId,
    txFee,
  );

  return await addTransaction(
    messenger,
    { ...transactionParamsWithMaxGas, from: trade.from },
    requestOptions,
  );
};
