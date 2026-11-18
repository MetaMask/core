[Core] perps-controller: save a default exchange, and send each order to the exchange the user picks
Context

The scope needs a default venue in settings, a venue chosen per trade, and positions and balances from both venues at the same time. Today Mobile switches the whole app between venues with switchProvider, which re-initializes the controller and reconnects every stream (packages/perps-controller/src/PerpsController.ts:6113). The aggregated mode already runs both providers, but its default provider is fixed at construction. Writes that omit providerId silently fall back to that default (src/routing/ProviderRouter.ts:74-81).
Scope

    Add a persisted defaultProvider: PerpsProviderType to PerpsControllerState, separate from activeProvider.

    Add setDefaultProvider(providerId) as a messenger action. It updates the aggregated provider's default without re-initializing or reconnecting.

    In aggregated mode, refuse writes that don't name a venue (place, edit, cancel, close, TP/SL, margin, leverage, flip) with a structured error instead of the default fallback. Direct single-provider modes are unchanged.

    Key tradeConfigurations (leverage, order-book grouping, margin mode, pending config) by provider and symbol, so leverage set for HyperLiquid BTC doesn't apply to Lighter BTC. Include a state migration.

    Add a migration for persisted activeProvider values: hyperliquid or lighter becomes aggregated with defaultProvider set to the previous value, when the multi-provider flag is on (TAT-4394).

    Regenerate the messenger action types (PerpsController-method-action-types.ts) and update the CHANGELOG.

Acceptance criteria

    AC1 [state] Changing the default provider doesn't re-initialize the controller or reconnect any stream (test).

    AC2 [state] In aggregated mode, a write without providerId is refused and never reaches a provider (test).

    AC3 [state] Leverage and margin mode are stored and read per provider and symbol, and existing state migrates.

    AC4 [state] No behaviour change for clients that don't use aggregated mode.

    AC5 [state] A @metamask/perps-controller release containing this change is published, with a CHANGELOG entry.
