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

export const generateActionId = () => Date.now() + Math.random();

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

// /**
//  *
//  * @param txMeta
//  */
// export function updateTransaction(txMeta: TransactionMeta) {
//   txController.updateTransaction(txMeta);

//   try {
//     dispatch(updateTransactionParams(txMeta.id, txMeta.txParams));
//     await forceUpdateMetamaskState(dispatch);
//     dispatch(showConfTxPage({ id: txMeta.id }));
//     return txMeta;
//   } finally {
//     dispatch(hideLoadingIndication());
//   }
// }

// /**
//  *
// //  * @param request
//  */
// async function addTransactionOrUserOperation(
//   request: FinalAddTransactionRequest,
// ) {
//   const { selectedAccount } = request;

//   const isSmartContractAccount =
//     selectedAccount.type === EthAccountType.Erc4337;

//   if (isSmartContractAccount) {
//     return addUserOperationWithController(request);
//   }

//   return addTransactionWithController(request);
// }

// /**
//  *
//  * @param request
//  */
// async function addTransactionWithController(
//   request: FinalAddTransactionRequest,
// ) {
//   const {
//     transactionController,
//     transactionOptions,
//     transactionParams,
//     networkClientId,
//   } = request;

//   const { result, transactionMeta } =
//     await transactionController.addTransaction(transactionParams, {
//       ...transactionOptions,
//       networkClientId,
//     });

//   return {
//     transactionMeta,
//     waitForHash: () => result,
//   };
// }

// /**
//  *
//  * @param request
//  */
export const addTransactionOrUserOperation = async (request: unknown) => {
  //   const { selectedAccount } = request;
  //   const isSmartContractAccount =
  //     selectedAccount.type === EthAccountType.Erc4337;
  //   if (isSmartContractAccount) {
  //     return addUserOperationWithController(request);
  //   }
  //   return addTransactionWithController(request);
};

// /**
//  *
//  * @param request
//  */
export const addTransaction = async () => {
  //   request: AddTransactionRequest,
  // ): Promise<TransactionMeta> {
  //   await validateSecurity(request);
  //   const { transactionMeta, waitForHash } =
  //     await addTransactionOrUserOperation(request);
  //   if (!request.waitForSubmit) {
  //     waitForHash().catch(() => {
  //       // Not concerned with result.
  //     });
  //     return transactionMeta as TransactionMeta;
  //   }
  //   const transactionHash = await waitForHash();
  //   const finalTransactionMeta = getTransactionByHash(
  //     transactionHash as string,
  //     request.transactionController,
  //   );
  //   return finalTransactionMeta as TransactionMeta;
};

// export const getAddTransactionRequest = ({
//   transactionParams,
//   transactionOptions,
//   dappRequest,
//   ...otherParams
// }) => ({
//   internalAccounts: this.accountsController.listAccounts(),
//   dappRequest,
//   networkClientId:
//     dappRequest?.networkClientId ?? transactionOptions?.networkClientId,
//   selectedAccount: this.accountsController.getAccountByAddress(
//     transactionParams.from,
//   ),
//   transactionController: this.txController,
//   transactionOptions,
//   transactionParams,
//   userOperationController: this.userOperationController,
//   chainId: this.#getGlobalChainId(),
//   ppomController: this.ppomController,
//   securityAlertsEnabled:
//     this.preferencesController.state?.securityAlertsEnabled,
//   updateSecurityAlertResponse: this.updateSecurityAlertResponse.bind(this),
//   ...otherParams,
// });

export const getTxMetaFields = (
  quoteResponse: Omit<QuoteResponse<string | TxData>, 'approval' | 'trade'> &
    QuoteMetadata,
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
  quoteResponse: Omit<QuoteResponse<string>, 'approval' | 'trade'> &
    QuoteMetadata,
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
