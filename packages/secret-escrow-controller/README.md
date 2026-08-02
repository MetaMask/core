# `@metamask/secret-escrow-controller`

Controller that orchestrates WebAuthn-gated secret escrow enrollment and
export for social-login passkey recovery.

Persists only public factor metadata. Secrets from `enroll` /
`completeExport` must be consumed immediately by the caller (for example to
wrap a wallet password) and cleared from memory.

## Installation

`yarn add @metamask/secret-escrow-controller`

or

`npm install @metamask/secret-escrow-controller`

## Usage

```typescript
import { Messenger } from '@metamask/messenger';
import { MockSecretEscrowClient } from '@metamask/secret-escrow-client';
import {
  SecretEscrowController,
  type SecretEscrowControllerMessenger,
} from '@metamask/secret-escrow-controller';

const messenger: SecretEscrowControllerMessenger = /* create via root messenger */;

const controller = new SecretEscrowController({
  messenger,
  client: new MockSecretEscrowClient(), // replace with real client later
});

const secret = await controller.enroll({
  userId: 'social-user-id',
  factorId: 'passkey',
  factor: {
    type: 'webauthn',
    rpId: 'example.com',
    origins: ['chrome-extension://abcdef'],
    credentialId: '<base64url>',
    publicKey: { kty: 'EC', crv: 'P-256', x: '...', y: '...' },
  },
});
// wrap password with `secret`, then clear it

const { challenge } = await controller.startExport();
// WebAuthn get() with challenge...
const released = await controller.completeExport({
  id: '<credential-id>',
  challenge,
});
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found
in the [monorepo README](https://github.com/MetaMask/core#readme).
