# `@metamask/passkey-controller`

Manages passkey-based vault key protection using [WebAuthn](https://www.w3.org/TR/webauthn-3/). Orchestrates the full passkey lifecycle: generating WebAuthn ceremony options, verifying authenticator responses, and protecting/retrieving the vault encryption key via AES-256-GCM wrapping with HKDF-derived keys.

## Installation

`yarn add @metamask/passkey-controller`

or

`npm install @metamask/passkey-controller`

## Overview

The controller follows a two-phase ceremony pattern for unlock (authentication) and a three-step pattern for enrollment: registration options → post-registration authentication options → combined verify and protect.

1. **Generate options** — call a synchronous method that returns options JSON and records **in-flight ceremony** state (challenge-keyed; not a user login session).
2. **Verify response** — pass the authenticator's response back to the controller, which verifies the WebAuthn signature and performs the cryptographic operation (protect or retrieve the vault key).

For enrollment, the wrapping key is always derived from the **post-registration** `get()` response (same path as unlock), not from the `create()` response alone.

### Key derivation strategies

The controller supports two key derivation methods, selected automatically during enrollment:

| Strategy       | When used                                                                                                                                           | Input key material                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **PRF**        | Post-registration assertion includes non-empty [PRF extension](https://w3c.github.io/webauthn/#prf-extension) output and registration used PRF salt | PRF evaluation output from the assertion (ceremony `prfSalt` is stored on the record) |
| **userHandle** | Otherwise                                                                                                                                           | Random `userHandle` from registration (asserted on the post-registration `get()`)     |

Both strategies feed the input key material through **HKDF-SHA256** with the credential ID as salt and a fixed info string to produce the 32-byte AES-256 wrapping key.

## Usage

### Setting up the controller

The restricted messenger must allow the KeyringController actions listed in [Keyring integration](#keyring-integration). Onboarding completion is supplied via constructor callback (not via messenger).

```typescript
import { PasskeyController } from '@metamask/passkey-controller';
import type { PasskeyControllerMessenger } from '@metamask/passkey-controller';

const messenger: PasskeyControllerMessenger = /* create via root messenger */;

const controller = new PasskeyController({
  messenger,
  rpId: 'example.com',
  // Or multiple verification candidates: expectedRPID: ['a.example', 'b.example']
  expectedRPID: 'example.com',
  rpName: 'My Wallet',
  expectedOrigin: 'chrome-extension://abcdef1234567890',
  // Optional — both default to `rpName` when omitted.
  userName: 'My Wallet',
  userDisplayName: 'My Wallet',
  getIsOnboardingCompleted: () => onboardingController.state.completedOnboarding,
});
```

`expectedRPID` is a string or string array used to verify the authenticator `rpIdHash`. Optional `rpId`, when set, is sent as `rp.id` / `rpId` in generated WebAuthn options; when omitted, those fields are omitted so the client uses its default RP ID behavior.

### Passkey enrollment (registration)

`protectVaultKeyWithPasskey` fetches the current vault encryption key from KeyringController. When onboarding is complete, pass the wallet `password` for step-up verification first.

```typescript
// 1. Generate registration options (synchronous)
const regOptions = controller.generateRegistrationOptions();

// 2. Create the passkey in the browser
const regResponse = await navigator.credentials.create({
  publicKey: regOptions,
});

// 3. Post-registration authentication (same wrapping-key path as unlock)
const authOptions = controller.generatePostRegistrationAuthenticationOptions({
  registrationResponse: regResponse,
});
const authResponse = await navigator.credentials.get({
  publicKey: authOptions,
});

// 4. Verify registration + post-registration auth, then persist
await controller.protectVaultKeyWithPasskey({
  registrationResponse: regResponse,
  authenticationResponse: authResponse,
  password: settingsEnroll ? walletPassword : undefined,
});
```

### Passkey unlock (authentication)

Prefer `unlockWithPasskey`, which verifies the assertion and submits the vault key to KeyringController.

```typescript
const options = controller.generateAuthenticationOptions();
const response = await navigator.credentials.get({ publicKey: options });

await controller.unlockWithPasskey(response);
```

### Orchestrated product flows

These methods combine passkey verification with KeyringController calls. Use them from UI layers that already performed `navigator.credentials.get()`.

| Method                                  | Purpose                                                   |
| --------------------------------------- | --------------------------------------------------------- |
| `unlockWithPasskey`                     | Unlock keyring after passkey assertion                    |
| `removePasskeyWithPasskeyVerification`  | Remove passkey after assertion step-up                    |
| `removePasskeyWithPasswordVerification` | Remove passkey after password step-up                     |
| `changePasswordWithPasskeyVerification` | Change password; re-wrap vault key by default             |
| `exportSeedPhraseWithPasskey`           | Export SRP bytes after assertion step-up                  |
| `exportAccountsWithPasskey`             | Export private keys for addresses after assertion step-up |

```typescript
// Change password (re-wraps passkey protection by default)
await controller.changePasswordWithPasskeyVerification({
  newPassword: 'new-secret',
  authenticationResponse: response,
  options: { renewVaultKeyProtection: true },
});

// Export seed phrase (raw Uint8Array; format in your app layer)
const seedPhrase = await controller.exportSeedPhraseWithPasskey(
  response,
  keyringId,
);

// Export private keys for multiple addresses (one assertion)
const privateKeys = await controller.exportAccountsWithPasskey(response, [
  '0xabc…',
  '0xdef…',
]);
```

### Low-level methods

`retrieveVaultKeyWithPasskey` and `renewVaultKeyProtection` remain available for advanced composition. Prefer the orchestrated methods above for standard product flows. Use `clearState` for wallet reset lifecycle.

### Checking enrollment and removing a passkey

```typescript
controller.isPasskeyEnrolled(); // boolean

await controller.removePasskeyWithPasskeyVerification(response);
await controller.removePasskeyWithPasswordVerification(password);

controller.clearState(); // persisted reset + clears in-flight ceremony state; use for app lifecycle (e.g. wallet reset)
```

### Selectors

For Redux selectors and other code paths without access to the controller
instance, use the exported selector(s):

```typescript
import { passkeyControllerSelectors } from '@metamask/passkey-controller';

passkeyControllerSelectors.selectIsPasskeyEnrolled(state); // boolean
```

### Errors

`PasskeyControllerError` is thrown for controller failures. Expected operational
cases use a stable `code` from `PasskeyControllerErrorCode` (for example:
`not_enrolled`, `already_enrolled`, `no_registration_ceremony`,
`authentication_verification_failed`, `missing_key_material`, `vault_key_decryption_failed`,
`vault_key_mismatch`, `vault_key_renewal_failed`). Human-readable strings
live on `PasskeyControllerErrorMessage`. Use `instanceof PasskeyControllerError`
and a defined `error.code` to tell these apart from malformed WebAuthn payloads
and other `Error` values. Thrown errors from the internal WebAuthn verify helpers
are also surfaced as `PasskeyControllerError` with the same `registration_verification_failed`
or `authentication_verification_failed` code and the original error as `cause`.
`verifyPasskeyAuthentication` returns `false` only for
those controller errors (with `code`) and rethrows everything else.

## API

### State

| Property        | Type                    | Description                                                                                   |
| --------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `passkeyRecord` | `PasskeyRecord \| null` | Enrolled passkey credential data and encrypted vault key. `null` when no passkey is enrolled. |

### Messenger actions

| Action                                                            | Purpose                                    |
| ----------------------------------------------------------------- | ------------------------------------------ |
| `PasskeyController:getState`                                      | Persisted `passkeyRecord`                  |
| `PasskeyController:isPasskeyEnrolled`                             | Enrollment boolean                         |
| `PasskeyController:generateRegistrationOptions`                   | WebAuthn `create()` options                |
| `PasskeyController:generatePostRegistrationAuthenticationOptions` | WebAuthn `get()` after `create()`          |
| `PasskeyController:generateAuthenticationOptions`                 | WebAuthn `get()` for unlock / step-up      |
| `PasskeyController:protectVaultKeyWithPasskey`                    | Enroll: verify ceremonies + wrap vault key |
| `PasskeyController:retrieveVaultKeyWithPasskey`                   | Verify assertion + return vault key        |
| `PasskeyController:unlockWithPasskey`                             | Unlock keyring via passkey                 |
| `PasskeyController:exportSeedPhraseWithPasskey`                   | Export SRP after passkey step-up           |
| `PasskeyController:exportAccountsWithPasskey`                     | Export private keys after passkey step-up  |
| `PasskeyController:verifyPasskeyAuthentication`                   | Boolean assertion verification             |
| `PasskeyController:renewVaultKeyProtection`                       | Re-wrap vault key after rotation           |
| `PasskeyController:changePasswordWithPasskeyVerification`         | Change password with passkey step-up       |
| `PasskeyController:removePasskeyWithPasskeyVerification`          | Remove passkey after assertion step-up     |
| `PasskeyController:removePasskeyWithPasswordVerification`         | Remove passkey after password step-up      |
| `PasskeyController:clearState`                                    | Reset state                                |
| `PasskeyController:destroy`                                       | Tear down messenger + ceremony state       |

Corresponding `PasskeyController*Action` types are exported from the package entry point.

For derived enrollment status outside of components that hold a controller
reference, use `passkeyControllerSelectors.selectIsPasskeyEnrolled` (see
[Selectors](#selectors)).

### Messenger events

| Event                            | Payload                                                      |
| -------------------------------- | ------------------------------------------------------------ |
| `PasskeyController:stateChanged` | Emitted when state changes (standard `BaseController` event) |

### Keyring integration

`PasskeyController` calls these KeyringController actions during orchestrated flows. Allow them on the restricted messenger at init:

| Messenger action                        |
| --------------------------------------- |
| `KeyringController:verifyPassword`      |
| `KeyringController:exportEncryptionKey` |
| `KeyringController:submitEncryptionKey` |
| `KeyringController:changePassword`      |
| `KeyringController:exportSeedPhrase`    |
| `KeyringController:exportAccount`       |

Onboarding completion is **not** read via messenger. Pass `getIsOnboardingCompleted` in the constructor (see [Setting up the controller](#setting-up-the-controller)).

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
