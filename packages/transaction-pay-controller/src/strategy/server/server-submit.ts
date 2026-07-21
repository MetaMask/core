import {
  ORIGIN_METAMASK,
  successfulFetch,
  toHex,
} from '@metamask/controller-utils';
import { SignTypedDataVersion } from '@metamask/keyring-controller';
import type {
  TransactionMeta,
  TransactionParams,
  TransactionType,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import {
  getServerPollingInterval,
  getServerPollingTimeout,
} from '../../utils/feature-flags';
import { getNetworkClientId } from '../../utils/provider';
import {
  getLiveTokenBalance,
  normalizeTokenAddress,
  TokenAddressTarget,
} from '../../utils/token';
import {
  collectTransactionIds,
  getTransaction,
  updateTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction';
import { RELAY_DEPOSIT_TYPES } from '../relay/constants';
import { getServerStatus, submitServerIntent } from './server-api';
import type {
  ServerQuote,
  ServerSignatureStep,
  ServerTransactionStep,
  ServerStatusResponse,
  ServerSubmitRequest,
} from './types';
import { ServerStatus } from './types';

const log = createModuleLogger(projectLogger, 'server-strategy');

const DOMAIN_FIELD_MAP: Record<string, { name: string; type: string }> = {
  name: { name: 'name', type: 'string' },
  version: { name: 'version', type: 'string' },
  chainId: { name: 'chainId', type: 'uint256' },
  verifyingContract: { name: 'verifyingContract', type: 'address' },
  salt: { name: 'salt', type: 'bytes32' },
};

function isSignatureStep(
  step: ServerQuote['steps'][number],
): step is ServerSignatureStep {
  return step.type === 'signature';
}

function isTransactionStep(
  step: ServerQuote['steps'][number],
): step is ServerTransactionStep {
  return step.type === 'transaction';
}

/**
 * Submits server intent quotes.
 *
 * @param request - Request object.
 * @returns An object containing the transaction hash if available.
 */
export async function submitServerQuotes(
  request: PayStrategyExecuteRequest<ServerQuote>,
): Promise<{ transactionHash?: Hex }> {
  log('Executing server quotes', request);

  const { quotes, messenger, transaction } = request;

  let transactionHash: Hex | undefined;

  for (const quote of quotes) {
    ({ transactionHash } = await executeSingleServerQuote(
      quote,
      messenger,
      transaction,
    ));
  }

  return { transactionHash };
}

async function executeSingleServerQuote(
  quote: TransactionPayQuote<ServerQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<{ transactionHash?: Hex }> {
  log('Executing single server quote', quote);

  updateTransaction(
    {
      transactionId: transaction.id,
      messenger,
      note: 'Remove nonce from skipped transaction',
    },
    (tx) => {
      tx.txParams.nonce = undefined;
    },
  );

  // Phase 1: off-chain signature steps (e.g. Relay authorize, HyperLiquid deposit).
  // Use quote.request.from (resolved accountOverride) not transaction.txParams.from.
  const signatureSteps = quote.original.steps.filter(isSignatureStep);

  for (const step of signatureSteps) {
    await submitSignatureStep(step, quote.request.from, messenger);
  }

  // Phase 2: on-chain transaction steps (if any).
  await submitTransactionSteps(quote, messenger, transaction);

  // Phase 3: poll until the intent is confirmed on the target chain.
  const targetHash = await waitForServerCompletion(
    quote.original,
    messenger,
    transaction.id,
  );

  log('Server request completed', targetHash);

  updateTransaction(
    {
      transactionId: transaction.id,
      messenger,
      note: 'Intent complete after Server completion',
    },
    (tx) => {
      tx.isIntentComplete = true;
    },
  );

  return { transactionHash: targetHash };
}

/**
 * Submit the on-chain transaction steps for a server quote.
 *
 * Validates the source balance, builds the complete set of params (including
 * any post-quote or payment-override prepends), then dispatches to the
 * gasless execute path or TransactionController depending on the quote.
 *
 * No-ops when the quote has no transaction steps (signature-only flows).
 *
 * @param quote - Server quote.
 * @param messenger - Controller messenger.
 * @param transaction - Original transaction meta.
 */
async function submitTransactionSteps(
  quote: TransactionPayQuote<ServerQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<void> {
  const transactionSteps = quote.original.steps.filter(isTransactionStep);

  if (transactionSteps.length === 0) {
    // Signature-only quotes (all steps are signature steps, no transaction
    // steps) have nothing to submit on-chain even when gasless is false.
    const hasSignatureSteps = quote.original.steps.some(isSignatureStep);
    if (!quote.original.gasless && !hasSignatureSteps) {
      throw new Error('Server quote has no steps to submit');
    }
    return;
  }

  const { isHyperliquidSource, isPostQuote, paymentOverride } = quote.request;

  // Skip balance check for HyperLiquid source flows (no on-chain debit),
  // post-quote flows (funds come from the Safe after the original tx executes),
  // and payment-override flows (funds are supplied by the override account).
  if (!isHyperliquidSource && !isPostQuote && !paymentOverride) {
    await validateSourceBalance(quote, messenger);
  }

  const allParams = await buildTransactionParams(
    quote,
    transactionSteps,
    transaction,
    messenger,
  );

  if (quote.original.gasless) {
    await submitViaServerExecute(quote, allParams, messenger, transaction);
  } else {
    await submitViaTransactionController(
      quote,
      allParams,
      messenger,
      transaction,
    );
  }
}

/**
 * Build the complete flat array of TransactionParams for on-chain submission.
 *
 * Converts server transaction steps to params, then prepends any additional
 * calls required by the payment override or post-quote flow. The returned
 * array is ready to pass directly to submitViaServerExecute or
 * submitViaTransactionController.
 *
 * @param quote - Server quote.
 * @param transactionSteps - Transaction steps from the quote (pre-filtered).
 * @param transaction - Original transaction meta.
 * @param messenger - Controller messenger.
 * @returns Complete ordered array of TransactionParams for submission.
 */
async function buildTransactionParams(
  quote: TransactionPayQuote<ServerQuote>,
  transactionSteps: ServerTransactionStep[],
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionParams[]> {
  const { from, isPostQuote, paymentOverride } = quote.request;
  const { gasLimits, maxFeePerGas, maxPriorityFeePerGas } =
    quote.original.client;
  const originalType = getEffectiveTransactionType(transaction);

  const relayParams = transactionSteps.map((step, i) =>
    transactionStepToParams(
      step,
      i,
      transactionSteps.length,
      from,
      gasLimits,
      maxFeePerGas,
      maxPriorityFeePerGas,
      originalType,
    ),
  );

  if (paymentOverride) {
    return prependPaymentOverrideParams(
      relayParams,
      quote,
      transaction,
      messenger,
    );
  }

  if (isPostQuote && transaction.txParams.to) {
    return prependPostQuoteParams(relayParams, quote, transaction, messenger);
  }

  return relayParams;
}

/**
 * Converts a single server transaction step to TransactionParams.
 *
 * @param step - The transaction step.
 * @param index - Zero-based position within the transaction steps array.
 * @param totalSteps - Total number of transaction steps (for type mapping).
 * @param from - Sender address.
 * @param gasLimits - Per-step gas limits from client-side estimation.
 * @param clientMaxFeePerGas - Client-side max fee per gas fallback.
 * @param clientMaxPriorityFeePerGas - Client-side max priority fee per gas fallback.
 * @param originalType - Effective type of the parent transaction.
 * @returns Normalized TransactionParams for this step.
 */
function transactionStepToParams(
  step: ServerTransactionStep,
  index: number,
  totalSteps: number,
  from: Hex,
  gasLimits: number[],
  clientMaxFeePerGas: string | undefined,
  clientMaxPriorityFeePerGas: string | undefined,
  originalType: TransactionMeta['type'],
): TransactionParams {
  let gas: Hex | undefined;
  const gasLimit = gasLimits[index];

  if (gasLimit) {
    gas = toHex(gasLimit);
  } else if (step.gasLimit) {
    gas = toHex(step.gasLimit);
  }

  const resolvedMaxFeePerGas = step.maxFeePerGas ?? clientMaxFeePerGas;
  const resolvedMaxPriorityFeePerGas =
    step.maxPriorityFeePerGas ?? clientMaxPriorityFeePerGas;

  const params: TransactionParams = {
    data: step.data,
    from,
    gas,
    maxFeePerGas: resolvedMaxFeePerGas
      ? toHex(resolvedMaxFeePerGas)
      : undefined,
    maxPriorityFeePerGas: resolvedMaxPriorityFeePerGas
      ? toHex(resolvedMaxPriorityFeePerGas)
      : undefined,
    to: step.to,
    type: getTransactionType(index, totalSteps, originalType),
    value: toHex(step.value),
  };

  log('Built transaction params for step', {
    index,
    step: {
      gasLimit: step.gasLimit,
      maxFeePerGas: step.maxFeePerGas,
      maxPriorityFeePerGas: step.maxPriorityFeePerGas,
      value: step.value,
    },
    params: {
      gas: params.gas,
      maxFeePerGas: params.maxFeePerGas,
      maxPriorityFeePerGas: params.maxPriorityFeePerGas,
      type: params.type,
      value: params.value,
    },
  });

  return params;
}

/**
 * Determine the relay deposit transaction type for a step at the given index.
 *
 * Single-step quotes always use the deposit type. In multi-step quotes the
 * first step is an approval and subsequent steps are deposits — matching the
 * Relay strategy's convention.
 *
 * @param index - Zero-based index of the step within the transaction step array.
 * @param totalSteps - Total number of transaction steps.
 * @param originalType - Effective type of the parent transaction.
 * @returns The mapped TransactionType for this step.
 */
function getTransactionType(
  index: number,
  totalSteps: number,
  originalType: TransactionMeta['type'],
): TransactionType {
  const depositType = getRelayDepositType(originalType);

  if (totalSteps === 1) {
    return depositType;
  }

  return index === 0 ? ('tokenMethodApprove' as TransactionType) : depositType;
}

/**
 * Get the relay deposit transaction type based on the parent transaction type.
 *
 * @param originalType - Type of the parent transaction.
 * @returns The mapped relay deposit type, or `relayDeposit` as a fallback.
 */
function getRelayDepositType(
  originalType: TransactionMeta['type'],
): TransactionType {
  return (
    (originalType && RELAY_DEPOSIT_TYPES[originalType]) ??
    ('relayDeposit' as TransactionType)
  );
}

/**
 * Get the effective transaction type, resolving through batch-type parent
 * transactions to find the nested perps/predict type.
 *
 * @param transaction - The transaction metadata.
 * @returns The resolved type from nested transactions, or the top-level type.
 */
function getEffectiveTransactionType(
  transaction: TransactionMeta,
): TransactionMeta['type'] {
  if (transaction.type !== ('batch' as TransactionType)) {
    return transaction.type;
  }

  const nestedType = transaction.nestedTransactions?.find(
    (tx) => tx.type && RELAY_DEPOSIT_TYPES[tx.type] !== undefined,
  )?.type;

  return nestedType ?? transaction.type;
}

/**
 * Prepend payment override calls before the relay transaction steps.
 *
 * For money-account payment override flows the override account supplies
 * the source funds. The override transactions must be batched ahead of the
 * relay deposit steps.
 *
 * @param relayParams - Already-built relay step params.
 * @param quote - Server quote.
 * @param transaction - Original transaction meta.
 * @param messenger - Controller messenger.
 * @returns Combined params with override calls prepended.
 */
async function prependPaymentOverrideParams(
  relayParams: TransactionParams[],
  quote: TransactionPayQuote<ServerQuote>,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionParams[]> {
  const { transactionData } = messenger.call(
    'TransactionPayController:getState',
  );

  const { calls: overrideCalls } = await messenger.call(
    'TransactionPayController:getPaymentOverrideData',
    {
      amount: quote.sourceAmount.human,
      transaction,
      transactionData: transactionData[transaction.id],
    },
  );

  if (!overrideCalls.length) {
    log('No payment override calls to prepend');
    return relayParams;
  }

  log('Prepending payment override calls', { count: overrideCalls.length });

  return [...(overrideCalls as TransactionParams[]), ...relayParams];
}

/**
 * Prepend the original transaction (or a delegation-wrapped version) before
 * the relay deposit steps for post-quote flows.
 *
 * In post-quote flows the source tokens are held in the Safe and only become
 * available after the original transaction executes as part of the batch.
 * When an accountOverride is active the override account cannot directly
 * execute the original call, so it is wrapped in a delegation transaction.
 *
 * @param relayParams - Already-built relay step params.
 * @param quote - Server quote.
 * @param transaction - Original transaction meta.
 * @param messenger - Controller messenger.
 * @returns Combined params with the original tx prepended.
 */
async function prependPostQuoteParams(
  relayParams: TransactionParams[],
  quote: TransactionPayQuote<ServerQuote>,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionParams[]> {
  const hasAccountOverride =
    quote.request.from.toLowerCase() !==
    (transaction.txParams.from as Hex).toLowerCase();

  const { maxFeePerGas, maxPriorityFeePerGas } = quote.original.client;

  let prependedParams: TransactionParams;

  if (hasAccountOverride) {
    prependedParams = await buildDelegatedOriginalParams(
      transaction,
      messenger,
    );
  } else {
    prependedParams = {
      data: transaction.txParams.data as Hex | undefined,
      from: transaction.txParams.from,
      to: transaction.txParams.to,
      value: transaction.txParams.value as Hex | undefined,
    } as TransactionParams;
  }

  // Ensure the prepended tx carries the same fee caps as the relay steps so
  // it isn't submitted with undefined maxFeePerGas in a non-7702 batch.
  prependedParams.maxFeePerGas = maxFeePerGas ? toHex(maxFeePerGas) : undefined;
  prependedParams.maxPriorityFeePerGas = maxPriorityFeePerGas
    ? toHex(maxPriorityFeePerGas)
    : undefined;

  log('Prepending post-quote original tx', { hasAccountOverride });

  return [prependedParams, ...relayParams];
}

/**
 * Build TransactionParams for a delegation that redeems the original
 * post-quote transaction on behalf of the override account.
 *
 * @param transaction - Original transaction meta to be redeemed.
 * @param messenger - Controller messenger.
 * @returns Transaction params for the delegation tx.
 */
async function buildDelegatedOriginalParams(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): Promise<TransactionParams> {
  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction },
  );

  log('Delegation result for post-quote original tx', delegation);

  return {
    data: delegation.data,
    from: transaction.txParams.from as Hex,
    to: delegation.to,
    value: delegation.value,
  };
}

/**
 * Validate that the user's source token balance covers the quote's required
 * source amount before submitting on-chain.
 *
 * Reads the live balance via RPC rather than the cached state so it reflects
 * any concurrent spends. Throws fast with a clear error instead of letting
 * the on-chain transaction revert.
 *
 * @param quote - Server quote containing the required source amount.
 * @param messenger - Controller messenger.
 */
async function validateSourceBalance(
  quote: TransactionPayQuote<ServerQuote>,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const { from, sourceChainId, sourceTokenAddress } = quote.request;

  const normalizedSourceTokenAddress = normalizeTokenAddress(
    sourceTokenAddress,
    sourceChainId,
    TokenAddressTarget.MetaMask,
  );

  let currentBalance: string;

  try {
    currentBalance = await getLiveTokenBalance(
      messenger,
      from,
      sourceChainId,
      normalizedSourceTokenAddress,
    );
  } catch (error) {
    throw new Error(
      `Cannot validate payment token balance - ${(error as Error).message}`,
    );
  }

  const requiredAmount = new BigNumber(quote.sourceAmount.raw);
  const balance = new BigNumber(currentBalance);

  log('Validating source balance', {
    from,
    sourceChainId,
    sourceTokenAddress,
    currentBalance,
    requiredAmount: requiredAmount.toString(10),
  });

  if (balance.isLessThan(requiredAmount)) {
    throw new Error(
      `Insufficient source token balance for server deposit. ` +
        `Required: ${requiredAmount.toString(10)}, ` +
        `Available: ${balance.toString(10)}`,
    );
  }
}

async function submitViaServerExecute(
  quote: TransactionPayQuote<ServerQuote>,
  allParams: TransactionParams[],
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<void> {
  const { from, sourceChainId } = quote.request;
  const networkClientId = getNetworkClientId(messenger, sourceChainId);

  const nestedTransactions = allParams.map((params) => ({
    data: (params.data ?? '0x') as Hex,
    to: params.to as Hex,
    value: (params.value ?? '0x0') as Hex,
  }));

  const sourceCallTransaction = {
    ...transaction,
    chainId: sourceChainId,
    networkClientId,
    nestedTransactions,
    txParams: {
      ...transaction.txParams,
      from,
    },
  } as TransactionMeta;

  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction: sourceCallTransaction },
  );

  log('Delegation result for server source calls', delegation);

  const submitBody: ServerSubmitRequest = {
    provider: quote.original.provider,
    id: quote.original.id,
    chainId: Number(sourceChainId),
    to: delegation.to,
    data: delegation.data,
    value: new BigNumber(delegation.value).toFixed(),
    ...(delegation.authorizationList?.length
      ? {
          authorizationList: delegation.authorizationList.map((auth) => ({
            chainId: Number(auth.chainId),
            address: auth.address,
            nonce: Number(auth.nonce),
            yParity: Number(auth.yParity),
            r: auth.r as Hex,
            s: auth.s as Hex,
          })),
        }
      : {}),
  };

  const submitResponse = await submitServerIntent(messenger, submitBody);

  if (!submitResponse.success) {
    throw new Error(
      `Server submit failed: ${submitResponse.error ?? 'unknown'}`,
    );
  }
}

async function submitViaTransactionController(
  quote: TransactionPayQuote<ServerQuote>,
  allParams: TransactionParams[],
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<void> {
  const { from, sourceChainId, sourceTokenAddress } = quote.request;
  const { gasLimits, is7702 } = quote.original.client;

  const networkClientId = getNetworkClientId(messenger, sourceChainId);
  const gasFeeToken = quote.fees.isSourceGasFeeToken
    ? sourceTokenAddress
    : undefined;

  log('Submitting via TransactionController', {
    from,
    gasFeeToken,
    is7702,
    networkClientId,
    paramCount: allParams.length,
    sourceChainId,
  });

  const transactionIds: string[] = [];
  const { end } = collectTransactionIds(
    sourceChainId,
    from,
    messenger,
    (transactionId) => {
      transactionIds.push(transactionId);
      updateTransaction(
        {
          transactionId: transaction.id,
          messenger,
          note: 'Add required transaction ID from server submission',
        },
        (tx) => {
          tx.requiredTransactionIds ??= [];
          tx.requiredTransactionIds.push(transactionId);
        },
      );
    },
  );

  try {
    if (allParams.length === 1) {
      const addTransactionOptions = {
        gasFeeToken,
        isInternal: true,
        networkClientId,
        origin: ORIGIN_METAMASK,
        requireApproval: false,
      };

      log('Calling addTransaction', {
        params: allParams[0],
        options: addTransactionOptions,
      });

      await messenger.call(
        'TransactionController:addTransaction',
        allParams[0],
        addTransactionOptions,
      );
    } else {
      const gasLimit7702 = is7702 ? toHex(gasLimits[0]) : undefined;

      const batchTransactions = allParams.map((params) => {
        // params.gas was already resolved correctly by transactionStepToParams
        // (indexed by relay-step position), so use it directly. Indexing
        // allParams position into gasLimits would be wrong when payment-
        // override or post-quote params are prepended.
        const gas = (gasLimit7702 ?? params.gas) as Hex | undefined;

        return {
          params: {
            data: params.data as Hex,
            gas,
            maxFeePerGas: params.maxFeePerGas as Hex,
            maxPriorityFeePerGas: params.maxPriorityFeePerGas as Hex,
            to: params.to as Hex,
            value: params.value as Hex,
          },
          type: params.type as TransactionType | undefined,
        };
      });

      const addTransactionBatchOptions = {
        from,
        ...(gasLimit7702 === undefined
          ? { disable7702: true }
          : {
              disable7702: false,
              disableHook: true,
              disableSequential: true,
              gasLimit7702,
            }),
        gasFeeToken,
        isInternal: true,
        networkClientId,
        origin: ORIGIN_METAMASK,
        overwriteUpgrade: true,
        requireApproval: false,
        transactions: batchTransactions,
      };

      log('Calling addTransactionBatch', addTransactionBatchOptions);

      await messenger.call(
        'TransactionController:addTransactionBatch',
        addTransactionBatchOptions,
      );
    }
  } finally {
    end();
  }

  log('Server transactions added', transactionIds);

  await Promise.all(
    transactionIds.map((txId) => waitForTransactionConfirmed(txId, messenger)),
  );

  log('Server transactions confirmed', transactionIds);

  const lastId = transactionIds.at(-1);
  const sourceHash = lastId
    ? getTransaction(lastId, messenger)?.hash
    : undefined;

  if (sourceHash) {
    updateTransaction(
      {
        transactionId: transaction.id,
        messenger,
        note: 'Add source hash from server transaction submission',
      },
      (tx) => {
        tx.metamaskPay ??= {};
        tx.metamaskPay.sourceHash = sourceHash as Hex;
      },
    );
  }
}

async function submitSignatureStep(
  step: ServerSignatureStep,
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const { sign, post } = step;

  const typedData = {
    domain: sign.domain,
    types: {
      ...sign.types,
      EIP712Domain: deriveEIP712DomainType(sign.domain),
    },
    primaryType: sign.primaryType,
    message: sign.value,
  };

  log('Signing typed data for signature step', {
    primaryType: sign.primaryType,
  });

  const signature = await messenger.call(
    'KeyringController:signTypedMessage',
    { from, data: JSON.stringify(typedData) },
    SignTypedDataVersion.V4,
  );

  await postSignatureStepResult(
    post.endpoint,
    post.method,
    post.body,
    signature,
    post.signatureFormat,
  );
}

async function postSignatureStepResult(
  endpoint: string,
  method: string,
  body: Record<string, unknown>,
  signature: string,
  signatureFormat: 'queryParam' | 'rsv',
): Promise<void> {
  let url = endpoint;
  let postBody: Record<string, unknown>;

  if (signatureFormat === 'queryParam') {
    url = `${endpoint}?signature=${signature}`;
    postBody = body;
  } else {
    // eslint-disable-next-line id-length
    const r = signature.slice(0, 66);
    // eslint-disable-next-line id-length
    const s = `0x${signature.slice(66, 130)}`;
    // eslint-disable-next-line id-length
    const v = parseInt(signature.slice(130, 132), 16);
    postBody = { ...body, signature: { r, s, v } };
  }

  log('Posting signature step result', { url, signatureFormat });

  let result: unknown;

  try {
    const response = await successfulFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postBody),
    });

    result = await response.json();
  } catch (error) {
    throw new Error(`Signature step POST failed: ${(error as Error).message}`);
  }

  log('Signature step POST response', result);

  // For rsv-format steps (HyperLiquid exchange endpoint) the response body
  // carries an explicit status field. Validate it here so a failed deposit
  // throws immediately rather than silently proceeding to the polling phase.
  if (signatureFormat === 'rsv') {
    const status = (result as { status?: string })?.status;

    if (status !== 'ok') {
      throw new Error(
        `Signature step rejected by server: ${JSON.stringify(result)}`,
      );
    }
  }
}

function deriveEIP712DomainType(
  domain: Record<string, unknown>,
): { name: string; type: string }[] {
  return Object.keys(DOMAIN_FIELD_MAP)
    .filter((key) => Object.prototype.hasOwnProperty.call(domain, key))
    .map((key) => DOMAIN_FIELD_MAP[key]);
}

async function waitForServerCompletion(
  quote: ServerQuote,
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
): Promise<Hex | undefined> {
  const pollingInterval = getServerPollingInterval(messenger);
  const pollingTimeout = getServerPollingTimeout(messenger);
  const hasTimeout = pollingTimeout !== undefined && pollingTimeout > 0;

  log('Server polling config', { pollingInterval, pollingTimeout });

  const startTime = Date.now();

  let lastStatus: string | undefined;
  let sourceHashEmitted = false;

  while (true) {
    let statusResponse: ServerStatusResponse | undefined;

    try {
      const tx = getTransaction(transactionId, messenger);

      statusResponse = await getServerStatus(messenger, {
        provider: quote.provider,
        id: quote.id,
        hash: tx?.metamaskPay?.sourceHash ?? tx?.hash,
      });
    } catch (error) {
      log('Polling network error', error);
    }

    if (statusResponse) {
      lastStatus = statusResponse.status;
      log('Polled status', statusResponse.status, statusResponse);

      if (!sourceHashEmitted && statusResponse.sourceHash) {
        sourceHashEmitted = true;
        const { sourceHash } = statusResponse;

        updateTransaction(
          {
            transactionId,
            messenger,
            note: 'Add source hash from server status',
          },
          (tx) => {
            tx.metamaskPay ??= {};
            tx.metamaskPay.sourceHash = sourceHash;
          },
        );
      }

      if (statusResponse.status === ServerStatus.Confirmed) {
        return statusResponse.targetHash ?? '0x';
      }

      if (
        statusResponse.status === ServerStatus.Failed ||
        statusResponse.status === ServerStatus.Refunded
      ) {
        throw new Error(`Server intent ${statusResponse.status.toLowerCase()}`);
      }
    }

    if (hasTimeout && Date.now() - startTime >= pollingTimeout) {
      const statusDetail = lastStatus ? ` (last status: ${lastStatus})` : '';
      throw new Error(`Server polling timed out${statusDetail}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollingInterval));
  }
}
