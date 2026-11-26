# Updating changelogs

Each package in this repo has a file called `CHANGELOG.md` which is used to record consumer-facing changes that have been published over time. This file is useful for other engineers who are upgrading to new versions of packages so that they know how to use new features they are expecting, they know when bugs have been addressed, and they understand how to adapt to breaking changes (if any). All changelogs follow the ["Keep a Changelog"](https://keepachangelog.com/) specification (enforced by `@metamask/auto-changelog`).

As you make changes to packages, make sure to update their changelogs in the same branch.

We will offer more guidance here in the future, but in general:

- When updating changelogs, follow the ["Keep a Changelog"](https://keepachangelog.com/) specification:
  - When releasing a new version, ensure that there is a header for the version linked to the corresponding tag on GitHub.
  - Always ensure there is an Unreleased section above any version section. It may be empty.
  - Within each version section or within Unreleased, place changelog entries into one of the following categories (note: categories must be listed in this order):
    - Added
    - Changed
    - Deprecated
    - Removed
    - Fixed
    - Security
- Within a category section, follow these guidelines:
  - Highlight breaking changes by prefixing them with `**BREAKING:**`. List breaking changes above non-breaking changes in the same category section. A change is breaking if it removes, renames, or changes the signature of any public export (function, type, class, constant), or changes default behavior that consumers rely on.
  - Omit non-consumer facing changes and reverted changes from the changelog.
  - Use a nested list to add more details about the change if it would help engineers. For breaking changes in particular, highlight steps engineers need to take to adapt to the changes.
  - Each changelog entry should be followed by links to the pull request(s) that introduced the change. If a pull request is not available yet, use a placeholder.
  - Do not simply reuse the PR title in the entry, but describe exact changes to the API or usable surface area of the project.
  - When there are multiple upgrades to the same package in the same release, combine them into a single entry.
  - Each changelog entry should describe one kind of change; if an entry describes too many things, split it up.
- After updating a changelog, run `yarn changelog:validate` and fix any errors reported.

## Generating changelog entries for dependency bumps

Recording dependency bumps within package changelogs can be tedious. You can have these entries generated for you instead of writing them by hand:

1. Post a comment on your pull request with the text `@metamaskbot update-changelogs`.
2. The `Update Changelogs` GitHub action reacts to your comment with a 👍 and kicks off.
3. After a few minutes you will see a new comment saying either that the changelogs were updated and pushed to your branch, or that no changes were needed. If validation errors remain that the action cannot fix, the comment links to the workflow run so you can see them.

A few things to know:

- This works on any pull request, not just release pull requests. Release pull requests also get this automatically when they are opened.
- If the action pushes a commit to your branch, remember to pull it locally before you push again.
- This only works on pull requests opened from a branch in this repo. Pull requests from forks are skipped, so if you are an outside contributor you will need to update changelogs by hand.
