# Learnings — PR #11206 round 4

- When a provider's catch path already reports through `#reportWriteError`, a service-level batch log without a cause is a duplicate summary, not lost diagnostics. Check who reports first before accepting a "cause lost" finding.
- `normalizeHyperLiquidError` maps a bare `PerpsErrorCode` string (e.g. `KEYRING_LOCKED`) to that code via `isPerpsErrorCode`, so an early-return helper can pass the code string directly.
- `AggregatedPerpsProvider.closePositions` passes the result through unchanged. Only spread-wrapping routes need `carryProviderErrorCause`; `replacePositionTPSLLeg` (`:1100`) spreads without it, which is harmless today because `TradingService` does not read its cause.
- `docs/architecture.md` hardcodes the error-code count; any PR that adds a code should update it.
