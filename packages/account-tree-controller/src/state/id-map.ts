import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';

import type {
  AccountGroupPayloadId,
  AccountWalletPayloadId,
} from './payload.js';

type LocalId = AccountWalletId | AccountGroupId;
type PayloadId = AccountWalletPayloadId | AccountGroupPayloadId;

/**
 * Bidirectional map between local controller IDs and portable payload IDs.
 *
 * Populated during {@link exportState} so that callers can bridge between
 * device-local wallet/group IDs and the stable cross-device IDs that appear
 * in a serialized {@link AccountTreePayload}.
 */
export class IdMap {
  readonly #localToPayload: Map<LocalId, PayloadId> = new Map();

  readonly #payloadToLocal: Map<PayloadId, LocalId> = new Map();

  /**
   * @param entries - Optional seed pairs `[localId, payloadId]` to pre-populate the map.
   */
  constructor(entries: [localId: LocalId, payloadId: PayloadId][] = []) {
    for (const [localId, payloadId] of entries) {
      this.add(localId, payloadId);
    }
  }

  /**
   * Registers a local↔payload ID pair.
   *
   * @param localId - Local controller wallet or group ID.
   * @param payloadId - Corresponding portable payload ID.
   */
  add(localId: LocalId, payloadId: PayloadId): void {
    this.#localToPayload.set(localId, payloadId);
    this.#payloadToLocal.set(payloadId, localId);
  }

  /**
   * Returns the portable payload ID for a given local ID.
   *
   * @param localId - Local controller wallet or group ID.
   * @returns The payload ID, or `undefined` if not registered.
   */
  getPayloadId(localId: LocalId): PayloadId | undefined {
    return this.#localToPayload.get(localId);
  }

  /**
   * Returns the local controller ID for a given payload ID.
   *
   * @param payloadId - Portable payload ID.
   * @returns The local wallet or group ID, or `undefined` if not registered.
   */
  getLocalId(payloadId: PayloadId): LocalId | undefined {
    return this.#payloadToLocal.get(payloadId);
  }
}
