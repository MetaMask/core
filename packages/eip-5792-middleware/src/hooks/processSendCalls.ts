import type { KeyringTypes } from '@metamask/keyring-controller';
import { JsonRpcError, providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type {
  BatchTransactionParams,
  IsAtomicBatchSupportedResultEntry,
  SecurityAlertResponse,
  TransactionController,
  ValidateSecurityRequest,
} from '@metamask/transaction-controller';
import { TransactionEnvelopeType } from '@metamask/transaction-controller';
import type { Hex, JsonRpcRequest } from '@metamask/utils';
import { add0x, bytesToHex } from '@metamask/utils';
import { groupBy } from 'lodash';
import { parse, v4 as uuid } from 'uuid';

import {
  EIP5792ErrorCode,
  EIP7682ErrorCode,
  KEYRING_TYPES_SUPPORTING_7702,
  MessageType,
  SupportedCapabilities,
  VERSION,
} from '../constants';
import type {
  EIP5792Messenger,
  SendCallsPayload,
  SendCallsRequiredAssetsParam,
  SendCallsResult,
} from '../types';
import { getAccountKeyringType } from '../utils';

/**
 * Type definition for required controller hooks and utilities of {@link processSendCalls}
 */
export type ProcessSendCallsHooks = {
  /** Function to add a batch of transactions atomically */
  addTransactionBatch: TransactionController['addTransactionBatch'];
  /** Function to add a single transaction */
  addTransaction: TransactionController['addTransaction'];
  /** Function to check if smart account suggestions are disabled */
  getDismissSmartAccountSuggestionEnabled: () => boolean;
  /** Function to check if atomic batching is supported for given parameters */
  isAtomicBatchSupported: TransactionController['isAtomicBatchSupported'];
  /** Function to validate security for transaction requests */
  validateSecurity: (
    securityAlertId: string,
    request: ValidateSecurityRequest,
    chainId: Hex,
  ) => Promise<void>;
  getPermittedAccountsForOrigin: () => Promise<Hex[]>;
  /** Function to validate if auxiliary funds capability is supported. */
  isAuxiliaryFundsSupported: (chainId: Hex) => boolean;
};

/**
 * A valid JSON-RPC request object for `wallet_sendCalls`.
 */
export type ProcessSendCallsRequest = JsonRpcRequest & {
  /** The identifier for the network client that has been created for this RPC endpoint */
  networkClientId: string;
  /** The origin of the RPC request */
  origin?: string;
};

/**
 * Processes a sendCalls request for EIP-5792 transactions.
 *
 * @param hooks - Object containing required controller hooks and utilities.
 * @param messenger - Messenger instance for controller communication.
 * @param params - The sendCalls parameters containing transaction calls and metadata.
 * @param req - The original JSON-RPC request.
 * @returns Promise resolving to a SendCallsResult containing the batch ID.
 */
export async function processSendCalls(
  hooks: ProcessSendCallsHooks,
  messenger: EIP5792Messenger,
  params: SendCallsPayload,
  req: ProcessSendCallsRequest,
): Promise<SendCallsResult> {
  const {
    addTransactionBatch,
    addTransaction,
    getDismissSmartAccountSuggestionEnabled,
    isAtomicBatchSupported,
    validateSecurity: validateSecurityHook,
    getPermittedAccountsForOrigin,
    isAuxiliaryFundsSupported,
  } = hooks;

  const { calls, from: paramFrom } = params;
  const { networkClientId, origin } = req;
  const transactions = calls.map((call) => ({ params: call }));

  const { chainId } = messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  ).configuration;

  // The first account returned by `getPermittedAccountsForOrigin` is the selected account for the origin
  const [selectedAccount] = await getPermittedAccountsForOrigin()
  const from = paramFrom ?? selectedAccount;

  if (!from) {
    throw providerErrors.unauthorized();
  }

  const securityAlertId = uuid();
  const validateSecurity = validateSecurityHook.bind(null, securityAlertId);

  const requestId = req.id ? String(req.id) : '';

  let batchId: Hex;
  if (Object.keys(transactions).length === 1) {
    batchId = await processSingleTransaction({
      addTransaction,
      chainId,
      from,
      messenger,
      networkClientId,
      origin,
      requestId,
      securityAlertId,
      sendCalls: params,
      transactions,
      validateSecurity,
      isAuxiliaryFundsSupported,
    });
  } else {
    batchId = await processMultipleTransaction({
      addTransactionBatch,
      isAtomicBatchSupported,
      chainId,
      from,
      getDismissSmartAccountSuggestionEnabled,
      messenger,
      networkClientId,
      origin,
      requestId,
      sendCalls: params,
      securityAlertId,
      transactions,
      validateSecurity,
      isAuxiliaryFundsSupported,
    });
  }

  return { id: batchId };
}

/**
 * Processes a single transaction from a sendCalls request.
 *
 * @param params - Object containing all parameters needed for single transaction processing.
 * @param params.addTransaction - Function to add a single transaction.
 * @param params.chainId - The chain ID for the transaction.
 * @param params.from - The sender address.
 * @param params.messenger - Messenger instance for controller communication.
 * @param params.networkClientId - The network client ID.
 * @param params.origin - The origin of the request (optional).
 * @param params.requestId - Unique requestId of the JSON-RPC request from DAPP.
 * @param params.securityAlertId - The security alert ID for this transaction.
 * @param params.sendCalls - The original sendCalls request.
 * @param params.transactions - Array containing the single transaction.
 * @param params.validateSecurity - Function to validate security for the transaction.
 * @param params.isAuxiliaryFundsSupported - Function to validate if auxiliary funds capability is supported.
 * @returns Promise resolving to the generated batch ID for the transaction.
 */
async function processSingleTransaction({
  addTransaction,
  chainId,
  from,
  messenger,
  networkClientId,
  origin,
  requestId,
  securityAlertId,
  sendCalls,
  transactions,
  validateSecurity,
  isAuxiliaryFundsSupported,
}: {
  addTransaction: TransactionController['addTransaction'];
  chainId: Hex;
  from: Hex;
  messenger: EIP5792Messenger;
  networkClientId: string;
  origin?: string;
  requestId?: string;
  securityAlertId: string;
  sendCalls: SendCallsPayload;
  transactions: { params: BatchTransactionParams }[];
  validateSecurity: (
    securityRequest: ValidateSecurityRequest,
    chainId: Hex,
  ) => void;
  isAuxiliaryFundsSupported: (chainId: Hex) => boolean;
}) {
  const keyringType = getAccountKeyringType(from, messenger);

  validateSingleSendCall(
    sendCalls,
    chainId,
    keyringType,
    isAuxiliaryFundsSupported,
  );

  const txParams = {
    from,
    ...transactions[0].params,
    type: TransactionEnvelopeType.feeMarket,
  };

  const securityRequest: ValidateSecurityRequest = {
    method: MessageType.SendTransaction,
    params: [txParams],
    origin,
  };
  validateSecurity(securityRequest, chainId);

  dedupeAuxiliaryFundsRequiredAssets(sendCalls);

  const batchId = generateBatchId();

  await addTransaction(txParams, {
    requestId,
    networkClientId,
    origin,
    securityAlertResponse: { securityAlertId } as SecurityAlertResponse,
    batchId,
  });
  return batchId;
}

/**
 * Processes multiple transactions from a sendCalls request as an atomic batch.
 *
 * @param params - Object containing all parameters needed for multiple transaction processing.
 * @param params.addTransactionBatch - Function to add a batch of transactions atomically.
 * @param params.isAtomicBatchSupported - Function to check if atomic batching is supported.
 * @param params.chainId - The chain ID for the transactions.
 * @param params.from - The sender address.
 * @param params.getDismissSmartAccountSuggestionEnabled - Function to check if smart account suggestions are disabled.
 * @param params.networkClientId - The network client ID.
 * @param params.messenger - Messenger instance for controller communication.
 * @param params.origin - The origin of the request (optional).
 * @param params.requestId - Unique requestId of the JSON-RPC request from DAPP.
 * @param params.sendCalls - The original sendCalls request.
 * @param params.securityAlertId - The security alert ID for this batch.
 * @param params.transactions - Array of transactions to process.
 * @param params.validateSecurity - Function to validate security for the transactions.
 * @param params.isAuxiliaryFundsSupported - Function to validate if auxiliary funds capability is supported.
 * @returns Promise resolving to the generated batch ID for the transaction batch.
 */
async function processMultipleTransaction({
  addTransactionBatch,
  isAtomicBatchSupported,
  chainId,
  from,
  getDismissSmartAccountSuggestionEnabled,
  networkClientId,
  messenger,
  origin,
  requestId,
  sendCalls,
  securityAlertId,
  transactions,
  validateSecurity,
  isAuxiliaryFundsSupported,
}: {
  addTransactionBatch: TransactionController['addTransactionBatch'];
  isAtomicBatchSupported: TransactionController['isAtomicBatchSupported'];
  chainId: Hex;
  from: Hex;
  getDismissSmartAccountSuggestionEnabled: () => boolean;
  messenger: EIP5792Messenger;
  networkClientId: string;
  origin?: string;
  requestId?: string;
  sendCalls: SendCallsPayload;
  securityAlertId: string;
  transactions: { params: BatchTransactionParams }[];
  validateSecurity: (
    securityRequest: ValidateSecurityRequest,
    chainId: Hex,
  ) => Promise<void>;
  isAuxiliaryFundsSupported: (chainId: Hex) => boolean;
}) {
  const batchSupport = await isAtomicBatchSupported({
    address: from,
    chainIds: [chainId],
  });

  const chainBatchSupport = batchSupport?.[0];

  const keyringType = getAccountKeyringType(from, messenger);

  const dismissSmartAccountSuggestionEnabled =
    getDismissSmartAccountSuggestionEnabled();

  validateSendCalls(
    sendCalls,
    chainId,
    dismissSmartAccountSuggestionEnabled,
    chainBatchSupport,
    keyringType,
    isAuxiliaryFundsSupported,
  );

  dedupeAuxiliaryFundsRequiredAssets(sendCalls);

  const result = await addTransactionBatch({
    from,
    networkClientId,
    origin,
    requestId,
    securityAlertId,
    transactions,
    validateSecurity,
  });
  return result.batchId;
}

/**
 * Generate a transaction batch ID.
 *
 * @returns  A unique batch ID as a hexadecimal string.
 */
function generateBatchId(): Hex {
  const idString = uuid();
  const idBytes = new Uint8Array(parse(idString));
  return bytesToHex(idBytes);
}

/**
 * Validates a single sendCalls request.
 *
 * @param sendCalls - The sendCalls request to validate.
 * @param dappChainId - The chain ID that the dApp is connected to.
 * @param keyringType - The type of keyring associated with the account.
 * @param isAuxiliaryFundsSupported - Function to validate if auxiliary funds capability is supported.
 */
function validateSingleSendCall(
  sendCalls: SendCallsPayload,
  dappChainId: Hex,
  keyringType: KeyringTypes,
  isAuxiliaryFundsSupported: (chainId: Hex) => boolean,
) {
  validateSendCallsVersion(sendCalls);
  validateCapabilities(sendCalls, keyringType, isAuxiliaryFundsSupported);
  validateDappChainId(sendCalls, dappChainId);
}

/**
 * Validates a sendCalls request for multiple transactions.
 *
 * @param sendCalls - The sendCalls request to validate.
 * @param dappChainId - The chain ID that the dApp is connected to
 * @param dismissSmartAccountSuggestionEnabled - Whether smart account suggestions are disabled.
 * @param chainBatchSupport - Information about atomic batch support for the chain.
 * @param keyringType - The type of keyring associated with the account.
 * @param isAuxiliaryFundsSupported - Function to validate if auxiliary funds capability is supported.
 */
function validateSendCalls(
  sendCalls: SendCallsPayload,
  dappChainId: Hex,
  dismissSmartAccountSuggestionEnabled: boolean,
  chainBatchSupport: IsAtomicBatchSupportedResultEntry | undefined,
  keyringType: KeyringTypes,
  isAuxiliaryFundsSupported: (chainId: Hex) => boolean,
) {
  validateSendCallsVersion(sendCalls);
  validateSendCallsChainId(sendCalls, dappChainId, chainBatchSupport);
  validateCapabilities(sendCalls, keyringType, isAuxiliaryFundsSupported);
  validateUpgrade(
    dismissSmartAccountSuggestionEnabled,
    chainBatchSupport,
    keyringType,
  );
}

/**
 * Validates the version of a sendCalls request.
 *
 * @param sendCalls - The sendCalls request to validate.
 * @throws JsonRpcError if the version is not supported.
 */
function validateSendCallsVersion(sendCalls: SendCallsPayload) {
  const { version } = sendCalls;

  if (version !== VERSION) {
    throw rpcErrors.invalidInput(
      `Version not supported: Got ${version}, expected ${VERSION}`,
    );
  }
}

/**
 * Validates that the chain ID in the sendCalls request matches the dApp's selected network.
 *
 * @param sendCalls - The sendCalls request to validate.
 * @param dappChainId - The chain ID that the dApp is connected to
 * @throws JsonRpcError if the chain IDs don't match
 */
function validateDappChainId(sendCalls: SendCallsPayload, dappChainId: Hex) {
  const { chainId: requestChainId } = sendCalls;

  if (
    requestChainId &&
    requestChainId.toLowerCase() !== dappChainId.toLowerCase()
  ) {
    throw rpcErrors.invalidParams(
      `Chain ID must match the dApp selected network: Got ${requestChainId}, expected ${dappChainId}`,
    );
  }
}

/**
 * Validates the chain ID for sendCalls requests with additional EIP-7702 support checks.
 *
 * @param sendCalls - The sendCalls request to validate.
 * @param dappChainId - The chain ID that the dApp is connected to
 * @param chainBatchSupport - Information about atomic batch support for the chain
 * @throws JsonRpcError if the chain ID doesn't match or EIP-7702 is not supported
 */
function validateSendCallsChainId(
  sendCalls: SendCallsPayload,
  dappChainId: Hex,
  chainBatchSupport: IsAtomicBatchSupportedResultEntry | undefined,
) {
  validateDappChainId(sendCalls, dappChainId);
  if (!chainBatchSupport) {
    throw new JsonRpcError(
      EIP5792ErrorCode.UnsupportedChainId,
      `EIP-7702 not supported on chain: ${dappChainId}`,
    );
  }
}

/**
 * Validates that all required capabilities in the sendCalls request are supported.
 *
 * @param sendCalls - The sendCalls request to validate.
 * @param keyringType - The type of keyring associated with the account.
 * @param isAuxiliaryFundsSupported - Function to validate if auxiliary funds capability is supported.
 *
 * @throws JsonRpcError if unsupported non-optional capabilities are requested.
 */
function validateCapabilities(
  sendCalls: SendCallsPayload,
  keyringType: KeyringTypes,
  isAuxiliaryFundsSupported: (chainId: Hex) => boolean,
) {
  const { calls, capabilities, chainId } = sendCalls;

  const requiredTopLevelCapabilities = Object.keys(capabilities ?? {}).filter(
    (name) =>
      // Non optional capabilities other than `auxiliaryFunds` are not supported by the wallet
      name !== SupportedCapabilities.AuxiliaryFunds.toString() &&
      capabilities?.[name].optional !== true,
  );

  const requiredCallCapabilities = calls.flatMap((call) =>
    Object.keys(call.capabilities ?? {}).filter(
      (name) =>
        name !== SupportedCapabilities.AuxiliaryFunds.toString() &&
        call.capabilities?.[name].optional !== true,
    ),
  );

  const requiredCapabilities = [
    ...requiredTopLevelCapabilities,
    ...requiredCallCapabilities,
  ];

  if (requiredCapabilities?.length) {
    throw new JsonRpcError(
      EIP5792ErrorCode.UnsupportedNonOptionalCapability,
      `Unsupported non-optional capabilities: ${requiredCapabilities.join(
        ', ',
      )}`,
    );
  }

  if (capabilities?.auxiliaryFunds) {
    validateAuxFundsSupportAndRequiredAssets({
      auxiliaryFunds: capabilities.auxiliaryFunds,
      chainId,
      keyringType,
      isAuxiliaryFundsSupported,
    });
  }
}

/**
 * Validates EIP-7682 optional `requiredAssets` to see if the account and chain are supported, and that param is well-formed.
 *
 * docs: {@link https://eips.ethereum.org/EIPS/eip-7682#extended-usage-requiredassets-parameter}
 *
 * @param param - The parameter object.
 * @param param.auxiliaryFunds - The auxiliaryFunds param to validate.
 * @param param.auxiliaryFunds.optional - Metadata to signal for wallets that support this optional capability, while maintaining compatibility with wallets that do not.
 * @param param.auxiliaryFunds.requiredAssets - Metadata that enables a wallets support for `auxiliaryFunds` capability.
 * @param param.chainId - The chain ID of the incoming request.
 * @param param.keyringType - The type of keyring associated with the account.
 * @param param.isAuxiliaryFundsSupported - Function to validate if auxiliary funds capability is supported.
 * @throws JsonRpcError if auxiliary funds capability is not supported.
 */
function validateAuxFundsSupportAndRequiredAssets({
  auxiliaryFunds,
  chainId,
  keyringType,
  isAuxiliaryFundsSupported,
}: {
  auxiliaryFunds: {
    optional?: boolean;
    requiredAssets?: SendCallsRequiredAssetsParam[];
  };
  chainId: Hex;
  keyringType: KeyringTypes;
  isAuxiliaryFundsSupported: (chainId: Hex) => boolean;
}) {
  // If we can make use of that capability then we should, but otherwise we can process the request and ignore the capability
  // so if the capability is signaled as optional, no validation is required, so we don't block the transaction from happening.
  if (auxiliaryFunds.optional) {
    return;
  }
  const isSupportedAccount =
    KEYRING_TYPES_SUPPORTING_7702.includes(keyringType);

  if (!isSupportedAccount) {
    throw new JsonRpcError(
      EIP5792ErrorCode.UnsupportedNonOptionalCapability,
      `Unsupported non-optional capability: ${SupportedCapabilities.AuxiliaryFunds}`,
    );
  }

  if (!isAuxiliaryFundsSupported(chainId)) {
    throw new JsonRpcError(
      EIP7682ErrorCode.UnsupportedChain,
      `The wallet no longer supports auxiliary funds on the requested chain: ${chainId}`,
    );
  }

  if (!auxiliaryFunds?.requiredAssets) {
    return;
  }

  for (const asset of auxiliaryFunds.requiredAssets) {
    if (asset.standard !== 'erc20') {
      throw new JsonRpcError(
        EIP7682ErrorCode.UnsupportedAsset,
        `The requested asset ${asset.address} is not available through the wallet’s auxiliary fund system: unsupported token standard ${asset.standard}`,
      );
    }
  }
}

/**
 * Validates whether an EIP-7702 upgrade is allowed for the given parameters.
 *
 * @param dismissSmartAccountSuggestionEnabled - Whether smart account suggestions are disabled.
 * @param chainBatchSupport - Information about atomic batch support for the chain.
 * @param keyringType - The type of keyring associated with the account.
 * @throws JsonRpcError if the upgrade is rejected due to user settings or account type.
 */
function validateUpgrade(
  dismissSmartAccountSuggestionEnabled: boolean,
  chainBatchSupport: IsAtomicBatchSupportedResultEntry | undefined,
  keyringType: KeyringTypes,
) {
  if (chainBatchSupport?.delegationAddress) {
    return;
  }

  if (dismissSmartAccountSuggestionEnabled) {
    throw new JsonRpcError(
      EIP5792ErrorCode.RejectedUpgrade,
      'EIP-7702 upgrade disabled by the user',
    );
  }

  if (!KEYRING_TYPES_SUPPORTING_7702.includes(keyringType)) {
    throw new JsonRpcError(
      EIP5792ErrorCode.RejectedUpgrade,
      'EIP-7702 upgrade not supported on account',
    );
  }
}

/**
 * Function to possibly deduplicate `auxiliaryFunds` capability `requiredAssets`.
 * Does nothing if no `requiredAssets` exists in `auxiliaryFunds` capability.
 *
 * @param sendCalls - The original sendCalls request.
 */
function dedupeAuxiliaryFundsRequiredAssets(sendCalls: SendCallsPayload): void {
  if (sendCalls.capabilities?.auxiliaryFunds?.requiredAssets) {
    const { requiredAssets } = sendCalls.capabilities.auxiliaryFunds;
    // Group assets by their address (lowercased) and standard
    const grouped = groupBy(
      requiredAssets,
      (asset) => `${asset.address.toLowerCase()}-${asset.standard}`,
    );

    // For each group, sum the amounts and return a single asset
    const deduplicatedAssets = Object.values(grouped).map((group) => {
      if (group.length === 1) {
        return group[0];
      }

      const totalAmount = group.reduce((sum, asset) => {
        return sum + BigInt(asset.amount);
      }, 0n);

      return {
        ...group[0],
        amount: add0x(totalAmount.toString(16)),
      };
    });

    sendCalls.capabilities.auxiliaryFunds.requiredAssets = deduplicatedAssets;
  }
}
