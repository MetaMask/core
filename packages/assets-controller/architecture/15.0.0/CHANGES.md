# AssetsController 15.0.0 - architecture change and AccountsAPI v5/v6 paths

This branch keeps the previous balance behavior and the new Accounts API v6
behavior side by side behind the `assetsAccountsApiV6` remote feature flag.

- Flag off, missing, or unreadable: use the legacy **v5** path.
- `assetsAccountsApiV6: { value: true }`: use the new **v6** path.

The flag is read only in `AssetsController.#isBalanceV6Enabled()` and injected
into `AccountsApiDataSource`, `RpcFallbackMiddleware`, and `RpcDataSource`.

## Architectural change

The controller now has two explicit orchestration paths instead of one mixed
flow with many conditional branches:

- **v5 path** preserves the old behavior so rollout-off matches existing
  production semantics.
- **v6 path** isolates the new behavior so rollout-on can be evaluated and the
  old path can be deleted cleanly later.

This split exists in three main places:

1. Force-update orchestration from `getAssets(..., { forceUpdate: true })`
2. Balance subscription setup
3. Balance update enrichment and merge

## Path overview

```mermaid
flowchart TD
  A[getAssets forceUpdate / subscribe / handleAssetsUpdate] --> F{assetsAccountsApiV6}
  F -->|false| V5[v5 path]
  F -->|true| V6[v6 path]
```

## Force-update path

Both paths share the same broad shape: run a fast lane, commit state, then run
the slower background fetch.

```mermaid
flowchart TB
  subgraph request ["Request shaping"]
    R5["v5 request<br/>every pinned asset for requested accounts<br/>unscoped<br/>no excludeAssetIds"]
    R6["v6 request<br/>pins scoped to requested chains<br/>optional customAssets override<br/>hidden assets as excludeAssetIds"]
  end

  subgraph v5fast ["v5 fast lane"]
    direction TB
    V5P["Accounts API v5 || Staked"]
    V5G[CustomAssetGraduation]
    V5F[RpcFallback]
    V5D[Detection]
    V5T["Token || Price"]
    V5P --> V5G --> V5F --> V5D --> V5T
    V5S["State update<br/>merge + replaceCoveredChainBalances"]
    V5T --> V5S
  end

  subgraph v6fast ["v6 fast lane"]
    direction TB
    V6P["Accounts API v6 || Staked<br/>includeAssetIds / excludeAssetIds"]
    V6F["RpcFallback<br/>errored chains + unprocessedIncludeAssetIds"]
    V6D[Detection]
    V6T["Token || Price"]
    V6P --> V6F --> V6D --> V6T
    V6S["State update<br/>Accounts API drives updateMode full"]
    V6T --> V6S
  end

  subgraph bg ["Background lane"]
    B1["Snap || RPC"]
    B2[Detection]
    B3["Token || Price"]
    B4["State update<br/>merge"]
    B1 --> B2 --> B3 --> B4
  end

  R5 --> v5fast --> bg
  R6 --> v6fast --> bg
```

When basic functionality is off, both fast lanes reduce to `Staked -> Detection`
and the background lane is RPC only.

## Subscribe path

```mermaid
flowchart LR
  subgraph v5sub ["v5 subscribe"]
    S5A[Chain handoff by source priority]
    S5B["RPC customAssetsOnly supplement<br/>for pins on chains another source owns"]
    S5A --> S5B
  end

  subgraph v6sub ["v6 subscribe"]
    S6A[Chain handoff by source priority]
    S6B["claimCustomAssets per source<br/>Accounts API claims EVM pins as includeAssetIds"]
    S6C["RPC asset-scoped polls<br/>for unclaimed claimed pins"]
    S6A --> S6B --> S6C
  end
```

`AccountsApiDataSource.claimCustomAssets()` returns `[]` on v5.

## Update enrichment path

```mermaid
flowchart TB
  subgraph v5update ["v5 handleAssetsUpdate"]
    U5G["CustomAssetGraduation<br/>for Accounts API / AccountActivity"]
    U5D[Detection]
    U5T["Token || Price"]
    U5S["State update<br/>merge; honor replaceCoveredChainBalances"]
    U5G --> U5D --> U5T --> U5S
  end

  subgraph v6update ["v6 handleAssetsUpdate"]
    U6F["RpcFallback when basic on<br/>errored chains + unprocessedCustomAssets"]
    U6D[Detection]
    U6T["Token || Price"]
    U6S["State update<br/>full when Accounts API marks it full"]
    U6F --> U6D --> U6T --> U6S
  end
```

v5 does not run `RpcFallbackMiddleware` on this subscribe/update path. v6 does
not run `CustomAssetGraduationMiddleware`.

## Behavioral intent

| Concern                   | v5                                         | v6                                                |
| ------------------------- | ------------------------------------------ | ------------------------------------------------- |
| Accounts API endpoint     | `fetchV5MultiAccountBalances`              | `fetchV6MultiAccountBalances`                     |
| Accounts API update mode  | `merge`                                    | `full`                                            |
| Covered-chain merge       | Preserve old behavior                      | Replace covered chain slice                       |
| Custom asset preservation | Keep custom + staked pins in v5 merge path | Keep `unprocessedCustomAssets` until RPC resolves |
| Hidden assets             | Not sent to v5 endpoint                    | Sent as `excludeAssetIds`                         |
| RPC token fetch           | Flat `request.customAssets` on the chain   | Only pins owned by that account                   |

## Code map

| Concern                  | v5 implementation                         | v6 implementation                         |
| ------------------------ | ----------------------------------------- | ----------------------------------------- |
| Force-update request     | `#buildForceUpdateRequestV5`              | `#buildForceUpdateRequestV6`              |
| Force-update pipeline    | `#forceUpdateAssetsV5`, `#runFastFetchV5` | `#forceUpdateAssetsV6`, `#runFastFetchV6` |
| Subscribe                | `#subscribeAssetsBalanceV5`               | `#subscribeAssetsBalanceV6`               |
| Update enrichment        | `#handleAssetsUpdateV5`                   | `#handleAssetsUpdateV6`                   |
| Balance merge            | `mergeAccountBalancesV5`                  | `mergeAccountBalancesV6`                  |
| Accounts API fetch       | `#fetchV5Balances`                        | `#fetchV6Balances`                        |
| RPC fallback             | `#recoverV5`                              | `#recoverV6`                              |
| RPC custom ERC-20 append | `#appendRequestCustomErc20sV5`            | `#appendRequestCustomErc20sV6`            |

## Deletion plan after rollout

Once v6 is accepted as the only behavior:

1. Remove the v5 methods and `!this.#isBalanceV6Enabled()` branches.
2. Keep the v6 methods as the only orchestration path.
3. Remove transitional docs/tables that compare v5 and v6.
