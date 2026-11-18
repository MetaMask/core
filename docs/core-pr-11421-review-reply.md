Thanks, updated the description against `d853a91`:

1. **Package compatibility:** a new "Breaking package compatibility" section names the Extension order-entry readers (`perps-order-entry-page.tsx:478,1447`), the old-shape `EMPTY_TRADE_CONFIGURATIONS` default, both error maps, and the affected fixtures and mocks. It also says these changes are needed even with the flag off.
2. **Routing and release order:** lists the eight aggregated writes that must carry `providerId` and the refusal guard, including the one-venue exemption. Each client's flag minimum version follows that client's compatibility and routing work.
3. **State fields:** the state table now includes `effectiveProvider`, `hasExplicitDefaultProviderSelection`, `hasMigratedToMultiProvider` and `hasExplicitProviderSelection`.
4. **Tests:** 69 declarations (52 `it`, 17 `it.each`), 112 expanded tests passing.
5. **Client plans:** Mobile has [TAT-4602](https://consensyssoftware.atlassian.net/browse/TAT-4602) (compatibility), [TAT-4405](https://consensyssoftware.atlassian.net/browse/TAT-4405) (routing) and [TAT-4394](https://consensyssoftware.atlassian.net/browse/TAT-4394) / [TAT-4403](https://consensyssoftware.atlassian.net/browse/TAT-4403) (version gating). Extension has [TAT-4603](https://consensyssoftware.atlassian.net/browse/TAT-4603) and stays flag-off; it isn't in Lighter V1. No client PRs exist yet, so the breaking-change box stays unchecked and the body says so.
6. **Terminal:** added a note that it still needs an audit and an owner.

This ships in a new major and clients are on `^22.3.0`, so merging doesn't force a client upgrade. Each client picks up its compatibility ticket in the PR that moves it to this release.
