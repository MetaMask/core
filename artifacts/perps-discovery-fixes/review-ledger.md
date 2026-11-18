# perps-review-pr: discovery-fix re-review ledger

## Request, scope and frozen revisions

- Request: evaluate three supplied P1 findings (account stream wallet scope, close-all failed position discovery, cancellation discovery), fix valid findings and then run the requested perps-review-pr skill.
- Repository/client: Core, package `@metamask/perps-controller`.
- Review base and exact Git HEAD: `a48398a677ca5e67abd8616a4c96b73d23da37ef` (the user's current commit; no new commit was made).
- Review head: that commit plus the 17-file working-tree snapshot below. Deterministic snapshot SHA-256: `4c4de745332122ad28315ee3628c2c6b57fa91a383fcea3642843aed37cfbe1a` (sorted path + NUL + contents + NUL). The new regression test is included although untracked.
- Branch context only: origin/main merge-base `9581ccfa5fa060e2a126c181c3e9e59ab4d027a6`. This review covers the fixes relative to HEAD, **not the entire pre-existing branch**.
- Skill source checkout: `/Users/matthewdenton/code/consensys/skills` at `d1bfc262835e0710665156d00773025544ac3600`; generated canonical review revision `fa5755de42c6ba8f4a0a3c30dfe498134d52c43e` from `references/review-sources.json`.
- References read: SKILL.md, shared.md, core.md, repos/core.md, shared-packages.md, parity.md, owned-paths.json, review-sources.json and report-template.md. No UI/locale delegation applies.
- Existing root review artifacts and unrelated untracked files were preserved; this task's output root is `artifacts/perps-discovery-fixes/`.
- Final skill phase: static source/diff/recorded-evidence review only. No tests, builds, installs, runtime probes, recipes, product changes, publication or cleanup occurred within this final phase.

## Changed-file inventory

- `packages/perps-controller/CHANGELOG.md`
- `packages/perps-controller/README.md`
- `packages/perps-controller/src/PerpsController.ts`
- `packages/perps-controller/src/aggregation/SubscriptionMultiplexer.ts`
- `packages/perps-controller/src/errors.ts`
- `packages/perps-controller/src/index.ts`
- `packages/perps-controller/src/providers/AggregatedPerpsProvider.ts`
- `packages/perps-controller/src/providers/HyperLiquidProvider.ts`
- `packages/perps-controller/src/providers/LighterProvider.ts`
- `packages/perps-controller/src/services/ServiceContext.ts`
- `packages/perps-controller/src/services/TradingService.ts`
- `packages/perps-controller/src/types/index.ts`
- `packages/perps-controller/src/utils/standaloneInfoClient.ts`
- `packages/perps-controller/tests/src/providers/AggregatedPerpsProvider.discovery.test.ts`
- `packages/perps-controller/tests/src/providers/AggregatedPerpsProvider.test.ts`
- `packages/perps-controller/tests/src/providers/HyperLiquidProvider.history.test.ts`
- `packages/perps-controller/tests/src/providers/HyperLiquidProvider.standalone.test.ts`

The files map to wallet ownership and account stream cleanup (Lighter/aggregate/multiplexer), strict discovery (both providers, aggregate, standalone helper), cancellation orchestration and public contracts (controller/service/context/types/errors/index), and tests/docs/changelog. All other package files and unrelated working-tree content are excluded.

## Acceptance and prior-round history

| Finding | Prior failure | Final source/test evidence | Outcome |
|---|---|---|---|
| Supplied P1 #1 | Selected wallet A can enter an account stream explicitly requested for B. | E1; real Lighter subscription rejects B, healthy HyperLiquid stays subscribed, Lighter becomes unavailable; later selected-wallet mismatch cannot emit balances; cleanup and case-insensitive A are covered. | Resolved |
| Supplied P1 #2 | A failed Lighter getAccountByIndex becomes empty positions during aggregate close-all. | E2; strict position read rejects transport/missing bound payload; aggregate keeps successful closes and adds a venue-attributed batch error. Confirmed empty/no account cases remain empty. | Resolved |
| Supplied P1 #3 | Failed discovery drops an explicit cancellation target and cancel-all can claim complete success. | E3; strict discovery carries successful orders and per-venue failures; real controller.cancelOrders preserves successful cancellations plus explicit unresolved IDs/discoveryFailures/error and nonzero failureCount. | Resolved |
| First static review follow-up | New strict-read option was inconsistent in aggregate positions and standalone HyperLiquid read paths. | E4; four failing tests were observed, then strict propagation was implemented in aggregate/HyperLiquid/standalone helpers; successful empty and normal reads are covered. | Resolved before final review |

## Evidence map

- **E1 (wallet/stream scope):** `src/providers/LighterProvider.ts:10153` shared scope guard and `:18103` account subscription; `src/aggregation/SubscriptionMultiplexer.ts:436` optional per-venue setup error continuation; `src/providers/AggregatedPerpsProvider.ts:2057` unavailable bookkeeping. `tests/src/providers/AggregatedPerpsProvider.discovery.test.ts:93–186` exercises real Lighter mismatch, selected-wallet casing, later mismatch and cleanup. `tests/src/providers/AggregatedPerpsProvider.test.ts:3675` keeps healthy streams on sibling setup failure. Paths here and below are relative to `packages/perps-controller/`.
- **E2 (close-all discovery):** `src/providers/LighterProvider.ts:10030–10100`; `src/providers/AggregatedPerpsProvider.ts:1514–1532` strict fallback and `:1585–1622` merge. `tests/src/providers/AggregatedPerpsProvider.discovery.test.ts:210–268` covers real transport rejection, missing bound payload, confirmed empty and nonexistent Lighter account. Unknown position count is not invented: close-all reports the failed venue in batch `error`, not fictional per-position results.
- **E3 (cancel discovery):** `src/providers/AggregatedPerpsProvider.ts:846–878`; `src/errors.ts:104` OrderDiscoveryError; `src/services/TradingService.ts:2120–2300`; `src/PerpsController.ts:4078`; `src/types/index.ts:1465–1498`; `src/index.ts:824`. `tests/src/providers/AggregatedPerpsProvider.discovery.test.ts:270–436` covers real controller + aggregate + Lighter explicit/cancel-all/legacy requests, exported error class/payload, lenient compatibility, unrelated failed venue, empty filters and all-unresolved requests. Existing mixed-venue/colliding-ID tests in AggregatedPerpsProvider.test.ts and TradingService.test.ts remain passing.
- **E4 (strict read consistency):** `src/providers/AggregatedPerpsProvider.ts:672–684`, `src/providers/HyperLiquidProvider.ts:13806–14085,14340–14460`, `src/utils/standaloneInfoClient.ts:45–116`. `tests/src/providers/AggregatedPerpsProvider.discovery.test.ts:188–208`; `tests/src/providers/HyperLiquidProvider.history.test.ts:1589–1650`; `tests/src/providers/HyperLiquidProvider.standalone.test.ts:1342–1380`. Legacy lenient queries remain opt-out/default; strict DEX discovery rejects any unavailable read. Position TP/SL decorations remain best-effort; strict position discovery concerns authoritative position state, not optional order context.
- **T1 (tracing/metrics):** `src/services/TradingService.ts:2338–2377` retains its existing catch/finally, typed event/duration, counts and endTrace; the new partial outcome flows through that ownership.
- **D1 (boundary/security):** reviewed all production additions. Diff-only search for added `react-native`, Engine, Sentry, DevLogger, __DEV__, window, chrome.*, app/ui imports, TODO, console.*, and URL literals found no matches. No package manifests/dependency graph, flags, permissions, secrets or signing boundary changed. OrderDiscoveryError uses type-only domain imports and is exported explicitly, without a barrel.

## K1: public contract impact and compatibility

| Surface | Impact | Compatibility/migration |
|---|---|---|
| Controller persisted state | None | No migration. |
| Controller action/method names | None | Existing public calls remain valid. |
| Read params | Optional throwOnUnavailable added to GetPositionsParams/GetOrdersParams | Existing lenient reads remain default; internal destructive discovery opts in. Both venues, aggregate paths and standalone HyperLiquid propagate strict behavior. |
| ServiceContext | getOpenOrders callback accepts optional GetOrdersParams | Existing no-argument callbacks remain assignable; controller forwards options. |
| Result types | Optional CancelOrdersResult.discoveryFailures and documented batch error/completeness semantics | Successful results remain; consumers must inspect discoveryFailures/error. failureCount includes unresolved IDs or one unavailable venue when unknown; no fabricated symbol/order count. |
| Package export | Add OrderDiscoveryError | Root import and instance/payload asserted in consumer-style regression. |
| Events/constants | None | No event/constant migration. |
| Release metadata | Current package 23.1.0 unchanged, Unreleased fixes updated | Not a release/bump PR; no removed or renamed export and no new required parameter. Release version policy remains with release process. |

README.md:95–119 describes result completeness, strict reads, additive compatibility and client rollout responsibility. CHANGELOG.md Unreleased Fixed records all three consumer-facing corrections. Consumer notes follow; source inspection is not a client compilation claim.

## C1: cross-repository source conformity

| Checkout/revision | Inspected source and result | Verification boundary |
|---|---|---|
| Mobile `d35ecaee8fbfad2187314e3471cff5fe723237e4` | package.json/yarn.lock resolve perps-controller 22.3.0; `app/components/UI/Perps/hooks/usePerpsCancelAllOrders.ts:92–134` and `usePerpsCloseAllPositions.ts:96–137` use batch counts and callbacks; optional result fields are additive. | Current hooks can navigate on partial success. Before adopting this unreleased multi-venue surface they must surface incomplete outcomes, including close-all batch error; no upgraded build/runtime claim. |
| Extension `803491c52a705f241204fa96b13dfe9392d6bfb6` | package.json/yarn.lock resolve 22.3.0; `ui/components/app/perps/perps-view.tsx:231–270` handles close partials via successCount/failureCount. | New cancel discovery failures are visible through failureCount, but close-all unknown-count failures require checking batch error. This is a documented consumer rollout requirement, not verified client integration in this Core fix. |
| Terminal `d07759de8dc572b5b427d10a525982ce8f555440` | `src/features/perpetuals/ports/IPerpsProvider.ts`, `queries/cancel-order-mutation.ts`, `queries/close-position-mutation.ts`; the available checkout uses its own provider port/single-item operations and has no root package.json perps-controller dependency. | Current shared-controller batch integration is unavailable in this checkout. Do not infer Terminal compatibility or compilation from these older/different call sites. |

No client was changed, built or run. These revisions are source-only reference points, not tested dependency upgrades. Existing UI math/divergences outside the changed Core behavior were not imported into Core and were not reviewed as part of this patch.

## V1: recorded development evidence (before final static review)

- Initial three-path regressions: 7 failures / 1 pass before implementation; initial mismatched subscriptions additionally left polling timers during the failed assertions. The final implementation rejects before registration and tests clean up successfully.
- HyperLiquid strict open-order tests: 2 failures before implementation, then passing (all/partial DEX errors).
- First-review consistency follow-up: 4 failing regressions (aggregate positions, direct HyperLiquid positions, two standalone paths) before the follow-up fix.
- Final `yarn workspace @metamask/perps-controller test:coverage run`: **137 files passed; 7,306 tests passed; 40 skipped**. Coverage thresholds passed: statements 92.14%, branches 87.20%, functions 90.88%, lines 92.22%. Recorded in `/tmp/perps-coverage-verified.log`.
- Final `yarn lint:tsc:check`: **No new type errors detected**; repository's existing suppression policy retained, no new suppression added. `/tmp/perps-tsc-verified.log`.
- Final `yarn exec oxlint packages/perps-controller`: pass; `/tmp/perps-lint-verified.log`.
- Final Oxfmt check on all 17 changed/new files: pass; `/tmp/perps-format-verified.log`.
- Final `yarn changelog:validate`: all workspaces passed; `/tmp/perps-changelog-verified.log`.
- Static `git diff --check`: pass. No full-repository test-suite or client runtime/build execution is claimed.

## Individual criteria ledger

Every bold checkbox rule in shared.md/core.md is listed individually, followed by prose-only/cross-cutting requirements. NOT_APPLICABLE rows explicitly state scope; PASS means static inspection of the cited source and recorded evidence, not a new runtime run by the review skill.

| ID | Family | Rule label | Outcome | Evidence or scope reason |
|---|---|---|---|---|
| R001 | Controller Portability (Core) | Platform import in controller | PASS | D1: changed production imports and diff; no platform/dependency boundary was added. |
| R002 | Controller Portability (Core) | Deep import from app code | NOT_APPLICABLE | No client imports changed; root OrderDiscoveryError export is exercised through src/index.ts consumer-style test (E3). |
| R003 | Controller Portability (Core) | New dependency not in DI interface | PASS | D1: changed production imports and diff; no platform/dependency boundary was added. |
| R004 | Controller Portability (Core) | Breaking the publisher contract | PASS | K1: additive optional read/result fields and export; no controller state/event/action changes; documented client completeness checks; C1 identifies unverified client runtime integration. |
| R005 | Perps Math Comes From the Controller | Client-side trading math | NOT_APPLICABLE | No trading formula or client-side math changes; account total builders are reused unchanged. |
| R006 | Perps Math Comes From the Controller | Copy or port of existing logic | NOT_APPLICABLE | No trading formula or client-side math changes; account total builders are reused unchanged. |
| R007 | Shared Formatting & Display Precision | Local formatter copy | NOT_APPLICABLE | No numeric display, formatting, locale, or precision changes. |
| R008 | Shared Formatting & Display Precision | Missing shared capability | NOT_APPLICABLE | No numeric display, formatting, locale, or precision changes. |
| R009 | Shared Formatting & Display Precision | Precision divergence | NOT_APPLICABLE | No numeric display, formatting, locale, or precision changes. |
| R010 | Shared Formatting & Display Precision | Intl built per call | NOT_APPLICABLE | No numeric display, formatting, locale, or precision changes. |
| R011 | Shared Formatting & Display Precision | Locale formatting not reused | NOT_APPLICABLE | No numeric display, formatting, locale, or precision changes. |
| R012 | Missing numeric data stays undefined | Missing data converted to zero | PASS | E1–E3: failed reads remain unavailable/errors; no selected-wallet substitution or invented numeric state; zero/no-account cases inspected. |
| R013 | Missing numeric data stays undefined | Unknown treated as confirmed zero | PASS | E1–E3: failed reads remain unavailable/errors; no selected-wallet substitution or invented numeric state; zero/no-account cases inspected. |
| R014 | Missing numeric data stays undefined | Reviewer proposes a fabricated value | PASS | E1–E3: failed reads remain unavailable/errors; no selected-wallet substitution or invented numeric state; zero/no-account cases inspected. |
| R015 | Missing numeric data stays undefined | Placeholder written into numeric state | PASS | E1–E3: failed reads remain unavailable/errors; no selected-wallet substitution or invented numeric state; zero/no-account cases inspected. |
| R016 | Magic Strings, Magic Numbers & Placeholder Values | Inline timeout/delay values | NOT_APPLICABLE | No new timing, leverage, decimal precision, endpoint, threshold or cache-duration literals in production. |
| R017 | Magic Strings, Magic Numbers & Placeholder Values | Hardcoded leverage fallback | NOT_APPLICABLE | No new timing, leverage, decimal precision, endpoint, threshold or cache-duration literals in production. |
| R018 | Magic Strings, Magic Numbers & Placeholder Values | Hardcoded precision | NOT_APPLICABLE | No new timing, leverage, decimal precision, endpoint, threshold or cache-duration literals in production. |
| R019 | Magic Strings, Magic Numbers & Placeholder Values | Hardcoded API URLs | NOT_APPLICABLE | No new timing, leverage, decimal precision, endpoint, threshold or cache-duration literals in production. |
| R020 | Magic Strings, Magic Numbers & Placeholder Values | Hardcoded validation thresholds | NOT_APPLICABLE | No new timing, leverage, decimal precision, endpoint, threshold or cache-duration literals in production. |
| R021 | Magic Strings, Magic Numbers & Placeholder Values | Hardcoded cache durations | NOT_APPLICABLE | No new timing, leverage, decimal precision, endpoint, threshold or cache-duration literals in production. |
| R022 | Protocol Abstraction | Execution identity inferred from display fields | PASS | E1–E3: wallet scope is checked at Lighter boundary; venue identity is attached at aggregate reads and retained through cancellation targets and discovery failures. |
| R023 | Protocol Abstraction | Entity ownership lost in transit | PASS | E1–E3: wallet scope is checked at Lighter boundary; venue identity is attached at aggregate reads and retained through cancellation targets and discovery failures. |
| R024 | Protocol Abstraction | Hardcoded provider | PASS | E1–E3: wallet scope is checked at Lighter boundary; venue identity is attached at aggregate reads and retained through cancellation targets and discovery failures. |
| R025 | Protocol Abstraction | Provider identity or capability hardcoded in client code | NOT_APPLICABLE | No client feature code, executable price/size normalization or order display changes; symbol literals occur only in tests. |
| R026 | Protocol Abstraction | Provider-specific error handling | PASS | E1–E3: wallet scope is checked at Lighter boundary; venue identity is attached at aggregate reads and retained through cancellation targets and discovery failures. |
| R027 | Protocol Abstraction | Hardcoded market symbols | NOT_APPLICABLE | No client feature code, executable price/size normalization or order display changes; symbol literals occur only in tests. |
| R028 | Protocol Abstraction | Executable precision differs from what the user confirms | NOT_APPLICABLE | No client feature code, executable price/size normalization or order display changes; symbol literals occur only in tests. |
| R029 | Protocol Abstraction | `detailedOrderType` rendered directly in UI | NOT_APPLICABLE | No client feature code, executable price/size normalization or order display changes; symbol literals occur only in tests. |
| R030 | Pro Mode UI Gating | Single-gate assumption | NOT_APPLICABLE | No UI, mode, rollout flag, tab or fixture-mode changes. |
| R031 | Pro Mode UI Gating | Fixture starts in Lite mode | NOT_APPLICABLE | No UI, mode, rollout flag, tab or fixture-mode changes. |
| R032 | Pro Mode UI Gating | Pro-only code tested only via live UI | NOT_APPLICABLE | No UI, mode, rollout flag, tab or fixture-mode changes. |
| R033 | Pro Mode UI Gating | Hardcoded tab index across feature gates | NOT_APPLICABLE | No UI, mode, rollout flag, tab or fixture-mode changes. |
| R034 | MetaMetrics Events | Magic string event properties | NOT_APPLICABLE | No event/property/value, view, component attribution or screen instrumentation changes. |
| R035 | MetaMetrics Events | Magic string event values | NOT_APPLICABLE | No event/property/value, view, component attribution or screen instrumentation changes. |
| R036 | MetaMetrics Events | New event instead of property | NOT_APPLICABLE | No event/property/value, view, component attribution or screen instrumentation changes. |
| R037 | MetaMetrics Events | Missing `source` on screen view | NOT_APPLICABLE | No event/property/value, view, component attribution or screen instrumentation changes. |
| R038 | MetaMetrics Events | Hardcoded source in reusable component | NOT_APPLICABLE | No event/property/value, view, component attribution or screen instrumentation changes. |
| R039 | MetaMetrics Events | New screen/view without tracking | NOT_APPLICABLE | No event/property/value, view, component attribution or screen instrumentation changes. |
| R040 | MetaMetrics Events | Missing `completion_duration` on transaction events | PASS | T1: existing TradingService.cancelOrders finally block retains typed event properties, duration, counts and trace completion on every return/throw. |
| R041 | Sentry Tracing | Unbounded background trace volume | NOT_APPLICABLE | No added background span, polling loop, trace name or sampling policy; existing foreground trace is retained (T1). |
| R042 | Connection & WebSocket Architecture | Cleanup has no owner for in-flight setup | PASS | E1: scope is validated before registration and before account delivery; cleanup deletes the exact wrapped subscriber; healthy venue cleanup is retained after a sibling setup failure. Existing session generation guards remain. |
| R043 | Connection & WebSocket Architecture | A second lifecycle owner | NOT_APPLICABLE | No client lifecycle owner, stream-manager bypass, React state listener, chart or WebView changes. |
| R044 | Connection & WebSocket Architecture | Unthrottled WS → setState | NOT_APPLICABLE | No client lifecycle owner, stream-manager bypass, React state listener, chart or WebView changes. |
| R045 | Connection & WebSocket Architecture | Per-consumer subscription bypasses the shared channel | NOT_APPLICABLE | No client lifecycle owner, stream-manager bypass, React state listener, chart or WebView changes. |
| R046 | Connection & WebSocket Architecture | WS subscription leak | PASS | E1: scope is validated before registration and before account delivery; cleanup deletes the exact wrapped subscriber; healthy venue cleanup is retained after a sibling setup failure. Existing session generation guards remain. |
| R047 | Connection & WebSocket Architecture | Stale data after async gap | PASS | E1: scope is validated before registration and before account delivery; cleanup deletes the exact wrapped subscriber; healthy venue cleanup is retained after a sibling setup failure. Existing session generation guards remain. |
| R048 | Connection & WebSocket Architecture | Static WebView work coupled to live ticks | NOT_APPLICABLE | No client lifecycle owner, stream-manager bypass, React state listener, chart or WebView changes. |
| R049 | Data Flow & State | Delayed balance tracker loses its initiating context | NOT_APPLICABLE | No balance-credit tracker, validation classification, UI editing/default lifecycle, structural controller state, preload hook, mutation lock or pre-trade validation change. |
| R050 | Data Flow & State | A changed classification leaves old priority rules | NOT_APPLICABLE | No balance-credit tracker, validation classification, UI editing/default lifecycle, structural controller state, preload hook, mutation lock or pre-trade validation change. |
| R051 | Data Flow & State | State persists outside the rendered control | NOT_APPLICABLE | No balance-credit tracker, validation classification, UI editing/default lifecycle, structural controller state, preload hook, mutation lock or pre-trade validation change. |
| R052 | Data Flow & State | React persistence mistaken for WebView synchronization | NOT_APPLICABLE | No balance-credit tracker, validation classification, UI editing/default lifecycle, structural controller state, preload hook, mutation lock or pre-trade validation change. |
| R053 | Data Flow & State | Old context remains actionable | PASS | E1: initial mismatch rejects and subsequent mismatched wallet delivery emits null rather than another wallet balance; genuine zero remains distinct. |
| R054 | Data Flow & State | Late defaults overwrite a user choice | NOT_APPLICABLE | No balance-credit tracker, validation classification, UI editing/default lifecycle, structural controller state, preload hook, mutation lock or pre-trade validation change. |
| R055 | Data Flow & State | Direct controller call from component | NOT_APPLICABLE | No balance-credit tracker, validation classification, UI editing/default lifecycle, structural controller state, preload hook, mutation lock or pre-trade validation change. |
| R056 | Data Flow & State | Missing `accountState` check | NOT_APPLICABLE | No balance-credit tracker, validation classification, UI editing/default lifecycle, structural controller state, preload hook, mutation lock or pre-trade validation change. |
| R057 | Data Flow & State | Derived flag promoted to structural state without its own lifecycle | NOT_APPLICABLE | No balance-credit tracker, validation classification, UI editing/default lifecycle, structural controller state, preload hook, mutation lock or pre-trade validation change. |
| R058 | Data Flow & State | Async flow loses ownership of cleanup | PASS | E1/T1: no new fire-and-forget setup/timers; wrapped subscription cleanup and existing finally/stream-pause ownership are preserved. |
| R059 | Data Flow & State | One in-flight mutation lock replaces earlier accepted outcomes | NOT_APPLICABLE | No balance-credit tracker, validation classification, UI editing/default lifecycle, structural controller state, preload hook, mutation lock or pre-trade validation change. |
| R060 | Data Flow & State | Preload data not seeded | NOT_APPLICABLE | No balance-credit tracker, validation classification, UI editing/default lifecycle, structural controller state, preload hook, mutation lock or pre-trade validation change. |
| R061 | Data Flow & State | Leverage/validation bypass | NOT_APPLICABLE | No balance-credit tracker, validation classification, UI editing/default lifecycle, structural controller state, preload hook, mutation lock or pre-trade validation change. |
| R062 | Trade Flow & Order Execution | Numeric meaning changes in transit | NOT_APPLICABLE | No units/formula, order sizing, slippage, pre-trade guard or client post-success refresh changes. Existing cancel/close transports are reused; C1 records consumer rollout checks. |
| R063 | Trade Flow & Order Execution | Pre-trade checks missing | NOT_APPLICABLE | No units/formula, order sizing, slippage, pre-trade guard or client post-success refresh changes. Existing cancel/close transports are reused; C1 records consumer rollout checks. |
| R064 | Trade Flow & Order Execution | Post-trade state not refreshed | NOT_APPLICABLE | No units/formula, order sizing, slippage, pre-trade guard or client post-success refresh changes. Existing cancel/close transports are reused; C1 records consumer rollout checks. |
| R065 | Trade Flow & Order Execution | Missing or hardcoded slippage | NOT_APPLICABLE | No units/formula, order sizing, slippage, pre-trade guard or client post-success refresh changes. Existing cancel/close transports are reused; C1 records consumer rollout checks. |
| R066 | Test Layer Coverage | Degenerate fixtures hide formula errors | PASS | E1–E4/V1: distinct A/B balances, actual Lighter subscription/read implementation and real controller/service integration; regression failures were observed before implementation. |
| R067 | Test Layer Coverage | Numeric control units change partially | NOT_APPLICABLE | No numeric input control, conversion, step, gesture or accessibility change. |
| R068 | Test Layer Coverage | Clock control changes the test mechanism | PASS | V1/E1–E4: existing fake-clock test setup and pending-timer teardown are reused; socket callbacks and setImmediate advance real provider setup without real polling waits. |
| R069 | Test Layer Coverage | Assertions miss the behavior under review | PASS | E1–E4/V1: distinct A/B balances, actual Lighter subscription/read implementation and real controller/service integration; regression failures were observed before implementation. |
| R070 | Embedded Signer Boundaries | Navigation policy mistaken for network isolation | NOT_APPLICABLE | No signer bridge, key material, embedded document, navigation or transport-boundary changes. |
| R071 | Embedded Signer Boundaries | Bridge messages trusted by assertion | NOT_APPLICABLE | No signer bridge, key material, embedded document, navigation or transport-boundary changes. |
| R072 | Public Controller Contracts Must Be Versioned and Migration-Aware | State shape changes without client migration | NOT_APPLICABLE | No persisted state, migration, event name or payload changes (K1). |
| R073 | Public Controller Contracts Must Be Versioned and Migration-Aware | Method signature changes without compatibility plan | PASS | K1: existing signatures accept all prior calls; ServiceContext callback only adds an optional parameter, and strict discovery is opt-in outside batch execution; README documents compatibility. |
| R074 | Public Controller Contracts Must Be Versioned and Migration-Aware | Event name/payload drift | NOT_APPLICABLE | No persisted state, migration, event name or payload changes (K1). |
| R075 | Public Controller Contracts Must Be Versioned and Migration-Aware | Package export changes without package-level tests | PASS | E3/K1: root OrderDiscoveryError import and instance/payload assertions; optional result fields covered through real controller.cancelOrders. |
| R076 | Package Release Metadata Must Match Contract Impact | Public API/state change without changelog | PASS | K1/V1: package Unreleased Fixed entries describe scope, close-all error and cancellation discovery metadata; changelog validation passed. |
| R077 | Package Release Metadata Must Match Contract Impact | Breaking change released as minor/patch | PASS | K1: no removed/renamed exports, required new parameters, state/event changes or release bump; package remains 23.1.0 with Unreleased fixes/additive strict-read surface. |
| R078 | Package Release Metadata Must Match Contract Impact | Controller package and client integration out of sync | NOT_CHECKED | C1: clients resolve 22.3.0 and were not rebuilt against this unreleased snapshot; this is not a dependency-bump PR. Explicit consumer rollout requirements are documented. |
| R079 | HyperLiquid Multi-Sig Account Handling in HyperLiquidProvider | Catch-path classifier without proactive probe | NOT_APPLICABLE | Only position/order read paths change; no exchange write or account-mode probe is added or moved. |
| R080 | HyperLiquid Multi-Sig Account Handling in HyperLiquidProvider | Proactive probe without catch-path classifier | NOT_APPLICABLE | Only position/order read paths change; no exchange write or account-mode probe is added or moved. |
| R081 | HyperLiquid Multi-Sig Account Handling in HyperLiquidProvider | Probe placed too early | NOT_APPLICABLE | Only position/order read paths change; no exchange write or account-mode probe is added or moved. |
| R082 | `#ensureUnifiedAccountEnabled` — Retry vs Permanent-Failure Cache Semantics | Permanent account-shape condition cached as retryable | NOT_APPLICABLE | No unified-account setup, retry flag, or readiness-cache changes. |
| R083 | `#ensureUnifiedAccountEnabled` — Retry vs Permanent-Failure Cache Semantics | Retryable flag + permanent condition | NOT_APPLICABLE | No unified-account setup, retry flag, or readiness-cache changes. |
| R084 | `#ensureUnifiedAccountEnabled` — Retry vs Permanent-Failure Cache Semantics | Deferred or skipped path treated as a failure | NOT_APPLICABLE | No unified-account setup, retry flag, or readiness-cache changes. |
| R085 | One Formatter Surface in the Controller | Duplicate formatting logic | NOT_APPLICABLE | No formatter surface or formatting implementation changes. |
| R086 | One Formatter Surface in the Controller | Variant function instead of an option | NOT_APPLICABLE | No formatter surface or formatting implementation changes. |
| R087 | Blocking review checks | Confirmed anti-patterns are blocking | PASS | No remaining confirmed violation in the reviewed fix snapshot; original findings and review-round strict-read gap are resolved below. |
| R088 | Controller Portability (Core) | Published platform-agnostic controller surface | PASS | D1/K1: only internal Core imports and DI services are used; existing client imports are unaffected. |
| R089 | Protocol Abstraction | Aggregate/router and feature-flag boundaries | PASS | E1–E3: no client venue-specific branch, flag or default selection change; fan-out remains within the existing aggregate wrapper. |
| R090 | Sentry Tracing | Named async traces must end | PASS | T1: pre-existing cancel trace/metric finally remains around both strict discovery and execution; no extra fan-out trace is introduced. |
| R091 | Connection & WebSocket Architecture | Single wallet-root lifecycle owner | NOT_APPLICABLE | No client connection provider or lifecycle ownership change. |
| R092 | Data Flow & State | Controller-to-consumer data flow and standalone mode | PASS | E1–E4: controller callback forwards strict options; provider boundaries normalize errors, successful data stays tagged; standalone strict paths now reject unavailable reads. |
| R093 | Trade Flow & Order Execution | Existing submission checks and refresh ownership | NOT_APPLICABLE | No new order submission primitive, post-confirmation refetch or cache invalidator behavior is introduced; existing methods are reused. |
| R094 | Test Layer Coverage | Client-specific testing/i18n skill delegation | NOT_APPLICABLE | Only Core tests and docs changed; no locale strings, locale objects, translation calls, locale-sensitive tests or client testing ownership changes. |
| R095 | Metered Benefits Need a Strict Improvement | Economic predicate for metered allowance | NOT_APPLICABLE | No fee resolution, charged fee, benefit selection or allowance-consumption changes. |
| R096 | Read-only Account Guards Cover Every Write | Narrow guarded write boundary and lifecycle | PASS | E2/E3: strict discovery adds no exchange write or local write side effect; cancellations/closures use the original provider methods and their account/signer guards. |
| R097 | Evidence Expected Before Core Perps Review | Contract matrix, consumers, fallback tests, forbidden-import grep | PASS | K1/C1/V1/D1 below provide the required matrix, recorded consumer revisions, provider fallback tests and diff-only import/global search evidence. |
| R098 | Cross-repository conformity | Mobile/Extension/Terminal parity map and owned paths | PASS | C1: named Mobile/Extension hooks, Extension batch UI and Terminal ports/mutations were inspected at recorded revisions; no UI parity work is introduced by this Core-only fix. |
| R099 | Cross-repository conformity | Runtime/build parity for upgraded consumers | NOT_CHECKED | No client was installed, built or run during static review; supplied checkouts are older than the Core unreleased surface, and Terminal uses a different provider port. |
| R100 | Base review | Normal/error/empty/boundary/cleanup and sibling paths | PASS | E1–E4 plus prior finding history below trace each requested fix and the first-review strict-read consistency follow-up. |
| R101 | Base review | Test inspection distinct from execution | PASS | V1 lists evidence produced before final read-only review; no tests/builds/recipes/installs/probes ran during this final review. |
| R102 | Base review | Permissions, secrets, dependencies, flags, localization | PASS | D1/K1: no manifests, dependencies, permissions, sensitive material, UI flags, translations or telemetry schemas changed; account mismatch error exposes no wallet address. |
| R103 | Base review | Comments, catches and abstraction scope | PASS | Diff inspected: no TODO/debug/tool/ticket source comments; scope helper has read/setup/delivery callers; catches either rethrow, preserve typed discovery failures or invalidate account availability, not fabricated financial values. |

## Reconciliation and verdict

NOT_APPLICABLE: 65, NOT_CHECKED: 2, PASS: 36; total: 103 individual outcomes.

All 17 changed/new files and the three supplied acceptance cases map to evidence E1–E4/K1. No outstanding in-scope finding, unexplained exclusion or confirmed anti-pattern remains. Reviewer-side NOT_CHECKED boundaries are client compilation/runtime integration only. **APPROVE the reviewed fix snapshot**, not the entire pre-existing branch or a consumer dependency rollout.
