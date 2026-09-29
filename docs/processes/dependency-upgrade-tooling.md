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

### 1. Security updates ignore most configuration

This is the single biggest problem with Dependabot here, and it is documented behaviour, not a bug.

> The `cooldown` option is only available for _version_ updates, not _security_ updates.

> _Security update_ pull requests are not subject to this limit and do not count toward it. There is no limit on the number of open pull requests for security updates.

Source: [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

The `allow` list does not gate them either. Our config allows only `@metamask/*` and `@lavamoat/*`, yet [#8849](https://github.com/MetaMask/core/pull/8849) bumps 20 unrelated dependencies. So the knobs we rely on for version updates simply do not exist for the pull requests we care about most.

Renovate applies one configuration to both. Its security behaviour is a `vulnerabilityAlerts` object with defaults, all overridable ([configuration options](https://docs.renovatebot.com/configuration-options/#vulnerabilityalerts)):

```
dependencyDashboardApproval: false
minimumReleaseAge: null
prCreation: immediate
prConcurrentLimit: 0
rangeStrategy: update-lockfile
commitMessageSuffix: [SECURITY]
```

Note the honest version of a claim we got wrong earlier: Renovate also exempts security fixes from the age gate **by default**, exactly like Dependabot. The difference is that Renovate lets you change that and Dependabot does not.

### 2. One pull request per dependency, or one per manifest

Dependabot security updates walk manifests one at a time. [#9369](https://github.com/MetaMask/core/pull/9369) is one dependency across 23 directories. Because each manifest is updated separately, the version range for a shared dependency ends up different per workspace, which fails our `yarn constraints` consistency rule.

Renovate updates every manifest that declares a dependency in a single branch, so ranges stay consistent by construction.

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

Renovate's dependency dashboard opens nothing until a checkbox is ticked (`dependencyDashboardApproval`, [docs](https://docs.renovatebot.com/configuration-options/#dependencydashboardapproval)). That is how we are able to run it on every dependency right now without drowning. Dependabot has `open-pull-requests-limit` and nothing else, and as quoted above it does not apply to security updates.

### 5. Recovering from a bad batch

Dependabot cannot rebase or recreate a grouped pull request once the config that produced it changed, and closing one does not produce a replacement. We closed [#10177](https://github.com/MetaMask/core/pull/10177) and [#10157](https://github.com/MetaMask/core/pull/10157) and neither came back, which is why [#9369](https://github.com/MetaMask/core/pull/9369) and [#8849](https://github.com/MetaMask/core/pull/8849) are still open from July and May.

Renovate regenerates a branch on demand from the dashboard, and stops touching a branch once someone else commits to it (`isBranchModified`). That second behaviour is load bearing for us: the repair workflow commits as `github-actions[bot]` specifically so Renovate leaves the repairs alone ([#10322](https://github.com/MetaMask/core/pull/10322)).

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

Renovate, for one reason that is hard to work around: **Dependabot's security updates are the pull requests we most need to be correct, and they are the ones its configuration cannot reach.** No amount of `dependabot.yml` fixes the per manifest range splitting, the missing cooldown or the unbounded pull request count, because those are documented as out of scope for security updates.

Everything Renovate cost us is one time setup that is now merged. What Dependabot costs is ongoing and unbounded.

Two things worth deciding alongside this:

- **Keep Dependabot for `github-actions`.** It is a separate ecosystem block, it works, and nothing above applies to it.
- **Renovate security remediation is not yet proven end to end.** It can read the alerts as of [#10496](https://github.com/MetaMask/core/pull/10496), but it has not yet opened a `[SECURITY]` pull request, so we should not switch off Dependabot security updates until it has.
