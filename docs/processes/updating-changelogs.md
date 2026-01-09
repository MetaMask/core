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
