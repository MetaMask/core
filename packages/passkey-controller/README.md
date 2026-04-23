# `@metamask/passkey-controller`

Manages passkey-based vault key protection using [WebAuthn](https://www.w3.org/TR/webauthn-3/). Orchestrates the full passkey lifecycle: generating WebAuthn ceremony options, verifying authenticator responses, and protecting/retrieving the vault encryption key via AES-256-GCM wrapping with HKDF-derived keys.

## Installation

`yarn add @metamask/passkey-controller`

or

`npm install @metamask/passkey-controller`

## Overview

The controller follows a two-phase ceremony pattern for both enrollment and authentication:

1. **Generate options** — call a synchronous method that returns options JSON and records **in-flight ceremony** state (challenge-keyed; not a user login session).
2. **Verify response** — pass the authenticator's response back to the controller, which verifies the WebAuthn signature and performs the cryptographic operation (protect or retrieve the vault key).

### Key derivation strategies

The controller supports two key derivation methods, selected automatically during enrollment:

| Strategy       | When used                                                                                          | Input key material                                |
| -------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **PRF**        | Authenticator supports the [WebAuthn PRF extension](https://w3c.github.io/webauthn/#prf-extension) | PRF evaluation output                             |
| **userHandle** | PRF is unavailable                                                                                 | Random `userHandle` generated during registration |

Both strategies feed the input key material through **HKDF-SHA256** with the credential ID as salt and a fixed info string to produce the 32-byte AES-256 wrapping key.

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
  // Optional — both default to `rpName` when omitted.
  userName: 'My Wallet',
  userDisplayName: 'My Wallet',
});
```

### Passkey enrollment (registration)

```typescript
// 1. Generate registration options (synchronous)
const options = controller.generateRegistrationOptions();

// 2. Pass options to the browser WebAuthn API
const response = await navigator.credentials.create({ publicKey: options });

// 3. Verify and protect the vault key
await controller.protectVaultKeyWithPasskey({
  registrationResponse: response,
  vaultKey: myVaultEncryptionKey,
});
```

### Passkey unlock (authentication)

```typescript
// 1. Generate authentication options (synchronous)
const options = controller.generateAuthenticationOptions();

// 2. Pass options to the browser WebAuthn API
const response = await navigator.credentials.get({ publicKey: options });

// 3. Verify and retrieve the vault key
const vaultKey = await controller.retrieveVaultKeyWithPasskey(response);
```

### Password change (vault key renewal)

```typescript
const options = controller.generateAuthenticationOptions();
const response = await navigator.credentials.get({ publicKey: options });

await controller.renewVaultKeyProtection({
  authenticationResponse: response,
  oldVaultKey: currentVaultKey,
  newVaultKey: newVaultKey,
});
```

### Checking enrollment and removing a passkey

```typescript
controller.isPasskeyEnrolled(); // boolean

controller.removePasskey(); // user-facing unenroll; clears persisted passkey and in-flight ceremonies

controller.clearState(); // same persisted reset + clears in-flight ceremony state; use for app lifecycle (e.g. wallet reset)
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
`not_enrolled`, `no_registration_ceremony`, `authentication_verification_failed`,
`missing_key_material`, `vault_key_decryption_failed`). Human-readable strings
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

| Action                       | Handler                              |
| ---------------------------- | ------------------------------------ |
| `PasskeyController:getState` | Returns the current controller state |

For derived enrollment status outside of components that hold a controller
reference, use `passkeyControllerSelectors.selectIsPasskeyEnrolled` (see
[Selectors](#selectors)).

### Messenger events

| Event                            | Payload                                                      |
| -------------------------------- | ------------------------------------------------------------ |
| `PasskeyController:stateChanged` | Emitted when state changes (standard `BaseController` event) |

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
