## Explanation

After a bridge or swap completes, the destination balance can stay stale. `AssetsController` force-fetches balances through the Accounts API, and that API serves a cached snapshot for about 60 seconds. The wallet can keep showing the pre-trade balance, or leave out a token that was just received, until the cache expires.

`BridgeStatusController` now refreshes the destination as soon as the trade succeeds, and asks `AssetsController` to skip that server cache.

- **Token destination:** calls `AssetsController:addCustomAsset` with `bypassServerCache: true`. This pins the asset for the receiving account and force-fetches its chain without the cached snapshot.
- **Native destination:** the asset is not imported. `AssetsController` already tracks natives, and the bridge's asset ID can differ from the one it tracks (MegaETH is the case this avoids duplicating). Instead, it calls `AssetsController:getAssets` for that chain with `forceUpdate: true` and `bypassServerCache: true`.
- **Receiving account:** the account that owns the quote's `destWalletAddress`. If that is missing, it falls back to the history item's account only when the source and destination chains use the same account type. For example, an EVM-to-Solana bridge with no destination wallet address is skipped, because the source account cannot hold the destination asset.
- **When it runs:** when a status-polled bridge or swap reaches `StatusTypes.COMPLETE`, and when a same-chain EVM swap transaction is confirmed. Intent swaps are left to the polling path, because confirming the on-chain transaction is not the same as the swap completing.
- **7702 batch sell:** walks every `quoteIds` entry, dedupes by asset ID, imports each token, and refreshes each native chain once. Quotes with no history item are skipped.
- **Failures:** logged as `Failed to import destination asset` and do not change the history item.

`@metamask/assets-controller` `^21.0.0` is added as a dependency so the messenger can type `AssetsController:addCustomAsset` and `AssetsController:getAssets`, including the `bypassServerCache` argument. The controller only calls those two actions through its messenger.

## References

- Branch: `swaps-5336`
- No GitHub issue is linked to this branch.
- Clients must allow and delegate `AssetsController:addCustomAsset` and `AssetsController:getAssets` on the `BridgeStatusController` messenger. MetaMask Mobile already delegates them locally (`app/core/Engine/messengers/bridge-status-controller-messenger/index.ts`), but no consumer pull request has been opened yet.

## Checklist

- [x] I've updated the test suite for new or updated code as appropriate
- [x] I've updated documentation (JSDoc, Markdown, etc.) for new or updated code as appropriate
- [x] I've communicated my changes to consumers by [updating changelogs for packages I've changed](https://github.com/MetaMask/core/tree/main/docs/processes/updating-changelogs.md)
- [ ] I've introduced [breaking changes](https://github.com/MetaMask/core/tree/main/docs/processes/breaking-changes.md) in this PR and have prepared draft pull requests for clients and consumer packages to resolve them

<!-- Unchecked: the messenger now requires clients to delegate two new actions. No client draft PR has been prepared yet. -->
