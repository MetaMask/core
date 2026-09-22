# `@metamask/profile-sync-controller`

The profile sync controller helps developers synchronize data across multiple clients and devices in a privacy-preserving way. All data saved in the user storage database is encrypted client-side to preserve privacy. The user storage provides a modular design, giving developers the flexibility to construct and manage their storage spaces in a way that best suits their needs

## Installation

`yarn add @metamask/profile-sync-controller`

or

`npm install @metamask/profile-sync-controller`

## Usage

You can import the controllers via the main npm path.

```ts
import { ... } from '@metamask/profile-sync-controller'
```

This package also uses subpath exports, which help minimize the amount of code you wish to import. It also helps keep specific modules isolated, and can be used to import specific code (e.g. mocks). You can see all the exports in the [`package.json`](./package.json), but here are a few.

Importing specific controllers/modules:

```ts
// Import the AuthenticationController and access its types/utilities
import { ... } from '@metamask/profile-sync-controller/auth'

// Import the UserStorageController and access its types/utilities
import { ... } from '@metamask/profile-sync-controller/user-storage'

// Import the profile-sync SDK and access its types/utilities
import { ... } from '@metamask/profile-sync-controller/sdk'
```

Importing mock creation functions:

```ts
// Import and use mock creation functions (designed to mirror the actual types).
// Useful for testing or Storybook development.
import { ... } from '@metamask/profile-sync-controller/auth/mocks'
import { ... } from '@metamask/profile-sync-controller/user-storage/mocks'
```

## Multi-factor authentication

`AuthenticationController` exposes UI-independent primitives for passkey and
email OTP enrollment and step-up verification:

- `refreshEnrolledCredentials()` refreshes the in-memory credential list.
- `beginCredentialEnrollment()` and `completeCredentialEnrollment()` surround
  a client-owned passkey ceremony or email-code screen.
- `beginStepUp()` and `completeStepUp()` verify an enrolled credential and
  return an elevated profile token.
- `getElevatedProfileToken()` reuses a live elevated session when it satisfies
  the caller's freshness requirement; `clearStepUpSession()` clears it.

Clients must retain the challenge `flowId`, perform the platform ceremony, and
send the resulting proof to the matching completion method. OTP codes,
passkey results, and elevated tokens are never persisted in controller state.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
