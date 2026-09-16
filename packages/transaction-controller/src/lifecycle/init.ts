import type { NetworkClientId } from '@metamask/network-controller';
import { JsonRpcError } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';
import { v1 as random } from 'uuid';
import type {
  DappSuggestedGasFees,
  TransactionMeta,
  TransactionParams,
} from '../types.js';
import { TransactionStatus } from '../types.js';
import { getDelegationAddress } from '../utils/eip7702.js';
import { getChainId } from '../utils/provider.js';
import { determineTransactionType } from '../utils/transaction-type.js';
import { normalizeTransactionParams, setEnvelopeType } from '../utils/utils.js';
import {
  ErrorCode,
  validateTransactionOrigin,
  validateTxParams,
} from '../utils/validation.js';
import type { TransactionLifecycleState } from './state.js';
import type {
  AddTransactionInput,
  TransactionConstructorOptions,
  TransactionStageDependencies,
} from './types.js';

/** The dependencies and context required to initialise a transaction. */
export type InitTransactionRequest = {
  addTransactionRequest: AddTransactionInput;
  constructorOptions: Pick<
    TransactionConstructorOptions,
    'getPermittedAccounts'
  >;
  dependencies: Pick<
    TransactionStageDependencies,
    'getState' | 'hasNetworkClient' | 'messenger'
  >;
};

/** The result of initialising a transaction. */
export type InitTransactionResult = {
  lifecycle: TransactionLifecycleState;
  /**
   * The in-flight delegation address request, consumed by the background
   * stage.
   */
  delegationAddressPromise: Promise<Hex | undefined>;

  /** The new unapproved transaction, not yet persisted to state. */
  transactionMeta: TransactionMeta;
};

/**
 * Validate a new transaction request and build its initial metadata.
 *
 * Resolves the chain, validates the origin and parameters, determines the
 * transaction type, and assembles the unapproved `TransactionMeta`. The
 * resulting transaction is not yet in state - `addMetadata` persists it once
 * the data stage has populated gas and swaps information.
 *
 * Also starts resolving the delegation address so the request is in flight
 * while the remaining validation runs. The background stage consumes it.
 *
 * @param request - Dependencies and context for the new transaction.
 * @returns The initial transaction metadata, and the in-flight delegation
 * address request.
 */
export async function initTransaction<Request extends InitTransactionRequest>(
  request: Request,
): Promise<Request & InitTransactionResult> {
  const {
    addTransactionRequest: { options, txParams: originalTxParams },
    constructorOptions: { getPermittedAccounts },
    dependencies: { getState, hasNetworkClient, messenger },
  } = request;

  const {
    actionId,
    assetsFiatValues,
    batchId,
    deviceConfirmedOn,
    disableGasBuffer,
    gasFeeToken,
    excludeNativeTokenForFee,
    isGasFeeIncluded,
    isGasFeeSponsored,
    isInternal = false,
    isStateOnly,
    nestedTransactions,
    networkClientId,
    origin,
    requestId,
    requiredAssets,
    securityAlertResponse,
    type,
  } = options;

  const txParams = normalizeTransactionParams(originalTxParams);

  if (!hasNetworkClient(networkClientId)) {
    throw new Error(`Network client not found - ${networkClientId}`);
  }

  const chainId = getChainId({ messenger, networkClientId });

  const permittedAddresses =
    origin === undefined ? undefined : await getPermittedAccounts?.(origin);

  const accountsState = messenger.call('AccountsController:getState');
  const internalAccounts = Object.values(
    accountsState.internalAccounts?.accounts ?? {},
  )
    .filter((account) => account.type === 'eip155:eoa')
    .map((account) => account.address as Hex);

  await validateTransactionOrigin({
    data: txParams.data,
    from: txParams.from,
    internalAccounts,
    isInternal,
    origin,
    permittedAddresses,
    txParams,
    type,
  });

  const delegationAddressPromise = getDelegationAddress(
    txParams.from as Hex,
    messenger,
    networkClientId,
  ).catch(() => undefined);

  const isEIP1559Compatible = await getEIP1559Compatibility(
    request.dependencies,
    networkClientId,
  );

  validateTxParams(txParams, isEIP1559Compatible, chainId);

  if (!txParams.type) {
    // Determine transaction type based on transaction parameters and network compatibility
    setEnvelopeType(txParams, isEIP1559Compatible);
  }

  const isDuplicateBatchId =
    batchId?.length &&
    getState().transactions.some(
      (tx) => tx.batchId?.toLowerCase() === batchId?.toLowerCase(),
    );

  if (isDuplicateBatchId && !isInternal) {
    throw new JsonRpcError(
      ErrorCode.DuplicateBundleId,
      'Batch ID already exists',
    );
  }

  const dappSuggestedGasFees = generateDappSuggestedGasFees(
    txParams,
    origin,
    isInternal,
  );

  const transactionType =
    type ??
    (
      await determineTransactionType(txParams, {
        messenger,
        networkClientId,
      })
    ).type;

  /**
   * Original behavior was that this was set to 'true' whenever a gasFeeToken was passed.
   * 'excludeNativeTokenForFee' optionally overrides this behavior to prevent native token from
   * being used when another gasFeeToken is set.
   */
  const isGasFeeTokenIgnoredIfBalance =
    Boolean(gasFeeToken) && !excludeNativeTokenForFee;

  const transactionMeta: TransactionMeta = {
    actionId,
    assetsFiatValues,
    batchId,
    chainId,
    dappSuggestedGasFees,
    deviceConfirmedOn,
    disableGasBuffer,
    id: random(),
    isGasFeeTokenIgnoredIfBalance,
    isGasFeeIncluded,
    isGasFeeSponsored,
    ...(isGasFeeSponsored ? { isExternalSign: true } : {}),
    // To avoid the property to be set as undefined.
    ...(excludeNativeTokenForFee === undefined
      ? {}
      : { excludeNativeTokenForFee }),
    isFirstTimeInteraction: undefined,
    isInternal,
    isStateOnly,
    nestedTransactions,
    networkClientId,
    origin,
    requestId,
    requiredAssets,
    securityAlertResponse,
    selectedGasFeeToken: gasFeeToken,
    status: TransactionStatus.unapproved as const,
    time: Date.now(),
    txParams,
    type: transactionType,
    userEditedGasLimit: false,
    verifiedOnBlockchain: false,
  };

  return {
    ...request,
    delegationAddressPromise,
    lifecycle: {},
    transactionMeta,
  };
}

export async function getEIP1559Compatibility(
  dependencies: Pick<TransactionStageDependencies, 'messenger'>,
  networkClientId?: NetworkClientId,
): Promise<boolean> {
  return (
    (await dependencies.messenger.call(
      'NetworkController:getEIP1559Compatibility',
      networkClientId,
    )) ?? false
  );
}

function generateDappSuggestedGasFees(
  txParams: TransactionParams,
  origin?: string,
  isInternal?: boolean,
): DappSuggestedGasFees | undefined {
  if (isInternal || !origin) {
    return undefined;
  }

  const { gasPrice, maxFeePerGas, maxPriorityFeePerGas, gas } = txParams;

  if (
    gasPrice === undefined &&
    maxFeePerGas === undefined &&
    maxPriorityFeePerGas === undefined &&
    gas === undefined
  ) {
    return undefined;
  }

  const dappSuggestedGasFees: DappSuggestedGasFees = {};

  if (gasPrice !== undefined) {
    dappSuggestedGasFees.gasPrice = gasPrice;
  } else if (maxFeePerGas !== undefined || maxPriorityFeePerGas !== undefined) {
    dappSuggestedGasFees.maxFeePerGas = maxFeePerGas;
    dappSuggestedGasFees.maxPriorityFeePerGas = maxPriorityFeePerGas;
  }

  if (gas !== undefined) {
    dappSuggestedGasFees.gas = gas;
  }

  return dappSuggestedGasFees;
}
