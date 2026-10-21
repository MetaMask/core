import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import { hexToBytes } from '@metamask/utils';
import type { CaipChainId } from '@metamask/utils';
import { address } from '@solana/addresses';
import { AccountRole } from '@solana/instructions';
import type { Instruction } from '@solana/instructions';
import { blockhash } from '@solana/rpc-types';
import {
  appendTransactionMessageInstructions,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/transaction-messages';
import type { AddressesByLookupTableAddress } from '@solana/transaction-messages';
import {
  compileTransaction,
  getBase64EncodedWireTransaction,
  isTransactionWithinSizeLimit,
} from '@solana/transactions';
import { BigNumber } from 'bignumber.js';
import { v4 as uuid } from 'uuid';

import type { TransactionPayControllerMessenger } from '../../types.js';
import type {
  RelaySolanaInstructionKey,
  RelaySolanaTransaction,
} from './types.js';

const SOLANA_DECIMALS = 9;

const INFURA_PROJECT_ID_PLACEHOLDER = '{infuraProjectId}';

/** Failure reason of a source transaction whose blockhash expired unlanded. */
export const SOLANA_SOURCE_EXPIRED_REASON = 'Solana source transaction expired';

type SolanaRpcResponse<Result> = {
  result?: Result;
  error?: { message: string };
};

type SolanaLatestBlockhash = {
  value: { blockhash: string; lastValidBlockHeight: number };
};

type SolanaLookupTableAccounts = {
  value: ({
    data?: { parsed?: { info?: { addresses?: unknown } } };
  } | null)[];
};

type SolanaSignatureStatuses = {
  /** Status per signature, carrying the transaction error as `err`. */
  value: (Record<string, unknown> | null)[];
};

type SnapFee = {
  type: string;
  asset: { amount: string };
};

/** Error thrown when a compiled Solana transaction exceeds the size limit. */
export class SolanaTransactionTooLargeError extends Error {
  constructor() {
    super('Solana transaction exceeds the size limit');
  }
}

/** Unsigned Solana transaction compiled by Core from a Relay payload. */
export type CompiledSolanaTransaction = {
  /** Base64 wire encoding of the unsigned v0 transaction. */
  transaction: string;

  /** Last block height at which the compiled blockhash is valid. */
  lastValidBlockHeight: number;
};

/**
 * Compiles the unsigned v0 transaction for a Relay Solana payload.
 *
 * Mirrors the Relay SVM adapter: the user pays the fee, the latest
 * `confirmed` blockhash is used, and lookup tables that cannot be resolved
 * are skipped.
 *
 * @param request - Compile request.
 * @param request.messenger - Controller messenger.
 * @param request.payer - Base58 Solana address of the fee payer and signer.
 * @param request.scope - CAIP-2 chain of the transaction.
 * @param request.transaction - Validated Relay instructions and lookup tables.
 * @returns The unsigned transaction and its blockhash lifetime.
 */
export async function compileRelaySolanaTransaction({
  messenger,
  payer,
  scope,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  payer: string;
  scope: CaipChainId;
  transaction: RelaySolanaTransaction;
}): Promise<CompiledSolanaTransaction> {
  const rpcUrl = getSolanaRpcUrl(messenger, scope);
  const lookupTableAddresses = transaction.addressLookupTableAddresses ?? [];

  const [latestBlockhash, lookupTables] = await Promise.all([
    solanaRpcRequest<SolanaLatestBlockhash>(rpcUrl, 'getLatestBlockhash', [
      { commitment: 'confirmed' },
    ]),
    getAddressLookupTables(rpcUrl, lookupTableAddresses),
  ]);

  const { lastValidBlockHeight } = latestBlockhash.value;

  const instructions: Instruction[] = transaction.instructions.map(
    (instruction) => ({
      accounts: instruction.keys.map((key) => ({
        address: address(key.pubkey),
        role: getAccountRole(key),
      })),
      data: instruction.data ? hexToBytes(instruction.data) : new Uint8Array(),
      programAddress: address(instruction.programId),
    }),
  );

  const message = appendTransactionMessageInstructions(
    instructions,
    setTransactionMessageLifetimeUsingBlockhash(
      {
        blockhash: blockhash(latestBlockhash.value.blockhash),
        lastValidBlockHeight: BigInt(lastValidBlockHeight),
      },
      setTransactionMessageFeePayer(
        address(payer),
        createTransactionMessage({ version: 0 }),
      ),
    ),
  );

  const compiled = compileTransaction(
    compressTransactionMessageUsingAddressLookupTables(message, lookupTables),
  );

  if (!isTransactionWithinSizeLimit(compiled)) {
    throw new SolanaTransactionTooLargeError();
  }

  return {
    lastValidBlockHeight,
    transaction: getBase64EncodedWireTransaction(compiled),
  };
}

/**
 * Returns the Snap that owns a non-EVM wallet account.
 *
 * @param messenger - Controller messenger.
 * @param walletAccountId - ID of the `InternalAccount`.
 * @returns The Snap ID from the account metadata.
 */
export function getAccountSnapId(
  messenger: TransactionPayControllerMessenger,
  walletAccountId: string,
): string {
  const account = messenger.call('AccountsController:getState').internalAccounts
    .accounts[walletAccountId];

  const snapId = account?.metadata.snap?.id;

  if (!snapId) {
    throw new Error('Solana source account Snap not found');
  }

  return snapId;
}

/**
 * Computes the network fee of an unsigned transaction through the account
 * Snap, as bridge-controller `appendNonEvmFees` does.
 *
 * @param request - Fee request.
 * @param request.messenger - Controller messenger.
 * @param request.snapId - Snap that owns the source account.
 * @param request.accountId - ID of the source `InternalAccount`.
 * @param request.scope - CAIP-2 chain of the transaction.
 * @param request.transaction - Base64 unsigned transaction.
 * @returns Total base and priority fee in lamports.
 */
export async function computeSolanaFeeRaw({
  accountId,
  messenger,
  scope,
  snapId,
  transaction,
}: {
  accountId: string;
  messenger: TransactionPayControllerMessenger;
  scope: CaipChainId;
  snapId: string;
  transaction: string;
}): Promise<string> {
  const fees = (await messenger.call('SnapController:handleRequest', {
    snapId: snapId as SnapId,
    origin: 'metamask',
    handler: HandlerType.OnClientRequest,
    request: {
      id: uuid(),
      jsonrpc: '2.0',
      method: 'computeFee',
      params: { accountId, scope, transaction },
    },
  })) as SnapFee[];

  return fees
    .reduce((total, fee) => total.plus(fee.asset.amount), new BigNumber(0))
    .shiftedBy(SOLANA_DECIMALS)
    .toFixed(0, BigNumber.ROUND_UP);
}

/**
 * Reads the rent-exempt minimum for a zero-data account through the account
 * Snap, as bridge-controller does.
 *
 * @param request - Rent request.
 * @param request.messenger - Controller messenger.
 * @param request.snapId - Snap that owns the source account.
 * @param request.scope - CAIP-2 chain of the account.
 * @returns Rent-exempt minimum in lamports.
 */
export async function getSolanaRentReserveRaw({
  messenger,
  scope,
  snapId,
}: {
  messenger: TransactionPayControllerMessenger;
  scope: CaipChainId;
  snapId: string;
}): Promise<string> {
  const rent = await messenger.call('SnapController:handleRequest', {
    snapId: snapId as SnapId,
    origin: 'metamask',
    handler: HandlerType.OnProtocolRequest,
    request: {
      method: ' ',
      jsonrpc: '2.0',
      params: {
        scope,
        request: {
          id: uuid(),
          jsonrpc: '2.0',
          method: 'getMinimumBalanceForRentExemption',
          params: [0, { commitment: 'confirmed' }],
        },
      },
    },
  });

  return new BigNumber(String(rent)).toFixed(0);
}

/**
 * Signs and broadcasts an unsigned transaction through the account Snap.
 *
 * The Snap shows no confirmation of its own, so this must only be called from
 * the publish path after the user approved the Pay confirmation.
 *
 * @param request - Sign request.
 * @param request.messenger - Controller messenger.
 * @param request.snapId - Snap that owns the source account.
 * @param request.accountId - ID of the source `InternalAccount`.
 * @param request.scope - CAIP-2 chain of the transaction.
 * @param request.transaction - Base64 unsigned transaction.
 * @returns The Snap response.
 */
export async function signAndSendSolanaTransaction({
  accountId,
  messenger,
  scope,
  snapId,
  transaction,
}: {
  accountId: string;
  messenger: TransactionPayControllerMessenger;
  scope: CaipChainId;
  snapId: string;
  transaction: string;
}): Promise<unknown> {
  return await messenger.call('SnapController:handleRequest', {
    snapId: snapId as SnapId,
    origin: 'metamask',
    handler: HandlerType.OnClientRequest,
    request: {
      id: uuid(),
      jsonrpc: '2.0',
      method: 'signAndSendTransaction',
      params: { accountId, scope, transaction },
    },
  });
}

/**
 * Reads the on-chain status of a submitted Solana transaction for a source
 * that Relay has not observed yet.
 *
 * The transaction failed if its status carries an error, or if it is unknown
 * to the cluster after the finalized block height passed the last block height
 * at which its blockhash was valid.
 *
 * @param request - Status request.
 * @param request.messenger - Controller messenger.
 * @param request.scope - CAIP-2 chain of the transaction.
 * @param request.signature - Signature of the submitted transaction.
 * @param request.lastValidBlockHeight - Last block height at which the
 * submitted blockhash is valid, if known.
 * @returns The failure reason, or undefined if the transaction may still land.
 */
export async function getSolanaSourceFailure({
  lastValidBlockHeight,
  messenger,
  scope,
  signature,
}: {
  lastValidBlockHeight?: number;
  messenger: TransactionPayControllerMessenger;
  scope: CaipChainId;
  signature: string;
}): Promise<string | undefined> {
  const rpcUrl = getSolanaRpcUrl(messenger, scope);

  const {
    value: [status],
  } = await solanaRpcRequest<SolanaSignatureStatuses>(
    rpcUrl,
    'getSignatureStatuses',
    [[signature], { searchTransactionHistory: true }],
  );

  if (status) {
    return status.err
      ? `Solana source transaction failed: ${JSON.stringify(status.err)}`
      : undefined;
  }

  if (lastValidBlockHeight === undefined) {
    return undefined;
  }

  const blockHeight = await solanaRpcRequest<number>(rpcUrl, 'getBlockHeight', [
    { commitment: 'finalized' },
  ]);

  return blockHeight > lastValidBlockHeight
    ? SOLANA_SOURCE_EXPIRED_REASON
    : undefined;
}

function getSolanaRpcUrl(
  messenger: TransactionPayControllerMessenger,
  scope: CaipChainId,
): string {
  const url = messenger.call(
    'ConfigRegistryController:getNetworkConfigByCaip2ChainId',
    scope,
  )?.rpcProviders.default.url;

  if (!url) {
    throw new Error(`Solana RPC URL not found for ${scope}`);
  }

  if (!url.includes(INFURA_PROJECT_ID_PLACEHOLDER)) {
    return url;
  }

  const infuraProjectId = messenger.call(
    'TransactionPayController:getInfuraProjectId',
  );

  if (!infuraProjectId) {
    throw new Error(
      `Solana RPC URL for ${scope} requires the infuraProjectId option`,
    );
  }

  return url.replaceAll(INFURA_PROJECT_ID_PLACEHOLDER, infuraProjectId);
}

async function getAddressLookupTables(
  rpcUrl: string,
  lookupTableAddresses: string[],
): Promise<AddressesByLookupTableAddress> {
  if (!lookupTableAddresses.length) {
    return {};
  }

  const accounts = await solanaRpcRequest<SolanaLookupTableAccounts>(
    rpcUrl,
    'getMultipleAccounts',
    [lookupTableAddresses, { encoding: 'jsonParsed', commitment: 'confirmed' }],
  );

  return lookupTableAddresses.reduce<AddressesByLookupTableAddress>(
    (lookupTables, lookupTableAddress, index) => {
      const addresses = accounts.value[index]?.data?.parsed?.info?.addresses;

      if (Array.isArray(addresses)) {
        lookupTables[address(lookupTableAddress)] = addresses.map((value) =>
          address(String(value)),
        );
      }

      return lookupTables;
    },
    {},
  );
}

async function solanaRpcRequest<Result>(
  rpcUrl: string,
  method: string,
  params: unknown[],
): Promise<Result> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
  });

  if (!response.ok) {
    throw new Error(`Solana RPC ${method} failed: ${response.status}`);
  }

  const { error, result } =
    (await response.json()) as SolanaRpcResponse<Result>;

  if (error || result === undefined) {
    throw new Error(
      `Solana RPC ${method} failed: ${error?.message ?? 'missing result'}`,
    );
  }

  return result;
}

function getAccountRole(key: RelaySolanaInstructionKey): AccountRole {
  if (key.isSigner) {
    return key.isWritable
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER;
  }

  return key.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
}
