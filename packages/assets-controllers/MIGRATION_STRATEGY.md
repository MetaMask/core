# Assets Controller State Migration Strategy: Balances

## Overview

This document outlines the migration strategy for consolidating **balance state** from `TokenBalancesController` and `AccountTrackerController` into the unified `AssetsController.assetsBalance` structure.

> **Note:** This same migration pattern (dual-write → dual-read → gradual rollout → confidence period → cleanup) should be followed for migrating:
> - **Metadata** (`TokensController`, `TokenListController` → `assetsMetadata`)
> - **Prices** (`TokenRatesController`, `CurrencyRateController` → `assetsPrice`)
> 
> Each migration should can be done **sequentially**, not in parallel, to reduce risk and simplify debugging.

### Target State Structure

```typescript
// assetsController.ts
export type AssetsControllerState = {
  /** Shared metadata for all assets (stored once per asset) */
  assetsMetadata: { [assetId: string]: Json };
  /** Price data for assets (stored once per asset) */
  assetsPrice: { [assetId: string]: Json };
  /** Per-account balance data */
  assetsBalance: { [accountId: string]: { [assetId: string]: Json } };
};
```

### Current State Sources Being Migrated (This Document: Balances)

| Current Controller | Current State Property | Target Property |
|-------------------|----------------------|-----------------|
| `TokenBalancesController` | `tokenBalances[account][chainId][token]` | `assetsBalance[accountId][assetId]` |
| `AccountTrackerController` | `accountsByChainId[chainId][account].balance` | `assetsBalance[accountId][assetId]` (native) |

### Future Migrations (Same Pattern)

| Current Controller | Current State Property | Target Property |
|-------------------|----------------------|-----------------|
| `TokensController` | `allTokens[chainId][account]` | `assetsMetadata[assetId]` |
| `TokenListController` | `tokenList`, `tokensChainsCache` | `assetsMetadata[assetId]` |
| `TokenRatesController` | `marketData[chainId][token].price` | `assetsPrice[assetId]` |
| `CurrencyRateController` | `currencyRates[ticker]` | `assetsPrice[assetId]` (native assets) |

---

## Feature Flags

Two feature flags control the entire migration:

| Flag | Type | Purpose |
|------|------|---------|
| `assets_controller_dual_write` | `boolean` | When `true`, balance updates write to both legacy and new state. Keep enabled through Phase 4 to ensure rollback always has fresh data. |
| `assets_controller_read_percentage` | `number (0-100)` | Percentage of users reading from new state. `0` = all legacy, `100` = all new. |

**Flag states by phase:**

| Phase | `dual_write` | `read_percentage` |
|-------|--------------|-------------------|
| Phase 1: Dual-Write | `true` | `0` |
| Phase 2: Dual-Read (comparison) | `true` | `0` (logging enabled in code) |
| Phase 3: Gradual Rollout | `true` | `10 → 25 → 50 → 75 → 100` |
| Phase 4: Confidence Period | `true` | `100` |
| Phase 5: Cleanup | removed | removed |

---

## Migration Phases (TokenBalancesController)

### Phase 1: Dual-Write

**Goal:** Write to both old and new state structures simultaneously.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Phase 1: Dual-Write                             │
│                                                                              │
│   Balance Update                                                            │
│        │                                                                     │
│        ├──► TokenBalancesController.state.tokenBalances (WRITE)             │
│        │                                                                     │
│        └──► AssetsController.state.assetsBalance (WRITE)                    │
│                                                                              │
│   External Controllers                                                       │
│        │                                                                     │
│        └──► TokenBalancesController.state.tokenBalances (READ) ◄── still    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Pseudo code:**

```
ON balance_update(account, chainId, token, balance):
    
    1. WRITE to TokenBalancesController.state (legacy)
    
    2. IF feature_flag("assets_controller_dual_write") THEN
         WRITE to AssetsController.state (new)
```

---

### Phase 2: Dual-Read with Comparison

**Goal:** Read from both sources, compare results, log discrepancies.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Phase 2: Dual-Read + Compare                         │
│                                                                              │
│   External Controller Request                                                │
│        │                                                                     │
│        ├──► TokenBalancesController.state (PRIMARY READ)                    │
│        │         │                                                           │
│        │         └──► Return to caller                                       │
│        │                                                                     │
│        └──► AssetsController.state (SHADOW READ)                            │
│                  │                                                           │
│                  └──► Compare with primary, log discrepancies               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Pseudo code:**

```
ON get_balance(account, chainId, token):
    
    1. legacyBalance = READ from TokenBalancesController.state
    
    2. IF feature_flag("assets_controller_dual_write") AND read_percentage == 0 THEN
         // Phase 2: Shadow read for comparison only
         newBalance = READ from AssetsController.state
         
         IF legacyBalance != newBalance THEN
           LOG discrepancy for investigation
    
    3. RETURN legacyBalance   // Still return legacy
```

---

### Phase 3: Gradual Read Migration

**Goal:** Gradually shift reads to new state with percentage-based rollout.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Phase 3: Percentage-Based Rollout                       │
│                                                                              │
│   Feature Flag: assets_controller_read_percentage = 10                      │
│                                                                              │
│   Request 1-10:   Read from AssetsController ────────┐                      │
│   Request 11-100: Read from TokenBalancesController ─┴──► Return            │
│                                                                              │
│   Gradually increase: 10% → 25% → 50% → 75% → 100%                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Rollout:** Gradually increase `assets_controller_read_percentage`: 10% → 25% → 50% → 75% → 100%

---

### Phase 4: Confidence Period (Keep Dual-Write Active)

**Goal:** Maintain dual-write while 100% of reads use new state. This ensures rollback is always to fresh data.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Phase 4: Confidence Period                              │
│                                                                              │
│   Balance Update (DUAL-WRITE CONTINUES)                                     │
│        │                                                                     │
│        ├──► TokenBalancesController.state.tokenBalances (WRITE) ◄── fresh! │
│        │                                                                     │
│        └──► AssetsController.state.assetsBalance (WRITE)                    │
│                                                                              │
│   External Controllers                                                       │
│        │                                                                     │
│        └──► AssetsController.state (READ 100%)                              │
│                                                                              │
│   Rollback available: Set read_percentage=0 → instant switch to fresh      │
│   legacy data                                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why keep dual-write?**
- Rollback to stale data is worse than the original problem
- Storage cost is temporary
- Peace of mind during high-risk period

---

### Phase 5: Legacy Removal

**Goal:** Remove legacy state and controllers. This is a one-way door.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Phase 5: Point of No Return                            │
│                                                                              │
│   BEFORE: Dual-write active, rollback possible                              │
│                                                                              │
│   AFTER: Legacy controllers removed, no rollback to old state              │
│                                                                              │
│   Rollback strategy changes to:                                             │
│   - Fix forward (patch the new controller)                                  │
│   - Restore from backup (if catastrophic)                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Checklist before removal:**
- [ ] 100% reads from new state for 4+ weeks
- [ ] Zero rollbacks triggered during confidence period
- [ ] All external controllers migrated and tested
- [ ] Performance metrics stable

---

## Rollback Strategy

### During Phases 1-4: Instant Rollback

Because dual-write is active, legacy state is always fresh.

```typescript
// Set feature flag to disable new state reads
{
  "assets_controller_read_percentage": 0
}
```

**Result:** All reads immediately use legacy state with fresh data (dual-write keeps it current).


---

## Monitoring

### Logging

```typescript
// Log all discrepancies during dual-read phase
interface DiscrepancyLog {
  timestamp: number;
  account: string;
  assetId: string;
  legacyValue: string;
  newValue: string;
  phase: 'dual_read' | 'percentage_rollout';
}
```

---


---

## Checklist

### Pre-Migration
- [ ] New `AssetsController` implemented with new state structure
- [ ] Feature flags created in LaunchDarkly/remote config
- [ ] Monitoring dashboards set up
- [ ] Rollback runbook documented

### During Migration
- [ ] Dual-write enabled and verified
- [ ] Discrepancy logging active
- [ ] Performance baseline established
- [ ] External team communication (if applicable)

### Post-Migration
- [ ] Legacy state writes disabled
- [ ] Legacy controller deprecated
- [ ] Documentation updated
- [ ] Storage cleanup verified

