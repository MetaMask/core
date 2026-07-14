import type {
  PasskeyAuthenticationCeremony,
  PasskeyRegistrationCeremony,
} from './types';

/** WebAuthn `timeout` for credential creation and assertion (ms). */
export const WEBAUTHN_TIMEOUT_MS = 60_000;

/**
 * Extra allowance beyond {@link WEBAUTHN_TIMEOUT_MS} before in-memory
 * ceremony state is discarded (covers slow UX, multi-step enrollment, and
 * clock skew).
 */
export const CEREMONY_TTL_SLACK_MS = 120_000;

/**
 * Maximum age for in-flight registration or authentication ceremony state
 * (between options and verified response). This bounds the lifetime of a
 * single WebAuthn ceremony only; it is not a user login session timeout.
 */
export const CEREMONY_MAX_AGE_MS = WEBAUTHN_TIMEOUT_MS + CEREMONY_TTL_SLACK_MS;

/**
 * Upper bound on concurrent in-memory ceremonies per flow type (registration
 * vs authentication), for abuse / leak protection.
 */
export const MAX_CONCURRENT_PASSKEY_CEREMONIES = 16;

type CeremonyFlow = 'registration' | 'authentication';

/**
 * In-memory store for in-flight WebAuthn ceremonies (registration vs authentication),
 * keyed by base64url challenge. Enforces TTL and a per-flow size cap; not user session state.
 */
export class CeremonyManager {
  readonly #registrationMap = new Map<string, PasskeyRegistrationCeremony>();

  readonly #authenticationMap = new Map<
    string,
    PasskeyAuthenticationCeremony
  >();

  /**
   * Challenge-keyed map for prune/capacity helpers.
   *
   * @param ceremonyType - Which in-flight ceremony map to use.
   * @returns The registration or authentication ceremony map for the given flow.
   */
  #getMap(
    ceremonyType: CeremonyFlow,
  ): Map<string, PasskeyRegistrationCeremony | PasskeyAuthenticationCeremony> {
    return ceremonyType === 'registration'
      ? this.#registrationMap
      : this.#authenticationMap;
  }

  #pruneExpired(ceremonyType: CeremonyFlow): void {
    const now = Date.now();
    const map = this.#getMap(ceremonyType);
    for (const [key, ceremony] of map) {
      if (now - ceremony.createdAt > CEREMONY_MAX_AGE_MS) {
        map.delete(key);
      }
    }
  }

  /**
   * Removes the oldest entry (by `createdAt`) until size is below the cap.
   *
   * @param ceremonyType - Which in-flight ceremony map to evict from.
   */
  #enforceCapacity(ceremonyType: CeremonyFlow): void {
    const map = this.#getMap(ceremonyType);
    while (map.size >= MAX_CONCURRENT_PASSKEY_CEREMONIES) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      for (const [mapKey, ceremony] of map) {
        if (ceremony.createdAt < oldestTime) {
          oldestTime = ceremony.createdAt;
          oldestKey = mapKey;
        }
      }
      if (oldestKey === undefined) {
        break;
      }
      map.delete(oldestKey);
    }
  }

  /**
   * Records registration ceremony state after pruning expired rows and evicting oldest if at cap.
   *
   * @param challenge - Same base64url challenge as in the creation options `challenge` field.
   * @param ceremony - Payload to retrieve when the registration response returns.
   */
  saveRegistrationCeremony(
    challenge: string,
    ceremony: PasskeyRegistrationCeremony,
  ): void {
    this.#pruneExpired('registration');
    this.#enforceCapacity('registration');
    this.#registrationMap.set(challenge, ceremony);
  }

  /**
   * Records authentication ceremony state after pruning expired rows and evicting oldest if at cap.
   *
   * @param challenge - Same base64url challenge as in the request options `challenge` field.
   * @param ceremony - Payload to retrieve when the assertion response returns.
   */
  saveAuthenticationCeremony(
    challenge: string,
    ceremony: PasskeyAuthenticationCeremony,
  ): void {
    this.#pruneExpired('authentication');
    this.#enforceCapacity('authentication');
    this.#authenticationMap.set(challenge, ceremony);
  }

  /**
   * Returns registration ceremony for a challenge, pruning expired entries on this map first.
   *
   * @param challenge - Base64url challenge from decoded `clientDataJSON` (matches stored key).
   * @returns Stored ceremony, or `undefined` if none or expired.
   */
  getRegistrationCeremony(
    challenge: string,
  ): PasskeyRegistrationCeremony | undefined {
    this.#pruneExpired('registration');
    return this.#registrationMap.get(challenge);
  }

  /**
   * Returns authentication ceremony for a challenge, pruning expired entries on this map first.
   *
   * @param challenge - Base64url challenge from decoded `clientDataJSON` (matches stored key).
   * @returns Stored ceremony, or `undefined` if none or expired.
   */
  getAuthenticationCeremony(
    challenge: string,
  ): PasskeyAuthenticationCeremony | undefined {
    this.#pruneExpired('authentication');
    return this.#authenticationMap.get(challenge);
  }

  /**
   * Removes a registration ceremony by challenge.
   *
   * @param challenge - Map key for the ceremony to remove.
   * @returns Whether an entry was deleted.
   */
  deleteRegistrationCeremony(challenge: string): boolean {
    return this.#registrationMap.delete(challenge);
  }

  /**
   * Removes an authentication ceremony by challenge.
   *
   * @param challenge - Map key for the ceremony to remove.
   * @returns Whether an entry was deleted.
   */
  deleteAuthenticationCeremony(challenge: string): boolean {
    return this.#authenticationMap.delete(challenge);
  }

  /** Drops all in-flight registration and authentication ceremonies. */
  clear(): void {
    this.#registrationMap.clear();
    this.#authenticationMap.clear();
  }
}
