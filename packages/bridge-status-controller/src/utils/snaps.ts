/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { AccountsControllerState } from '@metamask/accounts-controller';
import type {
  QuoteMetadata,
  QuoteResponse,
  Trade,
} from '@metamask/bridge-controller';
import {
  extractTradeData,
  formatChainIdToCaip,
  formatChainIdToHex,
  isCrossChain,
  isTronTrade,
} from '@metamask/bridge-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { CaipChainId, Hex } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

import type {
  BridgeStatusControllerMessenger,
  SolanaTransactionMeta,
} from '../types';

/**
 * Creates a client request object for signing and sending a transaction
 * Works for Solana, BTC, Tron, and other non-EVM networks
 *
 * @param snapId - The snap ID to send the request to
 * @param transaction - The base64 encoded transaction string
 * @param scope - The CAIP-2 chain scope
 * @param accountId - The account ID
 * @param options - Optional network-specific options
 * @returns The snap request object
 */
export const createClientTransactionRequest = (
  snapId: string,
  transaction: string,
  scope: CaipChainId,
  accountId: string,
  options?: Record<string, unknown>,
) => {
  return {
    // TODO: remove 'as never' typing.
    snapId: snapId as never,
    origin: 'metamask',
    handler: 'onClientRequest' as never,
    request: {
      id: uuid(),
      jsonrpc: '2.0',
      method: 'signAndSendTransaction',
      params: {
        transaction,
        scope,
        accountId,
        ...(options && { options }),
      },
    },
  };
};

/**
 * Creates a request to sign and send a transaction for non-EVM chains
 * Uses the new unified ClientRequest:signAndSendTransaction interface
 *
 * @param trade - The trade data
 * @param srcChainId - The source chain ID
 * @param accountId - The selected account ID
 * @param snapId - The snap ID
 * @returns The snap request object for signing and sending transaction
 */
export const getClientRequest = (
  trade: Trade,
  srcChainId: number,
  accountId: string,
  snapId: string,
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
    snapId,
    transactionData,
    scope,
    accountId,
    options,
  );
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
 * @param trade - The non-evm trade or approval data
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
  trade: Trade,
  quoteResponse: Omit<QuoteResponse<Trade>, 'trade' | 'approval'> &
    QuoteMetadata,
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

  let hexChainId: Hex;
  try {
    hexChainId = formatChainIdToHex(quoteResponse.quote.srcChainId);
  } catch {
    hexChainId = '0x1';
  }
  // Extract the transaction data for storage
  const tradeData = extractTradeData(trade);

  // Create a transaction meta object with bridge-specific fields
  return {
    ...getTxMetaFields(quoteResponse),
    time: Date.now(),
    id: hash ?? uuid(),
    chainId: hexChainId,
    networkClientId: snapId ?? 'mainnet',
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

/**
 * Submits the transaction to the snap using the new unified ClientRequest interface
 * Works for all non-EVM chains (Solana, BTC, Tron)
 * This adds an approval tx to the ApprovalsController in the background
 * The client needs to handle the approval tx by redirecting to the confirmation page with the approvalTxId in the URL
 *
 * @param messenger - The BridgeStatusControllerMessenger instance
 * @param trade - The trade data (can be approval or main trade)
 * @param quoteResponse - The quote response containing metadata
 * @param selectedAccount - The account to submit the transaction for
 * @returns The transaction meta
 */
export const handleNonEvmTx = async (
  messenger: BridgeStatusControllerMessenger,
  trade: Trade,
  quoteResponse: QuoteResponse<Trade, Trade> & QuoteMetadata,
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string],
): Promise<TransactionMeta> => {
  if (!selectedAccount.metadata?.snap?.id) {
    throw new Error(
      'Failed to submit cross-chain swap transaction: undefined snap id',
    );
  }

  const request = getClientRequest(
    trade,
    quoteResponse.quote.srcChainId,
    selectedAccount.id,
    selectedAccount.metadata?.snap?.id,
  );
  const requestResponse = (await messenger.call(
    'SnapController:handleRequest',
    request,
  )) as
    | string
    | { transactionId: string }
    | { result: Record<string, string> }
    | { signature: string };

  const txMeta = handleNonEvmTxResponse(
    requestResponse,
    trade,
    quoteResponse,
    selectedAccount,
  );

  // TODO remove this eventually, just returning it now to match extension behavior
  // OR if the snap can propagate the snapRequestId or keyringReqId to the ApprovalsController, this can return the approvalTxId instead and clients won't need to subscribe to the ApprovalsController state to redirect
  return txMeta;
};
