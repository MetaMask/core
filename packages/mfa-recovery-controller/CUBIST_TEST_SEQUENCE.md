# Cubist MFA recovery integration test sequence

Harness flow for `runMfaRecoveryCubistTest` (Developer Options → Cubist
gamma/beta/prod). Setup (OIDC proof, ensure-user, session, provider
construction) happens outside the controller; the controller only runs
`register` → `authenticateIdentifier` → `getRecoverySecret`.

```mermaid
sequenceDiagram
  participant UI as Developer Options
  participant Test as runMfaRecoveryCubistTest
  participant Auth as AuthenticationController
  participant Cubist as CubeSigner (gamma/beta/prod)
  participant Reg as Recovery Registration API
  participant KC as KeyringController
  participant Ctrl as MfaRecoveryController
  participant Escrow as CubistEscrowProvider

  UI->>Test: run test
  Test->>Auth: getBearerToken + getSessionProfile
  Auth-->>Test: accessToken, profileId

  Test->>Cubist: proveOidcIdentity(orgId, accessToken)
  Cubist-->>Test: providerRegistrationPayload
  Test->>Reg: ensure-user (Bearer accessToken)
  Reg-->>Test: created | exists

  Test->>Cubist: createOidcSession(scopes)
  Cubist-->>Test: session
  Test->>Test: new CubistEscrowProvider(client, wrap/receipt keys)
  Test->>Test: new MfaRecoveryController(stub auth, SIWE auth, escrow)

  Test->>Ctrl: register(recoverySecret, siweIdentifier)
  Ctrl->>Escrow: escrow C2F (wrap/store secret)
  Note over Ctrl,Auth: StubAuthProvider puts SRP token in AuthControllerToken.signature

  Test->>Ctrl: authenticateIdentifier(siweIdentifier)
  Ctrl->>KC: signPersonalMessage (identifier proof)
  KC-->>Ctrl: signature
  Ctrl-->>Test: identifierSession

  Test->>Ctrl: getRecoverySecret(identifierSession)
  Ctrl->>Escrow: getSecret (C2F unwrap)
  Escrow-->>Ctrl: wrapped/recovered secret + epoch
  Ctrl-->>Test: recovered
  Test->>Test: matches = bytes equal?
  Test-->>UI: { ensureUserStatus, epoch, matches }
```
