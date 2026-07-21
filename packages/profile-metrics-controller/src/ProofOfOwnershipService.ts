import type { KeyringControllerSignPersonalMessageAction } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';
import type { Messenger } from '@metamask/messenger';
import type { SnapControllerHandleRequestAction } from '@metamask/snaps-controllers';
import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';
import { string, type as structType } from '@metamask/superstruct';
import { KnownCaipNamespace, parseCaipChainId } from '@metamask/utils';
import { v4 as uuid } from 'uuid';

import type { AccountOwnershipProof } from './ProfileMetricsService';
import type { ProofOfOwnershipServiceMethodActions } from './ProofOfOwnershipService-method-action-types';
import {
  canonicalizeAddress,
  ProofUnsupportedNamespaceError,
} from './utils/canonicalize';

// === GENERAL ===

/**
 * The name of the {@link ProofOfOwnershipService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'ProofOfOwnershipService';

/**
 * The shape of the request object for signing a proof of ownership for a
 * single account.
 */
export type ProofOfOwnershipSignRequest = {
  /**
   * The account to sign the proof for. Provides the address, the scopes used
   * to infer the signing namespace, and (for non-EVM) the snap ID + account
   * ID needed by `SnapController:handleRequest`.
   */
  account: InternalAccount;
  /**
   * A single-use nonce minted by the auth API (see
   * `ProfileMetricsService:fetchNonces`). Consumed server-side on
   * verification; replay is not possible.
   */
  nonce: string;
};

/**
 * The JSON-RPC method name exposed by non-EVM wallet snaps for silent
 * proof-of-ownership signing. Each supported snap (Bitcoin, Solana, Tron)
 * implements this method under the `onClientRequest` handler and is expected
 * to validate that the signed message begins with
 * `metamask:proof-of-ownership:`.
 */
export const SNAP_SIGN_PROOF_OF_OWNERSHIP_METHOD = 'signProofOfOwnership';

/**
 * The shape of a successful response from a non-EVM wallet snap's
 * {@link SNAP_SIGN_PROOF_OF_OWNERSHIP_METHOD} handler. Validated at runtime;
 * declared with `type()` (not `object()`) so additive snap-side schema
 * changes do not break the client.
 */
const SnapSignProofResponseStruct = structType({
  signature: string(),
});

/**
 * Builds the canonical message string that all chains sign for a proof of
 * ownership: `metamask:proof-of-ownership:<nonce>:<canonical address>`.
 * Defined per the auth API spec — kept inline so the contract is visible
 * next to the dispatch logic that uses it.
 *
 * @param nonce - The single-use nonce from the auth API.
 * @param canonicalAddress - The account address in its CAIP-namespace
 * canonical form (see {@link canonicalizeAddress}).
 * @returns The message string to sign.
 */
function buildProofMessage(nonce: string, canonicalAddress: string): string {
  return `metamask:proof-of-ownership:${nonce}:${canonicalAddress}`;
}

/**
 * Extracts the CAIP-2 namespace from the first scope of an account. All
 * scopes on a single account are expected to share a namespace (e.g. an
 * `eip155` account may carry many `eip155:<chainId>` scopes but never a
 * `solana:<…>` one).
 *
 * @param account - The internal account to inspect.
 * @returns The namespace portion of the first scope.
 * @throws {ProofUnsupportedNamespaceError} if the account has no scopes,
 * or if its first scope does not parse as a CAIP-2 chain ID.
 */
function getAccountNamespace(account: InternalAccount): string {
  const [firstScope] = account.scopes;
  if (!firstScope) {
    throw new ProofUnsupportedNamespaceError('<no scope>');
  }
  try {
    // `parseCaipChainId` validates the `<namespace>:<reference>` shape; it
    // throws on malformed input. We funnel that into the same error type as
    // an unknown namespace so callers only have one failure mode to handle.
    return parseCaipChainId(firstScope).namespace;
  } catch {
    throw new ProofUnsupportedNamespaceError(firstScope);
  }
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['sign'] as const;

/**
 * Actions that {@link ProofOfOwnershipService} exposes to other consumers.
 */
export type ProofOfOwnershipServiceActions =
  ProofOfOwnershipServiceMethodActions;

/**
 * Actions from other messengers that {@link ProofOfOwnershipService} calls.
 */
type AllowedActions =
  | KeyringControllerSignPersonalMessageAction
  | SnapControllerHandleRequestAction;

/**
 * Events that {@link ProofOfOwnershipService} exposes to other consumers.
 */
export type ProofOfOwnershipServiceEvents = never;

/**
 * Events from other messengers that {@link ProofOfOwnershipService}
 * subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link ProofOfOwnershipService}.
 */
export type ProofOfOwnershipServiceMessenger = Messenger<
  typeof serviceName,
  ProofOfOwnershipServiceActions | AllowedActions,
  ProofOfOwnershipServiceEvents | AllowedEvents
>;

// === SERVICE DEFINITION ===

/**
 * A service that produces chain-native cryptographic proofs that the wallet
 * controls a given account address.
 *
 * Dispatches by the CAIP-2 namespace of the account's first scope:
 *
 * - `eip155` → `KeyringController:signPersonalMessage` (EIP-191).
 * - `solana`, `tron`, `bip122` → `SnapController:handleRequest` with the
 *   `onClientRequest` handler against the wallet snap declared in
 *   `account.metadata.snap.id`. Routed this way (rather than through the
 *   keyring) so the request is silent and client-internal: no user prompt,
 *   no dapp-facing exposure. The snap is expected to implement
 *   {@link SNAP_SIGN_PROOF_OF_OWNERSHIP_METHOD} and to validate the message
 *   prefix before signing.
 *
 * Any other namespace yields {@link ProofUnsupportedNamespaceError}, which
 * callers in the polling pipeline catch to submit the account without a
 * proof (the auth API treats `proof` as optional).
 */
export class ProofOfOwnershipService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  /**
   * The messenger suited for this service.
   */
  readonly #messenger: ProofOfOwnershipServiceMessenger;

  /**
   * Constructs a new ProofOfOwnershipService object.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   */
  constructor({ messenger }: { messenger: ProofOfOwnershipServiceMessenger }) {
    this.name = serviceName;
    this.#messenger = messenger;

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Sign a proof of ownership for the given account and server-issued nonce.
   *
   * The returned proof is shaped to drop directly into
   * `AccountWithScopes.proof` for `ProfileMetricsService:submitMetrics`.
   *
   * @param data - The account to prove ownership of and the nonce to bind
   * the proof to.
   * @returns The proof of ownership (nonce echo + signature).
   * @throws {ProofUnsupportedNamespaceError} if the account's first scope
   * carries a namespace this service does not know how to sign for, or if
   * the account has no scopes.
   * @throws if the underlying signer (keyring or snap) rejects, or if the
   * snap returns a malformed response.
   */
  async sign(
    data: ProofOfOwnershipSignRequest,
  ): Promise<AccountOwnershipProof> {
    const { account, nonce } = data;
    const namespace = getAccountNamespace(account);
    const canonicalAddress = canonicalizeAddress(account.address, namespace);
    const message = buildProofMessage(nonce, canonicalAddress);

    let signature: string;
    if (namespace === KnownCaipNamespace.Eip155) {
      signature = await this.#signEvm(account.address, message);
    } else {
      // canonicalizeAddress() already threw for any unsupported namespace,
      // so anything reaching here is one of solana / tron / bip122.
      signature = await this.#signViaSnap(account, message);
    }

    return { nonce, signature };
  }

  /**
   * Sign an EIP-191 personal message via the keyring controller.
   *
   * @param address - The EVM address to sign with (must belong to an
   * unlocked keyring).
   * @param message - The proof message to sign.
   * @returns The 0x-prefixed signature.
   */
  async #signEvm(address: string, message: string): Promise<string> {
    return await this.#messenger.call('KeyringController:signPersonalMessage', {
      data: message,
      from: address,
    });
  }

  /**
   * Sign a proof message via the wallet snap declared on the account's
   * metadata. Uses the `onClientRequest` handler with `origin: 'metamask'`,
   * which is what makes the request silent (no user prompt, no
   * dapp-facing exposure).
   *
   * @param account - The internal account; must carry a non-empty
   * `metadata.snap.id`.
   * @param message - The proof message to sign.
   * @returns The signature string as returned by the snap.
   * @throws if the snap response does not match
   * {@link SnapSignProofResponseStruct}.
   */
  async #signViaSnap(
    account: InternalAccount,
    message: string,
  ): Promise<string> {
    const snapId = account.metadata.snap?.id;
    if (!snapId) {
      throw new Error(
        `ProofOfOwnershipService: account '${account.id}' has no snap to sign a proof of ownership.`,
      );
    }

    const response: unknown = await this.#messenger.call(
      'SnapController:handleRequest',
      {
        snapId: snapId as SnapId,
        origin: 'metamask',
        handler: HandlerType.OnClientRequest,
        request: {
          id: uuid(),
          jsonrpc: '2.0',
          method: SNAP_SIGN_PROOF_OF_OWNERSHIP_METHOD,
          params: {
            accountId: account.id,
            message,
          },
        },
      },
    );

    if (!SnapSignProofResponseStruct.is(response)) {
      // Intentionally generic — a malformed snap response may still carry
      // a partial signature, and we don't want fragments of secret material
      // landing in error logs.
      throw new Error(
        `ProofOfOwnershipService: snap '${snapId}' returned a malformed response to '${SNAP_SIGN_PROOF_OF_OWNERSHIP_METHOD}'.`,
      );
    }

    return response.signature;
  }
}
