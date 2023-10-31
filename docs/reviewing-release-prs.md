# Reviewing Release PRs

In order to publish a new release of the monorepo, a release PR must be created. But before a release PR is merged, it is absolutely critical — even if you are the author of the PR — to review the changes that are about to be published and to ensure that consumers know about them effectively.

This document shows you how to do that.

## 0. tl;dr — if you've done this before

- [ ] Are there any packages with version bumps that should not be published?
- [ ] Do the new versions of packages being published sufficiently communicate the impact of changes to those packages?
- [ ] Are all changelog entries placed in the correct category?
- [ ] Do all changelog entries explain the changes in a clear and straightforward manner and detail exact changes to the package's interface?
- [ ] Are there any changelog entries that do not need to be listed?
- [ ] Are there any changes made to a package since its previous release that are not reflected in its changelog?
- [ ] Are there any changelog entries that have missing references to pull requests?
- [ ] Have any changes been merged to `main` while the release PR has been open that have not been added to a changelog?
- [ ] Are there any bumps to internal dependencies that have not been captured in changelogs?

## 1. Review packages being published

First, it is important to understand how the release automation knows which packages to publish, and which to ignore. Simply put, if the version for a package is bumped within the release PR, that version will be published. You may see changes made to a package within a release PR, but if the version is not being bumped, those changes will not be published (until some future release).

So the first thing to do is to gather the list of packages that will be published by finding those in the PR that have a version bump. Ensure that there aren't any packages included in this list that should not be published. Assuming that there aren't any, take a note of the versions they have now and the versions they will have after the release.

Once you have this information, you'll want to review the changes to the packages.

## 2. Review changes

You can review changes to packages two ways.

### A. Review pull requests listed in new changelog entries

New releases are accompanied by new changelog entries to the packages being published. These changelog entries are most likely to appear in the release PR itself, and these changelog entries are most likely to link to a PR that made the changes. So, a quick way to review the changes-to-be-published is to look through the linked PRs in the changelogs.

### B. Review commits

A more thorough approach to review changes is to find the commits that contain them.

You can do this by opening your terminal locally, switching to the release branch (which takes the form `release/X.Y.Z`), and running this command (where `package-name` is the package you're interested in, and `current-version` is the version it has now):

```
git log --oneline @metamask/<package-name>@<current-version>..HEAD -- packages/<package-name>
```

This should give you the set of commits that have taken place since the package's latest release which changed the package in any way.

You can also request a diff with each commit:

```
git log -p @metamask/<package-name>@<current-version>..HEAD -- packages/<package-name>
```

Or, you can view all of the changes in one:

```
git diff @metamask/<package-name>@<current-version>..HEAD -- packages/<package-name>
```

You'll reference these changes in upcoming steps.

## 2. Determine impact of changes

Now that you know what sort of changes are being made, the next step is look through the version bumps in the release PR and verify the impact of those changes so that it can be properly communicated.

First, it's helpful to understand what sort of changes are worth communicating. While a release could certainly ship with a list of every single change made to the code in this repository, this would be needless. The people who will end up using the packages in this monorepo — consumers — only care about that part of code they can actually see and work with. So when it comes to understanding impact, this is what you should pay attention to:

- Changes to interfaces
- Changes to behavior
- Changes to runtime dependencies
- Changes to consumer-facing documentation

Conversely, you generally should not need to worry about:

- Changes to internal tooling
- Changes to developer-only dependencies
- Changes to contributor-only documentation

With that in mind, there are four categories of changes that determine the level of impact.

### Breaking changes

If a consumer upgrades a package to a new version without making any modifications to their code, that version is "breaking" if it causes:

- An error at runtime
- An error at compile time (e.g., a TypeScript type error)
- An error at install time (e.g., the consumer's package manager reports a Node version incompatibility)
- A surprising difference in behavior

Given this, there are many ways a change could be regarded as breaking:

- Changing a function or method to throw an error
- Adding a required argument to a function or method
- Adding a property to a TypeScript type
- Narrowing the type of a property in a TypeScript type
- Narrowing the type of an argument in a function
- Adding a parameter to a TypeScript type
- Removing a parameter from a TypeScript type
- Upgrading a runtime dependency to a version which causes any of the above
- Removing an export from the package
- Renaming the package
- Bumping the Node version
- Bumping the NPM version

### Additions

Minimally, this category could cover any actions that extend the surface area of a package in some way:

- Adding an optional property to an existing type
- Adding an optional argument to an existing function or method
- Adding a new export to a package

However, it is important to remember that consumers care about capabilities first and interfaces second. So, some additions could also be more simply regarded as changes. For instance:

- Adding a new dependency

### Removals

In most cases, removing something from a package will cause a breaking change, and thus should be categorized as such. There are some rare instances, however, when this is not the case:

- Removing a runtime dependency

### Fixes

There are a few different kinds of changes that could be filed under this category.

- Fixing a security vulnerability. (NOTE: These are actually a special kind of change and should be made discreetly through a private channel so as not to raise suspicion.)
- Correcting a mistake introduced in a previous release. For example, a function was supposed to be included but was not.
- Realigning confusing or illogical behavior. This is tricky, because the longer buggy behavior is allowed to persist, the more consumers may rely upon it. In this case, it would be more thoughtful to call out a change in this behavior as breaking, even if the new behavior makes more sense. (As an example, read about the [history of MetaMask's signing methods](https://github.com/MetaMask/metamask-docs/blob/72e1a066ea1a81a7964dbc9aa83381493a2cd3eb/wallet/concepts/signing-methods.md).) But for minor cases, a "fix" may be more appropriate.

### Everything else

These constitute changes which cannot be neatly categorized as breaking, or as an addition, deletion, or fix, such as:

- Adding, upgrading, or removing a runtime dependency
- Modifying behavior in a low-impact, non-surprising way

## 3. Review new version strings

Now that you understand the changes being made and what sort of impact they are likely to have on consumers, the next step is to verify that the impact is being appropriately communicated via version strings.

[Semantic Versioning](https://semver.org/) (SemVer) dictates that versions should be bumped in the following manner:

- If there are any changes you would categorize as a breaking change, bump the **major** (first) part of the version.
- Otherwise, if there are any changes you would categorize as an addition, bump the **minor** (second) part of the version.
- Otherwise, bump the **patch** (third) part of the version.

If there are any packages being bumped whose new versions understate their impact, then notify the creator of the release PR so that they can update the versions appropriately.

## 4. Review existing changelog entries

Next, look over the changelogs in the packages-to-be-released to ensure that they are well formed and that they list all changes that will be released.

The [Keep a Changelog](https://keepachangelog.com/) specification defines a standard format for changelogs, and all MetaMask repositories, including the core monorepo, follow this format.

You might notice that the categories listed in this spec match the same ones listed above in this document. This is not a coincidence!

One tenet of Keep a Changelog is that changelog entries should not be mere regurgitations of commit messages or pull request titles. An item like "Support advanced gas fees in TransactionController" provides adequate clues for others to guess the content of a commit, but it is insufficient for a changelog. Keep in mind how consumers use software: through an interface. It is fine to provide the greater context for a set of changes in a changelog entry, but at the very least, there should be explicit mention of the pieces of the interface — classes, methods, functions, and types — that have been added, updated, or removed. Also, if a version contains breaking changes, it is essential to explain how consumers who are upgrading to that version will need to change their code in order to adapt to the changes. Either way, consumers should not have to click through pull requests and scan commit diffs to obtain this information.

Finally, a changelog entry may reference one or more pull requests that introduced the change. While `auto-changelog`, the tool used to validate changelogs, does not require these references to be present, they are nice to have so that consumers have an opportunity to dive into the context behind the change if they need to.

Therefore, if there are any changelog entries that should be moved to a different category, or if there are any changelog entries that can be reworded to help consumers, or if there are changelog entries that are missing pull request references, notify the creator of the release PR, offering a suggestion as necessary.

## 5. Add missing changelog entries

Finally, look over the changelogs one more time to ensure that they aren't missing anything. There are three ways that entries could get omitted:

- Although the `create-release-branch` tool helps to autopopulate changelog entries, it does not remove the human element entirely, and it is possible that the creator of the release PR may have inadvertently removed some entries before pushing up the branch.
- While a release PR is open, more changes may be made to packages that are already planned for release.
- Finally, if the version of a package in the monorepo is updated, the manifests of any dependents of that package will be updated so that they match the same version. This is unusual because bumps to dependencies usually happen _before_ a release PR, but is essential to document just the same.

Therefore, review the [changes committed since the previous release](#review-changes) and look for internal dependency bumps, and if either are missing from the changelogs, notify the creator of the release PR so that they can add them, offering a suggestion as necessary.

## 6. Approve the release

That's it! You can now rest easy knowing that all of the changes in the new release are accounted for and that consumers will be sufficiently notified once it has been created.
