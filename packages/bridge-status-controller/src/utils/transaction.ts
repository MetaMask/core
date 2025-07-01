import type { AccountsControllerState } from '@metamask/accounts-controller';
import type { Quote, TxData } from '@metamask/bridge-controller';
import {
  ChainId,
  FeeType,
  formatChainIdToHex,
  getEthUsdtResetData,
  isCrossChain,
  isEthUsdt,
  type QuoteMetadata,
  type QuoteResponse,
} from '@metamask/bridge-controller';
import { toHex } from '@metamask/controller-utils';
import { SolScope } from '@metamask/keyring-api';
import type { TransactionController } from '@metamask/transaction-controller';
import {
  TransactionStatus,
  TransactionType,
  type BatchTransactionParams,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createProjectLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';
import { v4 as uuid } from 'uuid';

import { calculateGasFees } from './gas';
import type {
  TransactionBatchSingleRequest,
  TransactionParams,
} from '../../../transaction-controller/src/types';
import { LINEA_DELAY_MS } from '../constants';
import type {
  BridgeStatusControllerMessenger,
  SolanaTransactionMeta,
} from '../types';

export const generateActionId = () => (Date.now() + Math.random()).toString();

export const getUSDTAllowanceResetTx = async (
  messagingSystem: BridgeStatusControllerMessenger,
  quoteResponse: QuoteResponse<TxData | string> & QuoteMetadata,
) => {
  const hexChainId = formatChainIdToHex(quoteResponse.quote.srcChainId);
  if (
    quoteResponse.approval &&
    isEthUsdt(hexChainId, quoteResponse.quote.srcAsset.address)
  ) {
    const allowance = new BigNumber(
      await messagingSystem.call(
        'BridgeController:getBridgeERC20Allowance',
        quoteResponse.quote.srcAsset.address,
        hexChainId,
      ),
    );
    const shouldResetApproval =
      allowance.lt(quoteResponse.sentAmount.amount) && allowance.gt(0);
    if (shouldResetApproval) {
      return { ...quoteResponse.approval, data: getEthUsdtResetData() };
    }
  }
  return undefined;
};

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
  quoteResponse: Omit<QuoteResponse<string | TxData>, 'approval' | 'trade'> &
    QuoteMetadata,
  approvalTxId?: string,
): Omit<
  TransactionMeta,
  'networkClientId' | 'status' | 'time' | 'txParams' | 'id'
> => {
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

    chainId: formatChainIdToHex(quoteResponse.quote.srcChainId),
    approvalTxId,
    // this is the decimal (non atomic) amount (not USD value) of source token to swap
    swapTokenValue: quoteResponse.sentAmount.amount,
  };
};

export const handleSolanaTxResponse = (
  snapResponse:
    | string
    | { result: Record<string, string> }
    | { signature: string },
  quoteResponse: Omit<QuoteResponse<string>, 'approval'> & QuoteMetadata,
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string],
): TransactionMeta & SolanaTransactionMeta => {
  const selectedAccountAddress = selectedAccount.address;
  const snapId = selectedAccount.metadata.snap?.id;
  let hash;
  // Handle different response formats
  if (typeof snapResponse === 'string') {
    hash = snapResponse;
  } else if (snapResponse && typeof snapResponse === 'object') {
    // If it's an object with result property, try to get the signature
    if (
      typeof snapResponse === 'object' &&
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
    }
    if (
      typeof snapResponse === 'object' &&
      'signature' in snapResponse &&
      snapResponse.signature &&
      typeof snapResponse.signature === 'string'
    ) {
      hash = snapResponse.signature;
    }
  }

  const hexChainId = formatChainIdToHex(quoteResponse.quote.srcChainId);
  const isBridgeTx = isCrossChain(
    quoteResponse.quote.srcChainId,
    quoteResponse.quote.destChainId,
  );

  // Create a transaction meta object with bridge-specific fields
  return {
    ...getTxMetaFields(quoteResponse),
    time: Date.now(),
    id: uuid(),
    chainId: hexChainId,
    networkClientId: snapId ?? hexChainId,
    txParams: { from: selectedAccountAddress, data: quoteResponse.trade },
    type: isBridgeTx ? TransactionType.bridge : TransactionType.swap,
    status: TransactionStatus.submitted,
    hash, // Add the transaction signature as hash
    origin: snapId,
    // Add an explicit bridge flag to mark this as a Solana transaction
    isSolana: true, // TODO deprecate this and use chainId
    isBridgeTx,
  };
};

export const handleLineaDelay = async (
  quoteResponse: QuoteResponse<TxData | string>,
) => {
  if (ChainId.LINEA === quoteResponse.quote.srcChainId) {
    const debugLog = createProjectLogger('bridge');
    debugLog(
      'Delaying submitting bridge tx to make Linea confirmation more likely',
    );
    const waitPromise = new Promise((resolve) =>
      setTimeout(resolve, LINEA_DELAY_MS),
    );
    await waitPromise;
  }
};

export const getKeyringRequest = (
  quoteResponse: Omit<QuoteResponse<string>, 'approval'> & QuoteMetadata,
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string],
) => {
  const keyringReqId = uuid();
  const snapRequestId = uuid();

  return {
    origin: 'metamask',
    snapId: selectedAccount.metadata.snap?.id as never,
    handler: 'onKeyringRequest' as never,
    request: {
      id: keyringReqId,
      jsonrpc: '2.0',
      method: 'keyring_submitRequest',
      params: {
        request: {
          params: {
            account: { address: selectedAccount.address },
            transaction: quoteResponse.trade,
            scope: SolScope.Mainnet,
          },
          method: 'signAndSendTransaction',
        },
        id: snapRequestId,
        account: selectedAccount.id,
        scope: SolScope.Mainnet,
      },
    },
  };
};

export const getClientRequest = (
  quoteResponse: Omit<QuoteResponse<string>, 'approval'> & QuoteMetadata,
  selectedAccount: AccountsControllerState['internalAccounts']['accounts'][string],
) => {
  const clientReqId = uuid();

  return {
    origin: 'metamask',
    snapId: selectedAccount.metadata.snap?.id as never,
    handler: 'onClientRequest' as never,
    request: {
      id: clientReqId,
      jsonrpc: '2.0',
      method: 'signAndSendTransactionWithoutConfirmation',
      params: {
        account: { address: selectedAccount.address },
        transaction: quoteResponse.trade,
        scope: SolScope.Mainnet,
      },
    },
  };
};

export const toTransactionBatchParams = (
  { chainId, gasLimit, ...trade }: TxData,
  { txFee }: Quote['feeData'],
): BatchTransactionParams => {
  return {
    ...trade,
    gas: toHex(gasLimit ?? 0),
    data: trade.data as `0x${string}`,
    to: trade.to as `0x${string}`,
    value: trade.value as `0x${string}`,
    maxFeePerGas: txFee ? toHex(txFee.maxFeePerGas ?? 0) : undefined,
    maxPriorityFeePerGas: txFee
      ? toHex(txFee.maxPriorityFeePerGas ?? 0)
      : undefined,
  };
};

export const getAddTransactionBatchParams = async ({
  messagingSystem,
  isBridgeTx,
  approval,
  resetApproval,
  trade,
  quoteResponse,
  requireApproval = false,
}: {
  messagingSystem: BridgeStatusControllerMessenger;
  isBridgeTx: boolean;
  approval?: TxData;
  resetApproval?: TxData;
  trade: TxData;
  quoteResponse: Omit<QuoteResponse, 'approval' | 'trade'> & QuoteMetadata;
  requireApproval?: boolean;
}) => {
  const selectedAccount = messagingSystem.call(
    'AccountsController:getAccountByAddress',
    trade.from,
  );
  if (!selectedAccount) {
    throw new Error(
      'Failed to submit cross-chain swap batch transaction: unknown account in trade data',
    );
  }
  const hexChainId = formatChainIdToHex(trade.chainId);
  const networkClientId = messagingSystem.call(
    'NetworkController:findNetworkClientIdByChainId',
    hexChainId,
  );

  const transactions: TransactionBatchSingleRequest[] = [];
  if (resetApproval) {
    transactions.push({
      type: isBridgeTx
        ? TransactionType.bridgeApproval
        : TransactionType.swapApproval,
      params: toTransactionBatchParams(
        resetApproval,
        quoteResponse.quote.feeData,
      ),
    });
  }
  if (approval) {
    transactions.push({
      type: isBridgeTx
        ? TransactionType.bridgeApproval
        : TransactionType.swapApproval,
      params: toTransactionBatchParams(approval, quoteResponse.quote.feeData),
    });
  }
  transactions.push({
    type: isBridgeTx ? TransactionType.bridge : TransactionType.swap,
    params: toTransactionBatchParams(trade, quoteResponse.quote.feeData),
  });
  const transactionParams: Parameters<
    TransactionController['addTransactionBatch']
  >[0] = {
    // disable7702: true, // TODO enable if chain supports 7702
    networkClientId,
    requireApproval,
    origin: 'metamask',
    from: trade.from as `0x${string}`,
    transactions,
  };

  // const isSmartContractAccount =
  //   selectedAccount.type === EthAccountType.Erc4337;
  // if (isSmartContractAccount && this.#addUserOperationFromTransactionFn) {
  //   const smartAccountTxResult =
  //     await this.#addUserOperationFromTransactionFn(
  //       transactionParamsWithMaxGas,
  //       requestOptions,
  //     );
  //   result = smartAccountTxResult.transactionHash;
  //   transactionMeta = {
  //     ...requestOptions,
  //     chainId: hexChainId,
  //     txParams: transactionParamsWithMaxGas,
  //     time: Date.now(),
  //     id: smartAccountTxResult.id,
  //     status: TransactionStatus.confirmed,
  //   };
  // }

  return transactionParams;
};

export const getAddTransactionParams = async ({
  messagingSystem,
  estimateGasFeeFn,
  transactionType,
  trade,
  quoteResponse,
  hexChainId,
  requireApproval = false,
}: {
  messagingSystem: BridgeStatusControllerMessenger;
  estimateGasFeeFn: typeof TransactionController.prototype.estimateGasFee;
  transactionType: TransactionType;
  trade: TxData;
  quoteResponse: Omit<QuoteResponse, 'approval' | 'trade'> & QuoteMetadata;
  hexChainId: Hex;
  requireApproval?: boolean;
}) => {
  const actionId = generateActionId().toString();
  const networkClientId = messagingSystem.call(
    'NetworkController:findNetworkClientIdByChainId',
    hexChainId,
  );

  const requestOptions = {
    actionId,
    networkClientId,
    requireApproval,
    transactionType,
    origin: 'metamask',
  };
  const transactionParams: Parameters<
    TransactionController['addTransaction']
  >[0] = {
    ...trade,
    chainId: hexChainId,
    gasLimit: trade.gasLimit?.toString(),
    gas: trade.gasLimit?.toString(),
  };
  const transactionParamsWithMaxGas: TransactionParams = {
    ...transactionParams,
    ...(quoteResponse.quote.feeData[FeeType.TX_FEE]
      ? toTransactionBatchParams(trade, quoteResponse.quote.feeData)
      : await calculateGasFees(
          messagingSystem,
          estimateGasFeeFn,
          transactionParams,
          networkClientId,
          hexChainId,
        )),
  };

  return { transactionParamsWithMaxGas, requestOptions };
};
