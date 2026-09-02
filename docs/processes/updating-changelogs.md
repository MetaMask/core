# Updating changelogs

Each package in this repo has a file called `CHANGELOG.md` which is used to record consumer-facing changes that have been published over time. This file is useful for other engineers who are upgrading to new versions of packages so that they know how to use new features they are expecting, they know when bugs have been addressed, and they understand how to adapt to breaking changes (if any). All changelogs follow the ["Keep a Changelog"](https://keepachangelog.com/) specification (enforced by `@metamask/auto-changelog`).

As you make changes to packages, make sure to update their changelogs in the same branch.

We will offer more guidance here in the future, but in general:

- Place new entries under the "Unreleased" section.
- Place changes into categories. Consult the ["Keep a Changelog"](https://keepachangelog.com/en/1.1.0/#how) specification for the list.
- Highlight breaking changes by prefixing them with `**BREAKING:**`.
- Omit non-consumer facing changes from the changelog.
- Do not simply reuse the commit message, but describe exact changes to the API or usable surface area of the project.
- Use a list nested under a changelog entry to enumerate more details about a change if need be.
- Include links to pull request(s) that introduced each change. (Most likely, this is the very same pull request in which you are updating the changelog.)
- Combine like changes from multiple pull requests into a single changelog entry if necessary.
- Split disparate changes from the same pull request into multiple entries if necessary.
- Omit reverted changes from the changelog.

## Updating changelogs automatically

Some changelog entries are mechanical, such as the entries that record dependency bumps across packages. You can get these written for you instead of writing them by hand:

1. Post a comment on your pull request with the text `@metamaskbot update-changelogs`.
2. The `Update Changelogs` GitHub action reacts to your comment with a 👍 and kicks off.
3. After a few minutes you will see a new comment saying either that the changelogs were updated and pushed to your branch, or that no changes were needed. If validation errors remain that the action cannot fix, the comment links to the workflow run so you can see them.

A few things to know:

- This works on any pull request, not just release pull requests. Release pull requests also get this automatically when they are opened.
- If the action pushes a commit, remember to pull it before you push again.
- This only works on pull requests opened from a branch in this repo. Pull requests from forks are skipped, so if you are an outside contributor you will need to update changelogs by hand.
