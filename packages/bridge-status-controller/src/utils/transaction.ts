/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  ChainId,
  formatChainIdToHex,
  BRIDGE_PREFERRED_GAS_ESTIMATE,
} from '@metamask/bridge-controller';
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
  IsAtomicBatchSupportedResultEntry,
  TransactionController,
  TransactionMeta,
  TransactionBatchSingleRequest,
  TransactionParams,
} from '@metamask/transaction-controller';
import { createProjectLogger, Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { APPROVAL_DELAY_MS } from '../constants';
import type { BridgeStatusControllerMessenger } from '../types';
import { getAccountByAddress } from './accounts';
import { getNetworkClientIdByChainId } from './network';

export const getGasFeeEstimates = async (
  messenger: BridgeStatusControllerMessenger,
  args: Parameters<TransactionController['estimateGasFee']>[0],
): Promise<{ maxFeePerGas?: string; maxPriorityFeePerGas?: string }> => {
  const { estimates } = await messenger.call(
    'TransactionController:estimateGasFee',
    args,
  );
  if (
    BRIDGE_PREFERRED_GAS_ESTIMATE in estimates &&
    typeof estimates[BRIDGE_PREFERRED_GAS_ESTIMATE] === 'object' &&
    'maxFeePerGas' in estimates[BRIDGE_PREFERRED_GAS_ESTIMATE] &&
    'maxPriorityFeePerGas' in estimates[BRIDGE_PREFERRED_GAS_ESTIMATE]
  ) {
    return estimates[BRIDGE_PREFERRED_GAS_ESTIMATE];
  }
  return {};
};

/**
 * Get the gas fee estimates for a transaction
 *
 * @param messenger - The messenger for the gas fee estimates
 * @param estimateGasFeeParams - The parameters for the {@link TransactionController.estimateGasFee} method
 
 * @returns The gas fee estimates for the transaction
 */
export const getTxGasEstimates = async (
  messenger: BridgeStatusControllerMessenger,
  estimateGasFeeParams: Parameters<TransactionController['estimateGasFee']>[0],
) => {
  const { gasFeeEstimates } = messenger.call('GasFeeController:getState');
  const estimatedBaseFee =
    'estimatedBaseFee' in gasFeeEstimates
      ? gasFeeEstimates.estimatedBaseFee
      : '0';

  // Get transaction's 1559 gas fee estimates
  const { maxFeePerGas, maxPriorityFeePerGas } = await getGasFeeEstimates(
    messenger,
    estimateGasFeeParams,
  );

  /**
   * @deprecated this is unused
   */
  const baseAndPriorityFeePerGas = maxPriorityFeePerGas
    ? new BigNumber(estimatedBaseFee, 10)
        .times(10 ** 9)
        .plus(maxPriorityFeePerGas, 16)
    : undefined;

  return {
    baseAndPriorityFeePerGas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };
};

export const calculateGasFees = async (
  skipGasFields: boolean,
  messenger: BridgeStatusControllerMessenger,
  { chainId: _, gasLimit, ...trade }: TxData,
  networkClientId: string,
  chainId: Hex,
  txFee?: { maxFeePerGas: string; maxPriorityFeePerGas: string },
) => {
  if (skipGasFields) {
    return {};
  }
  if (txFee) {
    return { ...txFee, gas: gasLimit?.toString() };
  }
  const transactionParams = {
    ...trade,
    gas: gasLimit?.toString(),
    data: trade.data as `0x${string}`,
    to: trade.to as `0x${string}`,
    value: trade.value as `0x${string}`,
  };
  const { maxFeePerGas, maxPriorityFeePerGas } = await getTxGasEstimates(
    messenger,
    {
      transactionParams,
      networkClientId,
      chainId,
    },
  );
  const maxGasLimit = toHex(transactionParams.gas ?? 0);

  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gas: maxGasLimit,
  };
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
    (tx: TransactionMeta) => tx.hash === txHash,
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
    data: trade.data as Hex,
    to: trade.to as Hex,
    value: trade.value as Hex,
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
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
  let disable7702 = !skipGasFields && !isDelegatedAccount;

  // For gasless transactions with STX/sendBundle we keep disabling 7702.
  if (gasIncluded && !gasIncluded7702) {
    disable7702 = true;
  }

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
    from: trade.from as Hex,
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
  const txs = getTransactions(messenger);
  const txBatch: {
    approvalMeta?: TransactionMeta;
    tradeMeta?: TransactionMeta;
  } = {
    approvalMeta: undefined,
    tradeMeta: undefined,
  };

  // This is a workaround to update the tx type after the tx is signed
  // TODO: remove this once the tx type for batch txs is preserved in the tx controller
  const txEntries = Object.entries(txDataByType) as [TransactionType, string][];
  txEntries.forEach(([txType, txData]) => {
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
      const updatedTx = { ...txMeta, type: txType };
      updateTransaction(
        messenger,
        txMeta,
        { type: txType },
        `Update tx type to ${txType}`,
      );
      const txTypes = [
        TransactionType.bridgeApproval,
        TransactionType.swapApproval,
      ] as readonly string[];
      txBatch[txTypes.includes(txType) ? 'approvalMeta' : 'tradeMeta'] =
        updatedTx;
    }
  });

  return txBatch;
};

export const addTransactionBatch = async (
  messenger: BridgeStatusControllerMessenger,
  addTransactionBatchFn: TransactionController['addTransactionBatch'],
  ...args: Parameters<TransactionController['addTransactionBatch']>
) => {
  const txDataByType = {
    [TransactionType.bridgeApproval]: args[0].transactions.find(
      ({ type }) => type === TransactionType.bridgeApproval,
    )?.params.data,
    [TransactionType.swapApproval]: args[0].transactions.find(
      ({ type }) => type === TransactionType.swapApproval,
    )?.params.data,
    [TransactionType.bridge]: args[0].transactions.find(
      ({ type }) => type === TransactionType.bridge,
    )?.params.data,
    [TransactionType.swap]: args[0].transactions.find(
      ({ type }) => type === TransactionType.swap,
    )?.params.data,
  };

  const { batchId } = await addTransactionBatchFn(...args);

  const { approvalMeta, tradeMeta } = findAndUpdateTransactionsInBatch({
    messenger,
    batchId,
    txDataByType,
  });

  if (!tradeMeta) {
    throw new Error(
      'Failed to update cross-chain swap transaction batch: tradeMeta not found',
    );
  }

  return { approvalMeta, tradeMeta };
};

// TODO rename
const getGasFeesForSubmission = async (
  messenger: BridgeStatusControllerMessenger,
  transactionParams: TransactionParams,
  networkClientId: string,
  chainId: Hex,
  txFee?: { maxFeePerGas: string; maxPriorityFeePerGas: string },
): Promise<{
  maxFeePerGas?: string; // Hex
  maxPriorityFeePerGas?: string; // Hex
  gas?: Hex;
}> => {
  const { gas } = transactionParams;
  // If txFee is provided (gasIncluded case), use the quote's gas fees
  // Convert to hex since txFee values from the quote are decimal strings
  if (txFee) {
    return {
      maxFeePerGas: toHex(txFee.maxFeePerGas),
      maxPriorityFeePerGas: toHex(txFee.maxPriorityFeePerGas),
      gas: gas ? toHex(gas) : undefined,
    };
  }

  const { maxFeePerGas, maxPriorityFeePerGas } = await getTxGasEstimates(
    messenger,
    {
      transactionParams,
      chainId,
      networkClientId,
    },
  );

  return {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gas: gas ? toHex(gas) : undefined,
  };
};

/**
 * Submits an EVM transaction to the TransactionController
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
  };
  // Exclude gasLimit from trade to avoid type issues (it can be null)
  const { gasLimit: tradeGasLimit, ...tradeWithoutGasLimit } = trade;

  const transactionParams: Parameters<
    TransactionController['addTransaction']
  >[0] = {
    ...tradeWithoutGasLimit,
    chainId: hexChainId,
    // Only add gasLimit and gas if they're valid (not undefined/null/zero)
    ...(tradeGasLimit &&
      tradeGasLimit !== 0 && {
        gasLimit: tradeGasLimit.toString(),
        gas: tradeGasLimit.toString(),
      }),
  };
  const transactionParamsWithMaxGas: TransactionParams = {
    ...transactionParams,
    ...(await getGasFeesForSubmission(
      messenger,
      transactionParams,
      networkClientId,
      hexChainId,
      txFee,
    )),
  };

  return await addTransaction(
    messenger,
    transactionParamsWithMaxGas,
    requestOptions,
  );
};
