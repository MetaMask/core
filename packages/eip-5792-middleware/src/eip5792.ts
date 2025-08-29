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
import { KeyringTypes } from '@metamask/keyring-controller';
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

// TODO: [ffmcgee] extract this
const KEYRING_TYPES_SUPPORTING_7702 = [KeyringTypes.hd, KeyringTypes.simple];

// TODO: [ffmcgee] extract this
// Matthew Walsh --> To be moved to @metamask/rpc-errors in future.
enum EIP5792ErrorCode {
  UnsupportedNonOptionalCapability = 5700,
  UnsupportedChainId = 5710,
  UnknownBundleId = 5730,
  RejectedUpgrade = 5750,
}

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

const VERSION = '2.0.0';

/**
 * TODO: add docs
 *
 * @param hooks - a
 * @param hooks.addTransactionBatch - a
 * @param hooks.addTransaction - a
 * @param hooks.getDismissSmartAccountSuggestionEnabled - a
 * @param hooks.isAtomicBatchSupported - a
 * @param hooks.validateSecurity - a
 * @param messenger - a
 * @param params - a
 * @param req - a
 * @returns - a
 */
export async function processSendCalls(
  hooks: {
    addTransactionBatch: TransactionController['addTransactionBatch'];
    addTransaction: TransactionController['addTransaction'];
    getDismissSmartAccountSuggestionEnabled: () => boolean;
    isAtomicBatchSupported: TransactionController['isAtomicBatchSupported'];
    validateSecurity: (
      securityAlertId: string,
      request: ValidateSecurityRequest,
      chainId: Hex,
    ) => Promise<void>;
  },
  messenger: EIP5792Messenger,
  params: SendCalls,
  req: JsonRpcRequest & { networkClientId: string; origin?: string },
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
 * TODO: add docs
 *
 * @param messenger - docs
 * @param id - docs
 * @returns - docs
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
 * TODO: add docss
 *
 * @param hooks - docs
 * @param hooks.getDismissSmartAccountSuggestionEnabled - docs
 * @param hooks.getIsSmartTransaction - docs
 * @param hooks.isAtomicBatchSupported - docs
 * @param hooks.isRelaySupported - docs
 * @param hooks.getSendBundleSupportedChains - docs
 * @param messenger - docs
 * @param address - docs
 * @param chainIds - docs
 * @returns - docs
 */
export async function getCapabilities(
  hooks: {
    getDismissSmartAccountSuggestionEnabled: () => boolean;
    getIsSmartTransaction: (chainId: Hex) => boolean;
    isAtomicBatchSupported: TransactionController['isAtomicBatchSupported'];
    isRelaySupported: (chainId: Hex) => Promise<boolean>;
    getSendBundleSupportedChains: (
      chainIds: Hex[],
    ) => Promise<Record<string, boolean>>;
  },
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
 * TODO: add docs
 *
 * @param param0 - docs
 * @param param0.addTransaction - docs
 * @param param0.chainId  - docs
 * @param param0.from  - docs
 * @param param0.networkClientId  - docs
 * @param param0.origin  - docs
 * @param param0.securityAlertId  - docs
 * @param param0.sendCalls  - docs
 * @param param0.transactions  - docs
 * @param param0.validateSecurity  - docs
 * @returns - docs
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
    method: 'eth_sendTransaction', // TODO: [ffmcgee] constant
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
 *
 * @param param0 -
 * @param param0.addTransactionBatch -
 * @param param0.isAtomicBatchSupported -
 * @param param0.chainId -
 * @param param0.from -
 * @param param0.getDismissSmartAccountSuggestionEnabled -
 * @param param0.networkClientId -
 * @param param0.messenger -
 * @param param0.origin -
 * @param param0.sendCalls -
 * @param param0.securityAlertId -
 * @param param0.transactions -
 * @param param0.validateSecurity -
 * @returns -
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
 *
 * @param sendCalls -
 * @param dappChainId .
 */
function validateSingleSendCall(sendCalls: SendCalls, dappChainId: Hex) {
  validateSendCallsVersion(sendCalls);
  validateCapabilities(sendCalls);
  validateDappChainId(sendCalls, dappChainId);
}

/**
 *
 * @param sendCalls -
 * @param dappChainId -
 * @param dismissSmartAccountSuggestionEnabled -
 * @param chainBatchSupport -
 * @param keyringType -
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
 *
 * @param sendCalls -
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
 *
 * @param sendCalls -
 * @param dappChainId .
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
 *
 * @param sendCalls -
 * @param dappChainId -
 * @param chainBatchSupport -
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
 *
 * @param sendCalls -
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
 *
 * @param dismissSmartAccountSuggestionEnabled -a
 * @param chainBatchSupport -a
 * @param keyringType -a
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
 *
 * @param chainIds -
 * @param batchSupport -
 * @param getIsSmartTransaction -
 * @param isRelaySupported -
 * @param getSendBundleSupportedChains -
 * @param messenger -
 * @returns -
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
 *
 * @param transactionMeta a
 * @returns a
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
 *
 * @param accountAddress - d
 * @param messenger -d
 * @returns  -
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
