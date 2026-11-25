# Updating changelogs

Each package in this repo has a file called `CHANGELOG.md` which is used to record consumer-facing changes that have been published over time. This file is useful for other engineers who want to know about new features, bugfixes, or breaking changes (particularly when upgrading a package in a consuming project).

A package's changelog should be updated in the same branch as changes that affect its consumer-facing API or behavior. To do this:

1. Look over the branch and identify changes you've made to the public API of the package.
2. Look for the "Unreleased" section of the package's changelog.
3. Decide which categories your changes belong to and ensure there are sections for those categories (see below for the full list).
4. Add one or more entries to the end of the corresponding sections.
5. After updating a changelog, run `yarn changelog:validate` and fix any errors reported.

## Guidelines for adding changelog entries

### Place entries in matching categories

Each entry should be placed in a category that matches the type of change. Here are the categories and how they are used:

- **Added** — for new "features", i.e., new exports, methods, or options
- **Changed** — for modifications to existing behavior)
- **Deprecated** — for exports or options that may be removed soon)
- **Removed** — for exports or options that _have_ been removed)
- **Fixed** — for corrections to existing behavior
- **Security** — for patches to security vulnerabilities or other changes that enhance security

### Describe one consumer-facing change per entry

Each entry should describe a single change that a consumer would adopt, be affected by, or evaluate as a unit. It is common that a pull request holds multiple changes that need to be documented, so a heuristic for deciding how to represent them is as follows:

- Split changes into separate entries when they require different kinds of actions from consumers or when consumers can adopt them independently.
  - For instance, breaking changes shouldn't be grouped with non-breaking changes because they require more explanation.
  - Tip: If the summary includes "and" or "also" to join unrelated things, split it.
- Keep changes together when they belong to the same category (Added, Changed, etc.), they have the same compatibility status, and they function together to support a feature or address a problem.

One final note: Nested bullets should add detail to the summary, not add further changes.

```markdown
<!-- ❌ There are two separate changes in one (tip: look for use of "also") -->

- **BREAKING:** `PaymentMethod.networks` is now typed as `string[] | CardNetwork[]` instead of `string[]`. Clients that handle `listPaymentMethods` responses must handle both shapes. All `limits` fields are also now optional ([#90210](https://github.com/MetaMask/core/pull/90210))
```

```markdown
<!-- ❌ Two separate changes are still listed in the same group -->

- **BREAKING:** `PaymentMethod.networks` is now typed as `string[] | CardNetwork[]` instead of `string[]` ([#90210](https://github.com/MetaMask/core/pull/90210))
  - Clients that handle `listPaymentMethods` responses must handle both shapes.
  - All `limits` fields are also now optional.
```

```markdown
<!-- ✅ Now there are two separate entries, and both response-shape changes are marked as breaking -->

- **BREAKING:** `PaymentMethod.networks` is now typed as `string[] | CardNetwork[]` instead of `string[]` ([#90210](https://github.com/MetaMask/core/pull/90210))
  - Clients that handle `listPaymentMethods` responses must handle both shapes.
- **BREAKING:** Make all properties in `PaymentMethod.limits` optional ([#90210](https://github.com/MetaMask/core/pull/90210))
  - Clients that handle `listPaymentMethods` responses must handle these properties being absent.
```

```markdown
<!-- ✅ Related API changes that consumers use together are grouped as one feature -->

- Add payee-key support for pinned and recently paid payees ([#90211](https://github.com/MetaMask/core/pull/90211), [#90214](https://github.com/MetaMask/core/pull/90214))
  - `PayeeController.togglePinnedPayee`, `isPinnedPayee`, `recordPayment` and `selectIsPinnedPayee` accept a `payeeKey`, the payee's linked bank accounts and an optional `legacyBank` to save or match the correct reference.
  - `resolveSavedPayees` resolves bare account numbers to their original bank, `bank:` references to the named bank, and `payee-key:` references to the matching linked payee. `selectRecentlyPaidPayees` returns saved references for callers to resolve.
```

### Write concise, consumer-focused summaries

Write a concise summary of the change in one sentence or sentence fragment. Do not simply reuse the title of the PR or commit that introduced the change, but highlight the consumer-visible behavior, preferring to name specific parts of the API (public methods, types, options, arguments, etc.) that have been added or updated. When the first word is a verb, use imperative mood ("Add NetworkController", not "Added NetworkController").

```markdown
<!-- ❌ PR title is restated -->

- Fix: Transfer statuses ([#90042](https://github.com/MetaMask/core/pull/90042))
```

```markdown
<!-- ✅ Changes to API are spelled out -->

- **BREAKING:** Rename `TransferStatus.WAITING` to `TransferStatus.PENDING` and `TransferStatus.DONE` to `TransferStatus.SETTLED` ([#90042](https://github.com/MetaMask/core/pull/90042))
```

### Link to pull requests

Follow the summary with links to the pull request(s) that introduced the change. If a pull request is not available yet, use a placeholder (e.g. `[#????](https://github.com/MetaMask/core/pull/????)`). When an entry has nested bullets, place the pull request links at the end of the parent item.

### Put supporting details in nested bullets

If a change requires further details to communicate its impact to consumers, list them under the summary. If a summary contains multiple sentences, try extracting everything after the first sentence to a nested list.

```markdown
<!-- ❌ One line has multiple statements -->

- Add `PARTIAL_FAILURE` and `failures` (`{ transferId, error }[]`) to `BulkTransferResult` and `BulkRefundResult`. When any transfer in a bulk request throws or returns an error, `error` is `PARTIAL_FAILURE` and `failures` keeps every transfer's error, so a combined bulk error stays a translatable code without hiding which transfers failed ([#90215](https://github.com/MetaMask/core/pull/90215))
```

```markdown
<!-- ✅ Multiple statements are split up into one summary line + details listed below that -->

- Add `PARTIAL_FAILURE` and `failures` (`{ transferId, error }[]`) to `BulkTransferResult` and `BulkRefundResult` ([#90215](https://github.com/MetaMask/core/pull/90215))
  - When any transfer in a bulk request throws or returns an error, `error` is `PARTIAL_FAILURE` and `failures` keeps every transfer's error, so a combined bulk error stays a translatable code without hiding which transfers failed
```

### Consolidate entries covering the same change

If multiple commits or pull requests represent the same change, consolidate their entries into one (including the list of pull request links).

```markdown
<!-- ❌ There are multiple entries for the same dependency bump -->

- Bump `@acme/fx-rates` to 3.0.0 ([#90100](https://github.com/MetaMask/core/pull/90100))
- ... other entries ...
- Bump `@acme/fx-rates` to 3.2.0 ([#90130](https://github.com/MetaMask/core/pull/90130))
```

```markdown
<!-- ✅ Like entries are consolidated -->

- Bump `@acme/fx-rates` to 3.2.0 ([#90100](https://github.com/MetaMask/core/pull/90100), [#90130](https://github.com/MetaMask/core/pull/90130))
```

### Omit non-essential information

Focus on what a change does and how it ought to be used rather than why it was added or how it works under the hood. Keep consumer-visible behavior and migration details when they are important to understand or use the change.

```markdown
<!-- ❌ This is an overwhelming amount of detail -->

- The statements service reads its own balance snapshot. With `ledgerApi.snapshotUrl` set, `listAccounts` adds the snapshot's `nickname`, `description`, `iconUrl`, `accountType`, `tags`, `openedAt`, `balance`, `pendingBalance`, `creditLimit` and `holderId` to each credit union account it lists. Interest rates, fees, overdraft rules and the `getLimits` results stay with `CreditUnionProvider` ([#90218](https://github.com/MetaMask/core/pull/90218))
  - `SnapshotClient.fetch` accepts `provider: 'credit-union'` with `regions: ['us-west']`, and `SnapshotRequest.provider` is now `'bank' | 'credit-union'`
  - An account's `product` sets its `accountType`. Credit unions list checking, savings and loans under one membership, so `us-west` does not mean a retail branch there as it does for banks
  - A missing or invalid snapshot leaves the accounts as the provider returned them
  - Daily balance changes use the previous statement balance as their reference
```

```markdown
<!-- ✅ This is much more parseable -->

- Use the ledger snapshot for credit union account metadata when `ledgerApi.snapshotUrl` is set ([#90218](https://github.com/MetaMask/core/pull/90218))
  - `CreditUnionProvider` remains the source for interest rates, fees, overdraft rules and limits.
  - If the snapshot is unavailable or invalid, account data falls back to `CreditUnionProvider`.
```

### Isolate and explain breaking changes

Highlight [breaking changes](./breaking-changes.md) by prefixing them with `**BREAKING:**`. List breaking changes above non-breaking changes in the same category section. Be sure to explain what makes the change breaking and, if not obvious, how engineers need to adapt in consuming projects (you can use a nested list to do this).

```markdown
<!-- ❌ No explanation exists for why the change is breaking -->

- **BREAKING:** Bump `@acme/payments-core` from `^4.0.0` to `^5.0.0` ([#90219](https://github.com/MetaMask/core/pull/90219))
```

```markdown
<!-- ✅ Now the effect of the bump on the public API is provided -->

- **BREAKING:** Bump `@acme/payments-core` from `^4.0.0` to `^5.0.0` ([#90219](https://github.com/MetaMask/core/pull/90219))
  - Because of this bump, each `Charge` returned by `listCharges` now has a required `currency`.
```

### Omit non-consumer-facing changes

Omit changes to tests, documentation updates, or other changes that don't impact consumers. If a change was added and then reverted later, remove the original entry as well.

```markdown
<!-- ❌ This change is only relevant to developers -->

- chore: migrate lint config to the flat format ([#90220](https://github.com/MetaMask/core/pull/90220))
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
