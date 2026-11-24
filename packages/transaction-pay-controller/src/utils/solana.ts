import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import type { Base58 } from '@metamask/transaction-controller';
import {
  hexToBytes,
  isObject,
  KnownCaipNamespace,
  parseCaipAccountId,
  parseCaipAssetType,
} from '@metamask/utils';
import type { CaipAssetType, CaipChainId } from '@metamask/utils';
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

import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../types.js';
import type { AssetAccount } from './account.js';

/** Decimals of native SOL. */
export const SOLANA_DECIMALS = 9;

const SOLANA_NATIVE_ASSET_REFERENCE = 'slip44:501';
const INFURA_PROJECT_ID_PLACEHOLDER = '{infuraProjectId}';
const SIGNATURE_STATUS_ERROR_KEY = 'err';

/** Account of a Solana instruction. */
export type SolanaInstructionKey = {
  /** Base58 account address. */
  pubkey: Base58;
  isSigner: boolean;
  isWritable: boolean;
};

/** Solana instruction, with its data hex encoded. */
export type SolanaInstruction = {
  /** Base58 program address. */
  programId: Base58;
  keys: SolanaInstructionKey[];

  /** Hex encoded instruction data, without a `0x` prefix. */
  data: string;
};

/** Instructions and lookup tables of a Solana transaction to compile. */
export type SolanaTransactionInstructions = {
  instructions: SolanaInstruction[];

  /** Base58 addresses of the lookup tables used to compress the transaction. */
  addressLookupTableAddresses: Base58[];
};

/** Unsigned Solana transaction compiled with a recent blockhash. */
export type CompiledSolanaTransaction = {
  /** Base64 wire encoding of the unsigned v0 transaction. */
  transaction: string;

  /** Last block height at which the compiled blockhash is valid. */
  lastValidBlockHeight: number;
};

/** Solana account and Snap that hold the source asset of a quote request. */
export type SolanaSource = {
  /** ID of the source `InternalAccount`, as used by Snap requests. */
  accountId: string;

  /** Base58 address of the source account, which pays the network fee. */
  address: Base58;

  /** CAIP-2 chain of the source asset. */
  scope: CaipChainId;

  /** Snap that owns the source account. */
  snapId: SnapId;
};

/** Error thrown when a compiled Solana transaction exceeds the size limit. */
export class SolanaTransactionTooLargeError extends Error {
  constructor() {
    super('Solana transaction exceeds the size limit');
  }
}

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

/** Signature status, carrying the transaction error in the `err` field. */
type SolanaSignatureStatus = Record<string, unknown> & {
  confirmationStatus?: string;
};

type SolanaSignatureStatuses = {
  value: (SolanaSignatureStatus | null)[];
};

type SnapFee = {
  asset: { amount: string };
};

/**
 * Check if the source asset of a quote request is on Solana.
 *
 * @param request - Quote request to check.
 * @returns True if the source asset is on Solana.
 */
export function isSolanaQuoteRequest(
  request: Pick<QuoteRequest, 'sourceAssetId'>,
): boolean {
  return (
    parseCaipAssetType(request.sourceAssetId).chain.namespace ===
    KnownCaipNamespace.Solana
  );
}

/**
 * Get the CAIP-19 asset type of native SOL on a Solana chain.
 *
 * @param chainId - CAIP-2 Solana chain ID.
 * @returns CAIP-19 asset type of native SOL.
 */
export function getSolanaNativeAssetId(chainId: CaipChainId): CaipAssetType {
  return `${chainId}/${SOLANA_NATIVE_ASSET_REFERENCE}`;
}

/**
 * Check if the source asset of a Solana quote request is native SOL.
 *
 * @param request - Solana quote request.
 * @returns True if the source asset is native SOL.
 */
export function isSolanaNativeRequest(
  request: Pick<QuoteRequest, 'sourceAssetId'>,
): boolean {
  const { chainId } = parseCaipAssetType(request.sourceAssetId);

  return request.sourceAssetId === getSolanaNativeAssetId(chainId);
}

/**
 * Get the account and Snap that hold the source asset of a Solana quote
 * request.
 *
 * The account is the one whose address and scopes match the CAIP-10 source
 * account of the request, so it is the one the quote was built for.
 *
 * @param messenger - Controller messenger.
 * @param request - Solana quote request.
 * @returns The source account, its Snap, and the source chain.
 */
export function getSolanaSource(
  messenger: TransactionPayControllerMessenger,
  request: Pick<QuoteRequest, 'sourceAccountId' | 'sourceAssetId'>,
): SolanaSource {
  const { address: sourceAddress, chainId: scope } = parseCaipAccountId(
    request.sourceAccountId,
  );

  const account = Object.values(
    messenger.call('AccountsController:getState').internalAccounts.accounts,
  ).find(
    (candidate: AssetAccount) =>
      candidate.address === sourceAddress && candidate.scopes.includes(scope),
  );

  const snapId = account?.metadata.snap?.id;

  if (!account || !snapId) {
    throw new Error('Solana source account not found');
  }

  return {
    accountId: account.id,
    address: sourceAddress,
    scope,
    snapId: snapId as SnapId,
  };
}

/**
 * Compile the unsigned v0 transaction for Solana instructions, with the
 * source account as fee payer and the latest `confirmed` blockhash.
 *
 * Lookup tables that cannot be resolved are skipped.
 *
 * @param request - Compile request.
 * @param request.messenger - Controller messenger.
 * @param request.source - Source account paying the fee.
 * @param request.transaction - Instructions and lookup tables to compile.
 * @returns The unsigned transaction and its blockhash lifetime.
 */
export async function compileSolanaTransaction({
  messenger,
  source,
  transaction,
}: {
  messenger: TransactionPayControllerMessenger;
  source: SolanaSource;
  transaction: SolanaTransactionInstructions;
}): Promise<CompiledSolanaTransaction> {
  const rpcUrl = getSolanaRpcUrl(messenger, source.scope);

  const [latestBlockhash, lookupTables] = await Promise.all([
    solanaRpcRequest<SolanaLatestBlockhash>(rpcUrl, 'getLatestBlockhash', [
      { commitment: 'confirmed' },
    ]),
    getAddressLookupTables(rpcUrl, transaction.addressLookupTableAddresses),
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
        address(source.address),
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
 * Compute the network fee of an unsigned transaction through the account
 * Snap, as bridge-controller does.
 *
 * @param messenger - Controller messenger.
 * @param source - Source account and Snap.
 * @param transaction - Base64 unsigned transaction.
 * @returns Total base and priority fee in lamports.
 */
export async function computeSolanaFeeRaw(
  messenger: TransactionPayControllerMessenger,
  source: SolanaSource,
  transaction: string,
): Promise<string> {
  const fees = (await messenger.call('SnapController:handleRequest', {
    handler: HandlerType.OnClientRequest,
    origin: 'metamask',
    request: {
      id: uuid(),
      jsonrpc: '2.0',
      method: 'computeFee',
      params: { accountId: source.accountId, scope: source.scope, transaction },
    },
    snapId: source.snapId,
  })) as SnapFee[];

  return fees
    .reduce((total, fee) => total.plus(fee.asset.amount), new BigNumber(0))
    .shiftedBy(SOLANA_DECIMALS)
    .toFixed(0, BigNumber.ROUND_UP);
}

/**
 * Read the rent-exempt minimum of a zero-data account through the account
 * Snap, as bridge-controller does.
 *
 * @param messenger - Controller messenger.
 * @param source - Source account and Snap.
 * @returns Rent-exempt minimum in lamports.
 */
export async function getSolanaRentReserveRaw(
  messenger: TransactionPayControllerMessenger,
  source: SolanaSource,
): Promise<string> {
  const rent = await messenger.call('SnapController:handleRequest', {
    handler: HandlerType.OnProtocolRequest,
    origin: 'metamask',
    request: {
      jsonrpc: '2.0',
      method: ' ',
      params: {
        request: {
          id: uuid(),
          jsonrpc: '2.0',
          method: 'getMinimumBalanceForRentExemption',
          params: [0, { commitment: 'confirmed' }],
        },
        scope: source.scope,
      },
    },
    snapId: source.snapId,
  });

  return new BigNumber(String(rent)).toFixed(0);
}

/**
 * Sign and broadcast an unsigned transaction through the account Snap.
 *
 * The Snap shows no confirmation of its own, so this must only be called from
 * the publish hook after the user approved the Pay confirmation.
 *
 * @param messenger - Controller messenger.
 * @param source - Source account and Snap.
 * @param transaction - Base64 unsigned transaction.
 * @returns The base58 signature of the broadcast transaction.
 */
export async function signAndSendSolanaTransaction(
  messenger: TransactionPayControllerMessenger,
  source: SolanaSource,
  transaction: string,
): Promise<Base58> {
  const response = await messenger.call('SnapController:handleRequest', {
    handler: HandlerType.OnClientRequest,
    origin: 'metamask',
    request: {
      id: uuid(),
      jsonrpc: '2.0',
      method: 'signAndSendTransaction',
      params: { accountId: source.accountId, scope: source.scope, transaction },
    },
    snapId: source.snapId,
  });

  const signature = isObject(response) ? response.transactionId : undefined;

  if (typeof signature !== 'string' || !signature) {
    throw new Error('Solana transaction signature missing');
  }

  return signature;
}

/**
 * Wait until a broadcast Solana transaction is confirmed, by polling its
 * signature status. Throws once the transaction fails, or once its blockhash
 * expired without the transaction landing.
 *
 * @param request - Wait request.
 * @param request.lastValidBlockHeight - Last block height at which the
 * transaction blockhash is valid.
 * @param request.messenger - Controller messenger.
 * @param request.pollingInterval - Delay between status reads in milliseconds.
 * @param request.scope - CAIP-2 chain of the transaction.
 * @param request.signature - Base58 signature of the transaction.
 */
export async function waitForSolanaTransactionConfirmed({
  lastValidBlockHeight,
  messenger,
  pollingInterval,
  scope,
  signature,
}: {
  lastValidBlockHeight: number;
  messenger: TransactionPayControllerMessenger;
  pollingInterval: number;
  scope: CaipChainId;
  signature: Base58;
}): Promise<void> {
  const rpcUrl = getSolanaRpcUrl(messenger, scope);

  while (true) {
    const {
      value: [status],
    } = await solanaRpcRequest<SolanaSignatureStatuses>(
      rpcUrl,
      'getSignatureStatuses',
      [[signature], { searchTransactionHistory: true }],
    );

    const transactionError = status?.[SIGNATURE_STATUS_ERROR_KEY];

    if (transactionError) {
      throw new Error(
        `Solana transaction failed: ${JSON.stringify(transactionError)}`,
      );
    }

    if (
      status?.confirmationStatus === 'confirmed' ||
      status?.confirmationStatus === 'finalized'
    ) {
      return;
    }

    if (!status) {
      const blockHeight = await solanaRpcRequest<number>(
        rpcUrl,
        'getBlockHeight',
        [{ commitment: 'confirmed' }],
      );

      if (blockHeight > lastValidBlockHeight) {
        throw new Error('Solana transaction expired');
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollingInterval));
  }
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
      `Solana RPC URL for ${scope} requires an Infura project ID`,
    );
  }

  return url.replaceAll(INFURA_PROJECT_ID_PLACEHOLDER, infuraProjectId);
}

async function getAddressLookupTables(
  rpcUrl: string,
  lookupTableAddresses: Base58[],
): Promise<AddressesByLookupTableAddress> {
  if (!lookupTableAddresses.length) {
    return {};
  }

  const accounts = await solanaRpcRequest<SolanaLookupTableAccounts>(
    rpcUrl,
    'getMultipleAccounts',
    [lookupTableAddresses, { commitment: 'confirmed', encoding: 'jsonParsed' }],
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
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
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

function getAccountRole(key: SolanaInstructionKey): AccountRole {
  if (key.isSigner) {
    return key.isWritable
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER;
  }

  return key.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
}
