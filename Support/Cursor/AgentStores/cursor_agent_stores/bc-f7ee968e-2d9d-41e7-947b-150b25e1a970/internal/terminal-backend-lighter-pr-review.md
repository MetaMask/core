

Recommendation: Request changes. Fresh review of all 17 changed files at 5f4a7d4fb5c, against merge-base 238fd01bce4d of origin/main. Both still match their remote refs.

1. [P2] Validate account responses against the active provider mode

Comment on changed line [PerpsController.ts (line 5099)](/core/packages/perps-controller/src/PerpsController.ts:5099):

With activeProvider: 'lighter' and defaultProvider: 'hyperliquid', every Lighter REST account response fails this predicate, including valid responses from the current provider. That configuration is supported when the multi-provider flag is off and after an explicit provider switch. MarketDataService consequently skips updating accountState, leaving it null or stale. Please resolve the current account venue from the active direct provider, using defaultProvider only in aggregated mode, and cover this configuration in the regression tests. This PR introduces the rejection through the new predicate; origin/main commits these successful responses.

2. [P2] Preserve an explicitly saved default during delayed migration

Comment on changed line [PerpsController.ts (line 2225)](/core/packages/perps-controller/src/PerpsController.ts:2225):

If the multi-provider flag is unavailable during construction, setDefaultProvider('lighter') can successfully save the preference before initialization. When the flag becomes available, initialization runs this migration and overwrites that choice with the previous direct provider, commonly HyperLiquid. hasExplicitProviderSelection does not prevent this because only switchProvider sets it. Please distinguish an existing saved default from legacy state that needs a default inferred, and preserve the saved choice during migration. Both operations are introduced by this PR, and their interaction defeats the setter’s documented pre-initialization persistence. Add coverage that saves the default before enabling the flag and initializing.

3. [P2] Move the available-to-trade subscription when its default changes

Comment on changed line [AggregatedPerpsProvider.ts (line 299)](/core/packages/perps-controller/src/providers/AggregatedPerpsProvider.ts:299):

subscribeToAvailableToTrade also accepts an omitted providerId, but it never registers with the new rerouting helper. A subscription started with Lighter as the default returns a no-op cleanup; changing the default to HyperLiquid never opens the supported stream. In the opposite direction, it continues delivering HyperLiquid values after the default becomes Lighter. Please track subscriptions without an explicit route, invalidate their previous value when moving, and preserve explicitly routed subscriptions. Although the subscription method is unchanged, this PR introduces the regression by making its previously immutable default mutable. Cover both transitions.

Copyable PR summary

Request changes. The subscription invalidation, explicit-selection persistence, failed-open retry, and connection-listener fixes address the earlier concerns and remain within this PR’s scope. Before merging, please correct direct-provider account validation, preserve defaults saved before migration, and include available-to-trade subscriptions in default changes. These remaining cases affect balance freshness and whether the saved venue preference is honored.
