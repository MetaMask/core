# Dependabot or Renovate

We currently run both. This document sets out what each one can and cannot do, so we can pick one. It is written to be checkable: every capability claim links to the vendor's own documentation or source, and every claim about this repo links to the pull request or run that showed it.

## The question

Not "which tool is better". Both bump dependencies. The question is which one can bump **every** dependency in a 55 package Yarn workspace monorepo without producing pull requests that a human has to repair before merging.

Today `.github/dependabot.yml` restricts version updates to `@metamask/*` and `@lavamoat/*`. That restriction exists because unrestricted bumps produced pull requests that failed CI. Removing it is the goal.

## Where we are today

|         | Dependabot                                                         | Renovate                                                                                                                          |
| ------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Status  | version updates for the allowlist, security updates for everything | version updates for everything, gated behind an approval checkbox                                                                 |
| Hosting | GitHub, nothing to run                                             | self hosted in [`renovate.yml`](../../.github/workflows/renovate.yml), authenticating as `metamask-ci` through the token exchange |
| Config  | [`.github/dependabot.yml`](../../.github/dependabot.yml)           | [`renovate.json`](../../renovate.json)                                                                                            |

Both feed the same repair workflow, [`repair-dependency-upgrade-pull-requests.yml`](../../.github/workflows/repair-dependency-upgrade-pull-requests.yml), which aligns version ranges, deduplicates `yarn.lock` and writes changelog entries on bot pull requests.

## Differences that decide it

### 1. Security updates split version ranges across workspaces

Dependabot security updates walk manifests one at a time. [#9369](https://github.com/MetaMask/core/pull/9369) is one dependency across 23 directories, [#8849](https://github.com/MetaMask/core/pull/8849) is 20 dependencies in one. Because each manifest is updated on its own, a shared dependency ends up with a different version range per workspace, which fails our `yarn constraints` consistency rule. That is the defect: not what Dependabot chooses to update, but how it writes the update.

Renovate updates every manifest that declares a dependency in a single branch, so ranges stay consistent by construction.

**What is not a problem, so nobody has to relitigate it.** Security updates deliberately ignore `cooldown`, `open-pull-requests-limit` and `allow`. That is correct: you want a patch as early as possible, you do not want security fixes queued behind a cap, and you do want them for dependencies outside the allowlist. GitHub documents the first two explicitly:

> The `cooldown` option is only available for _version_ updates, not _security_ updates.

> _Security update_ pull requests are not subject to this limit and do not count toward it.

Source: [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference). `allow` behaves the same way, which is why [#8849](https://github.com/MetaMask/core/pull/8849) bumps 20 dependencies our allowlist does not cover.

Renovate does the same thing by default, so this is not a difference between the two. Its `vulnerabilityAlerts` defaults are `minimumReleaseAge: null`, `prConcurrentLimit: 0`, `dependencyDashboardApproval: false`, `prCreation: immediate` ([docs](https://docs.renovatebot.com/configuration-options/#vulnerabilityalerts)). The only real distinction is that Renovate lets you narrow those if you ever want to, and Dependabot does not, which is a footnote rather than a reason to switch.

One consequence that applies to **both** tools and is worth knowing: because security fixes skip the age gate, they can propose a version younger than `npmMinimalAgeGate: 4320` in [`.yarnrc.yml`](../../.yarnrc.yml), and the install then fails. It is rare and loud. Do not engineer around it.

### 2. Recovering from a rotted batch

Dependabot cannot rebase or recreate a grouped pull request once the configuration that produced it has changed, and closing one does not produce a replacement. We closed [#10177](https://github.com/MetaMask/core/pull/10177) and [#10157](https://github.com/MetaMask/core/pull/10157) and neither came back, which is why [#9369](https://github.com/MetaMask/core/pull/9369) and [#8849](https://github.com/MetaMask/core/pull/8849) are still open from July and May. Combined with the range splitting above, a batch that fails CI once is effectively stuck.

Renovate regenerates a branch on demand from the dashboard, and stops touching a branch once someone else commits to it (`isBranchModified`). That second behaviour is load bearing for us: the repair workflow commits as `github-actions[bot]` specifically so Renovate leaves the repairs alone ([#10322](https://github.com/MetaMask/core/pull/10322)).

### 3. Grouping

Dependabot groups by pattern lists you maintain by hand, and it does support security updates via `applies-to: security-updates`. An earlier version of this analysis said grouping was Renovate only. That was wrong.

What Renovate has that Dependabot does not is a computed group name. `groupName` is templatable and `sourceRepoSlug` is available, so one rule groups every dependency by the repository it is published from:

```json
{
  "matchPackageNames": [
    "!@metamask/**",
    "!@metamask-previews/**",
    "!@types/**"
  ],
  "groupName": "{{#if sourceRepoSlug}}{{{sourceRepoSlug}}}{{else}}{{{depName}}}{{/if}}"
}
```

That is the whole config for it ([#10495](https://github.com/MetaMask/core/pull/10495)). It correctly collapsed 11 `@ethersproject` pull requests into one, and it correctly kept `@noble` separate without being told, because `noble-hashes` and `noble-curves` are different repositories. A hand maintained scope list got that wrong.

### 4. Volume control

Renovate's dependency dashboard opens nothing until a checkbox is ticked (`dependencyDashboardApproval`, [docs](https://docs.renovatebot.com/configuration-options/#dependencydashboardapproval)). That is how we can point it at every dependency in the repo right now without drowning, and it is why we can drop the allowlist in one step rather than widening it a scope at a time. Dependabot's only equivalent is `open-pull-requests-limit`, which caps the queue but gives no way to choose what comes out of it.

## What Renovate costs

Self hosting is not free, and this is the honest side of the ledger.

**Three permission walls, one still not fully closed.** Each needed a policy change in `token-exchange-service` and, twice, a change to the `metamask-ci` App itself. `statuses: write` was requested, refused by GitHub because the App did not hold it, and reverted ([#10316](https://github.com/MetaMask/core/pull/10316), [#10317](https://github.com/MetaMask/core/pull/10317)). Reading Dependabot alerts needed TechOps to add the permission to the App. Dependabot needs none of this.

**Version pinning is on us.** `renovatebot/github-action` defaults `renovate-version` to the floating `44` tag, so pinning the action by commit does nothing for the Renovate inside it. 44.107.0 silently fell back to the global Yarn 1.22.22 and broke 5 of 11 lockfile updates, so we pin explicitly now ([#10371](https://github.com/MetaMask/core/pull/10371)).

**Upstream bugs land on us.** Two we are carrying: Renovate's monorepo data is missing entries for several of our dependencies, and [renovate#25853](https://github.com/renovatebot/renovate/issues/25853) has been open since 2023, where the Corepack detection flag gets lost and Renovate runs the wrong Yarn. Its fix, [renovate#45153](https://github.com/renovatebot/renovate/pull/45153), is unmerged.

**Yarn integration needed work.** Renovate's default lockfile only install skips Yarn's link step, which breaks our LavaMoat `allow-scripts` plugin, so we run a fuller install ([#10311](https://github.com/MetaMask/core/pull/10311)).

Roughly 12 pull requests in this repo and 5 in `token-exchange-service` to get here.

## What Dependabot costs

The allowlist. Every dependency outside `@metamask/*` and `@lavamoat/*` is either upgraded by hand or arrives as a security update that needs repairing first. As of this writing that is **127 open alerts, 126 with a patched version available**, against two live security pull requests, both stuck.

## Recommendation

Renovate, for one reason: **Dependabot writes security updates in a shape this repo cannot merge, and no configuration changes that shape.** It updates one manifest at a time, which splits version ranges across workspaces and fails `yarn constraints`, and once a batch has rotted it cannot be regenerated. That is why 126 fixable alerts sit behind two stuck pull requests.

Everything Renovate cost us was one time setup, and it is merged. What Dependabot costs is per advisory, forever.

The counterargument deserves stating plainly: Dependabot is hosted, needs no token, no App permissions, no version pinning and no upstream bug watching, and that is worth real money. If the range splitting were fixable from `dependabot.yml` the answer would be to stay. It is not.

Two things worth deciding alongside this:

- **Keep Dependabot for `github-actions`.** It is a separate ecosystem block, it works, and nothing above applies to it.
- **Renovate security remediation is not yet proven end to end.** It can read the alerts as of [#10496](https://github.com/MetaMask/core/pull/10496), but it has not yet opened a `[SECURITY]` pull request, so we should not switch off Dependabot security updates until it has.
