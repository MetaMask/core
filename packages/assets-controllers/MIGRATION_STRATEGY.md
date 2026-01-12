# Assets Controller State Migration Strategy

## Overview

This document outlines the migration strategy for consolidating asset state from multiple legacy controllers into a unified `AssetsController` structure.

### Target State Structure

```typescript
export type AssetsControllerState = {
  assetsMetadata: { [assetId: string]: Json };
  assetsPrice: { [assetId: string]: Json };
  assetsBalance: { [accountId: string]: { [assetId: string]: Json } };
};
```

### Migrations

| Migration | Legacy Controllers | Target Property |
|-----------|-------------------|-----------------|
| **Balances** | `TokenBalancesController`, `AccountTrackerController`, `MultichainBalancesController` | `assetsBalance` |
| **Metadata** | `TokensController`, `TokenListController` | `assetsMetadata` |
| **Prices** | `TokenRatesController`, `CurrencyRateController`, `MultichainAssetsRatesController` | `assetsPrice` |

Each migration follows the same pattern: **shadow write → dual-read → gradual rollout → confidence period → cleanup**.

> **Note:** Examples in this document use balances migration, but the pattern applies to all migrations.

---

## Feature Flags

Two remote feature flags (LaunchDarkly) control the entire migration:

| Flag | Type | Purpose |
|------|------|---------|
| `assets_controller_enabled` | `boolean` | When `true`, AssetsController is instantiated and writes to its own state. Acts as a kill switch — can be disabled remotely without a deploy. |
| `assets_controller_use_new_state` | `boolean` (with % rollout) | LaunchDarkly returns `true` or `false` per user based on configured percentage. Controls which state source to read from. |

**Flag states by phase:**

| Phase | `enabled` | `use_new_state` |
|-------|-----------|-----------------|
| Phase 1: Shadow Write | `true` | `false` (0%) |
| Phase 2: Dual-Read (comparison) | `true` | `false` (0%, logging enabled in code) |
| Phase 3: Gradual Rollout | `true` | % rollout: 10% → 25% → 50% → 75% → 100% |
| Phase 4: Confidence Period | `true` | `true` (100%) |
| Phase 5: Cleanup | removed | removed |

---

## Migration Phases (TokenBalancesController)

### Phase 1: Shadow Write

**Goal:** New controller writes to its own state independently. Legacy continues unchanged. No one reads from new state yet.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Phase 1: Shadow Write                              │
│                                                                              │
│   TokenBalancesController (unchanged)                                        │
│        │                                                                     │
│        └──► tokenBalances state (WRITE + READ by external controllers)      │
│                                                                              │
│   AssetsController (new, independent)                                        │
│        │                                                                     │
│        └──► assetsBalance state (WRITE only, no readers yet)                │
│                                                                              │
│   Kill switch: Set assets_controller_enabled=false in LaunchDarkly          │
│                → AssetsController not instantiated, zero impact             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key points:**
- Both controllers write to their own state
- Feature flag acts as a **kill switch** — if performance degrades, disable remotely without deploy
- No user impact if new controller has bugs (no one reads from it yet)

**Pseudo code:**

```typescript
// Legacy controller — always instantiated
new TokenBalancesController({ messenger, ... });

// New controller — instantiated only if flag is enabled
if (remoteConfig.get('assets_controller_enabled')) {
  new AssetsController({ messenger, ... });
}
```

**Risks mitigated by the flag:**
- Performance degradation (CPU, memory)
- Excessive network calls
- Storage bloat from persisted state
- Crashes during instantiation or event handling

---

### Phase 2: Dual-Read with Comparison

**Goal:** Read from both sources, compare results, log discrepancies.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Phase 2: Dual-Read + Compare                         │
│                                                                              │
│   External Controller (e.g., transaction-pay-controller)                    │
│        │                                                                     │
│        └──► getTokenBalance()  ◄── shared selector in assets-controllers   │
│                  │                                                           │
│                  ├──► TokenBalancesController.state (PRIMARY READ)          │
│                  │         └──► Return to caller                            │
│                  │                                                           │
│                  └──► AssetsController.state (SHADOW READ)                  │
│                            └──► Compare with primary, log discrepancies     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Where does the dual-read logic live?**

The logic is **centralized in a shared selector/utility** within `assets-controllers`, not in each external consumer. This keeps migration logic in one place and minimizes changes to external controllers.

**Pseudo code (shared selector in assets-controllers):**

```
FUNCTION getTokenBalance(messenger, account, chainId, token):
    
    1. legacyBalance = READ from TokenBalancesController.state
    
    2. IF feature_flag("assets_controller_enabled") THEN
         // Shadow read for comparison (Phase 2)
         newBalance = READ from AssetsController.state
         
         IF legacyBalance != newBalance THEN
             LOG discrepancy for investigation
    
    3. RETURN legacyBalance   // Still return legacy in Phase 2
```

**Benefits:**
- Migration logic is centralized (easy to update, easy to remove later)
- External controllers make minimal changes
- Discrepancy logging happens automatically

---

### Phase 3: Gradual Read Migration

**Goal:** Gradually shift reads to new state with percentage-based rollout.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Phase 3: Percentage-Based Rollout                       │
│                                                                              │
│   Feature Flag: assets_controller_use_new_state (boolean, % rollout)       │
│                                                                              │
│   LaunchDarkly handles user bucketing:                                      │
│        │                                                                     │
│        ├──► 10% of users: flag returns TRUE  → use AssetsController        │
│        └──► 90% of users: flag returns FALSE → use TokenBalancesController │
│                                                                              │
│   Gradually increase percentage in LaunchDarkly dashboard:                  │
│   10% → 25% → 50% → 75% → 100%                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**The same shared selector handles the rollout:**

```
FUNCTION getTokenBalance(messenger, account, chainId, token):
    
    // LaunchDarkly returns TRUE or FALSE based on user's bucket
    use_new_state = feature_flag("assets_controller_use_new_state", user_key)
    
    IF use_new_state THEN
        RETURN READ from AssetsController.state
    ELSE
        RETURN READ from TokenBalancesController.state
```

**Rollout:** Increase percentage in LaunchDarkly dashboard — flag returns `true` for more users as percentage increases.

---

### Phase 4: Confidence Period (Both Controllers Still Active)

**Goal:** Keep both controllers writing while 100% of reads use new state. This ensures rollback is always to fresh data.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Phase 4: Confidence Period                              │
│                                                                              │
│   Both controllers still active (assets_controller_enabled=true)            │
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

**Why keep both controllers active?**
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
│   - Fix forward                             │                             │
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

### During Phases 1-4: Instant Rollback (via LaunchDarkly)

Because both controllers are active, legacy state is always fresh.

**Phase 1 rollback (if performance issues):**
```typescript
// Disable new controller entirely — not instantiated on next app launch
{
  "assets_controller_enabled": false
}
```

**Phase 2-4 rollback (if data issues):**
```
// Keep new controller active but switch reads back to legacy
Set assets_controller_use_new_state to 0% in LaunchDarkly
→ All users get FALSE → reads from legacy
```

**Result:** All reads immediately use legacy state with fresh data (both controllers keep writing).


---

## Format Compatibility Layer

Legacy state and new state use different formats. To minimize risk, the shared selector converts new state → legacy format before returning to external controllers.

### Format Differences

| Data | Legacy Format | New Format |
|------|---------------|------------|
| Account identifier | `0xabc...` (hex address) | `uuid-1234` (accountId) |
| Chain identifier | `0x1` (hex) | `eip155:1` (CAIP-2) |
| Asset identifier | `0x123...` (hex token address) | `eip155:1/erc20:0x123...` (CAIP-19) |
| Balance | `0x...` (hex) | `0x...` (hex) — no change |

### Selector with Compatibility Layer

```
FUNCTION getTokenBalance(hexAddress, chainId, tokenAddress):
    
    use_new_state = feature_flag("assets_controller_use_new_state", user_key)
    
    IF use_new_state THEN
        // Convert legacy params → new format for lookup
        accountId = hexAddressToAccountId(hexAddress)
        assetId = toCAIP19(chainId, tokenAddress)
        
        // Read from new state
        balance = READ AssetsController.state.assetsBalance[accountId][assetId]
        
        // Return in legacy format (balance is already hex)
        RETURN balance
    ELSE
        // Read from legacy state (no conversion needed)
        RETURN READ TokenBalancesController.state.tokenBalances[hexAddress][chainId][tokenAddress]
```

### Why This Approach?

1. **External controllers don't change** — they keep calling with legacy params, get legacy format back
2. **Risk is isolated** — if conversion has bugs, rollback to legacy instantly
3. **Gradual migration** — later, update external controllers to use new format directly
4. **Easy cleanup** — remove conversion layer once all consumers use new format

---

## UI Selector Migration

The strategy above is designed for **controller-to-controller** reads (via messenger calls). UI selectors are different — they read state directly from Redux/background state, not via messenger.

### Current State

Today, asset selectors are split between:
- **Some in `core`** (`assets-controllers/src/selectors/`)
- **Most in UI** (extension/mobile repos)

### Goal

Move all asset selectors to `core`. This enables:
- Centralized compatibility layer (same pattern as controller migration)
- Single source of truth for asset data access

### Recommended Approach: Selectors in Core

Create compatibility selectors in `assets-controllers` that UI imports:

```
// In assets-controllers/src/selectors/

FUNCTION selectTokenBalance(state, hexAddress, chainId, token):
    
    use_new_state = feature_flag("assets_controller_use_new_state", user_key)
    
    IF use_new_state THEN
        // Convert legacy params → new format for lookup
        accountId = lookupAccountId(hexAddress)
        assetId = toCAIP19(chainId, token)
        RETURN state.AssetsController.assetsBalance[accountId][assetId]
    ELSE
        RETURN state.TokenBalancesController.tokenBalances[hexAddress][chainId][token]
```

### UI Migration Timeline

UI migration can follow the same phases as controller migration, but may run on a **separate timeline**:

| Phase | Controllers | UI |
|-------|-------------|-----|
| Phase 1 | Shadow write | No changes (still reads legacy) |
| Phase 2 | Dual-read comparison | Add compatibility selectors, enable comparison logging |
| Phase 3 | Gradual rollout | Same — rollout via feature flag |
| Phase 4 | Confidence period | Same |
| Phase 5 | Cleanup | Remove legacy selectors |

### Key Considerations

- UI and controller migrations can be **decoupled** — UI can stay on legacy longer if needed
- Same feature flag (`assets_controller_use_new_state`) can control both
- Goal: All asset selectors in `core` — UI imports from `@metamask/assets-controllers`
- Migration may require moving existing UI selectors to `core` first

---

## Monitoring

### Logging

```typescript
// Log all discrepancies during dual-read phase
interface DiscrepancyLog {
  timestamp: number;
  account: string;
  assetId: string;
  legacySource: string;  // e.g., 'TokenBalancesController', 'TokenRatesController', etc.
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
- [ ] External team communication

### Post-Migration
- [ ] Legacy state writes disabled
- [ ] Legacy controller deprecated
- [ ] Storage cleanup verified

