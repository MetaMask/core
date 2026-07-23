import {
  boolean,
  define,
  literal,
  nonempty,
  object,
  optional,
  refine,
  string,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { isValidHexAddress, StrictHexStruct } from '@metamask/utils';
import type { Hex } from '@metamask/utils';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '@metamask/wallet';

/**
 * Origin recorded on daemon-initiated transactions. Mirrors
 * `ORIGIN_METAMASK` from `@metamask/controller-utils` (a single string
 * constant, inlined here to avoid pulling that whole package in as a
 * dependency for one value).
 */
const INTERNAL_ORIGIN = 'metamask';

/**
 * Struct for a `0x`-prefixed 20-byte hex address. `isValidHexAddress` accepts
 * an all-lowercase address or a valid EIP-55 checksummed one, so a plain
 * lowercase paste works while a mistyped mixed-case address is rejected.
 */
const AddressStruct = define<Hex>('Address', (value) =>
  typeof value === 'string' && isValidHexAddress(value as Hex)
    ? true
    : 'Expected a 0x-prefixed 20-byte hex address',
);

/**
 * Params struct for the `sendTransaction` RPC method.
 *
 * The transaction fields (`to`, `value`, `data`, gas overrides) are canonical
 * `0x`-prefixed hex — any unit conversion (e.g. ether → wei) is the CLI
 * command's job, so the daemon boundary stays unambiguous. Exactly one of
 * `networkClientId` / `chainId` selects the network client; the refinement
 * below rejects supplying both or neither. `dryRun` short-circuits before
 * broadcast (see {@link runSendTransaction}).
 */
export const SendTransactionParamsStruct = refine(
  object({
    to: AddressStruct,
    from: optional(AddressStruct),
    value: optional(StrictHexStruct),
    data: optional(StrictHexStruct),
    gas: optional(StrictHexStruct),
    maxFeePerGas: optional(StrictHexStruct),
    maxPriorityFeePerGas: optional(StrictHexStruct),
    gasPrice: optional(StrictHexStruct),
    networkClientId: optional(nonempty(string())),
    chainId: optional(StrictHexStruct),
    dryRun: optional(boolean()),
  }),
  'SendTransactionParams',
  (value) => {
    if (
      (value.networkClientId === undefined) ===
      (value.chainId === undefined)
    ) {
      return 'Exactly one of `networkClientId` or `chainId` must be provided';
    }
    return true;
  },
);

export type SendTransactionParams = Infer<typeof SendTransactionParamsStruct>;

/**
 * The resolved plan a `dryRun` returns: the network client and sender the
 * daemon would use, without adding or broadcasting anything. Exported as a
 * struct so the CLI can validate the payload it reads back over JSON-RPC
 * (which erases types on the wire) rather than trusting its shape.
 */
export const SendTransactionDryRunResultStruct = object({
  dryRun: literal(true),
  from: StrictHexStruct,
  to: StrictHexStruct,
  value: StrictHexStruct,
  networkClientId: string(),
});

/**
 * The outcome of a broadcast send: the on-chain hash plus the id/status the
 * daemon tracks the transaction under. Exported as a struct for the same
 * client-side validation reason as {@link SendTransactionDryRunResultStruct}.
 */
export const SendTransactionBroadcastResultStruct = object({
  transactionHash: string(),
  transactionId: string(),
  status: string(),
});

export type SendTransactionDryRunResult = Infer<
  typeof SendTransactionDryRunResultStruct
>;

export type SendTransactionBroadcastResult = Infer<
  typeof SendTransactionBroadcastResultStruct
>;

export type SendTransactionResult =
  | SendTransactionDryRunResult
  | SendTransactionBroadcastResult;

/**
 * Add and broadcast a transaction through the daemon-hosted
 * `TransactionController`, returning a serializable result.
 *
 * `TransactionController:addTransaction` returns `{ transactionMeta, result }`
 * where `result` is a `Promise<hash>` that resolves once the transaction is
 * signed and broadcast. That promise is not JSON-serializable, so it cannot
 * travel back over the daemon's JSON-RPC socket via the generic `call`
 * dispatch — hence this dedicated handler, which awaits the broadcast
 * server-side and returns only the resolved hash (and id/status).
 *
 * The network client is resolved from `chainId` (via `NetworkController`) when
 * `networkClientId` is not given directly, and `from` defaults to the selected
 * account. The transaction is submitted as `isInternal` (the daemon is driven
 * only by its owner over the `0600` same-user socket), which skips
 * origin/permitted-account validation; its approval request is auto-accepted
 * by the daemon's auto-approval subscription.
 *
 * When `dryRun` is set, the network client and sender are resolved and the
 * params validated, but nothing is added or broadcast — the resolved plan is
 * returned so the CLI can preview it before the user confirms.
 *
 * @param messenger - The wallet root messenger.
 * @param params - Validated `sendTransaction` params.
 * @returns The dry-run plan, or the broadcast hash with its id and status.
 */
export async function runSendTransaction(
  messenger: Readonly<RootMessenger<DefaultActions, DefaultEvents>>,
  params: SendTransactionParams,
): Promise<SendTransactionResult> {
  const {
    to,
    value = '0x0',
    data,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasPrice,
    networkClientId: networkClientIdParam,
    chainId,
    dryRun,
  } = params;

  // The struct guarantees exactly one of `networkClientId` / `chainId`, so
  // `chainId` is defined whenever `networkClientId` is not.
  const networkClientId =
    networkClientIdParam ??
    messenger.call(
      'NetworkController:findNetworkClientIdByChainId',
      chainId as Hex,
    );

  const from =
    params.from ??
    (messenger.call('AccountsController:getSelectedAccount').address as Hex);

  if (dryRun) {
    return { dryRun: true, from, to, value, networkClientId };
  }

  const txParams = {
    from,
    to,
    value,
    ...(data === undefined ? {} : { data }),
    ...(gas === undefined ? {} : { gas }),
    ...(maxFeePerGas === undefined ? {} : { maxFeePerGas }),
    ...(maxPriorityFeePerGas === undefined ? {} : { maxPriorityFeePerGas }),
    ...(gasPrice === undefined ? {} : { gasPrice }),
  };

  const { result, transactionMeta } = await messenger.call(
    'TransactionController:addTransaction',
    txParams,
    { networkClientId, origin: INTERNAL_ORIGIN, isInternal: true },
  );

  // `result` resolves only once the transaction is signed and broadcast (see
  // the function JSDoc); awaiting it here is what this handler exists for.
  const transactionHash = await result;

  // Re-read the live record for the current status: `transactionMeta` is the
  // creation snapshot (still `unapproved`). If the record is already gone,
  // fall back to `submitted` — reaching this point means `result` resolved, so
  // the transaction was broadcast, never merely `unapproved`.
  const [current] = messenger.call('TransactionController:getTransactions', {
    searchCriteria: { id: transactionMeta.id },
  });

  return {
    transactionHash,
    transactionId: transactionMeta.id,
    status: current?.status ?? 'submitted',
  };
}
