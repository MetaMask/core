[Core] Extend shared error-context tagging so Sentry dashboards can filter by operation/component/action

Background
The "Dashboard Perps - Health" Sentry dashboard (id 314902) looks empty for the extension project even though extension has ~200,886 feature:perps errors in the last 14 days — comparable in scale to mobile's ~420,262. Most dashboard widgets filter on component:, action:, or operation: tags, and those tags are effectively never set on extension events (component:PerpsConnectionManager returns 0 results), so the widgets render blank. Mobile shows a thin trickle of data in those same widgets (e.g. 42 component:PerpsConnectionManager events, 43 operation:position_management events) out of 420k total — barely enough to plot, not enough to be useful.

Technical Details
core/packages/perps-controller/src/PerpsController.ts, #getErrorContext (~line 2481-2499): the single shared helper (used by ~30 #logError call sites across the file, lines 1264-6966) that builds the object passed to the platform logger. It only ever puts feature, provider, network into tags; everything else callers pass as extra (e.g. operation: 'websocket_reconnect' at line 5462) lands in a non-indexed context.data blob named "PerpsController", invisible to Sentry's tag-based search/dashboard filters.

metamask-extension/app/scripts/controllers/perps/infrastructure.ts, createLogger (~line 112-171): confirmed not the problem — it faithfully forwards tags via scope.setTag and context via scope.setContext exactly as it receives them.

metamask-extension/app/scripts/lib/setupSentry.js, rewriteReport/beforeSend (~line 486-530): only adds installType/storageKind tags, doesn't strip anything.

ui/components/app/error-boundary/error-boundary.tsx (~line 23-25), wrapping ui/components/app/perps/perps-tab.tsx (~line 88-92): extension's only UI-level Sentry capture for perps, and it sends no tags at all (not even feature).

Mobile's component/operation tags come from a mobile-only UI code path not present in core or in the extension repo — out of scope to trace further here since the mobile repo isn't available locally.

This is a core change: #getErrorContext lives in the shared @metamask/perps-controller package consumed by both platforms.

Acceptance Criteria
Given a perps error is logged with an operation (or similar structured) value in its extra context, when #getErrorContext builds the Sentry payload, then that value is emitted as a Sentry tag, not just buried in context.data — for both extension and mobile.

feature, provider, network tags continue to be emitted unchanged (no regression).

The existing context.data "PerpsController" payload is preserved (additive change, not a replacement).

After deploy, the "Dashboard Perps - Health" widgets that filter on operation:\* show non-empty data for the extension project (273505) within a normal release cycle.

Unit tests for #getErrorContext / #logError cover the new tag-promotion behavior.

Out of Scope
Redesigning the dashboard's widget definitions themselves.

Reverse-engineering mobile's separate ad hoc UI-layer tagging path (mobile repo unavailable).

Adding new component/action instrumentation to extension's UI layer (error boundary) — track as a follow-up if wanted.
