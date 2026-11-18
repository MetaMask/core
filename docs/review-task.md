# Immediate agent task: address review comment 4535434546

Prepared 2026-11-11. This task addresses [the client-migration review comment](https://github.com/MetaMask/core/pull/11421#discussion_r4535434546) on [Core #11421](https://github.com/MetaMask/core/pull/11421). The client plans are filed as Jira tickets (see "Client plan"); no client changes are done yet.

## Copyable task

Prepare a review-ready update to Core PR #11421's description addressing only discussion `4535434546`, including all subpoints within that one comment. Use the filed client tickets listed under "Client plan" below as each client's plan for package compatibility, explicit write routing, and version-gated adoption. Link them; don't restate their scope in the PR body. Recheck the current PR head and client sources before stating what is implemented. Produce the replacement PR body and a short proposed review reply as local Markdown files. Report any missing owner, release-version, client-PR, or Terminal evidence explicitly. Publishing PR edits, comments, or tickets is a separate action requiring the user's instruction.

## Scope boundary

This is a PR-description and adoption-plan task. The six corrections below unpack one review comment; they are not a checklist for the entire PR review. Do not absorb other review threads or implement client features in this task.

## Inputs and baselines

| Source                                                          | Inspected revision or status                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Core local checkout: `~/code/consensys/core`     | `e0b1433cdfe1b05d5278a6e49feaa5293058e851`                                                           |
| Core #11421 remote metadata                                     | Head `d853a918a246247edfe249e8a29e815be2d08ed1`; open when read                                      |
| Extension: `~/code/consensys/metamask-extension` | `803491c52a705f241204fa96b13dfe9392d6bfb6`; manifest requests `@metamask/perps-controller` `^22.3.0` |
| Mobile: `~/code/consensys/metamask-mobile`       | `a0035d41e780a15dc1946fd42618d07068af5bc9`; manifest requests `@metamask/perps-controller` `^22.3.0` |
|                                                             |

The review comment cites an older Extension revision, `95553d8`. Its two old-shape readers are still present at lines 478 and 1447 in the inspected Extension checkout. The local Core checkout is behind the remote PR head. Refresh evidence rather than assuming those revisions or line numbers remain current. A manifest range is not the resolved package version; inspect `yarn.lock` when implementing either ticket.

## Client plan (filed tickets)

These replace the local drafts (`metamask-mobile/docs/perps/provider-state.md`, `metamask-extension/docs/provider-state.md`). Link these in the PR body instead of the drafts.

| Client | Package compatibility (breaks at upgrade, flag off) | Write routing | Flag and minimum version | Status |
| --- | --- | --- | --- | --- |
| Mobile | [TAT-4602](https://consensyssoftware.atlassian.net/browse/TAT-4602): error map, test data and types; no production code reads `tradeConfigurations` directly | [TAT-4405](https://consensyssoftware.atlassian.net/browse/TAT-4405): every write hook sends `providerId`; relies on Core's migration | [TAT-4394](https://consensyssoftware.atlassian.net/browse/TAT-4394) (Core), [TAT-4403](https://consensyssoftware.atlassian.net/browse/TAT-4403) (Mobile): the Mobile minimum version must follow TAT-4602 and TAT-4405 | Filed, unassigned, no PR yet |
| Extension | [TAT-4603](https://consensyssoftware.atlassian.net/browse/TAT-4603): the two order-entry readers, the selector default, the error map and fixtures; after [TAT-4534](https://consensyssoftware.atlassian.net/browse/TAT-4534) | Not planned: Extension isn't in Lighter V1 | Flag stays off for Extension; no minimum version is set | Filed, unassigned, no PR yet |
| Terminal | Not inspected (see correction 6) | — | — | Unverified |

Release order to state in the PR body: merging Core doesn't force a client change, because this ships in a new major and clients request `^22.3.0`. Each client does its compatibility ticket in the PR that moves it to that release. The multi-provider flag turns on per client only after that client's routing work ships.

## Instructions and relevant skills

- Read the current `AGENTS.md` in each repository you work in and preserve existing unrelated edits.
- Use Core's `.github/pull_request_template.md` for the Core description. Do not apply Mobile's PR headings to Core.
- For a later Mobile PR description, use [mms-pr-description](~/code/consensys/metamask-mobile/.agents/skills/mms-pr-description/SKILL.md) with Mobile's current template. Its evidence-first workflow informs this handoff; its Mobile-specific checklist does not replace Core's breaking-change requirements.
- For Mobile rollout details, use [mms-feature-flags](~/code/consensys/metamask-mobile/.agents/skills/mms-feature-flags/SKILL.md): evaluate version-gated flags in selectors through the shared helper and keep UI consumers on booleans. Core already receives the shared validator through `mobileInfrastructure.ts`.
- If commissioned to implement the Mobile ticket, read its installed `mms-planning`, `mms-controller-integration`, `mms-mobile-testing`, and any other skills applicable to the actual changes. For Extension, read its controller, testing, and PR guidelines. This handoff authorizes preparation of the documentation task, not execution of the client implementations.

## Required description corrections

1. **Explain package compatibility independently of rollout.** The provider-keyed `tradeConfigurations` shape and expanded `PerpsErrorCode` union require client changes upon adopting the package, even with `perpsMultiProviderModeEnabled` disabled. Remove or qualify the blanket statement that flag-off clients see no change. Name the Extension order-entry readers and selector default, plus both error translation maps and affected fixtures.
2. **Describe routing adoption and release order.** Each supported aggregated write must carry its concrete venue. Include `placeOrder`, `editOrder`, `cancelOrder`, `closePosition`, `updatePositionTPSL`, `replacePositionTPSLLeg`, `updateMargin`, and `flipPosition` through `position.providerId`. Confirm the exact refusal guard at the refreshed Core head. TAT-4394's minimum supported version for each client must follow delivery of that client's routing and compatibility work. Do not invent version numbers or enable the remote flag.
3. **Complete the missing state-field inventory.** Add the four fields named in the comment: non-persisted nullable `effectiveProvider`, and persisted `hasExplicitDefaultProviderSelection`, `hasMigratedToMultiProvider`, and `hasExplicitProviderSelection`. Retain the existing `defaultProvider` entry and briefly distinguish saved preference, live venue, and `activeProvider` mode. This correction documents the contract; it does not commission new selectors, settings UI, stream handling, or controller behavior.
4. **Correct validation evidence.** The reviewer reported 68 `it`/`it.each` cases at the reviewed revision, while the body says 26. Recount against the current file at `packages/perps-controller/tests/src/PerpsController.default-provider.test.ts`; distinguish source declarations from expanded parameterized runtime cases. Use fresh test output for runtime counts and do not present old suite totals as current verification. If no tests are run for the description-only task, say so.
5. **Make client plans and checklist status truthful.** Add separate Extension and Mobile rows from the "Client plan" table: ticket links, owner status (unassigned), package/build dependency, client PR (none yet), and minimum-version status. Mark the change as breaking. If Core's checkbox also attests that draft client PRs are prepared, only check the whole statement when those PRs exist; otherwise state the outstanding preparation explicitly.
6. **Add a Terminal note.** Terminal was not inspected for this task. State that applicability and ownership remain unverified; identify the required audit of package use, direct state readers, error maps, and trading routes. If it consumes this contract, require its own adoption plan before rollout. If it does not, document evidence for “not affected.” Do not claim compatibility from absence of a supplied checkout.

## Deliverables and completion

- Write `core-pr-11421-description.md` and `core-pr-11421-review-reply.md` beside this handoff, preserving Core's current PR template.
- Include a subpoint-to-description-section checklist for this single comment so all six corrections can be checked quickly. Do not add unrelated review findings to it.
- Link the filed tickets in the "Client plan" table, and client PRs if any exist by then. Don't link the local draft files.
- Record revisions, inspected evidence, checks actually run, and pending decisions. Exact release artifacts, owners, minimum client versions, client PR URLs, and Terminal status remain to be established.
- Finish with the two local output paths and any remaining factual gaps. Keep the separate integration follow-up out of this task's completion criteria.
