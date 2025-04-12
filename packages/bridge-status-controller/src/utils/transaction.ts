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
  quoteResponse: QuoteResponse & QuoteMetadata,
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
  quoteResponse: QuoteResponse & QuoteMetadata,
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

// TODO can thsi be removed since QuoteMetadata is already serialized?
// export const serializeQuoteMetadata = (
//   quoteResponse: QuoteResponse & QuoteMetadata,
// ): QuoteResponse & QuoteMetadata => {
//   return {
//     ...quoteResponse,
//     sentAmount: {
//       amount: quoteResponse.sentAmount.amount.toString(),
//       valueInCurrency: quoteResponse.sentAmount.valueInCurrency
//         ? quoteResponse.sentAmount.valueInCurrency.toString()
//         : null,
//       usd: quoteResponse.sentAmount.usd
//         ? quoteResponse.sentAmount.usd.toString()
//         : null,
//     },
//     gasFee: {
//       amount: quoteResponse.gasFee.amount.toString(),
//       valueInCurrency: quoteResponse.gasFee.valueInCurrency
//         ? quoteResponse.gasFee.valueInCurrency.toString()
//         : null,
//       usd: quoteResponse.gasFee.usd
//         ? quoteResponse.gasFee.usd.toString()
//         : null,
//     },
//     totalNetworkFee: {
//       amount: quoteResponse.totalNetworkFee.amount.toString(),
//       valueInCurrency: quoteResponse.totalNetworkFee.valueInCurrency
//         ? quoteResponse.totalNetworkFee.valueInCurrency.toString()
//         : null,
//       usd: quoteResponse.totalNetworkFee.usd
//         ? quoteResponse.totalNetworkFee.usd.toString()
//         : null,
//     },
//     totalMaxNetworkFee: {
//       amount: quoteResponse.totalMaxNetworkFee.amount.toString(),
//       valueInCurrency: quoteResponse.totalMaxNetworkFee.valueInCurrency
//         ? quoteResponse.totalMaxNetworkFee.valueInCurrency.toString()
//         : null,
//       usd: quoteResponse.totalMaxNetworkFee.usd
//         ? quoteResponse.totalMaxNetworkFee.usd.toString()
//         : null,
//     },
//     toTokenAmount: {
//       amount: quoteResponse.toTokenAmount.amount.toString(),
//       valueInCurrency: quoteResponse.toTokenAmount.valueInCurrency
//         ? quoteResponse.toTokenAmount.valueInCurrency.toString()
//         : null,
//       usd: quoteResponse.toTokenAmount.usd
//         ? quoteResponse.toTokenAmount.usd.toString()
//         : null,
//     },
//     adjustedReturn: {
//       valueInCurrency: quoteResponse.adjustedReturn.valueInCurrency
//         ? quoteResponse.adjustedReturn.valueInCurrency.toString()
//         : null,
//       usd: quoteResponse.adjustedReturn.usd
//         ? quoteResponse.adjustedReturn.usd.toString()
//         : null,
//     },
//     swapRate: quoteResponse.swapRate.toString(),
//     cost: {
//       valueInCurrency: quoteResponse.cost.valueInCurrency
//         ? quoteResponse.cost.valueInCurrency.toString()
//         : null,
//       usd: quoteResponse.cost.usd ? quoteResponse.cost.usd.toString() : null,
//     },
//   };
// };
