# `migrate-tags`

When migrating libraries into the core monorepo, the original git history is transferred using the `git-filter-repo` tool (instructions [here](https://github.com/MetaMask/core/issues/1079#issuecomment-1700126302)), but tags attached to release commits are excluded from the process. This is because the tag names (`v[major].[minor].[patch]`) first need to be adjusted to conform to the scheme used by the core repo (`@metamask/<package-name>@[major].[minor].[patch]`).

The `./scripts/migrate-tags.sh` script automates the process of enumerating the tags and associated release commit messages in the original repo, searching the migrated git history in the core repo's `merged-packages/<package-name>` directory for each commit message, creating tags with correctly-formatted names and attaching them to the found release commits, and pushing those tags to the core repo.

## A. Preparations

- The migration target package must be inside of the `merged-packages/` directory with its git history fully migrated.
- The script must be run from the root directory of the core repo.
- The `/tmp/<package-name>` directory used during the git history migration process should still be accessible. If not, perform steps 1-5 of [these instructions](https://github.com/MetaMask/core/issues/1079#issuecomment-1700126302) before proceeding.
- If the script isn't executable, run `chmod +x ./scripts/migrate-tags.sh`.
- By default, this script will run in "dry mode", printing out all pairs of release commit hashes and prefixed tag names, but not modifying the local or remote repo in any way. To override this and actually create/push tags, run the script with a `--no-dry-run` flag appended at the end.

## B. Options

- `<package-name>` (required).
  - Only supply the package directory name. Exclude the `@metamask/` namespace.
- `-r`, `--remote` (optional): the git remote repo where the tags will be pushed.
  - Default if omitted: "test".
- `-v`, `--version-before-package-rename` (optional)
  - Default if omitted: `0.0.0`.
  - **If `-v` is not passed, all tag names will be prepended with the `@metamask/` namespace.**
- `-t`, `--tag-prefix-before-package-rename` (optional)
  - Default if omitted: `<package-name>` supplied in the first argument.
- `-d`, `--tmp-dir` (optional)
  - Default if omitted: `/tmp`
  - Specifies the temporary directory where `git-filter-repo` was applied to a clone of the original repo.
- `-p`, `--sed-pattern` (optional): sed pattern for extracting version numbers from the original repo's tag names.
  - Default if omitted: `'s/^v//'`
  - If the original tag names follow a different naming scheme than `v[major].[minor].[patch]`, adjust this setting.
- `--no-dry-run` (optional):
  - Default if omitted: `false`.
  - If not specified, the script will run in "dry run" mode. The script will print out all pairs of release commit hashes and prefixed tag names, but without modifying the local or remote repo in any way.
  - **This flag MUST be enabled for tags to be created and pushed.**
  - Make sure to specify the correct remote repo where the tags will be pushed by using the `-r` flag.

## C. Usage

### 1. General Case (package never renamed)

- For most cases, you will only need to specify the `<package-name>` as the first argument.

```shell
> ./scripts/migrate-tags.sh eth-json-rpc-provider
```

```output
328a43ed @metamask/eth-json-rpc-provider@1.0.0
06c41f6a @metamask/eth-json-rpc-provider@1.0.1
de124c41 @metamask/eth-json-rpc-provider@2.0.0
0aa45a9a @metamask/eth-json-rpc-provider@2.1.0
d3a9f01c @metamask/eth-json-rpc-provider@2.2.0
```

### 2. Renamed Package

- If the migration target package has been renamed, specify the `-v`, `--version-before-package-rename` option.

```shell
> ./scripts/migrate-tags.sh json-rpc-engine -v 6.1.0
```

```output
67c7fee5 @metamask/json-rpc-engine@7.2.0
23aa8d9e @metamask/json-rpc-engine@7.1.1
76394323 @metamask/json-rpc-engine@7.1.0
22ff65e0 @metamask/json-rpc-engine@7.0.0
c753c16c @metamask/json-rpc-engine@7.0.0
670d8dd7 json-rpc-engine@6.1.0
9646dc26 json-rpc-engine@6.0.0
...
```

- The above output shows two `7.0.0` entries. If any duplicate release commits are found, the script will create and push tags only on the most recent commit.
- The user has the option to supply a custom regex pattern under `-p` to narrow down the search results for the release commits.

### 3. Package will be Renamed on the first Post-Migration Release

- If the migration target package will be renamed after the migration, **specify the latest release version** in `-v`.

```shell
> ./scripts/migrate-tags.sh json-rpc-middleware-stream -v 5.0.1
```

```output
38c007a3 json-rpc-middleware-stream@5.0.1
c34b1704 json-rpc-middleware-stream@5.0.0
8c6b70e5 json-rpc-middleware-stream@4.2.3
f7290013 json-rpc-middleware-stream@4.2.2
e08455ca json-rpc-middleware-stream@4.2.1
d90fe43d json-rpc-middleware-stream@4.2.0
...
```

### 4. Non-Dry Mode

- To override dry run mode and actually create/push tags, run the script with a `--no-dry-run` flag at the end.
- Make sure to specify the correct remote repo where the tags will be pushed by using the `-r` flag.

```shell
> ./scripts/migrate-tags.sh json-rpc-middleware-stream -v 5.0.1 -r origin --no-dry-run
```

```output
Total 0 (delta 0), reused 0 (delta 0), pack-reused 0
To https://github.com/[USERNAME]/[FORKNAME]
 * [new tag]           json-rpc-middleware-stream@5.0.1 -> json-rpc-middleware-stream@5.0.1
Total 0 (delta 0), reused 0 (delta 0), pack-reused 0
To https://github.com/[USERNAME]/[FORKNAME]
 * [new tag]           json-rpc-middleware-stream@5.0.0 -> json-rpc-middleware-stream@5.0.0
Total 0 (delta 0), reused 0 (delta 0), pack-reused 0

...

To https://github.com/[USERNAME]/[FORKNAME]
 * [new tag]           json-rpc-middleware-stream@2.0.0 -> json-rpc-middleware-stream@2.0.0
Total 0 (delta 0), reused 0 (delta 0), pack-reused 0
To https://github.com/[USERNAME]/[FORKNAME]
 * [new tag]           json-rpc-middleware-stream@1.0.1 -> json-rpc-middleware-stream@1.0.1
```

## D. Verify

- Check whether the tags have correctly been pushed to the remote repo.

```shell
> git ls-remote --tags origin | grep 'json-rpc-engine'
```

```output
22ff65e0f76710188b527bd5d3f81dd2103c5514        refs/tags/@metamask/json-rpc-engine@7.0.0
7639432339e60767a8239d681911375833bc3839        refs/tags/@metamask/json-rpc-engine@7.1.0
23aa8d9e59d9275c0725cb0264057e082034dae9        refs/tags/@metamask/json-rpc-engine@7.1.1
67c7fee5141f6c0bb2f459c1cb3062c02bbf6a15        refs/tags/@metamask/json-rpc-engine@7.2.0
304f6efa4d1be2460c9d0bec48224cefcf7fd208        refs/tags/json-rpc-engine@1.0.0
4909d7fd95a555a7ae18cb1f9840db4fe1f3c85d        refs/tags/json-rpc-engine@2.0.0
93e2b7224f7370468466e2e5e29a2c10da016b11        refs/tags/json-rpc-engine@2.1.0
286c2716a7b856b95f74d64edd9e653728dd031c        refs/tags/json-rpc-engine@2.2.0
...
```

## E. Troubleshooting

> [!WARNING]
> DO NOT run this script on the core repo until the results have been tested on a fork.

The following commands should NOT be run on the core repo unless something has gone very wrong.

### 1. Delete remote tags

**WARNING**: Proceed with EXTREME CAUTION

```shell
> git ls-remote --tags <remote-repo> | grep '<package-name>' | cut -f2 | sed 's|refs/tags/||g' | xargs git push --delete <remote-repo>
```

- ALWAYS create a backup clone repo in advance and delete local tags AFTER remote tags.
- If something goes wrong, try `git push <remote-repo>` to push the local tags to remote.
- If the local tags have been deleted, push the unaltered tags in the backup clone repo to remote.
- If this fails, ask a teammate who has the correct tags on local to push them to remote.

### 2. Delete local tags

```shell
> git tag | grep '<package-name>' | xargs git tag --delete
```

- If anything goes wrong, run `git pull --all` and the tags in the remote repo will be restored to local.
