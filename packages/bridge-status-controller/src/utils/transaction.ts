import type { TxData } from '@metamask/bridge-controller';
import {
  formatChainIdToHex,
  type QuoteMetadata,
  type QuoteResponse,
} from '@metamask/bridge-controller';
import {
  TransactionStatus,
  TransactionType,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import { v4 as uuid } from 'uuid';

export const getStatusRequestParams = (
  quoteResponse: QuoteResponse<string | TxData>,
) => {
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
  quoteResponse: QuoteResponse<string | TxData> & QuoteMetadata,
  approvalTxId?: string,
) => {
  return {
    destinationChainId: formatChainIdToHex(quoteResponse.quote.destChainId),
    sourceTokenAmount: quoteResponse.quote.srcTokenAmount,
    sourceTokenSymbol: quoteResponse.quote.srcAsset.symbol,
    sourceTokenDecimals: quoteResponse.quote.srcAsset.decimals,
    sourceTokenAddress: quoteResponse.quote.srcAsset.address,

    destinationTokenAmount: quoteResponse.quote.destTokenAmount,
    destinationTokenSymbol: quoteResponse.quote.destAsset.symbol,
    destinationTokenDecimals: quoteResponse.quote.destAsset.decimals,
    destinationTokenAddress: quoteResponse.quote.destAsset.address,

    approvalTxId,
    // this is the decimal (non atomic) amount (not USD value) of source token to swap
    swapTokenValue: quoteResponse.sentAmount.amount,
    // Ensure it's marked as a bridge transaction for UI detection
    isBridgeTx: true, // TODO deprecate this and use tx type
  };
};

export const handleSolanaTxResponse = (
  snapResponse: string | { result: Record<string, string> },
  quoteResponse: QuoteResponse<string | TxData> & QuoteMetadata,
  snapId: string, // TODO use SnapId type
  selectedAccountAddress: string,
) => {
  let hash;
  // Handle different response formats
  if (typeof snapResponse === 'string') {
    hash = snapResponse;
  } else if (snapResponse && typeof snapResponse === 'object') {
    // If it's an object with result property, try to get the signature
    if (snapResponse.result && typeof snapResponse.result === 'object') {
      // Try to extract signature from common locations in response object
      hash =
        snapResponse.result.signature ||
        snapResponse.result.txid ||
        snapResponse.result.hash ||
        snapResponse.result.txHash;
    }
  }

  // Create a transaction meta object with bridge-specific fields
  const txMeta: TransactionMeta = {
    ...getTxMetaFields(quoteResponse),
    id: uuid(),
    chainId: formatChainIdToHex(quoteResponse.quote.srcChainId),
    // networkClientId: selectedAccount.id, //TODO optional for solana or no?
    txParams: { from: selectedAccountAddress }, // { data: quoteResponse.trade }, // TODO not reading this for solana
    type: TransactionType.bridge,
    status: TransactionStatus.submitted,
    hash, // Add the transaction signature as hash
    // Add an explicit flag to mark this as a Solana transaction
    isSolana: true, // TODO deprecate this and use chainId
    isBridgeTx: true, // TODO deprecate this and use type
    // Add key bridge-specific fields for proper categorization
    // actionId: txType,
    origin: snapId,
  } as never; // TODO remove this override once deprecated fields are removed

  return txMeta;
};
