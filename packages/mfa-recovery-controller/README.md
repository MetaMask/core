# `@metamask/mfa-recovery-controller`

Manages MFA recovery flows across MetaMask clients. Auth and escrow storage are
injected so the same controller can run against different identity providers and
escrow backends.

Pending mutations are persisted as encoded encrypted `authorizing` / `writing`
state so a crash can `resume()` the same mutation. `abort()` is allowed only
before the first escrow write. The encoded ciphertext is stored as a string so
BaseController state serialization preserves the encrypted value.

## Installation

`yarn add @metamask/mfa-recovery-controller`

or

`npm install @metamask/mfa-recovery-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
