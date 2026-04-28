# `@metamask/passkey-controller`

WebAuthn passkey support for protecting a vault encryption key: ceremony options, assertion verification, and AES-256-GCM wrapping with HKDF-derived keys.

## Installation

`yarn add @metamask/passkey-controller`

or

`npm install @metamask/passkey-controller`

## Overview

Two-phase flow for enrollment and authentication:

1. **Generate options** — synchronous call returns WebAuthn options JSON and stores **in-flight ceremony** state (challenge-keyed; not a login session).
2. **Complete ceremony** — pass the authenticator response to the controller to verify the assertion and protect or unwrap the vault key.

### Key derivation

Enrollment picks PRF or `userHandle` automatically from the registration result:

| Strategy       | When used                                                                                          | Input key material                            |
| -------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **PRF**        | Authenticator supports the [WebAuthn PRF extension](https://w3c.github.io/webauthn/#prf-extension) | PRF evaluation output                         |
| **userHandle** | PRF output absent                                                                                  | Random `userHandle` from registration options |

HKDF-SHA256 uses the verified credential id as salt and info label `metamask:passkey:encryption-key:v1` for the 32-byte AES-256 wrapping key.

## Usage

### Setting up the controller

```typescript
import { PasskeyController } from '@metamask/passkey-controller';
import type { PasskeyControllerMessenger } from '@metamask/passkey-controller';

const messenger: PasskeyControllerMessenger = /* create via root messenger */;

const controller = new PasskeyController({
  messenger,
  rpID: 'example.com',
  rpName: 'My Wallet',
  expectedOrigin: 'chrome-extension://abcdef1234567890',
  userName: 'My Wallet',
  userDisplayName: 'My Wallet',
});
```

`expectedOrigin` may be `string` or `string[]`. Optional `state` is merged with **`getDefaultPasskeyControllerState()`** when rehydrating. Call **`destroy()`** when disposing the controller so in-flight ceremonies are cleared. See [Constructor](#constructor) for the full argument list.

### Passkey enrollment (registration)

```typescript
const options = controller.generateRegistrationOptions();
const response = await navigator.credentials.create({ publicKey: options });

await controller.protectVaultKeyWithPasskey({
  registrationResponse: response,
  vaultKey: myVaultEncryptionKey,
});
```

Use **`generateRegistrationOptions({ prfAvailable: false })`** to skip the PRF extension (e.g. tests or environments without PRF).

### Passkey unlock (authentication)

```typescript
const options = controller.generateAuthenticationOptions();
const response = await navigator.credentials.get({ publicKey: options });

const vaultKey = await controller.retrieveVaultKeyWithPasskey(response);
```

### Password change (vault key renewal)

`renewVaultKeyProtection` does not verify the WebAuthn assertion. Call **`verifyPasskeyAuthentication`** or **`retrieveVaultKeyWithPasskey`** on the **same** `response` first so the signature, challenge, origin, and counter are checked and the authentication ceremony is consumed.

```typescript
const options = controller.generateAuthenticationOptions();
const response = await navigator.credentials.get({ publicKey: options });

if (!(await controller.verifyPasskeyAuthentication(response))) {
  throw new Error('Passkey verification failed');
}

await controller.renewVaultKeyProtection({
  authenticationResponse: response,
  oldVaultKey: currentVaultKey,
  newVaultKey: newVaultKey,
});
```

### Enrollment status and lifecycle

```typescript
controller.isPasskeyEnrolled(); // boolean

controller.removePasskey(); // unenroll: clears passkey + in-flight ceremonies
controller.clearState(); // same as `removePasskey()` (wallet reset naming)

controller.destroy(); // ceremonies + BaseController teardown
```

### Selectors

```typescript
import { passkeyControllerSelectors } from '@metamask/passkey-controller';

passkeyControllerSelectors.selectIsPasskeyEnrolled(state); // `state`: `PasskeyControllerState` slice
```

### Errors

Handle failures with **`instanceof PasskeyControllerError`** and **`error.code`** from **`PasskeyControllerErrorCode`** (not raw `message` strings). Codes include `not_enrolled`, `no_registration_ceremony`, `registration_verification_failed`, `no_authentication_ceremony`, `authentication_verification_failed`, `missing_key_material`, `vault_key_decryption_failed`, and `vault_key_mismatch`. Human-readable text is on **`PasskeyControllerErrorMessage`**. Verification failures from internal WebAuthn helpers are wrapped with `registration_verification_failed` or `authentication_verification_failed` and **`cause`**.

**`verifyPasskeyAuthentication`** delegates to **`retrieveVaultKeyWithPasskey`**. It returns **`false`** when that throws a `PasskeyControllerError` with a defined **`code`**; any other throw is propagated.

## API

### Constructor

| Argument          | Type                              | Required | Description                                            |
| ----------------- | --------------------------------- | -------- | ------------------------------------------------------ |
| `messenger`       | `PasskeyControllerMessenger`      | Yes      | Messenger for this controller.                         |
| `rpID`            | `string`                          | Yes      | WebAuthn relying party ID.                             |
| `rpName`          | `string`                          | Yes      | Human-readable RP name in the OS UI.                   |
| `expectedOrigin`  | `string \| string[]`              | Yes      | Allowed `clientDataJSON.origin` value(s).              |
| `userName`        | `string`                          | No       | Registration `user.name`; defaults to `rpName`.        |
| `userDisplayName` | `string`                          | No       | Registration `user.displayName`; defaults to `rpName`. |
| `state`           | `Partial<PasskeyControllerState>` | No       | Merged with `getDefaultPasskeyControllerState()`.      |

### State

| Property        | Type                    | Description                                                     |
| --------------- | ----------------------- | --------------------------------------------------------------- |
| `passkeyRecord` | `PasskeyRecord \| null` | Credential metadata and encrypted vault key, or `null` if none. |

### Messenger

| Kind   | Name                             | Notes                                   |
| ------ | -------------------------------- | --------------------------------------- |
| Action | `PasskeyController:getState`     | Current controller state.               |
| Event  | `PasskeyController:stateChanged` | Standard `BaseController` state change. |

## Contributing

This package is part of a monorepo. See the [monorepo README](https://github.com/MetaMask/core#readme).
