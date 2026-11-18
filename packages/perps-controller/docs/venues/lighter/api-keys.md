# Lighter trading keys

Your Ethereum address owns your Lighter account. Orders use a separate trading key registered with Lighter in a numbered API-key slot. `LighterProvider` selects the slot and registers the key. The client's `LighterSignerBridge` creates and stores keys and reports which slots it can recover; Core never receives a private key.

Key derivation, key storage and Mobile's env variables are in [metamask-mobile/docs/perps/lighter-api-keys.md](https://github.com/MetaMask/metamask-mobile/blob/main/docs/perps/lighter-api-keys.md).

## Config

| Input                  | Source                                                                   | Default                             |
| ---------------------- | ------------------------------------------------------------------------ | ----------------------------------- |
| Preferred slot         | `providerCredentials.lighter.apiKeyIndex`                                | 7 (`LIGHTER_DEFAULT_API_KEY_INDEX`) |
| Trading slots          | `LIGHTER_MIN_TRADING_API_KEY_INDEX`, `LIGHTER_MAX_TRADING_API_KEY_INDEX` | 2 to 254                            |
| Account index override | `providerCredentials.lighter.accountIndexTestnet`, `accountIndexMainnet` | Discovered from the address         |

- Without an override, `#ensureAccountIndex` reads `getAccountsByL1Address` and takes the sub-account with the lowest index.
- An override or discovered account must be a Standard account owned by the selected address. Anything else is refused.
- With no `signerBridge`, the provider is read-only.

Code: `src/constants/lighterConfig.ts` `LIGHTER_DEFAULT_API_KEY_INDEX`, `LIGHTER_MIN_TRADING_API_KEY_INDEX`, `LIGHTER_MAX_TRADING_API_KEY_INDEX`; `src/types/index.ts` `LighterCredentials`; `src/providers/LighterProvider.ts` `#ensureAccountIndex`, `#assertStandardAccount`, `#assertAccountOwnership`.

## Slot selection

`#signerCandidates` builds the ordered list of slots to try.

1. A pending registration pins the list to its slot.
2. A bridge with neither `getRecoverableKeyIndices` nor `getStoredKeyIndices` gets the preferred slot only.
3. Otherwise the provider reads the venue's registered keys (`getApiKeys`) and asks the bridge which of the preferred and occupied slots in 2 to 254 it can recover. `getRecoverableKeyIndices` wins when both hooks exist.
4. The list is recoverable occupied slots, recoverable free slots, the preferred slot if free, then every other free slot. Wallet-derived recovery keeps free slots in order; storage-only discovery starts them at a random offset.
5. When the bridge recovers nothing, the preferred slot is occupied and a free slot exists, setup stops with "No recoverable Lighter trading key is available from this wallet or local storage. Use an existing registered device."

With a discovery-capable bridge, a preferred slot outside 2 to 254 drops out of the list without an error.

Code: `src/providers/LighterProvider.ts` `#signerCandidates`; `src/types/lighter-types.ts` `LighterSignerBridge.getRecoverableKeyIndices`, `getStoredKeyIndices`.

## Recovery and reuse

`#setupSignerForAccount` runs under a process mutex per network and account. For each candidate it creates the bridge client and compares its public key with the venue (`#venueKeyStatus`).

| Venue slot                           | Action                                                   |
| ------------------------------------ | -------------------------------------------------------- |
| Holds this device's key (`matching`) | Reuse it; no registration and no new slot                |
| Empty (`available`)                  | Register this key                                        |
| Holds a different key (`occupied`)   | Skip it. Another device or application may still use it. |

A bridge without recovery hooks that meets an occupied slot fails with a reconnect hint. When every candidate is skipped, setup fails with "No available Lighter trading key slot. Remove an unused API key in Lighter, then reconnect."

Code: `src/providers/LighterProvider.ts` `#setupSigner`, `#setupSignerForAccount`, `#venueKeyStatus`.

## Registration

1. The bridge's `ChangePubKey` plaintext is signed by the Ethereum wallet with `personal_sign` (EIP-191), then the bridge signs the L2 transaction.
2. With a recovery-capable bridge (`getRecoverableKeyIndices` or `getStoredKeyIndices`), the pending registration (slot, public key, tx hash, nonce, expiry) is written to `diskCache` before dispatch.
3. Such a bridge then waits in `#waitForRegisteredKey`, which polls the venue every 250 ms for up to 10 s until the slot shows this key. A different key fails setup. A timeout returns "Lighter trading key registration is still pending; reconnect to check its status".
4. On reconnect the pending slot is checked first. A matching key clears the record. A failed or expired unsent transaction clears it. Otherwise it stays pending.

A bridge without those hooks submits the transaction directly, with no pending record and no visibility wait.

Code: `src/providers/LighterProvider.ts` `#registerVenueKey`, `#waitForRegisteredKey`, `#loadPendingKeyRegistration`, `#reconcilePendingKeyRegistration`; `src/constants/lighterConfig.ts` `LIGHTER_KEY_REGISTRATION_VISIBILITY_TIMEOUT_MS`, `LIGHTER_KEY_REGISTRATION_VISIBILITY_POLL_MS`.
