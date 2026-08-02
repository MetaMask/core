# `@metamask/secret-escrow-client`

Client SDK for a WebAuthn-gated secret escrow service used to recover
social-login wallets when passkey PRF is unavailable (or as a general passkey
recovery path).

## Protocol

1. **register** — store a WebAuthn factor + escrow a 32-byte secret
2. **exportInit** — issue a challenge for `navigator.credentials.get()`
3. **exportComplete** — verify the assertion and release the secret

Release must require a valid factor assertion — never OAuth / bearer token alone.

## Mock backend

`MockSecretEscrowClient` is an in-memory implementation for tests and local
development. It mirrors the CubeSigner C2F `register` / `export_init` /
`export_complete` flow but only checks credential id + challenge (no
cryptographic signature verify).

## Installation

`yarn add @metamask/secret-escrow-client`

or

`npm install @metamask/secret-escrow-client`

## Usage

```typescript
import { MockSecretEscrowClient } from '@metamask/secret-escrow-client';

const client = new MockSecretEscrowClient();

const { secret } = await client.register({
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
// wrap wallet password with `secret`, then clear it

const { challenge } = await client.exportInit({
  userId: 'social-user-id',
  factorId: 'passkey',
});
// run WebAuthn get() with `challenge`

const { secret: released } = await client.exportComplete({
  userId: 'social-user-id',
  factorId: 'passkey',
  assertion: { id: '<credential-id>', challenge },
});
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found
in the [monorepo README](https://github.com/MetaMask/core#readme).
