# `@metamask/mfa-recovery-controller`

Manages MFA recovery flows across MetaMask clients. Auth and escrow storage are
injected so the same controller can run against different identity providers and
escrow backends.

Pending mutations are persisted as encoded encrypted `authorizing` / `writing`
state so a crash can `resume()` the same mutation. `abort()` drops `authorizing`
only; `writing` must `resume()`. The encoded ciphertext is stored as a string so
BaseController state serialization preserves the encrypted value.

## Recovery Lock

Supply `RecoveryRegistrationLockProvider` with the registration service URL and
a Hydra-token callback for the same profile. Call `acquireLock()` before reading
state or changing Auth identifiers, `renewLock()` before Auth writes after user
interaction, and `releaseLock()` after completion. The controller checks the lease
before escrow writes and blocks release while a mutation is pending.

Leases expire after five minutes without renewal. On renewal failure, reacquire
and reread state before continuing. Coordination is cooperative: expiry or Redis
loss cannot cancel in-flight writes.

## Installation

`yarn add @metamask/mfa-recovery-controller`

or

`npm install @metamask/mfa-recovery-controller`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
