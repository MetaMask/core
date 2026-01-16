# 20+ Network Performance Spike - Test Results

## Executive Summary

**Test Date:** 01/14/26
**Tester:** Vince Howard
**Branch/Commit:** _[Git branch/commit hash]_

**Hypothesis:** The app can support 20+ networks with acceptable performance after parallel chain processing optimizations.

**Key Finding (1-2 sentences):**
_[Brief summary of what you discovered]_

---

## Test Configuration

### Test Environments

This spike tests three distinct configurations to measure performance impact as network count increases:

**Debug Build Caveat:** All tests were conducted using debug builds, which include development tooling overhead (React DevTools Profiler, unminified code, source maps, additional logging). Performance metrics should be interpreted as **relative comparisons** between environments rather than absolute production benchmarks. Production builds typically show better performance

**Note:** Network counts are based on actual code inspection of `POPULAR_NETWORKS` constant and `InfuraNetworkType` definitions. Main branch currently enables 15 networks by default (not 10 as initially assumed).

#### Environment 1: Baseline (15 Networks)
- **Configuration:** Default production state (main branch)
- **Networks Enabled:** 15 networks enabled by default via `POPULAR_NETWORKS`
  - **8 Infura networks:** Ethereum, Linea, Base, Arbitrum, BNB Chain, Optimism, Polygon, Sei
  - **7 Custom RPC networks:** Avalanche, zkSync Era, Palm, HyperEVM, Monad, MegaETH, (1 more)
- **RPC Infrastructure:**
  - 8 networks use dedicated Infura endpoints (`https://{network}.infura.io/v3/{projectId}`)
  - 7 networks use custom/public RPC endpoints with variable performance
- **Purpose:** Establish baseline performance metrics with current production defaults
- **Branch:** `main`
- **Pull Request for reference:** NA

#### Environment 2: Target (20 Networks)
- **Configuration:** Expanded defaults on `spike/enable-20-networks` branch
- **Networks Enabled:** 20 networks enabled by default
  - 15 networks: Same as Environment 1 (current production defaults)
  - 5 networks: Additional networks enabled for this test (previously require manual addition)
- **RPC Infrastructure:**
  - 8 Infura networks (from Environment 1)
  - 12 Custom/public RPC networks (7 from Environment 1 + 5 additional)
- **Purpose:** Test realistic performance with expanded network support - this is the ship/no-ship decision point
- **Branch:**
- **Pull Request for reference:** NA

#### Environment 3: Power User (25 Networks)
- **Configuration:** Environment 2 + additional custom networks
- **Networks Enabled:** 25 networks enabled by default
  - 20 networks: Same as Environment 2
  - 5 networks: Additional custom networks with varied RPC support (simulates users who manually add many networks)
- **RPC Infrastructure:** Mixed quality, includes potentially slow or unreliable public RPCs
- **Purpose:** Validate that parallel processing handles users with many custom networks without severe performance degradation (simulates lower end of "power user" scenario - some users have 50-100 networks)
- **Branch:**
- **Pull Request for reference:** NA 

---

### Device/Environment

- Device: iPhone 17
- OS Version: 26.2
- App Version: 7.62.0

- **Environment Tested:** ☐ Environment 1 (15 networks) ☐ Environment 2 (20 networks) ☐ Environment 3 (25 networks)

**Environment 1 Networks (15 - main branch):**
- **Infura RPCs (8):** Ethereum Mainnet, Linea, Base, Arbitrum One, BNB Chain, Optimism, Polygon, Sei
- **Custom RPCs (6):** Avalanche C-Chain, zkSync Era, Palm, HyperEVM, Monad, MegaETH, 

**Additional Networks in Env 2 (5 more = 20 total):**
- Solana (non-EVM, Snap-based)
- Bitcoin (non-EVM, Snap-based)
- Tron (EVM-compatible)
- Sepolia (Ethereum testnet, Infura RPC)
- Linea Sepolia (Linea testnet, Infura RPC)

**Additional Networks in Env 3 (5 more = 25 total):**
- Fantom Mainnet (Custom RPC)
- Gnosis Mainnet (Custom RPC)
- Cronos Mainnet (Custom RPC)
- Moonbeam Mainnet (Custom RPC)
- Moonriver Mainnet (Custom RPC)

---

## Critical Metrics

**Instructions:** The "Δ from Baseline" column shows the performance difference compared to Environment 1.

---

### 1. App Startup Time

**Measurement:** Time from app launch to homepage token list fully loaded

**Components Being Tested:**
- `app/components/UI/Tokens/TokenList/TokenList.tsx` - FlashList initialization and first render
- `app/components/UI/Assets/components/Balance/AccountGroupBalance.tsx` - Portfolio balance calculation across all networks
<!-- - `app/components/Views/Wallet/index.tsx` - Initial mount and render
- `app/components/UI/Tokens/index.tsx` - Token container initialization
- `app/components/UI/Tokens/TokenList/TokenListSkeleton/TokenListSkeleton.tsx` - Loading state display -->

**What to Watch:**
- Time until skeleton loader appears
- Time from skeleton to actual token list render
- Portfolio balance calculation time (aggregates all networks)
- Network initialization overhead (more networks = more RPC client setup)

#### Home Screen - TokenList Component

**Performance Data from React DevTools Profiler:**

| Scenario | Env 1: Baseline (15) | Env 2: Target (20) | Δ from Baseline | Env 3: Power User (25) | Δ from Baseline |
|----------|---------------------|-------------------|----------------|----------------------|----------------|
| On first wallet import | 13s | _____ sec | _____ sec | _____ sec | _____ sec |
| Cold start | 5.5s | _____ sec | _____ sec | _____ sec | _____ sec | ☐ Pass ☐ Fail |

**Key Observations:**
Env 1: Baseline 
- TokenList re-renders 9 times over 13 seconds during first wallet import (5.5s → 19s)
- TokenList renders faster during cold start due to Redux Persist rehydration
  - Persisted token data loads from AsyncStorage immediately
  - First render shows last known state while fresh data fetches in background
  - Actual token balance updates happen asynchronously after initial render
- There is not skeleton loader for 1-2 seconds then it shows

#### Home Screen - AccountGroupBalance Component

**Performance Data from React DevTools Profiler:**

| Scenario | Env 1: Baseline (15) | Env 2: Target (20) | Δ from Baseline | Env 3: Power User (25) | Δ from Baseline |
|----------|---------------------|-------------------|----------------|----------------------|----------------|
| On first wallet import | 13.1s | _____ sec | _____ sec | _____ sec | _____ sec |
| Cold start | 7.1s | _____ sec | _____ sec | _____ sec | _____ sec | ☐ Pass ☐ Fail |

**Key Observations:**
Env 1: Baseline 
- Multiple quick re-renders (1-19ms) suggest rapid state updates. During cold boot the balance does not change yet its re-rendering multiple times suggesting state updates happening yet nothing changing 
- During app cold start, Redux Persist rehydrates the UI quickly with last-known balance data, but as stated above there is several re-renders

#### View All Tokens Screen - FlashList Component

**Performance Data from React DevTools Profiler:**

| Scenario | Env 1: Baseline (15) | Env 2: Target (20) | Δ from Baseline | Env 3: Power User (25) | Δ from Baseline |
|----------|---------------------|-------------------|----------------|----------------------|----------------|
| On first wallet import | 3s | _____ sec | _____ sec | _____ sec | _____ sec |
| Cold start | 2.1s | _____ sec | _____ sec | _____ sec | _____ sec | ☐ Pass ☐ Fail |


**Key Observations:**
- View All Tokens benefits from token data already being fetched by home screen
  - When user navigates to this screen, most token detection has already completed
  - Screen only needs to render the list with existing data
- View All Tokens screen cold start is faster than first wallet import because persisted token data loads immediately

<!-- **Notes:**
_[Any observations about startup behavior across environments]_ -->


<!-- --- TODO: Will come back and test

### 2. Token Detection Cycle Time

**Measurement:** Time for first complete token detection cycle across all enabled networks

**Components Being Tested:**
- `app/components/UI/Tokens/util/refreshTokens.ts` - Token refresh logic (orchestrates detection across all networks)
- `app/components/Views/DetectedTokens/index.tsx` - Detected tokens bottom sheet (if new tokens found)
- `app/components/UI/Tokens/TokenList/TokenListItem/TokenListItem.tsx` - Token item updates with new balances
- Controllers: `TokenDetectionController`, `TokensController`, `AssetsContractController`

**What to Watch:**
- Parallel vs sequential network processing (should be parallel)
- Impact of slow RPCs on overall cycle time (should timeout independently)
- Token balance updates appearing progressively vs all at once
- Detected tokens bottom sheet appearance time

| Scenario | Env 1: Baseline (15) | Env 2: Target (20) | Δ from Baseline | Env 3: Power User (25) | Δ from Baseline | Pass/Fail |
|----------|---------------------|-------------------|----------------|----------------------|----------------|-----------|
| First detection cycle | _____ sec | _____ sec | _____ sec | _____ sec | _____ sec | ☐ Pass ☐ Fail |
| Subsequent cycles | _____ sec | _____ sec | _____ sec | _____ sec | _____ sec | ☐ Pass ☐ Fail |

**Pass Criteria:**
- First cycle: <10 seconds (absolute), <5 seconds increase from baseline
- Subsequent cycles: <5 seconds (absolute), <3 seconds increase from baseline

**Notes:**
_[Behavior of parallel processing across environments - do slow networks block fast ones?]_ -->

<!-- ---

### 2. Memory Consumption

**Measurement:** App memory usage (use Xcode Instruments or Android Profiler)

**Components Being Tested:**
- `app/components/UI/Tokens/TokenList/TokenList.tsx` - FlashList memory footprint with increasing token counts
- `app/components/UI/Tokens/TokenList/TokenListItem/TokenListItem.tsx` - Individual item memory (images, state)
- Controllers: `NetworkController` (network state per chain), `TokensController` (token metadata cache)
- Network client instances (one per enabled network)
- Token metadata cache (addresses, images, balances per network)

**What to Watch:**
- Memory at startup (network client initialization)
- Memory growth during token detection (token metadata accumulation)
- Memory after 30 min (check for leaks in network clients or token state)
- FlashList recycling effectiveness (should reuse views efficiently)

| Scenario | Env 1: Baseline (15) | Env 2: Target (20) | Δ from Baseline | Env 3: Power User (25) | Δ from Baseline | Pass/Fail |
|----------|---------------------|-------------------|----------------|----------------------|----------------|-----------|
| At startup | _____ MB | _____ MB | _____ MB | _____ MB | _____ MB | ☐ Pass ☐ Fail |
| After 5 min usage | _____ MB | _____ MB | _____ MB | _____ MB | _____ MB | ☐ Pass ☐ Fail |
| After 30 min usage | _____ MB | _____ MB | _____ MB | _____ MB | _____ MB | ☐ Pass ☐ Fail |

**Pass Criteria:**
- Memory increase: <100MB per environment vs baseline
- Memory growth: No leaks (30min usage should be within 20MB of 5min usage)

**Notes:**
_[Any memory spikes, leaks, or growth patterns observed across environments]_ -->

---

### 2. RPC Request Behavior

**Measurement:** Observe network tab during token detection cycle

**Components Being Tested:**
- `app/components/UI/Tokens/util/refreshTokens.ts` - RPC request orchestration
- Controllers: `TokenDetectionController` (parallel token detection), `AssetsContractController` (Multicall3 batching)
- Network clients: RPC request handling per network
- RPC timeout handling and retry logic

**What to Watch:**
- Parallel processing: Do all networks make requests simultaneously?
- Multicall3 usage: Are token balance requests batched?
- Timeout behavior: Do slow networks (Klaytn/Fantom) block others?
- Request queueing: Is there a concurrency limit?
- Failed request handling: Are failures graceful and retried?

| Metric | Env 1: Baseline (15) | Env 2: Target (20) | Env 3: Power User (25) | Pass/Fail |
|--------|---------------------|-------------------|----------------------|-----------|
| Max concurrent RPC requests | _____ | _____ | _____ | ☐ Pass ☐ Fail |
| Total requests in first cycle | _____ | _____ | _____ | ☐ Pass ☐ Fail |
| Failed requests count | _____ | _____ | _____ | ☐ Pass ☐ Fail |
| Slow network timeout (Klaytn/Fantom) | _____ sec | _____ sec | _____ sec | ☐ Pass ☐ Fail |

**Pass Criteria:**
- Requests processed in parallel (not sequential)
- Timeouts: <30 seconds
- Failure rate: <5% across all environments

**Notes:**
_[Do slow networks block fast ones? Are Multicall3 batches used? Any differences across environments?]_

---

## Qualitative Observations

### UI Behavior

**Token List Loading:**
- [x] Loading states appear correctly
- [ ] No blank screens or hanging loaders
    - On first import 
- [ ] Token images load progressively
- [ ] Scroll performance is smooth (60fps)

**Error Handling:**
- [ ] Slow RPC timeouts handled gracefully
- [ ] Failed token detections don't crash app
- [ ] Error messages are user-friendly
- [ ] Retry logic works correctly

**Notes:**
_[Any UI glitches, hangs, or unexpected behavior]_

---

### Edge Cases Tested

**Test Case 1: Slow RPC Impact**
- Scenario: _[e.g., Klaytn and Fantom public RPCs are slow]_
- Result: ☐ Pass ☐ Fail
- Observation: _[Does one slow RPC block others?]_

**Test Case 2: Network with No Tokens**
- Scenario: _[e.g., Switch to a network with no user tokens]_
- Result: ☐ Pass ☐ Fail
- Observation: _[How long does detection take? Is UI responsive?]_

**Test Case 3: Import Gnarly SRP**
- Scenario: _[Import wallet with many assets across multiple networks]_
- Result: ☐ Pass ☐ Fail
- Observation: _[Time to detect all tokens, memory usage spike]_

**Test Case 4: Extended Usage (30+ min)**
- Result: ☐ Pass ☐ Fail
- Observation: _[Any performance degradation, memory leaks, crashes?]_

---

## Console Log Verification

**Expected console output (adjust counts based on environment tested):**

**Environment 1 (15 networks - main branch):**
- [ ] `[NetworkEnablementController] Enabled EVM networks: [15 networks]`
- [ ] `[NetworkController] Custom network chain IDs: [7 custom networks]` (Avalanche, zkSync Era, Palm, HyperEVM, Monad, MegaETH, +1)

**Environment 2 (25 networks - spike branch + manual additions):**
- [ ] `[NetworkController] Custom network chain IDs: [17 custom networks]` (12 from Env 2 + 5 manually added)
- [ ] `[NetworkEnablementController] Enabled EVM networks: [25 networks]`
- [ ] `[NetworkEnablementController] Constructor - final EVM networks count: 25`

**Any errors or warnings:**
_[List any console errors observed during testing]_

---

## Blockers or Issues Discovered

**Issue #1: Token List Loads All Tokens Upfront Despite UI Showing Only 10**
- Severity: ☑ Critical 
- Description: The homepage redesign refactor (showing first 10 tokens via `maxItems` prop) is purely cosmetic. All tokens are loaded into Redux state via the `selectSortedAssetsBySelectedAccountGroup` selector before any rendering occurs. The selector performs sorting, deduplication, and filtering on the entire token set upfront. The `maxItems` limit only affects rendering via `.slice(0, maxItems)` in TokenList.tsx:83 - no lazy loading or progressive data fetching exists.
- Location: `metamask-mobile/app/selectors/assets/assets-list.ts`, `metamask-mobile/app/components/UI/Tokens/TokenList/TokenList.tsx:83`
- Impact: Extremely slow app startup times on first wallet import (19+ seconds for TokenList first render, 10.8s for AccountGroupBalance). Users experience long loading states despite only seeing 10 tokens. This is why "View All Tokens" loads instantly - the data is already in memory.
- Workaround: None - fundamental architectural issue requiring true lazy loading implementation

**Issue #2: Token Detection Processes Networks Sequentially Instead of in Parallel**
- Severity: ☑ High 
- Description: The `TokenDetectionController.detectTokens()` method processes networks sequentially via a `for...await` loop in `#detectTokensUsingRpc` (lines 589-607). Each network waits for the previous network's token detection to complete before starting. While token slices within a single network are parallelized using `Promise.all()`, the outer loop blocks on `await Promise.all(tokenDetectionPromises)` before processing the next network.
- Location: `core/packages/assets-controllers/src/TokenDetectionController.ts:585-609`
- Impact: With 20 networks averaging ~2 seconds each, sequential processing takes ~40 seconds vs ~2-3 seconds if parallelized. This compounds Issue #1 by delaying token balance updates during first wallet import. Each additional network adds linear time overhead.
- Workaround: None - requires refactoring the outer loop to use `Promise.all()` or `Promise.allSettled()` for parallel network processing

**Issue #3: Production Baseline Already Has 40% Custom RPC Networks**
- Severity: ☐ Critical ☑ High ☐ Medium ☐ Low
- Description: Main branch (production baseline) ships with 15 networks where 6 use custom/public RPC endpoints (40%): Avalanche (`https://api.avax.network/ext/bc/C/rpc`), zkSync Era (`https://mainnet.era.zksync.io`), Palm (`https://palm-mainnet.public.blastapi.io`), HyperEVM (`https://rpc.hyperliquid.xyz`), MegaETH testnet (`https://carrot.megaeth.com/rpc`), and Monad testnet (`https://testnet-rpc.monad.xyz`). These third-party endpoints have variable reliability, rate limiting policies, and performance characteristics outside MetaMask's control.
- Location: `core/packages/controller-utils/src/constants.ts` (BUILT_IN_CUSTOM_NETWORKS_RPC lines 67-70), `core/packages/network-enablement-controller/src/constants.ts` (POPULAR_NETWORKS)
- Impact: Users already experience inconsistent token detection times, missing balances, and failed requests due to third-party RPC infrastructure issues in production. Rate limit errors (HTTP 429) trigger circuit breakers that pause requests. Combined with Issue #2 (sequential processing), one slow custom RPC blocks all subsequent networks in the detection queue. This is a pre-existing production issue, not introduced by the spike branch.
- Workaround: Configure `failoverRpcUrls` for critical custom networks (Avalanche, zkSync Era, Palm). Consider migrating high-traffic custom networks to Infura endpoints where possible.

**Issue #4: Spike Branch Adds 8 Test Networks with Intentionally Slow RPCs**
- Severity: ☐ Critical ☐ High ☑ Medium ☐ Low
- Description: This spike branch adds 8 additional custom RPC networks specifically for performance testing: Fantom, Gnosis, Celo, Cronos, Aurora, Moonbeam, Moonriver, and Klaytn. Klaytn (`https://public-en-cypress.klaytn.net`) was intentionally added as a slow RPC endpoint to stress-test performance degradation. This increases custom RPC dependency from 40% (6/15) to 70% (14/20).
- Location: `core/packages/controller-utils/src/constants.ts` (BUILT_IN_CUSTOM_NETWORKS_RPC lines 71-82), `core/packages/network-enablement-controller/src/constants.ts` (POPULAR_NETWORKS lines 17-24)
- Impact: The 8 test networks amplify the issues described in Issue #3. Klaytn's intentionally slow RPC, combined with sequential token detection (Issue #2), significantly degrades first wallet import performance. Test results show this spike configuration increases app startup time and token detection cycles compared to baseline.
- Workaround: These are test networks only - do NOT ship to production. Remove all 8 test networks (Fantom through Klaytn) before any production rollout. If any of these networks are desired for production, add failover RPCs and evaluate performance individually.

**Issue #5: Failed requests seem to block aggregated balance and token rendering**
- Severity: ☐ High
- Description: When a network fails or is rate limited it blocks the entire process of rendering the token balance and token list
- Impact: Users get incomplete information about what assets they are holding
- Workaround: TBA

**Issue #6: Load times are widely variable due to slow and inconsistent networks**

**Issue #7: Slow network banner only shows 1 network**


_[Add more issues as needed]_

---
<!-- 
## Final Recommendation

**Overall Assessment:** ☐ SHIP IT ☐ NEEDS WORK ☐ DO NOT SHIP

**Reasoning:**
_[2-3 sentences explaining your recommendation based on the test results]_

**Next Steps:**
1. _[e.g., File tickets for any bugs found]_
2. _[e.g., Plan feature flag rollout strategy]_
3. _[e.g., Additional optimizations needed before production]_

**Confidence Level:** ☐ High ☐ Medium ☐ Low

---

## Appendix: Raw Data

**Screenshots:**
_[Link to or attach screenshots of token list, network selector, memory profiler]_

**Performance Trace Files:**
_[Link to Xcode Instruments trace, Android Profiler session, or Chrome DevTools profile]_

**Additional Notes:**
_[Any other observations, data, or context that doesn't fit above]_ -->
