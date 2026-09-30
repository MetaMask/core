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
email OTP enrollment and verification:

- `refreshEnrolledCredentials()` refreshes the in-memory credential list.
- `beginCredentialEnrollment()` and `completeCredentialEnrollment()` surround
  a client-owned passkey ceremony or email-code screen. Once the profile has a
  credential that proves AAL2, the server requires an AAL2 token to begin
  enrolling another one: `beginCredentialEnrollment()` sends the verification
  token only while a session younger than `ENROLLMENT_MAX_SESSION_AGE_MS`
  (2 minutes) is live, and the server otherwise rejects it with
  `aal2_required`, so clients should verify an existing credential and retry.
  The controller never inspects the token's assurance level; the server
  decides. A setup flow that proved a factor itself can pass
  `maxSessionAgeMs` (for example, the time since the flow started) so chained
  enrollments reuse that proof. Enrollment does not end the session.
- `beginCredentialVerification()` and `completeCredentialVerification()`
  verify an enrolled credential and return a verification token.
- `getVerificationToken()` reuses a live verification session when it satisfies
  the caller's freshness requirement; `clearVerificationSession()` clears it. The
  session lasts as long as the verification token (at most
  `VERIFICATION_SESSION_TTL_MS`, 15 minutes) and ends on lock, sign-out, reset, or
  a rejected base session.

Clients must retain the challenge `flowId`, perform the platform ceremony, and
send the resulting proof to the matching completion method. OTP codes,
passkey results, and verification tokens are never persisted in controller state.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
