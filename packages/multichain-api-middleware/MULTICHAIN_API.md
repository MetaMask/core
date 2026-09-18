# The MetaMask Multichain API

This is high-level reference documentation for MetaMask's CAIP-25 / CAIP-27 based
Multichain API. The API is powered by `@metamask/multichain-api-middleware` and
`@metamask/chain-agnostic-permission`, and is implemented on both the MetaMask
extension and mobile clients.

> **Audience.** This document describes the **wallet's JSON-RPC contract**: the
> requests a caller (dapp / SDK) sends and the responses MetaMask returns. If you
> are integrating a dapp, you usually want the
> [MetaMask Connect SDK](https://github.com/MetaMask/connect-monorepo) instead,
> which wraps this API. This is the layer underneath that.

> **Source of truth.** Behavior is described from the implementation in this
> package (`src/handlers/*.ts`) and `@metamask/chain-agnostic-permission`. The
> machine-readable schema lives in
> [`@metamask/api-specs`](https://github.com/MetaMask/api-specs)
> (`multichain/openrpc.yaml`). Where this prose and the OpenRPC schema disagree,
> the handler code is authoritative; please file an issue so we can reconcile
> them.

## Contents

- [Overview](#overview)
- [Concepts](#concepts)
- [Methods](#methods)
  - [`wallet_createSession`](#wallet_createsession)
  - [`wallet_getSession`](#wallet_getsession)
  - [`wallet_revokeSession`](#wallet_revokesession)
  - [`wallet_invokeMethod`](#wallet_invokemethod)
- [Notifications](#notifications)
  - [`wallet_sessionChanged`](#wallet_sessionchanged)
  - [`wallet_notify`](#wallet_notify)
- [Supported methods & notifications per namespace](#supported-methods--notifications-per-namespace)
- [Error codes](#error-codes)
- [Divergences from current CAIP-25](#divergences-from-current-caip-25)
- [MetaMask-specific behavior](#metamask-specific-behavior)
- [Source-of-truth pointers](#source-of-truth-pointers)

## Overview

The Multichain API lets a caller negotiate a single **session** that spans
multiple chains and ecosystems (EVM, Solana, Bitcoin, Tron), and multiple accounts
across those scopes, in one authorization, then invoke methods on any authorized
scope. It replaces the per-chain EIP-1193 model (`eth_requestAccounts` on one chain
at a time) with a chain-agnostic, scope-based model.

It is built on the CASA Chain Agnostic standards:

- **[CAIP-25](https://chainagnostic.org/CAIPs/caip-25)**: `wallet_createSession`, session negotiation
- **[CAIP-27](https://chainagnostic.org/CAIPs/caip-27)**: `wallet_invokeMethod`, invoking a method on a scope
- **[CAIP-285](https://chainagnostic.org/CAIPs/caip-285)**: `wallet_revokeSession`
- **[CAIP-311](https://chainagnostic.org/CAIPs/caip-311)**: `wallet_sessionChanged`
- **[CAIP-312](https://chainagnostic.org/CAIPs/caip-312)**: `wallet_getSession`
- **[CAIP-2](https://chainagnostic.org/CAIPs/caip-2)** / **[CAIP-10](https://chainagnostic.org/CAIPs/caip-10)** / **[CAIP-217](https://chainagnostic.org/CAIPs/caip-217)**: chain IDs, account IDs, scope objects

For MetaMask's design rationale see
[MIP-5](https://github.com/MetaMask/metamask-improvement-proposals/blob/main/MIPs/mip-5.md).
[MIP-6](https://github.com/MetaMask/metamask-improvement-proposals/blob/main/MIPs/mip-6.md)
is **historical**; it predates the current implementation and the upstream CAIP-25
rewrite, so don't rely on it for current behavior.

> ⚠️ **CAIP-25 moved; MetaMask has not caught up (yet).** Upstream CAIP-25 was restructured
> in July to August 2025 (single `scopes`, `properties`/`capabilities` renames, bare
> accounts, chain-only scope keys). MetaMask still implements the **pre-rewrite**
> shape (`requiredScopes`/`optionalScopes`, `sessionProperties`,
> CAIP-10 accounts, namespace-scoped keys). See
> [Divergences from current CAIP-25](#divergences-from-current-caip-25).

## Concepts

- **Scope string**: a CAIP-2 chain id (`eip155:1`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`)
  or a CAIP-104 namespace-level scope (`wallet`, `wallet:eip155`). Pattern:
  `[-a-z0-9]{3,8}(:[-_a-zA-Z0-9]{1,32})?`.
- **Scope object**: per CAIP-217, an object with `methods`, `notifications`, and
  (in responses) `accounts`. In requests it may also carry `references` (namespace
  shorthand). Keyed by scope string.
- **Account**: a fully-qualified **CAIP-10** id in MetaMask: `eip155:1:0xabc...`,
  `solana:5eykt...:6Lm...`.
- **Session**: the set of granted scopes for an origin. MetaMask stores this as a
  single CAIP-25 permission caveat per origin and **does not** issue or accept a
  `sessionId` (one session per origin, tracked internally).
- **`sessionProperties`**: global session metadata (allowlisted; see below).

## Methods

### `wallet_createSession`

Prompts the user and grants a CAIP-25 session. `paramStructure: by-name`.

**Params**

| Field               | Type                             | Required    | Notes                                                                                                                         |
| ------------------- | -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `requiredScopes`    | `{ [scopeString]: ScopeObject }` | conditional | Accepted but **treated as optional** (see divergences).                                                                       |
| `optionalScopes`    | `{ [scopeString]: ScopeObject }` | conditional |                                                                                                                               |
| `sessionProperties` | `{ [key]: Json }`                | no          | Allowlist-filtered to [known keys](#supported-methods--notifications-per-namespace). An empty object is rejected with `5302`. |

At least one of `requiredScopes` / `optionalScopes` must be present and resolve to
a supported scope; a request with neither (or with only unsupported scopes) is
rejected with `5100`.

`ScopeObject` fields: `methods: string[]`, `notifications: string[]`,
optionally `accounts: CaipAccountId[]` and `references: string[]`.

**Result**

```jsonc
{
  "sessionScopes": { "<scopeString>": { "accounts": [...], "methods": [...], "notifications": [...] } },
  "sessionProperties": { /* approved, may be {} */ }
}
```

**Example request**

```jsonc
{
  "id": 1,
  "jsonrpc": "2.0",
  "method": "wallet_createSession",
  "params": {
    "optionalScopes": {
      "eip155:1": {
        "methods": ["eth_sendTransaction", "personal_sign", "eth_getBalance"],
        "notifications": ["eth_subscription"],
      },
      "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": {
        "methods": ["signMessage", "signAndSendTransaction"],
        "notifications": [],
      },
    },
  },
}
```

**Example response**

```jsonc
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": {
    "sessionProperties": {},
    "sessionScopes": {
      "eip155:1": {
        "accounts": ["eip155:1:0x5cfe73b6021e818b776b421b1c4db2474086a7e1"],
        "methods": ["eth_sendTransaction", "personal_sign", "eth_getBalance"],
        "notifications": ["eth_subscription"],
      },
    },
  },
}
```

**Behavior notes**

- All requested scopes are treated as optional; unsupported scopes, unknown
  methods/notifications, and accounts not held by the wallet are **silently
  dropped** rather than erroring.
- If, after filtering, **no** scopes remain, it returns `5100` (Requested scopes
  are not supported).

### `wallet_getSession`

Returns the active session for the origin. `params: []`.

**Result:** `{ "sessionScopes": { ... } }`. If there is **no** active session,
returns `{ "sessionScopes": {} }` (does **not** throw). Any `sessionId` param is
ignored.

### `wallet_revokeSession`

Revokes the session for the origin. Returns `true`.

- With no params (or empty `scopes`), revokes the entire CAIP-25 permission.
- Accepts an optional `params.scopes: string[]` for **partial** revocation
  (implemented in this middleware handler, `partialRevokePermissions`); each
  listed scope is removed; if no permitted accounts
  remain afterward, the whole permission is revoked.
- Returns `true` even when there was no active session. Any `sessionId` param is
  ignored.

### `wallet_invokeMethod`

Invokes a method on a previously authorized scope (CAIP-27). `paramStructure: by-name`.

**Params**

| Field     | Type                                | Required | Notes                                               |
| --------- | ----------------------------------- | -------- | --------------------------------------------------- |
| `scope`   | `ScopeString`                       | yes      | Must be an authorized scope in the current session. |
| `request` | `{ method: string, params?: Json }` | yes      | The wrapped JSON-RPC request.                       |

**Result:** whatever the underlying method returns.

**Behavior notes**

- If the origin has no CAIP-25 caveat, returns `4100` (unauthorized).
- If `request.method` is not in the authorized scope's `methods`, returns `4100`.
- EVM requests (`eip155:*`, or `wallet` / `wallet:eip155`) are routed to the
  resolved `networkClientId` and passed down the middleware stack; non-EVM
  requests are dispatched to the multichain router. Any `sessionId` param is
  ignored; the origin's single session is used.

**Example**

```jsonc
{
  "id": 2,
  "jsonrpc": "2.0",
  "method": "wallet_invokeMethod",
  "params": {
    "scope": "eip155:1",
    "request": {
      "method": "eth_getBalance",
      "params": ["0x5cfe...", "latest"],
    },
  },
}
```

## Notifications

### `wallet_sessionChanged`

Published by the wallet when a session's authorization scopes change (accounts,
scopes added/removed, restoration). `paramStructure: by-name`. Payload:
`{ "sessionScopes": { ... } }` with the full updated scopes.

### `wallet_notify`

Delivers a scope-bound notification to the caller. Params: `scope` (an authorized
scope string) and `notification` (`{ method, params }`). Used to forward
subscription events such as `eth_subscription`.

## Supported methods & notifications per namespace

How a method gets into a session's `methods` array depends on the namespace.

### EVM (`eip155`): static, from `api-specs`

EVM method support is enumerated statically in
`@metamask/chain-agnostic-permission` (`src/scope/constants.ts`).

| List                                    | Scope              | Contents                                                                                                            |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `KnownRpcMethods.eip155`                | `eip155:<chainId>` | All MetaMask JSON-RPC methods from `@metamask/api-specs`, **minus** the wallet-scoped and EIP-1193-only lists below |
| `KnownWalletNamespaceRpcMethods.eip155` | `wallet:eip155`    | `wallet_addEthereumChain`                                                                                           |
| `KnownWalletRpcMethods`                 | `wallet`           | `wallet_registerOnboarding`, `wallet_scanQRCode`                                                                    |
| `KnownNotifications.eip155`             | `eip155:<chainId>` | `eth_subscription`                                                                                                  |

**EIP-1193-only methods** (`Eip1193OnlyMethods`): explicitly **excluded** from the
Multichain API; available only via the injected EIP-1193 provider:
`wallet_switchEthereumChain`, `wallet_getPermissions`, `wallet_requestPermissions`,
`wallet_revokePermissions`, `eth_requestAccounts`, `eth_accounts`, `eth_coinbase`,
`net_version`, `metamask_logWeb3ShimUsage`, `metamask_getProviderState`,
`metamask_sendDomainMetadata`, `wallet_registerOnboarding`.

### Non-EVM (`solana`, `bip122`, `tron`): dynamic, from Snaps

`KnownRpcMethods` / `KnownNotifications` are **empty** for non-EVM namespaces. Their
supported methods are resolved **at runtime** through the handler's
`getNonEvmSupportedMethods(scope)` hook, which the wallet wires to the Snaps
subsystem.

In the extension, that hook calls
`MultichainRoutingService:getSupportedMethods(scope)`
(`@metamask/snaps-controllers`), which returns the **union** of:

1. **Account-Snap methods**: methods declared by installed account-management
   Snaps that hold an account for that scope (via
   `AccountsController:listMultichainAccounts`, filtered to runnable Snaps), and
2. **Protocol-Snap methods**: methods declared by protocol Snaps that service the
   scope.

```text
getNonEvmSupportedMethods(scope)
  └─ MultichainRoutingService.getSupportedMethods(scope)
       = unique( accountSnap.methods[] ∪ protocolSnap.methods[] )
```

Consequently the non-EVM method set depends on which Snaps the user has installed
and which accounts they hold; there is no fixed wallet-wide list. Scope support is
likewise dynamic: `isNonEvmScopeSupported(scope)` is true when at least one Snap can
service the scope.

**Example (Solana, via the MetaMask Solana Snap).** Methods are exposed using
[Wallet Standard](https://github.com/wallet-standard/wallet-standard) naming, e.g.
`signIn`, `signMessage`, `signTransaction`, `signAndSendTransaction`,
`signAllTransactions`. These are provided by the Snap, not hardcoded here, so treat
the list as illustrative and verify against the installed Snap's manifest.

### Known `sessionProperties` keys

`wallet_createSession` filters `sessionProperties` to the `KnownSessionProperties`
allowlist; unknown keys are dropped:

| Key                                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eip1193-compatible`                  | Marks the connection as originating from an EIP-1193 client (injected `window.ethereum` middleware or `@metamask/connect-evm`). The extension uses it to gate EVM-connection UX such as the network picker on the dapp connection bar. Newly-created pure Multichain API sessions (even EVM-only ones) do not set it; note the extension also backfills it onto pre-existing connections with any `eip155:*` scope (migration 211), so older Multichain-only EVM connections may carry it. |
| `solana_accountChanged_notifications` | Opt-in to `accountChanged` notifications for Solana scopes.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `tron_accountChanged_notifications`   | Opt-in to `accountChanged` notifications for Tron scopes.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `bip122_accountChanged_notifications` | Opt-in to `accountChanged` notifications for Bitcoin scopes.                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Error codes

| Code   | Message                             | When                                                                                                                                                         |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `5000` | Unknown error with request          | Generic failure.                                                                                                                                             |
| `5100` | Requested scopes are not supported  | Actually returned by `wallet_createSession` when no supported scopes remain after filtering.                                                                 |
| `5302` | Invalid sessionProperties requested | Returned by `wallet_createSession` when `sessionProperties` is present but an empty object `{}`.                                                             |
| `4100` | Unauthorized                        | Returned by `wallet_invokeMethod` when the origin has no CAIP-25 session, or the requested scope/method is not authorized (`providerErrors.unauthorized()`). |

The OpenRPC schema and `@metamask/chain-agnostic-permission` define additional codes
(`5101`, `5102`, `5201`, `5202`, `5300`, `5301`) that the current
`wallet_createSession` handler does not emit, so callers should not expect them on
the wire.

## Divergences from current CAIP-25

CAIP-25 was restructured upstream in July to August 2025 (see the spec's own
changelog). MetaMask implements the **pre-rewrite** shape. Verified against the
current [CAIP-25 spec](https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-25.md)
and this package's handlers:

| Concept                                       | Current CAIP-25                                                                                                                                                                                                          | MetaMask implementation                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request scopes                                | Single `scopes` (`optionalScopes` → `scopes`, 2025-07-30; `requiredScopes` removed 2025-07-31)                                                                                                                           | Still `requiredScopes` + `optionalScopes`; **all treated as optional**                                                                                                                                                                                                                  |
| Session metadata key                          | `properties` (renamed from `sessionProperties`, 2025-07-30)                                                                                                                                                              | Still `sessionProperties`; **allowlist-filtered** to known keys                                                                                                                                                                                                                         |
| Per-scope request extras (`scopedProperties`) | Removed from the request: `scopedProperties` became `capabilities` (2025-07-30), merged into the scope object (2025-08-04), then dropped from the request entirely (2025-08-07). A response-only `capabilities` remains. | **Abandoned.** Intended for EIP-3085-style dynamic chain addition; partly implemented then deprioritized. Lives in the OpenRPC schema (error codes `5300`/`5301`) and the `Caip25Authorization` type, but the handler never reads it. Stranded; candidate for removal from `api-specs`. |
| Scope granularity                             | Chain-scoped only (namespace-scoped removed 2025-08-03)                                                                                                                                                                  | Uses namespace-scoped objects (`wallet:eip155`) and a `references` shorthand array                                                                                                                                                                                                      |
| Accounts format                               | Bare addresses; CAIP-2 prefix removed (2025-08-07)                                                                                                                                                                       | Fully-qualified **CAIP-10** (`eip155:1:0x...`)                                                                                                                                                                                                                                          |
| `sessionId`                                   | Optional, supported (CAIP-171 / CAIP-316)                                                                                                                                                                                | **Not** returned or accepted; one session per origin, tracked internally                                                                                                                                                                                                                |
| `chains` shorthand                            | `chains: string[]` inside the scope object                                                                                                                                                                               | `references: string[]` (older CAIP-217 shorthand)                                                                                                                                                                                                                                       |
| Invalid input                                 | MAY error                                                                                                                                                                                                                | **Silently dropped** (invalid scopes/methods/accounts)                                                                                                                                                                                                                                  |

## MetaMask-specific behavior

- **All scopes optional.** `requiredScopes` are not enforced as required; the
  handler buckets everything and grants whatever is supported.
- **Lenient filtering.** Malformed scopes and unknown methods/notifications/accounts
  are dropped instead of erroring (reduces fingerprinting and breakage).
- **`sessionProperties` allowlist.** Only the keys in `KnownSessionProperties` are
  retained; an explicitly empty `sessionProperties: {}` errors with `5302`.
- **Single session per origin.** `sessionId` is ignored across `getSession`,
  `revokeSession`, and `invokeMethod`.
- **Graceful no-session results.** `wallet_getSession` returns
  `{ sessionScopes: {} }` and `wallet_revokeSession` returns `true` even with no
  active session.
- **Partial revoke.** `wallet_revokeSession` accepts an optional `scopes` array to
  remove individual scopes; full revoke happens automatically if no accounts remain.

## Source-of-truth pointers

- **Handlers:** `src/handlers/wallet-createSession.ts`, `wallet-getSession.ts`,
  `wallet-revokeSession.ts`, `wallet-invokeMethod.ts`
- **Scope/permission semantics, constants, error codes:**
  [`@metamask/chain-agnostic-permission`](https://github.com/MetaMask/core/tree/main/packages/chain-agnostic-permission)
  (`src/scope/constants.ts`, `src/scope/errors.ts`)
- **OpenRPC schema:**
  [`@metamask/api-specs`](https://github.com/MetaMask/api-specs) →
  `multichain/openrpc.yaml`
- **Design rationale:**
  [MIP-5](https://github.com/MetaMask/metamask-improvement-proposals/blob/main/MIPs/mip-5.md)
  (MIP-6 is historical)
- **Dapp/SDK consumer docs:**
  [MetaMask Connect](https://github.com/MetaMask/connect-monorepo)
