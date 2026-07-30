import { generateEIP7702BatchTransaction } from '@metamask/transaction-controller';
import type { TransactionParams } from '@metamask/transaction-controller';
import type {
  AuthorizationList,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger.js';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import { prefixError } from '../../utils/error-prefix.js';
import { getNetworkClientId } from '../../utils/provider.js';
import { FALLBACK_HASH } from './constants.js';
import { submitRelayExecute } from './relay-api.js';
import type { RelayExecuteRequest, RelayQuote } from './types.js';

const log = createModuleLogger(projectLogger, 'relay-strategy');
const RELAY_EXECUTE_ERROR_PREFIX = 'Execute: ';

export async function submitViaRelayExecute(
  quote: TransactionPayQuote<RelayQuote>,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  allParams: TransactionParams[],
): Promise<Hex> {
  try {
    return await submitViaRelayExecuteInternal(
      quote,
      transaction,
      messenger,
      allParams,
    );
  } catch (error) {
    throw prefixError(error, RELAY_EXECUTE_ERROR_PREFIX);
  }
}

async function submitViaRelayExecuteInternal(
  quote: TransactionPayQuote<RelayQuote>,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  allParams: TransactionParams[],
): Promise<Hex> {
  const isSubsidized = isSubsidizedRelayQuote(quote.original);
  const requestId = getRelayExecuteRequestId(quote.original);
  const metamask = getRelayExecuteMetamask(quote.original, isSubsidized);

  const core = await getRelayExecuteRequest({
    allParams,
    isSubsidized,
    messenger,
    quote,
    regenerateBatchParams: true,
    requestId,
    transaction,
  });

  const executeBody: RelayExecuteRequest = { ...core, metamask };

  log('Submitting to Relay execute', { executeBody, from: quote.request.from });

  const result = await submitRelayExecute(messenger, executeBody);

  log('Relay execute response', result);

  // Server may return a different requestId (e.g. after JIT quote for subsidized).
  // Replace the original quote requestId so waitForRelayCompletion polls the correct request.
  replaceFirstStepRequestId(quote.original, result.requestId);

  return FALLBACK_HASH;
}

function isSubsidizedRelayQuote(quote: RelayQuote): boolean {
  return Number(quote.fees?.subsidized?.amountUsd ?? '0') > 0;
}

function stripRelayExecuteMarker(requestId: string): string {
  return requestId.includes('#mm')
    ? requestId.slice(0, requestId.indexOf('#mm'))
    : requestId;
}

function getRelayExecuteRequestId(quote: RelayQuote): string {
  const requestId = quote.steps?.[0]?.requestId;
  if (!requestId) {
    throw new Error('Missing requestId in quote step');
  }
  return stripRelayExecuteMarker(requestId);
}

function getRelayExecuteMetamask(
  quote: RelayQuote,
  isSubsidized: boolean,
): {
  isSubsidized: boolean;
  quoteRequest: RelayQuote['request'];
  signature: string;
} {
  const signature = quote.metamask?.signature;
  if (!signature) {
    throw new Error(
      'Missing metamask.signature — cannot submit to /relay/execute without the HMAC token',
    );
  }
  return {
    isSubsidized,
    quoteRequest: quote.request,
    signature,
  };
}

function mapAuthorizationList(
  authorizationList: AuthorizationList | undefined,
): {
  authorizationList?: {
    chainId: number;
    address: Hex;
    nonce: number;
    yParity: number;
    r: Hex;
    s: Hex;
  }[];
} {
  if (!authorizationList?.length) {
    return {};
  }
  return {
    authorizationList: authorizationList.map((auth) => ({
      chainId: Number(auth.chainId),
      address: auth.address,
      nonce: Number(auth.nonce),
      yParity: Number(auth.yParity),
      r: auth.r as Hex,
      s: auth.s as Hex,
    })),
  };
}

function replaceFirstStepRequestId(quote: RelayQuote, requestId: string): void {
  /* istanbul ignore next: requestId is read from steps[0] earlier, so steps is non-empty here; defensive guard. */
  const steps = quote.steps ?? [];
  /* istanbul ignore if: requestId is read from steps[0] earlier, so steps is non-empty here; defensive guard. */
  if (steps.length === 0) {
    throw new Error('Cannot update requestId — quote has no steps');
  }

  const existingStep = steps[0];
  const remainingSteps = steps.slice(1);

  quote.steps = [{ ...existingStep, requestId }, ...remainingSteps];
}

export async function getRelayExecuteRequest({
  allParams,
  isSubsidized = false,
  messenger,
  quote,
  regenerateBatchParams = false,
  requestId,
  transaction,
}: {
  allParams: TransactionParams[];
  isSubsidized?: boolean;
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  regenerateBatchParams?: boolean;
  requestId: string;
  transaction: TransactionMeta;
}): Promise<Omit<RelayExecuteRequest, 'metamask'>> {
  const { from, sourceChainId } = quote.request;
  const networkClientId = getNetworkClientId(messenger, sourceChainId);

  const nestedTransactions = allParams.map((param) => ({
    data: (param.data ?? '0x') as Hex,
    to: param.to as Hex,
    value: (param.value ?? '0x0') as Hex,
  }));

  let txParams = { ...transaction.txParams, from };

  if (regenerateBatchParams) {
    // Regenerate `txParams` so it matches the current quote's nested transactions.
    // The original `transaction.txParams` may be stale (from a previous quote), and
    // downstream delegation caveats are built from `txParams.data`, so it must reflect
    // the transactions being redeemed. A single nested transaction is used directly;
    // multiple are wrapped into an atomic EIP-7702 (ERC-7821) batch.
    const batchParams =
      nestedTransactions.length === 1
        ? nestedTransactions[0]
        : generateEIP7702BatchTransaction(from, nestedTransactions);
    txParams = {
      ...txParams,
      to: batchParams.to,
      value: batchParams.value ?? '0x0',
      data: batchParams.data,
    };
  }

  const executionTransaction: TransactionMeta = {
    ...transaction,
    chainId: sourceChainId,
    networkClientId,
    nestedTransactions,
    txParams,
  } as TransactionMeta;

  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction: executionTransaction, isSubsidized },
  );

  log('Delegation result for execute request', delegation);

  return {
    executionKind: 'rawCalls',
    data: {
      chainId: Number(sourceChainId),
      to: delegation.to,
      data: delegation.data,
      value: new BigNumber(delegation.value).toFixed(),
      ...mapAuthorizationList(delegation.authorizationList),
    },
    executionOptions: {
      subsidizeFees: false,
    },
    requestId,
  };
}
