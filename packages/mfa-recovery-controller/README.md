# `@metamask/mfa-recovery-controller`

Manages MFA recovery flows across MetaMask clients. Auth and escrow storage are
injected so the same controller can run against different identity providers and
escrow backends.

Pending mutations are persisted as encrypted `authorizing` / `writing` state so
a crash can `resume()` the same mutation. `abort()` is allowed only before the
first escrow write.

## Installation

`yarn add @metamask/mfa-recovery-controller`

or

`npm install @metamask/mfa-recovery-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
