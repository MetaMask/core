import type {
  AccountsControllerGetSelectedAccountAction,
  AccountsControllerGetStateAction,
} from '@metamask/accounts-controller';
import type { Messenger } from '@metamask/base-controller';
import type {
  GetCallsStatusResult,
  GetCapabilitiesResult,
  SendCalls,
  SendCallsResult,
} from '@metamask/eth-json-rpc-middleware';
import { GetCallsStatusCode } from '@metamask/eth-json-rpc-middleware';
import type { KeyringTypes } from '@metamask/keyring-controller';
import type {
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';
import type { PreferencesControllerGetStateAction } from '@metamask/preferences-controller';
import { JsonRpcError, rpcErrors } from '@metamask/rpc-errors';
import type {
  BatchTransactionParams,
  IsAtomicBatchSupportedResult,
  IsAtomicBatchSupportedResultEntry,
  Log,
  SecurityAlertResponse,
  TransactionController,
  TransactionControllerGetStateAction,
  TransactionMeta,
  TransactionReceipt,
  ValidateSecurityRequest,
} from '@metamask/transaction-controller';
import {
  TransactionEnvelopeType,
  TransactionStatus,
} from '@metamask/transaction-controller';
import type { Hex, JsonRpcRequest } from '@metamask/utils';
import { bytesToHex } from '@metamask/utils';
import { parse, v4 as uuid } from 'uuid';

import {
  EIP5792ErrorCode,
  KEYRING_TYPES_SUPPORTING_7702,
  MESSAGE_TYPE,
} from './constants';

type Actions =
  | AccountsControllerGetStateAction
  | AccountsControllerGetSelectedAccountAction
  | NetworkControllerGetNetworkClientByIdAction
  | TransactionControllerGetStateAction
  | PreferencesControllerGetStateAction
  | NetworkControllerGetStateAction;

export type EIP5792Messenger = Messenger<Actions, never>;

export enum AtomicCapabilityStatus {
  Supported = 'supported',
  Ready = 'ready',
  Unsupported = 'unsupported',
}

/**
 * Type definition for the hooks parameter of processSendCalls function.
 */
export type ProcessSendCallsHooks = {
  addTransactionBatch: TransactionController['addTransactionBatch'];
  addTransaction: TransactionController['addTransaction'];
  getDismissSmartAccountSuggestionEnabled: () => boolean;
  isAtomicBatchSupported: TransactionController['isAtomicBatchSupported'];
  validateSecurity: (
    securityAlertId: string,
    request: ValidateSecurityRequest,
    chainId: Hex,
  ) => Promise<void>;
};

/**
 * Type definition for the request parameter of processSendCalls function.
 */
export type ProcessSendCallsRequest = JsonRpcRequest & {
  networkClientId: string;
  origin?: string;
};

/**
 * Type definition for the hooks parameter of getCapabilities function.
 */
export type GetCapabilitiesHooks = {
  getDismissSmartAccountSuggestionEnabled: () => boolean;
  getIsSmartTransaction: (chainId: Hex) => boolean;
  isAtomicBatchSupported: TransactionController['isAtomicBatchSupported'];
  isRelaySupported: (chainId: Hex) => Promise<boolean>;
  getSendBundleSupportedChains: (
    chainIds: Hex[],
  ) => Promise<Record<string, boolean>>;
};

/**
 * Type definition for the parameters of getCallsStatus function.
 */
export type GetCallsStatusParams = {
  messenger: EIP5792Messenger;
  id: Hex;
};

const VERSION = '2.0.0';

/**
 * Processes a sendCalls request for EIP-5792 atomic transactions.
 *
 * @param hooks - Object containing required controller hooks and utilities.
 * @param hooks.addTransactionBatch - Function to add a batch of transactions atomically.
 * @param hooks.addTransaction - Function to add a single transaction.
 * @param hooks.getDismissSmartAccountSuggestionEnabled - Function to check if smart account suggestions are disabled.
 * @param hooks.isAtomicBatchSupported - Function to check if atomic batching is supported for given parameters.
 * @param hooks.validateSecurity - Function to validate security for transaction requests.
 * @param messenger - Messenger instance for controller communication.
 * @param params - The sendCalls parameters containing transaction calls and metadata.
 * @param req - The original JSON-RPC request.
 * @returns Promise resolving to a SendCallsResult containing the batch ID.
 */
export async function processSendCalls(
  hooks: ProcessSendCallsHooks,
  messenger: EIP5792Messenger,
  params: SendCalls,
  req: ProcessSendCallsRequest,
): Promise<SendCallsResult> {
  const {
    addTransactionBatch,
    addTransaction,
    getDismissSmartAccountSuggestionEnabled,
    isAtomicBatchSupported,
    validateSecurity: validateSecurityHook,
  } = hooks;

  const { calls, from: paramFrom } = params;
  const { networkClientId, origin } = req;
  const transactions = calls.map((call) => ({ params: call }));

  const { chainId } = messenger.call(
    'NetworkController:getNetworkClientById',
    networkClientId,
  ).configuration;

  const from =
    paramFrom ??
    (messenger.call('AccountsController:getSelectedAccount').address as Hex);

  const securityAlertId = uuid();
  const validateSecurity = validateSecurityHook.bind(null, securityAlertId);

  let batchId: Hex;
  if (Object.keys(transactions).length === 1) {
    batchId = await processSingleTransaction({
      addTransaction,
      chainId,
      from,
      networkClientId,
      origin,
      securityAlertId,
      sendCalls: params,
      transactions,
      validateSecurity,
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
      sendCalls: params,
      securityAlertId,
      transactions,
      validateSecurity,
    });
  }

  return { id: batchId };
}

/**
 * Retrieves the status of a transaction batch by its ID.
 *
 * @param messenger - Messenger instance for controller communication.
 * @param id - The batch ID to look up (hexadecimal string).
 * @returns GetCallsStatusResult containing the batch status, receipts, and metadata.
 * @throws JsonRpcError with EIP5792ErrorCode.UnknownBundleId if no matching bundle is found.
 */
export function getCallsStatus(
  messenger: EIP5792Messenger,
  id: Hex,
): GetCallsStatusResult {
  const transactions = messenger
    .call('TransactionController:getState')
    .transactions.filter((tx) => tx.batchId === id);

  if (!transactions?.length) {
    throw new JsonRpcError(
      EIP5792ErrorCode.UnknownBundleId,
      `No matching bundle found`,
    );
  }

  const transaction = transactions[0];
  const { chainId, txReceipt: rawTxReceipt } = transaction;
  const status = getStatusCode(transaction);
  const txReceipt = rawTxReceipt as Required<TransactionReceipt> | undefined;
  const logs = (txReceipt?.logs ?? []) as Required<Log>[];

  const receipts: GetCallsStatusResult['receipts'] = txReceipt && [
    {
      blockHash: txReceipt.blockHash as Hex,
      blockNumber: txReceipt.blockNumber as Hex,
      gasUsed: txReceipt.gasUsed as Hex,
      logs: logs.map((log: Required<Log> & { data: Hex }) => ({
        address: log.address as Hex,
        data: log.data,
        topics: log.topics as unknown as Hex[],
      })),
      status: txReceipt.status as '0x0' | '0x1',
      transactionHash: txReceipt.transactionHash,
    },
  ];

  return {
    version: VERSION,
    id,
    chainId,
    atomic: true, // Always atomic as we currently only support EIP-7702 batches
    status,
    receipts,
  };
}

/**
 * Retrieves the capabilities for atomic transactions on specified chains.
 *
 * @param hooks - Object containing required controller hooks and utilities.
 * @param hooks.getDismissSmartAccountSuggestionEnabled - Function to check if smart account suggestions are disabled.
 * @param hooks.getIsSmartTransaction - Function to check if a chain supports smart transactions.
 * @param hooks.isAtomicBatchSupported - Function to check if atomic batching is supported.
 * @param hooks.isRelaySupported - Function to check if relay is supported on a chain.
 * @param hooks.getSendBundleSupportedChains - Function to get chains that support send bundle.
 * @param messenger - Messenger instance for controller communication.
 * @param address - The account address to check capabilities for.
 * @param chainIds - Array of chain IDs to check capabilities for (if undefined, checks all configured networks).
 * @returns Promise resolving to GetCapabilitiesResult mapping chain IDs to their capabilities.
 */
export async function getCapabilities(
  hooks: GetCapabilitiesHooks,
  messenger: EIP5792Messenger,
  address: Hex,
  chainIds: Hex[] | undefined,
) {
  const {
    getDismissSmartAccountSuggestionEnabled,
    getIsSmartTransaction,
    isAtomicBatchSupported,
    isRelaySupported,
    getSendBundleSupportedChains,
  } = hooks;

  let chainIdsNormalized = chainIds?.map(
    (chainId) => chainId.toLowerCase() as Hex,
  );

  if (!chainIdsNormalized?.length) {
    const networkConfigurations = messenger.call(
      'NetworkController:getState',
    ).networkConfigurationsByChainId;
    chainIdsNormalized = Object.keys(networkConfigurations) as Hex[];
  }

  const batchSupport = await isAtomicBatchSupported({
    address,
    chainIds: chainIdsNormalized,
  });

  const alternateGasFeesAcc = await getAlternateGasFeesCapability(
    chainIdsNormalized,
    batchSupport,
    getIsSmartTransaction,
    isRelaySupported,
    getSendBundleSupportedChains,
    messenger,
  );

  return chainIdsNormalized.reduce<GetCapabilitiesResult>((acc, chainId) => {
    const chainBatchSupport = (batchSupport.find(
      ({ chainId: batchChainId }) => batchChainId === chainId,
    ) ?? {}) as IsAtomicBatchSupportedResultEntry & {
      isRelaySupported: boolean;
    };

    const { delegationAddress, isSupported, upgradeContractAddress } =
      chainBatchSupport;

    const isUpgradeDisabled = getDismissSmartAccountSuggestionEnabled();
    let isSupportedAccount = false;

    try {
      const keyringType = getAccountKeyringType(address, messenger);
      isSupportedAccount = KEYRING_TYPES_SUPPORTING_7702.includes(keyringType);
    } catch (error) {
      // Intentionally empty
    }

    const canUpgrade =
      !isUpgradeDisabled &&
      upgradeContractAddress &&
      !delegationAddress &&
      isSupportedAccount;

    if (!isSupported && !canUpgrade) {
      return acc;
    }

    const status = isSupported
      ? AtomicCapabilityStatus.Supported
      : AtomicCapabilityStatus.Ready;

    if (acc[chainId as Hex] === undefined) {
      acc[chainId as Hex] = {};
    }

    acc[chainId as Hex].atomic = {
      status,
    };

    return acc;
  }, alternateGasFeesAcc);
}

/**
 * Processes a single transaction from a sendCalls request.
 *
 * @param params - Object containing all parameters needed for single transaction processing.
 * @param params.addTransaction - Function to add a single transaction.
 * @param params.chainId - The chain ID for the transaction.
 * @param params.from - The sender address.
 * @param params.networkClientId - The network client ID.
 * @param params.origin - The origin of the request (optional).
 * @param params.securityAlertId - The security alert ID for this transaction.
 * @param params.sendCalls - The original sendCalls request.
 * @param params.transactions - Array containing the single transaction.
 * @param params.validateSecurity - Function to validate security for the transaction.
 * @returns Promise resolving to the generated batch ID for the transaction.
 */
async function processSingleTransaction({
  addTransaction,
  chainId,
  from,
  networkClientId,
  origin,
  securityAlertId,
  sendCalls,
  transactions,
  validateSecurity,
}: {
  addTransaction: TransactionController['addTransaction'];
  chainId: Hex;
  from: Hex;
  networkClientId: string;
  origin?: string;
  securityAlertId: string;
  sendCalls: SendCalls;
  transactions: { params: BatchTransactionParams }[];
  validateSecurity: (
    securityRequest: ValidateSecurityRequest,
    chainId: Hex,
  ) => void;
}) {
  validateSingleSendCall(sendCalls, chainId);

  const txParams = {
    from,
    ...transactions[0].params,
    type: TransactionEnvelopeType.feeMarket,
  };

  const securityRequest: ValidateSecurityRequest = {
    method: MESSAGE_TYPE.ETH_SEND_TRANSACTION,
    params: [txParams],
    origin,
  };
  validateSecurity(securityRequest, chainId);

  const batchId = generateBatchId();

  await addTransaction(txParams, {
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
 * @param params.sendCalls - The original sendCalls request.
 * @param params.securityAlertId - The security alert ID for this batch.
 * @param params.transactions - Array of transactions to process.
 * @param params.validateSecurity - Function to validate security for the transactions.
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
  sendCalls,
  securityAlertId,
  transactions,
  validateSecurity,
}: {
  addTransactionBatch: TransactionController['addTransactionBatch'];
  isAtomicBatchSupported: TransactionController['isAtomicBatchSupported'];
  chainId: Hex;
  from: Hex;
  getDismissSmartAccountSuggestionEnabled: () => boolean;
  messenger: EIP5792Messenger;
  networkClientId: string;
  origin?: string;
  sendCalls: SendCalls;
  securityAlertId: string;
  transactions: { params: BatchTransactionParams }[];
  validateSecurity: (
    securityRequest: ValidateSecurityRequest,
    chainId: Hex,
  ) => Promise<void>;
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
  );

  const result = await addTransactionBatch({
    from,
    networkClientId,
    origin,
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
 */
function validateSingleSendCall(sendCalls: SendCalls, dappChainId: Hex) {
  validateSendCallsVersion(sendCalls);
  validateCapabilities(sendCalls);
  validateDappChainId(sendCalls, dappChainId);
}

/**
 * Validates a sendCalls request for multiple transactions.
 *
 * @param sendCalls - The sendCalls request to validate.
 * @param dappChainId - The chain ID that the dApp is connected to.
 * @param dismissSmartAccountSuggestionEnabled - Whether smart account suggestions are disabled.
 * @param chainBatchSupport - Information about atomic batch support for the chain.
 * @param keyringType - The type of keyring associated with the account.
 */
function validateSendCalls(
  sendCalls: SendCalls,
  dappChainId: Hex,
  dismissSmartAccountSuggestionEnabled: boolean,
  chainBatchSupport: IsAtomicBatchSupportedResultEntry | undefined,
  keyringType: KeyringTypes,
) {
  validateSendCallsVersion(sendCalls);
  validateSendCallsChainId(sendCalls, dappChainId, chainBatchSupport);
  validateCapabilities(sendCalls);
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
function validateSendCallsVersion(sendCalls: SendCalls) {
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
function validateDappChainId(sendCalls: SendCalls, dappChainId: Hex) {
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
  sendCalls: SendCalls,
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
 * @throws JsonRpcError if unsupported non-optional capabilities are requested.
 */
function validateCapabilities(sendCalls: SendCalls) {
  const { calls, capabilities } = sendCalls;

  const requiredTopLevelCapabilities = Object.keys(capabilities ?? {}).filter(
    (name) => capabilities?.[name].optional !== true,
  );

  const requiredCallCapabilities = calls.flatMap((call) =>
    Object.keys(call.capabilities ?? {}).filter(
      (name) => call.capabilities?.[name].optional !== true,
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
 * Determines alternate gas fees capability for the specified chains.
 *
 * @param chainIds - Array of chain IDs to check for alternate gas fees support.
 * @param batchSupport - Information about atomic batch support for each chain.
 * @param getIsSmartTransaction - Function to check if a chain supports smart transactions.
 * @param isRelaySupported - Function to check if relay is supported on a chain.
 * @param getSendBundleSupportedChains - Function to get chains that support send bundle.
 * @param messenger - Messenger instance for controller communication.
 * @returns Promise resolving to GetCapabilitiesResult with alternate gas fees information.
 */
async function getAlternateGasFeesCapability(
  chainIds: Hex[],
  batchSupport: IsAtomicBatchSupportedResult,
  getIsSmartTransaction: (chainId: Hex) => boolean,
  isRelaySupported: (chainId: Hex) => Promise<boolean>,
  getSendBundleSupportedChains: (
    chainIds: Hex[],
  ) => Promise<Record<string, boolean>>,
  messenger: EIP5792Messenger,
) {
  const simulationEnabled = messenger.call(
    'PreferencesController:getState',
  ).useTransactionSimulations;

  const relaySupportedChains = await Promise.all(
    batchSupport
      .map(({ chainId }) => chainId)
      .map((chainId) => isRelaySupported(chainId)),
  );

  const sendBundleSupportedChains =
    await getSendBundleSupportedChains(chainIds);

  const updatedBatchSupport = batchSupport.map((support, index) => ({
    ...support,
    relaySupportedForChain: relaySupportedChains[index],
  }));

  return chainIds.reduce<GetCapabilitiesResult>((acc, chainId) => {
    const chainBatchSupport = (updatedBatchSupport.find(
      ({ chainId: batchChainId }) => batchChainId === chainId,
    ) ?? {}) as IsAtomicBatchSupportedResultEntry & {
      relaySupportedForChain: boolean;
    };

    const { isSupported = false, relaySupportedForChain } = chainBatchSupport;

    const isSmartTransaction = getIsSmartTransaction(chainId);
    const isSendBundleSupported = sendBundleSupportedChains[chainId] ?? false;

    const alternateGasFees =
      simulationEnabled &&
      ((isSmartTransaction && isSendBundleSupported) ||
        (isSupported && relaySupportedForChain));

    if (alternateGasFees) {
      acc[chainId as Hex] = {
        alternateGasFees: {
          supported: true,
        },
      };
    }

    return acc;
  }, {});
}

/**
 * Maps transaction status to EIP-5792 call status codes.
 *
 * @param transactionMeta - The transaction metadata containing status and hash information.
 * @returns GetCallsStatusCode representing the current status of the transaction.
 */
function getStatusCode(transactionMeta: TransactionMeta) {
  const { hash, status } = transactionMeta;

  if (status === TransactionStatus.confirmed) {
    return GetCallsStatusCode.CONFIRMED;
  }

  if (status === TransactionStatus.failed) {
    return hash
      ? GetCallsStatusCode.REVERTED
      : GetCallsStatusCode.FAILED_OFFCHAIN;
  }

  if (status === TransactionStatus.dropped) {
    return GetCallsStatusCode.REVERTED;
  }

  return GetCallsStatusCode.PENDING;
}

/**
 * Retrieves the keyring type for a given account address.
 *
 * @param accountAddress - The account address to look up.
 * @param messenger - Messenger instance for controller communication.
 * @returns The keyring type associated with the account.
 * @throws JsonRpcError if the account type is unknown or not found.
 */
function getAccountKeyringType(
  accountAddress: Hex,
  messenger: EIP5792Messenger,
): KeyringTypes {
  const { accounts } = messenger.call(
    'AccountsController:getState',
  ).internalAccounts;

  const account = Object.values(accounts).find(
    (acc) => acc.address.toLowerCase() === accountAddress.toLowerCase(),
  );

  const keyringType = account?.metadata?.keyring?.type;

  if (!keyringType) {
    throw new JsonRpcError(
      EIP5792ErrorCode.RejectedUpgrade,
      'EIP-7702 upgrade not supported as account type is unknown',
    );
  }

  return keyringType as KeyringTypes;
}
