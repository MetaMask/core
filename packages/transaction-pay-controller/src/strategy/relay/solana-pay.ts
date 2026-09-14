import type {
  MetamaskPayExecution,
  MetamaskPayRelayStatus,
} from '@metamask/transaction-controller';

import type {
  GetSolanaPayQuoteRequest,
  TransactionPayIntent,
} from '../../types.js';
import {
  RELAY_SOLANA_CHAIN_ID,
  RELAY_SOLANA_NATIVE_CURRENCY,
} from './constants.js';
import type {
  RelaySolanaQuote,
  RelaySolanaQuoteRequest,
  RelaySolanaTransaction,
  RelayStatus,
} from './types.js';

const SOLANA_MAINNET_CAIP_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_NATIVE_ASSET_REFERENCE = 'slip44:501';
const SOLANA_TOKEN_ASSET_NAMESPACE = 'token:';
const HEX_BYTES_REGEX = /^(?:[\da-f]{2})*$/iu;

/**
 * Builds the Relay /quote/v2 request for a persisted Solana Pay intent.
 *
 * @param intent - Persisted chain-agnostic source identity.
 * @param request - Destination and amount selected by the client.
 * @returns A Relay Solana exact-input request.
 */
export function buildRelaySolanaQuoteRequest(
  intent: TransactionPayIntent,
  request: GetSolanaPayQuoteRequest,
): RelaySolanaQuoteRequest {
  if (intent.sourceChainId !== SOLANA_MAINNET_CAIP_CHAIN_ID) {
    throw new Error(`Unsupported Solana source chain: ${intent.sourceChainId}`);
  }

  const sourceAccount = getSourceAccount(intent);

  return {
    amount: request.amount,
    destinationChainId: Number(request.destinationChainId),
    destinationCurrency: request.destinationCurrency,
    originChainId: RELAY_SOLANA_CHAIN_ID,
    originCurrency: getOriginCurrency(intent),
    recipient: request.recipient,
    refundTo: sourceAccount,
    tradeType: 'EXACT_INPUT',
    user: sourceAccount,
  };
}

/**
 * Extracts and validates the single Relay Solana transaction handoff.
 *
 * Relay leaves item data untyped in its public schema. Runtime validation here
 * prevents EVM transaction items or malformed instruction keys from reaching
 * the client callback.
 *
 * @param quote - Relay /quote/v2 response.
 * @returns Instructions and lookup-table addresses for client compilation.
 */
export function getRelaySolanaTransaction(
  quote: RelaySolanaQuote,
): RelaySolanaTransaction {
  const transactionItems = quote.steps.flatMap((step) => step.items);
  const hasInvalidStep = quote.steps.some(
    (step) => step.kind !== 'transaction' || step.requestId !== quote.requestId,
  );

  if (
    !quote.requestId ||
    hasInvalidStep ||
    transactionItems.length !== 1 ||
    !isRelaySolanaTransaction(transactionItems[0].data)
  ) {
    throw new Error('Invalid Relay Solana transaction payload');
  }

  return transactionItems[0].data;
}

/**
 * Returns the durable initial execution checkpoints for an executable quote.
 *
 * @returns Initial one-attempt status axes.
 */
export function getInitialSolanaPayExecution(): MetamaskPayExecution {
  return {
    providerNotificationStatus: 'not-started',
    relayStatus: 'not-started',
    sourceStatus: 'not-started',
  };
}

/**
 * Maps the provider lifecycle onto the independent durable Relay axis.
 *
 * @param status - Status returned by Relay.
 * @returns Durable Relay observation.
 */
export function mapRelayStatus(status: RelayStatus): MetamaskPayRelayStatus {
  if (status === 'success') {
    return 'success';
  }

  if (status === 'failure') {
    return 'failure';
  }

  if (status === 'refund' || status === 'refunded') {
    return 'refund';
  }

  return 'pending';
}

function getSourceAccount(intent: TransactionPayIntent): string {
  const prefix = `${intent.sourceChainId}:`;

  if (!intent.sourceAccountId.startsWith(prefix)) {
    throw new Error('Solana source account does not match source chain');
  }

  return intent.sourceAccountId.slice(prefix.length);
}

function getOriginCurrency(intent: TransactionPayIntent): string {
  const prefix = `${intent.sourceChainId}/`;

  if (!intent.sourceAssetId.startsWith(prefix)) {
    throw new Error('Solana source asset does not match source chain');
  }

  const assetReference = intent.sourceAssetId.slice(prefix.length);

  if (assetReference === SOLANA_NATIVE_ASSET_REFERENCE) {
    return RELAY_SOLANA_NATIVE_CURRENCY;
  }

  if (assetReference.startsWith(SOLANA_TOKEN_ASSET_NAMESPACE)) {
    return assetReference.slice(SOLANA_TOKEN_ASSET_NAMESPACE.length);
  }

  throw new Error(`Unsupported Solana source asset: ${intent.sourceAssetId}`);
}

function isRelaySolanaTransaction(
  value: unknown,
): value is RelaySolanaTransaction {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.chainId !== RELAY_SOLANA_CHAIN_ID ||
    !Array.isArray(value.instructions) ||
    value.instructions.length === 0 ||
    !value.instructions.every(isRelaySolanaInstruction)
  ) {
    return false;
  }

  return (
    value.addressLookupTableAddresses === undefined ||
    (Array.isArray(value.addressLookupTableAddresses) &&
      value.addressLookupTableAddresses.every(isNonEmptyString))
  );
}

function isRelaySolanaInstruction(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.programId) &&
    typeof value.data === 'string' &&
    HEX_BYTES_REGEX.test(value.data) &&
    Array.isArray(value.keys) &&
    value.keys.every(isRelaySolanaInstructionKey)
  );
}

function isRelaySolanaInstructionKey(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.pubkey) &&
    typeof value.isSigner === 'boolean' &&
    typeof value.isWritable === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
