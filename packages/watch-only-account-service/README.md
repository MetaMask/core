# `@metamask/watch-only-account-service`

Service for managing watch-only accounts

## Overview

`WatchOnlyAccountService` centralizes the creation of watch-only accounts, providing a single integration point for:

- **Account creation** — Imports an EVM account by address into the `"watch-only"` keyring. No secret material is ever involved, and the resulting account cannot sign. Resolving the corresponding internal account and selecting it is left to the client.
- **Keyring plumbing** — Atomically creates the watch-only keyring if it does not exist yet.
- **Feature gating** — Takes an `enabled` flag at construction time (typically a compile-time dev-mode flag) and refuses to create accounts while disabled.

The service exposes its functionality through the MetaMask messenger pattern and depends on the `KeyringController`.

## Installation

`yarn add @metamask/watch-only-account-service`

or

`npm install @metamask/watch-only-account-service`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
