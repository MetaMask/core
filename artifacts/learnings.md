# Learnings — full-branch Perps review at 06dafcb

- Aggregation must override a provider's lenient default read mode when its public contract distinguishes failed from zero balances. Testing only mocked rejections misses adapters that encode failure as a successful empty state.
- A single-provider fast path is still an execution boundary. Passing a mixed tagged array through to the one loaded provider discards ownership just as surely as default-routing an ambiguous multi-provider request.
- When a batch changes from default-only execution to fan-out, all derived economics need the same target partition. A pre-filter by `getWriteProviderId()` and one default-scoped fee resolution become stale even if their own lines are mostly unchanged.
- Parameter precedence needs one definition across controller guards, fee estimation, aggregation, and venue adapters. In this diff `closeAll` beats `symbols` in some layers but not others, while fee selection and execution disagree about `targets` versus `closeAll`.
- REST and subscriptions each need their own direct/single-provider regression. Special-casing only the read path leaves the stream with a different shape and drops top-level venue-local fields during fallback.
- Persisted derived values need identity provenance, not only a provider key. Carrying `accountValue1dAgo` forward without account and network checks can combine two users' observations.
- New type exports need a test imported through the package name. Internal `src/types` imports do not verify the public entry point.

## Prior Bugbot pass on PR 11461

- A single-venue passthrough is not safe for a new field the venue does not read. HyperLiquid treats a missing `symbols` list as close-all, so `targets` must be rewritten to `symbols` before that call.
- `depositRoutes[0]` follows map insertion order. Once `getDepositRoutes` lists every venue, the deposit has to select `providerId` or `getWriteProviderId()` and fail closed when that venue has no route.
- A thrown `Promise.allSettled` entry drops out of `results` unless the merge still has the requested symbols. Cancel already did this; close did not.
- An `isCurrent` check that accepts "provider id matches the default" accepts a one-venue fallback after a second venue has recovered. Compare the snapshot shape to the current venue count.

## Round 2

- Reroute old emissions too, not only old reads. When a stream moves from default-routed to fan-out, check every placeholder the adapters already emit. Lighter's wallet-rebind `EMPTY_ACCOUNT_STATE` was harmless while the stream followed the default venue. Under the aggregate contract it becomes a confirmed $0 venue. Grep adapters for zero-valued constants that reach subscriber callbacks.
- Price fees where they are applied. A broadcast fee context gives one resolution to every venue, even though each venue charges its own batch. Resolve per venue (own notional, own route scope) and scope the setter to that venue. Summing every venue's notional over-charges the venue that consumes the fee.
- Provenance makes a carried value safe but does not supply it. With account and network checks in place, `accountValue1dAgo` has no producer. Record that explicitly so it is not mistaken for working history.
- Renaming an immer callback parameter without renaming its uses silently binds the outer `state`. The no-shadow lint caught it, and a mutation check confirmed the test would too.

## Round 3

- Fix a placeholder where it is produced. The aggregator cannot tell Lighter's rebind zeros from a real zero, but the adapter knows which of its three reset callers is authoritative: switch and deselect are unknown, a venue-confirmed missing account is a real zero. Give the reset an explicit value parameter so each caller states which it means.
