# Reviewing Release PRs

In order to publish a new release of the monorepo, a release PR must be created. But before a release PR is merged, it is absolutely critical — even if you are the author of the PR — to review the changes that are about to be published and to ensure that consumers know about them effectively.

This document shows you how to do that.

## 0. tl;dr — if you've done this sort of thing before

- [ ] Are there any packages with version bumps that should not be published?
- For all packages being published:
  - [ ] Does the new version string sufficiently communicate the impact of changes?
  - [ ] Are there any changelog entries that do not need to be listed?
  - [ ] Are there any changelog entries that are placed in the wrong category (including "Unreleased")?
  - [ ] Do all changelog entries explain the changes in a clear and straightforward manner and detail exact changes to the package's interface?
  - [ ] Do all change entries include a link to the pull requests where that change was made?
  - [ ] Are there any changes since the package's previous release that are not reflected in the changelog?
  - [ ] Have there been any changes merged to `main` while the release PR has been open that have not been added to a changelog?
  - [ ] Are there any bumps to workspace dependencies made within the release PR that have not been captured in the changelog?

## 1. Review packages being published

First, it is important to understand how the release automation knows which packages to publish, and which to ignore. Simply put:

**If the version for a package is bumped within the release PR, that version will be published.**

You may see changes made to a package within a release PR, but if the version is not being bumped, those changes will not be published (until some future release).

So:

- Gather the list of packages that will be published by finding those in the PR that have a version bump.
- Ensure that there aren't any packages included in this list that should not be published.
- Take a note of the versions they have now and the versions they will have after the release.

Once you have this information, you'll want to review the changes to the packages.

## 2. Review changes being published

You can locate and review all of the changes that will be published in two ways:

### A. Review pull requests listed in new changelog entries

New releases are accompanied by new changelog entries to the packages being published. These changelog entries are most likely to appear in the release PR itself, and these changelog entries are most likely to link to a PR that made the changes. So, a quick way to review the changes to be published is to look through the linked PRs in the changelogs.

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

## 3. Review types of changes

Now that you have a better sense of the changes, the next step is to begin to classify them so that they can be communicated effectively.

First, it's important to understand which changes are important to communicate and which are not. While some developers might care about every single change made to the code, the people who will end up using the packages in this monorepo — consumers — only care about that part of code they can actually see and work with. So here are the changes to consider:

- Changes to interfaces ✅
- Changes to behavior ✅
- Additions of runtime dependencies ✅
- Upgrades to runtime dependencies ✅
- Changes to consumer-facing documentation ✅

Conversely, you generally should not need to worry about:

- Changes to internal tooling ❌
- Changes to developer-only dependencies ❌
- Changes to contributor-only documentation ❌
- Removal of runtime dependencies ❌ (unless it is being done to improve the size of the package)

With that in mind, there are three ways changes can be categorized:

### Breaking changes

A change is "breaking" if it is included in a version of a package, which, after a consumer upgrades to it and makes no further changes, causes one of the following:

- An error at runtime
- An error at compile time (e.g., a TypeScript type error)
- An error at install time (e.g., the consumer's package manager reports a Node version incompatibility)
- A surprising difference in behavior

Given this, there are many ways a change could be regarded as breaking:

- Changing a function or method to throw an error
- Adding a required argument to a function or method
- Adding a required property to a TypeScript type
- Narrowing the type of a property in a TypeScript type
- Narrowing the type of an argument in a function
- Adding or removing a parameter to a TypeScript type
- Upgrading a runtime dependency to a version which causes any of the above
- Removing an export from the package
- Bumping the minimum supported Node.js version

### Additions

A change is an "addition" if it extends the surface area of a package's API. For example:

- Adding an optional property to an existing type ✅
- Adding an optional argument to an existing function or method ✅
- Adding a new export to a package ✅

It is important to remember that consumers care about capabilities first and interfaces second, so these would not count as an addition:

- Adding a new dependency ❌

### Fixes

A change is a "fix" when it corrects unintentional or buggy behavior. For example:

- Patching a security vulnerability
- Correcting a mistake introduced in a previous release (for example, a function was supposed to be included but was not)
- Realigning confusing or illogical behavior

Note that in some cases, a fix may need to be announced as a breaking change, especially if the undesirable behavior has existed for a while. (As an example, read about the [history of MetaMask's signing methods](https://github.com/MetaMask/metamask-docs/blob/72e1a066ea1a81a7964dbc9aa83381493a2cd3eb/wallet/concepts/signing-methods.md).)

### Everything else

Some changes cannot be neatly categorized as breaking, or as an addition or fix, such as:

- Adding or upgrading a runtime dependency
- Modifying behavior in a low-impact, non-surprising way

## 4. Review new version strings

Now that you've categorized the changes being released, the next step is to verify that the versions of each package being bumped accurately embody those categories.

[Semantic Versioning](https://semver.org/) dictates that versions should be bumped in the following manner:

- If the release contains any breaking changes, bump the **MAJOR** (first) part of the version.
- Otherwise, if it extends the surface area of the package, bump the **MINOR** (second) part of the version.
- Otherwise, bump the **PATCH** (third) part of the version.

If there are any packages being bumped whose new versions do not align to this scheme, then notify the creator of the release PR so that they can update the versions appropriately.

## 5. Review wording of existing changelog entries

Next, look over the changelogs of the packages which will be released to ensure that they are well-formed and that they list all changes that will be released.

The [Keep a Changelog](https://keepachangelog.com/) specification defines a standard format for changelogs, and all MetaMask repositories, including the core monorepo, follow this format.

One tenet of Keep a Changelog is that **changelog entries should not be mere regurgitations of commit messages or pull request titles**. An entry like "Support advanced gas fees in TransactionController" is adequate to understand the content of a commit, but it contains insufficient detail for a changelog. Keep in mind that since consumers use software through an interface, they want to know how that interface will change if they upgrade to a new version. So, a changelog entry should list specifics, i.e., the classes, methods, functions, and types that have been added, updated, or removed. If a version contains breaking changes, the changelog should explain how consumers who are upgrading to that version will need to adapt to the changes. Either way, consumers should not have to click through pull requests and scan commit diffs to obtain this information.

A changelog entry should reference one or more pull requests that introduced the change. While `auto-changelog`, the tool that validates changelogs, does not require these pull request references to be present, they are useful so that consumers have an opportunity to dive into the context behind the change if they need to.

Conversely, some pull requests contain multiple changes and thus may need to split up into multiple changelog entries.

So, if you find any changelog entries that:

- should be moved to a different category
- can be reworded to help consumers
- are missing pull request references
- can be split up into multiple entries

notify the creator of the release PR, offering a suggestion as necessary.

## 6. Add missing changelog entries

Finally, look over the changelogs one more time to ensure that they aren't missing anything. There are three ways that entries could get omitted:

1. Although the `create-release-branch` tool helps to autopopulate changelog entries, it does not remove the human element entirely, and it is possible that the creator of the release PR may have inadvertently removed some entries before pushing up the branch.
2. While a release PR is open, pull requests may be merged to `main` which make more changes to packages that are already planned for release.
3. Finally, if the version of a package in the monorepo is updated, the manifests of any dependents of that package will automatically be updated so that they match the same version. This is unusual because bumps to dependencies usually happen _before_ a release PR, but is essential to document these bumps in the changelogs.

Therefore, review the [changes committed since the previous release](#review-changes) and look for changed versions of workspace dependencies. If any are missing from changelogs, notify the creator of the release PR so that they can add them, offering a suggestion as appropriate.

## 7. Approve the release

That's it! You can now rest easy knowing that all of the changes in the new release are accounted for and that consumers will be sufficiently notified once it has been created.
