# Dependabot or Renovate

We run both today. This document compares what each tool **can** do, so we can pick one. It deliberately does not argue from how we have them configured right now: anything we have not switched on is not a limitation of the tool.

Every capability claim cites the vendor's documentation or source. Every number about this repo is reproducible from the appendix.

## The question

Which tool can keep every dependency in a 55 package Yarn workspace monorepo current, producing pull requests that merge without hand repair.

## First, what the alert backlog is not

It is tempting to pick whichever tool clears our open security alerts. That framing is wrong, and worth dismissing before anything else.

There are currently 139 open Dependabot alerts covering 134 advisories across 38 packages. Every one is recorded against `yarn.lock`, none against a `package.json`. Split by whether we declare the package ourselves:

|            | Alerts | Packages                                               |
| ---------- | ------ | ------------------------------------------------------ |
| Transitive | 124    | 35, led by `axios`, `undici`, `protobufjs`, `fast-uri` |
| Direct     | 15     | 3: `tar`, `bn.js`, `uuid`                              |

Dependabot has already raised pull requests for the direct ones ([#8849](https://github.com/MetaMask/core/pull/8849), [#9369](https://github.com/MetaMask/core/pull/9369)). The remaining 124 need some parent package to start depending on a patched version, and **neither tool does that**:

- Dependabot security updates can only move a transitive dependency when the tree already permits the patched version.
- Renovate had an option for exactly this, `transitiveRemediation`, and **removed it** ([renovate#27985](https://github.com/renovatebot/renovate/pull/27985), `feat(npm)!: drop transitiveRemediation option`).

The levers that do work are upgrading the parents, which is ordinary version updating, or a `resolutions` override, which this repo already uses for `elliptic`, `fast-xml-parser` and `ws` in [`package.json`](../../package.json).

So the alert count does not discriminate between the two tools. It is, however, the argument for dropping the `allow` list in [`.github/dependabot.yml`](../../.github/dependabot.yml): upgrading parents broadly is the only automated route to those 124 alerts, whichever tool does the upgrading.

## Capabilities

Present in the tool, whether or not we currently use it.

|                                | Dependabot                                                                                                                                                                                                     | Renovate                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting                        | GitHub runs it, nothing to operate                                                                                                                                                                             | self hosted, or Mend's hosted app                                                                                                                        |
| Authentication                 | none needed                                                                                                                                                                                                    | a token, and for us GitHub App permissions through the token exchange                                                                                    |
| Interactive queue              | no                                                                                                                                                                                                             | dependency dashboard, opens nothing until a checkbox is ticked ([docs](https://docs.renovatebot.com/configuration-options/#dependencydashboardapproval)) |
| Grouping                       | `groups`, hand written pattern lists, with `applies-to: version-updates` or `security-updates` ([docs](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)) | `groupName`, and it is templatable, so a **computed** group is possible: `sourceRepoSlug` groups by upstream repository in one rule                      |
| Range handling                 | `versioning-strategy`, per ecosystem entry                                                                                                                                                                     | `rangeStrategy`, per rule, so it can differ by dependency type                                                                                           |
| Age gate                       | `cooldown`, version updates only                                                                                                                                                                               | `minimumReleaseAge`, applies everywhere, overridable per rule                                                                                            |
| Lockfile dedupe                | no                                                                                                                                                                                                             | `postUpdateOptions: ["yarnDedupeHighest"]`                                                                                                               |
| Arbitrary post update commands | no                                                                                                                                                                                                             | `postUpgradeTasks`, self hosted only                                                                                                                     |
| Transitive remediation         | no                                                                                                                                                                                                             | no, removed                                                                                                                                              |
| Abandoned package detection    | no                                                                                                                                                                                                             | yes                                                                                                                                                      |
| Monorepo awareness             | updates every manifest declaring the dependency                                                                                                                                                                | same                                                                                                                                                     |

Two corrections to claims made earlier in this work, kept rather than quietly dropped. Grouping is **not** Renovate only, Dependabot supports it including for security updates and we simply never enabled it. And Renovate exempts security fixes from its age gate **by default**, exactly like Dependabot.

## Constraints

Behaviour no amount of configuration changes.

**Dependabot security updates ignore `cooldown`, `open-pull-requests-limit` and `allow`.** This is correct and we want it: patch as early as possible, never queue a security fix behind a cap, and cover dependencies outside the allowlist. GitHub documents it:

> The `cooldown` option is only available for _version_ updates, not _security_ updates.

> _Security update_ pull requests are not subject to this limit and do not count toward it.

Renovate's `vulnerabilityAlerts` defaults behave the same way, so this is not a difference between them. One shared consequence worth knowing: because security fixes skip the age gate, either tool can propose a version younger than `npmMinimalAgeGate` in [`.yarnrc.yml`](../../.yarnrc.yml), and the install then fails. Rare and loud.

**Dependabot cannot regenerate a stale grouped pull request.** Once the configuration that produced it changes it refuses both rebase and recreate, and closing it does not produce a replacement. We closed [#10177](https://github.com/MetaMask/core/pull/10177) and [#10157](https://github.com/MetaMask/core/pull/10157) and neither returned, which is why [#8849](https://github.com/MetaMask/core/pull/8849) and [#9369](https://github.com/MetaMask/core/pull/9369) have sat since May and July. Renovate regenerates on demand from the dashboard.

**Renovate's version floats unless pinned.** `renovatebot/github-action` defaults `renovate-version` to the major tag, so pinning the action by commit does not pin Renovate. 44.107.0 silently ran the wrong Yarn and broke 5 of 11 lockfile updates ([#10371](https://github.com/MetaMask/core/pull/10371)).

**Renovate's upstream bugs become ours.** Two we carry: its monorepo dataset is missing several of our dependencies, and [renovate#25853](https://github.com/renovatebot/renovate/issues/25853), open since 2023, loses the Corepack flag so Renovate runs the wrong Yarn. The fix is unmerged.

**Renovate needs App permissions we do not control.** `statuses: write` was requested, refused because the `metamask-ci` App did not hold it, and reverted ([#10316](https://github.com/MetaMask/core/pull/10316), [#10317](https://github.com/MetaMask/core/pull/10317)). Reading alerts needed TechOps to add a permission to the App.

## Not yet tested

Two gaps, listed so nobody reads a conclusion into them.

- **Dependabot `groups` with `applies-to: security-updates`.** Never enabled here. It is the obvious first thing to try if we stay, and it plausibly addresses the stuck batches.
- **Renovate security remediation.** It can read the alerts since [#10496](https://github.com/MetaMask/core/pull/10496) but has not yet opened a `[SECURITY]` pull request, so it is unproven end to end.

## Where that leaves the decision

This is a choice about **ergonomics at volume**, not capability. Both tools update every manifest, both group, both can gate by age, and neither fixes a transitive vulnerability.

Renovate's advantages are real but narrow. An interactive queue, so the allowlist can be dropped in one step instead of widened scope by scope. A computed group name, so grouping does not need a hand maintained list that goes stale and gets things wrong. Range strategy per dependency type. Native dedupe, which removes work our repair workflow currently does.

Dependabot's advantage is that GitHub operates it. No token, no App permissions, no version pinning, no upstream bug watching. Every item in the constraints section above is work we absorbed and would keep absorbing.

Suggested way to settle it rather than deciding from this document alone:

1. Enable `groups` with `applies-to: security-updates` on Dependabot and see whether the stuck batches clear. Cheap, and it tests the main thing we have never tried.
2. Confirm Renovate opens a `[SECURITY]` pull request at all.
3. Choose knowing both tools' real behaviour on this repo rather than their documentation.

If both work, the tiebreaker is whether an interactive queue and computed grouping are worth operating a bot. On a monorepo this size with the allowlist removed they probably are, but that is a judgement this document cannot settle for you.

## Appendix: reproducing the numbers

```sh
gh api "repos/MetaMask/core/dependabot/alerts?state=open&per_page=100" --paginate > alerts.json
```

Alert, advisory and package counts come from that file. The direct versus transitive split compares each alert's package name against every `dependencies`, `devDependencies` and `peerDependencies` entry in the root and workspace manifests.
