import type { AccountsControllerState } from '@metamask/accounts-controller';
import {
  ChainId,
  extractTradeData,
  isTronTrade,
  formatChainIdToCaip,
  formatChainIdToHex,
  isCrossChain,
} from '@metamask/bridge-controller';
import type {
  QuoteMetadata,
  QuoteResponse,
  Trade,
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
import { createProjectLogger } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

import { calculateGasFees } from './gas';
import { createClientTransactionRequest } from './snaps';
import type { TransactionBatchSingleRequest } from '../../../transaction-controller/src/types';
import { APPROVAL_DELAY_MS } from '../constants';
import type {
  BridgeStatusControllerMessenger,
  SolanaTransactionMeta,
} from '../types';

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

export const getTxMetaFields = (
  quoteResponse: Omit<QuoteResponse<Trade, Trade>, 'approval' | 'trade'> &
    QuoteMetadata,
  approvalTxId?: string,
): Omit<
  TransactionMeta,
  'networkClientId' | 'status' | 'time' | 'txParams' | 'id' | 'chainId'
> => {
  // Handle destination chain ID - should always be convertible for EVM destinations
  let destinationChainId;
  try {
    destinationChainId = formatChainIdToHex(quoteResponse.quote.destChainId);
  } catch {
    // Fallback for non-EVM destination (shouldn't happen for BTC->EVM)
    destinationChainId = '0x1' as `0x${string}`; // Default to mainnet
  }

  return {
    destinationChainId,
    sourceTokenAmount: quoteResponse.quote.srcTokenAmount,
    sourceTokenSymbol: quoteResponse.quote.srcAsset.symbol,
    sourceTokenDecimals: quoteResponse.quote.srcAsset.decimals,
    sourceTokenAddress: quoteResponse.quote.srcAsset.address,

    destinationTokenAmount: quoteResponse.quote.destTokenAmount,
    destinationTokenSymbol: quoteResponse.quote.destAsset.symbol,
    destinationTokenDecimals: quoteResponse.quote.destAsset.decimals,
    destinationTokenAddress: quoteResponse.quote.destAsset.address,

    // chainId is now excluded from this function and handled by the caller
    approvalTxId,
    // this is the decimal (non atomic) amount (not USD value) of source token to swap
    swapTokenValue: quoteResponse.sentAmount.amount,
  };
};

/**
 * Handles the response from non-EVM transaction submission
 * Works with the new unified ClientRequest:signAndSendTransaction interface
 * Supports Solana, Bitcoin, and other non-EVM chains
 *
 * @param snapResponse - The response from the snap after transaction submission
 * @param quoteResponse - The quote response containing trade details and metadata
 * @param selectedAccount - The selected account information
 * @returns The transaction metadata including non-EVM specific fields
 */
export const handleNonEvmTxResponse = (
  snapResponse:
    | string
    | { transactionId: string } // New unified interface response
    | { result: Record<string, string> }
    | { signature: string },
  quoteResponse: Omit<QuoteResponse<Trade>, 'approval'> & QuoteMetadata,
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string],
): TransactionMeta & SolanaTransactionMeta => {
  const selectedAccountAddress = selectedAccount.address;
  const snapId = selectedAccount.metadata.snap?.id;
  let hash;
  // Handle different response formats
  if (typeof snapResponse === 'string') {
    hash = snapResponse;
  } else if (snapResponse && typeof snapResponse === 'object') {
    // Check for new unified interface response format first
    if ('transactionId' in snapResponse && snapResponse.transactionId) {
      hash = snapResponse.transactionId;
    } else if (
      'result' in snapResponse &&
      snapResponse.result &&
      typeof snapResponse.result === 'object'
    ) {
      // Try to extract signature from common locations in response object
      hash =
        snapResponse.result.signature ||
        snapResponse.result.txid ||
        snapResponse.result.hash ||
        snapResponse.result.txHash;
    } else if (
      'signature' in snapResponse &&
      snapResponse.signature &&
      typeof snapResponse.signature === 'string'
    ) {
      hash = snapResponse.signature;
    }
  }

  const isBridgeTx = isCrossChain(
    quoteResponse.quote.srcChainId,
    quoteResponse.quote.destChainId,
  );

  let hexChainId;
  try {
    hexChainId = formatChainIdToHex(quoteResponse.quote.srcChainId);
  } catch {
    // TODO: Fix chain ID activity list handling for Bitcoin
    // Fallback to Ethereum mainnet for now
    hexChainId = '0x1' as `0x${string}`;
  }

  // Extract the transaction data for storage
  const tradeData = extractTradeData(quoteResponse.trade);

  // Create a transaction meta object with bridge-specific fields
  return {
    ...getTxMetaFields(quoteResponse),
    time: Date.now(),
    id: hash ?? uuid(),
    chainId: hexChainId,
    networkClientId: snapId ?? hexChainId,
    txParams: { from: selectedAccountAddress, data: tradeData },
    type: isBridgeTx ? TransactionType.bridge : TransactionType.swap,
    status: TransactionStatus.submitted,
    hash, // Add the transaction signature as hash
    origin: snapId,
    // Add an explicit flag to mark this as a non-EVM transaction
    isSolana: true, // TODO deprecate this and use chainId to detect non-EVM chains
    isBridgeTx,
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

/**
 * Creates a request to sign and send a transaction for non-EVM chains
 * Uses the new unified ClientRequest:signAndSendTransaction interface
 *
 * @param trade - The trade data
 * @param srcChainId - The source chain ID
 * @param selectedAccount - The selected account information
 * @returns The snap request object for signing and sending transaction
 */
export const getClientRequest = (
  trade: Trade,
  srcChainId: number,
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string],
) => {
  const scope = formatChainIdToCaip(srcChainId);

  const transactionData = extractTradeData(trade);

  // Tron trades need the visible flag and contract type to be included in the request options
  const options = isTronTrade(trade)
    ? {
        visible: trade.visible,
        type: trade.raw_data?.contract?.[0]?.type,
      }
    : undefined;

  // Use the new unified interface
  return createClientTransactionRequest(
    selectedAccount.metadata.snap?.id as string,
    transactionData,
    scope,
    selectedAccount.id,
    options,
  );
};

export const toBatchTxParams = (
  disable7702: boolean,
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
  if (!disable7702) {
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
  estimateGasFeeFn,
}: {
  messenger: BridgeStatusControllerMessenger;
  isBridgeTx: boolean;
  trade: TxData;
  quoteResponse: Omit<QuoteResponse, 'approval' | 'trade'> &
    Partial<QuoteMetadata>;
  estimateGasFeeFn: typeof TransactionController.prototype.estimateGasFee;
  approval?: TxData;
  resetApproval?: TxData;
  requireApproval?: boolean;
}) => {
  const isGasless = gasIncluded || gasIncluded7702;
  const selectedAccount = messenger.call(
    'AccountsController:getAccountByAddress',
    trade.from,
  );
  if (!selectedAccount) {
    throw new Error(
      'Failed to submit cross-chain swap batch transaction: unknown account in trade data',
    );
  }
  const hexChainId = formatChainIdToHex(trade.chainId);
  const networkClientId = messenger.call(
    'NetworkController:findNetworkClientIdByChainId',
    hexChainId,
  );

  // When an active quote has gasIncluded7702 set to true,
  // enable 7702 gasless txs for smart accounts
  const disable7702 = gasIncluded7702 !== true;
  const transactions: TransactionBatchSingleRequest[] = [];
  if (resetApproval) {
    const gasFees = await calculateGasFees(
      disable7702,
      messenger,
      estimateGasFeeFn,
      resetApproval,
      networkClientId,
      hexChainId,
      isGasless ? txFee : undefined,
    );
    transactions.push({
      type: isBridgeTx
        ? TransactionType.bridgeApproval
        : TransactionType.swapApproval,
      params: toBatchTxParams(disable7702, resetApproval, gasFees),
    });
  }
  if (approval) {
    const gasFees = await calculateGasFees(
      disable7702,
      messenger,
      estimateGasFeeFn,
      approval,
      networkClientId,
      hexChainId,
      isGasless ? txFee : undefined,
    );
    transactions.push({
      type: isBridgeTx
        ? TransactionType.bridgeApproval
        : TransactionType.swapApproval,
      params: toBatchTxParams(disable7702, approval, gasFees),
    });
  }
  const gasFees = await calculateGasFees(
    disable7702,
    messenger,
    estimateGasFeeFn,
    trade,
    networkClientId,
    hexChainId,
    isGasless ? txFee : undefined,
  );
  transactions.push({
    type: isBridgeTx ? TransactionType.bridge : TransactionType.swap,
    params: toBatchTxParams(disable7702, trade, gasFees),
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
  updateTransactionFn,
  batchId,
  txDataByType,
}: {
  messenger: BridgeStatusControllerMessenger;
  updateTransactionFn: typeof TransactionController.prototype.updateTransaction;
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
    // Find transaction by batchId and either matching data or delegation characteristics
    const txMeta = txs.find((tx) => {
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
          txType === TransactionType.swap &&
          tx.type === TransactionType.batch
        ) {
          return true;
        }
        // Also check if it's an approval transaction for 7702
        if (
          txType === TransactionType.swapApproval &&
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
      updateTransactionFn(updatedTx, `Update tx type to ${txType}`);
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

/**
 * Determines the key to use for storing a bridge history item.
 * Uses actionId for pre-submission tracking, or bridgeTxMetaId for post-submission.
 *
 * @param actionId - The action ID used for pre-submission tracking
 * @param bridgeTxMetaId - The transaction meta ID from bridgeTxMeta
 * @returns The key to use for the history item
 * @throws Error if neither actionId nor bridgeTxMetaId is provided
 */
export function getHistoryKey(
  actionId: string | undefined,
  bridgeTxMetaId: string | undefined,
): string {
  const historyKey = actionId ?? bridgeTxMetaId;
  if (!historyKey) {
    throw new Error(
      'Cannot add tx to history: either actionId or bridgeTxMeta.id must be provided',
    );
  }
  return historyKey;
}
