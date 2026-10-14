# `@metamask/snap-account-service`

Service for Account Management Snaps

## Overview

`SnapAccountService` centralizes common operations around Snap-based account management, providing a single integration point for:

- **Migration** — Migrates accounts from the legacy monolithic v1 Snap keyring to per-Snap v2 keyrings. The migration runs once at initialization and is safe for concurrent callers (subsequent calls await the same promise).
- **Readiness** — Ensures a Snap is fully ready for account operations before proceeding: migration is complete, a v2 keyring exists for the Snap, and the Snap platform itself is initialized.
- **Keyring message handling** — Routes messages from Snap keyrings to the appropriate per-Snap keyring instance, including lazy keyring creation for event-driven v1 flows.

The service exposes its functionality through the MetaMask messenger pattern and depends on `KeyringController` and `SnapController`.

## Installation

`yarn add @metamask/snap-account-service`

or

`npm install @metamask/snap-account-service`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
