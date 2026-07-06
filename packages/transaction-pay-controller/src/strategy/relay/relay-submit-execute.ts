import type { TransactionParams } from '@metamask/transaction-controller';
import type {
  AuthorizationList,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { prefixError } from '../../utils/error-prefix';
import { getNetworkClientId } from '../../utils/provider';
import { FALLBACK_HASH } from './constants';
import { submitRelayExecute } from './relay-api';
import type { RelayExecuteRequest, RelayQuote } from './types';

const log = createModuleLogger(projectLogger, 'relay-strategy');
const RELAY_EXECUTE_ERROR_PREFIX = 'Execute: ';

export async function submitViaRelayExecute(
  quote: TransactionPayQuote<RelayQuote>,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  allParams: TransactionParams[],
): Promise<Hex> {
  const isSubsidized = isSubsidizedRelayQuote(quote.original);
  const requestId = getRelayExecuteRequestId(quote.original);
  const metamask = getRelayExecuteMetamask(quote.original, isSubsidized);

  const { from, sourceChainId } = quote.request;
  const networkClientId = getNetworkClientId(messenger, sourceChainId);

  const executionTransaction: TransactionMeta = {
    ...transaction,
    chainId: sourceChainId,
    networkClientId,
    nestedTransactions: allParams.map((param) => ({
      data: (param.data ?? '0x') as Hex,
      to: param.to as Hex,
      value: (param.value ?? '0x0') as Hex,
    })),
    txParams: {
      ...transaction.txParams,
      from,
    },
  } as TransactionMeta;

  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction: executionTransaction, isSubsidized },
  );

  log('Delegation result for execute', delegation);

  const executeBody: RelayExecuteRequest = {
    executionKind: 'rawCalls',
    data: {
      chainId: Number(quote.request.sourceChainId),
      to: delegation.to,
      data: delegation.data,
      value: new BigNumber(delegation.value).toFixed(),
      ...mapAuthorizationList(delegation.authorizationList),
    },
    executionOptions: {
      subsidizeFees: false,
    },
    requestId,
    metamask,
  };

  log('Submitting to Relay execute', { executeBody, from: quote.request.from });

  let result;
  try {
    result = await submitRelayExecute(messenger, executeBody);
  } catch (error) {
    throw prefixError(error, RELAY_EXECUTE_ERROR_PREFIX);
  }

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
    throw new Error(
      `${RELAY_EXECUTE_ERROR_PREFIX}Missing requestId in quote step`,
    );
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
      `${RELAY_EXECUTE_ERROR_PREFIX}Missing metamask.signature — cannot submit to /relay/execute without the HMAC token`,
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
    throw new Error(
      `${RELAY_EXECUTE_ERROR_PREFIX}Cannot update requestId — quote has no steps`,
    );
  }

  const existingStep = steps[0];
  const remainingSteps = steps.slice(1);

  quote.steps = [{ ...existingStep, requestId }, ...remainingSteps];
}
