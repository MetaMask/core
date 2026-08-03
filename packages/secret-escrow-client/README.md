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

### File-backed HTTP mock (wipe / rehydration)

For Social + Passkey recovery across wallet wipe, run the persistent mock:

```sh
yarn mock-server
# listens on http://127.0.0.1:8787
# store: ./.secret-escrow-mock.json (override with SECRET_ESCROW_MOCK_STORE)
```

Point the extension at it via `.metamaskrc`:

```
SECRET_ESCROW_URL=http://127.0.0.1:8787
```

`HttpSecretEscrowClient` talks to this API. Enrollment also stores the wrapped
password on the mock so `hydrateFromRemote` can restore local state after wipe.

### Portable zip for testers (no git)

```sh
yarn mock-server:pack
# → mock-server/secret-escrow-mock-server.zip
```

Testers unzip and run `node server.mjs` (or `start.command` / `start.bat`).
Only Node.js is required.

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
