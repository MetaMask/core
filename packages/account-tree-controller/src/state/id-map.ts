import type { AccountGroupId, AccountWalletId } from '@metamask/account-api';

import type {
  AccountGroupPayloadId,
  AccountWalletPayloadId,
} from './payload.js';

type LocalId = AccountWalletId | AccountGroupId;
type PayloadId = AccountWalletPayloadId | AccountGroupPayloadId;

/**
 * Bidirectional map between local controller IDs and portable payload IDs.
 */
export class IdMap {
  readonly #localToPayload: Map<LocalId, PayloadId> = new Map();

  readonly #payloadToLocal: Map<PayloadId, LocalId> = new Map();

  constructor(entries: [localId: LocalId, payloadId: PayloadId][] = []) {
    for (const [localId, payloadId] of entries) {
      this.add(localId, payloadId);
    }
  }

  add(localId: LocalId, payloadId: PayloadId): void {
    this.#localToPayload.set(localId, payloadId);
    this.#payloadToLocal.set(payloadId, localId);
  }

  getPayloadId(localId: LocalId): PayloadId | undefined {
    return this.#localToPayload.get(localId);
  }

  getLocalId(payloadId: PayloadId): LocalId | undefined {
    return this.#payloadToLocal.get(payloadId);
  }
}
