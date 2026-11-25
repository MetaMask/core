# Updating changelogs

Each package in this repo has a file called `CHANGELOG.md` which is used to record consumer-facing changes that have been published over time. This file is useful for other engineers who want to know about new features, bugfixes, or breaking changes (particularly when upgrading a package in a consuming project).

A package's changelog should be updated in the same branch as changes that affect its consumer-facing API or behavior. To do this:

1. Look over the branch and identify changes you've made to the public API of the package.
2. Look for the "Unreleased" section of the package's changelog.
3. Decide which categories your changes belong to and ensure there are headers for those changes:
   - Added (for new "features", i.e., new exports, methods, or options)
   - Changed (for modifications to existing behavior)
   - Deprecated (for exports or options that may be removed soon)
   - Removed (for exports or options that _have_ been removed)
   - Fixed (for corrections to existing behavior)
   - Security (for patches to security vulnerabilities or other changes that enhance security)
4. Add one or more entries under the corresponding headers.
5. After updating a changelog, run `yarn changelog:validate` and fix any errors reported.

## Guidelines for adding changelog entries

### Describe one consumer-facing change per entry

Each entry should describe a single change that a consumer would adopt, be affected by, or evaluate as a unit. It is common that a pull request holds multiple changes that need to be documented, so a heuristic for deciding how to represent them is as follows:

- Split changes into separate entries when they require different kinds of actions from consumers or when consumers can adopt them independently.
  - For instance, breaking changes shouldn't be grouped with non-breaking changes because they require more explanation.
  - Tip: If the summary include "and" or "also" to join unrelated things, split it.
- Keep changes together when they belong to the same category (Added, Changed, etc.), they have the same compatibility status, and they function together to support a feature or address a problem.

One final note: Nested bullets should add detail to the summary, not add further changes.

```markdown
<!-- ❌ There are two separate changes in one (tip: look for use of "also") -->

- **BREAKING:** `TransakAdditionalRequirement.metadata.options` is now typed as `string[] | TransakAdditionalRequirementOption[]` instead of `string[]`. Clients that handle `getAdditionalRequirements` responses must handle both shapes. All `metadata` fields are also now optional ([#11672](https://github.com/MetaMask/core/pull/11672))
```

```markdown
<!-- ❌ Two separate changes are still listed in the same group -->

- **BREAKING:** `TransakAdditionalRequirement.metadata.options` is now typed as `string[] | TransakAdditionalRequirementOption[]` instead of `string[]` ([#11672](https://github.com/MetaMask/core/pull/11672))
  - Clients that handle `getAdditionalRequirements` responses must handle both shapes.
  - All `metadata` fields are also now optional.
```

```markdown
<!-- ✅ Now there are two separate entries; also, both response-shape changes are marked as breaking -->

- **BREAKING:** `TransakAdditionalRequirement.metadata.options` is now typed as `string[] | TransakAdditionalRequirementOption[]` instead of `string[]` ([#11672](https://github.com/MetaMask/core/pull/11672))
  - Clients that handle `getAdditionalRequirements` responses must handle both shapes.
- **BREAKING:** Make all properties in `TransakAdditionalRequirement.metadata` optional ([#11672](https://github.com/MetaMask/core/pull/11672))
  - Clients that handle `getAdditionalRequirements` responses must handle these properties being absent.
```

```markdown
<!-- ✅ Related API changes that consumers use together are grouped as one feature -->

- Add market-key support for watchlist and recently viewed market references ([#11698](https://github.com/MetaMask/core/pull/11698), [#11702](https://github.com/MetaMask/core/pull/11702))
  - `PerpsController.toggleWatchlistMarket`, `isWatchlistMarket`, `recordMarketViewed` and `selectIsWatchlistMarket` accept a market key, grouped venue rows and an optional `legacyProvider` to save or match the correct reference.
  - `resolveSavedPerpsMarkets` resolves legacy symbols to their original venue, `venue:` references to the named venue, and `market-key:` references to a matching unit-scale row. `selectRecentlyViewedMarkets` returns saved references for callers to resolve.
```

### Write concise, consumer-focused summaries

Write a concise summary of the change in one sentence or sentence fragment. Do not simply reuse the title of the PR or commit that introduced the change, but highlight the consumer-visible behavior, preferring to name specific parts of the API (public methods, types, options, arguments, etc.) that have been added or updated. When the first word is a verb, use imperative mood ("Add NetworkController", not "Added NetworkController").

```markdown
<!-- ❌ PR title is restated -->

- Fix: Bridge Txs ([#44](https://github.com/MetaMask/core/pull/44))
```

```markdown
<!-- ✅ Changes to API are spelled out -->

- **BREAKING:** Rename `Actions.BRIDGE_IN` to `Actions.BRIDGE_DEPOSIT` and `Actions.BRIDGE_OUT` to `Actions.BRIDGE_WITHDRAW` ([#44](https://github.com/MetaMask/core/pull/44))
```

### Link to pull requests

Follow the summary with links to the pull request(s) that introduced the change. If a pull request is not available yet, use a placeholder (e.g. `[#????](https://github.com/MetaMask/core/pull/????)`). When an entry has nested bullets, place the pull request links at the end of the parent item.

### Put supporting details in nested bullets

If a change requires further details to communicate its impact to consumers, list them under the summary. If a summary contains multiple sentences, try extracting everything after the first sentence to a nested list.

```markdown
<!-- ❌ There are multiple statements here -->

- Add `PERPS_ERROR_CODES.BATCH_INCOMPLETE` and `failures` (`{ providerId, error }[]`) on `ClosePositionsResult` and `CancelOrdersResult`. When any venue's batch throws or returns an error, `error` is `BATCH_INCOMPLETE` and `failures` keeps every venue's error, so a merged batch error stays a translatable code without hiding which venues failed ([#11461](https://github.com/MetaMask/core/pull/11461))
```

```markdown
<!-- ✅ Multiple statements are split up into one summary line + details listed below that -->

- Add `PERPS_ERROR_CODES.BATCH_INCOMPLETE` and `failures` (`{ providerId, error }[]`) on `ClosePositionsResult` and `CancelOrdersResult` ([#11461](https://github.com/MetaMask/core/pull/11461))
  - When any venue's batch throws or returns an error, `error` is `BATCH_INCOMPLETE` and `failures` keeps every venue's error, so a merged batch error stays a translatable code without hiding which venues failed
```

### Consolidate entries covering the same change

If multiple commits or pull requests represent the same change, consolidate their entries into one (including the list of pull request links).

```markdown
<!-- ❌ Multiple entries for the same dependency bump -->

- Bump `@metamask/transaction-controller` to 30.0.0 ([#100](https://github.com/MetaMask/tx-categorize/pull/100))
- ... other entries ...
- Bump `@metamask/transaction-controller` to 32.0.0 ([#130](https://github.com/MetaMask/tx-categorize/pull/130))
```

```markdown
<!-- ✅ Like entries are consolidated -->

- Bump `@metamask/transaction-controller` to 32.0.0 ([#100](https://github.com/MetaMask/tx-categorize/pull/100), [#130](https://github.com/MetaMask/tx-categorize/pull/130))
```

### Omit non-essential information

Focus on what a change does and how it ought to be used rather than why it was added or how it works under the hood. Keep consumer-visible behavior and migration details when they are important to understand or use the change.

```markdown
<!-- ❌ The second, third, and fourth sentences mention implementation details which don't seem necessary -->

- Export `groupMarketsByMarketKey` to group rows with an explicit backend key and `priceScale: 1`. Each grouped row has a stable `rowId` and retains its original venue data, with the default venue first. Rows without keys, or with absent or different scales, remain separate and omit `marketKey`. Saved rows keep the bare symbol on the legacy venue and use `venue:<provider>:<symbol>` on another venue ([#11698](https://github.com/MetaMask/core/pull/11698), [#11702](https://github.com/MetaMask/core/pull/11702))
```

```markdown
<!-- ✅ Keep the concise summary and move important contract details into nested bullets -->

- Export `groupMarketsByMarketKey` to group rows with an explicit backend key and `priceScale: 1` ([#11698](https://github.com/MetaMask/core/pull/11698), [#11702](https://github.com/MetaMask/core/pull/11702))
  - Each grouped row has a stable `rowId` and retains its original venue data, with the default venue first.
  - Rows without keys, or with absent or different scales, remain separate and omit `marketKey`.
  - Saved rows keep the bare symbol on the legacy venue and use `venue:<provider>:<symbol>` on another venue.
```

```markdown
<!-- ❌ There is way too much information here -->

- Lighter reads its own Terminal global snapshot. With `terminalApi.globalSnapshotUrl` set, `getMarketDataWithPrices` adds the snapshot's `name`, `description`, `iconUrl`, `marketType`, `categories`, `keywords`, `tags`, `listedAt`, `volume`, `openInterest` and `marketKey` to each Lighter market it lists. Price, change, funding, leverage and the `getMarkets` trading rules stay with `LighterProvider` ([#11698](https://github.com/MetaMask/core/pull/11698))
  - `TerminalMarketService.fetchGlobalSnapshot` accepts `provider: 'lighter'` with `enabledDexes: ['main']`, and `PerpsGlobalSnapshotRequest.provider` is now `'hyperliquid' | 'lighter'`
  - A Lighter row's `category` sets its `marketType`. Lighter lists stocks, FX and commodities on its one DEX, so `main` does not mean crypto there as it does for HyperLiquid
  - A missing or invalid Lighter snapshot leaves the Lighter rows as the provider returned them
  - Lighter v4 daily changes use the venue's last trade price as their reference
```

```markdown
<!-- ✅ This is much more parseable -->

- Use the Terminal global snapshot for Lighter market metadata when `terminalApi.globalSnapshotUrl` is set ([#11698](https://github.com/MetaMask/core/pull/11698))
  - Lighter's provider remains the source for prices, price changes, funding, leverage, and trading rules.
  - If the snapshot is unavailable or invalid, market data falls back to `LighterProvider`.
```

### Explain breaking changes

Highlight [breaking changes](./breaking-changes.md) by prefixing them with `**BREAKING:**`. List breaking changes above non-breaking changes in the same category section. Make sure to explain 1) what makes the change breaking and 2) how engineers need to adapt in consuming projects (you can use a nested list to do this).

```markdown
<!-- ❌ No explanation exists for why the change is breaking -->

- **BREAKING:** Bump `@metamask/network-controller` from `^24.0.0` to `^25.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
```

```markdown
<!-- ✅ Now the breaking change is listed -->

- **BREAKING:** Bump `@metamask/network-controller` from `^24.0.0` to `^25.0.0` ([#6962](https://github.com/MetaMask/core/pull/6962))
  - Because of this bump, each `RpcEndpoint` that `getEvmRpcEndpoints` returns now has a non-optional `networkClientId`.
```

### Omit non-consumer-facing changes

Omit changes to tests, documentation updates, or other changes that don't impact consumers. If a change was added and then reverted later, remove the original entry as well.

```markdown
<!-- ❌ This change is only relevant to developers -->

- chore: migrate Jest from v29 to v30 ([#7905](https://github.com/MetaMask/core/pull/7905))
```

## Generating changelog entries for dependency bumps

Recording dependency bumps within package changelogs can be tedious. You can have these entries generated for you instead of writing them by hand:

1. Post a comment on your pull request with the text `@metamaskbot update-changelogs`.
2. The `Update Changelogs` GitHub action reacts to your comment with a 👍 and kicks off.
3. After a few minutes you will see a new comment saying either that the changelogs were updated and pushed to your branch, or that no changes were needed. If validation errors remain that the action cannot fix, the comment links to the workflow run so you can see them.

A few things to know:

- This works on any pull request, not just release pull requests. Release pull requests also get this automatically when they are opened.
- If the action pushes a commit to your branch, remember to pull it locally before you push again.
- This only works on pull requests opened from a branch in this repo. Pull requests from forks are skipped, so if you are an outside contributor you will need to update changelogs by hand.
