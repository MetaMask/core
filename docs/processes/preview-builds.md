# Publishing and using preview builds

Preview builds are pre-production versions of packages. Unlike [local builds](./local-builds.md), they are published to NPM (albeit under a separate NPM namespace) and can therefore be treated the same way as production releases in CI. Because of this, we recommend using preview builds for testing.

Generally, when working with preview builds, you will follow this process:

1. Create a branch in your clone of this repo
2. Work on changes to your package(s)
3. [Publish preview builds](#publishing-preview-builds)
4. Switch to the project and [configure it to use the new preview builds](#using-preview-builds)
5. Repeat steps 2-4 as necessary

## Publishing preview builds

To publish preview builds:

1. Create a pull request with the changes to your package(s).
2. Post a comment on the pull request with the text `@metamaskbot publish-previews`. The `publish-preview` GitHub action will kick off to generate and publish preview builds for all packages in the monorepo.
3. After a few minutes, you will see a new comment that lists the newly published packages along with their versions.

<details><summary><b>Publishing preview builds as an independent contributor</b></summary>
<br/>
Note that the steps above will only work if you are a member of the MetaMask engineering team on GitHub. If you are not, you'll need to follow some different steps:

1. First, you'll need access to an NPM organization under which the preview builds will be published. If you have not already done so, you can either [create a new organization](https://www.npmjs.com/org/create) or [convert your existing username into an organization](https://www.npmjs.com/org/upgrade).
2. Open the `package.json` for each package that you want to publish, and change the NPM scope in the package's name from `@metamask` to reflect your NPM organization.
3. Run the following command to create and publish preview builds for all packages in the monorepo (replacing `NPM_ORG` as appropriate):

   ```bash
   yarn prepare-preview-builds "@<NPM_ORG>" "$(git rev-parse --short HEAD)"
   yarn build
   yarn publish-previews
   ```

   You will see a list of the newly published packages along with their versions.
   </details>

## Using preview builds

To simulate production as best as possible, there two different paths to take depending on whether you anticipate making breaking or non-breaking changes to the package you want to test.

### Testing non-breaking changes to a package

If you're in a MetaMask client repo (e.g. `metamask-extension` or `metamask-mobile`), run:

```bash
yarn use-preview-build <name-of-package> <preview-version> --type non-breaking
```

For example:

```bash
yarn use-preview-build @metamask/permission-controller 13.0.2-preview-940c934 --type non-breaking
```

<details>
<summary><strong>Manual steps</strong></summary>

If you have made non-breaking changes to the package you want to test, and therefore plan on bumping the _minor_ or _patch_ part of that package's version, follow these steps:

1. In the project, open `package.json` and locate the entry in `dependencies` for the package. Take note of the major part of the version.

2. Run `yarn why @metamask/<PACKAGE_NAME>`, replacing `PACKAGE_NAME` as appropriate. You will see output like this:

   ```
   ├─ @metamask/parent-controller-1@npm:93.1.0
   │  └─ @metamask/my-controller@npm:12.1.1 (via npm:^12.1.1)
   │
   ├─ @metamask/parent-controller-2@npm:94.1.0
   │  └─ @metamask/my-controller@npm:12.1.1 (via npm:^12.1.1)
   │
   ├─ @metamask/parent-controller-3@npm:94.1.0 [abc9d]
   │  └─ @metamask/my-controller@npm:12.1.1 [57677] (via npm:^12.1.1 [15228])
   ...
   │
   └─ metamask@workspace:.
      └─ @metamask/my-controller@npm:12.1.1 [57677] (via npm:^12.1.0 [abc9d])
   ```

   Take note of all the version ranges that match the major version you saw earlier (here, we are looking for all version ranges that start with `^12`).

3. Back in `package.json`, locate the section responsible for resolution overrides (or create one if it doesn't exist). If you're using Yarn, this is `resolutions`; if you're using NPM or any other package manager, this is `overrides`.

4. For each version range, add a new entry that looks like this:

   ```json
   "@metamask/<PACKAGE_NAME>@<VERSION_RANGE>": "npm:@<NPM_ORG>/<PACKAGE_NAME>@<PREVIEW_VERSION>"
   ```

   where:

   - `PACKAGE_NAME` is the name of your package
   - `VERSION_RANGE` is one of the version ranges you noted in step 2
   - `NPM_ORG` is the NPM scope that the preview build is published under (note: this is _not_ `@metamask`)
   - `PREVIEW_VERSION` is the version string of the preview build (note: this should _not_ start with `^`)

5. Run `yarn install` to apply the changes.

6. Run `yarn why @metamask/<PACKAGE_NAME>` again to confirm that all of the instances of the package you saw when you ran this command earlier are now using your preview build.

> **Example:**
>
> - You have non-breaking changes to `@metamask/controller-utils` you want to test
> - You're in a MetaMask client repo
> - `@metamask/controller-utils` is listed at `^1.1.4`, and `yarn why` reveals that `^1.0.1` and `^1.1.3` are also being used as version ranges in the dependency tree
> - You want to use the preview version `1.1.4-preview-e2df9b4`
>
> In this case, you would go to `resolutions` and add these lines:
>
> ```json
> "@metamask/controller-utils@^1.0.1": "npm:@metamask-previews/controller-utils@1.1.4-preview-e2df9b4",
> "@metamask/controller-utils@^1.1.3": "npm:@metamask-previews/controller-utils@1.1.4-preview-e2df9b4",
> "@metamask/controller-utils@^1.1.4": "npm:@metamask-previews/controller-utils@1.1.4-preview-e2df9b4",
> ```
</details>

### Testing breaking changes to a package

If you're in a MetaMask client repo (e.g. `metamask-extension` or `metamask-mobile`), run:

```bash
yarn use-preview-build <name-of-package> <preview-version> --type breaking
```

For example:

```bash
yarn use-preview-build @metamask/permission-controller 13.0.2-preview-940c934 --type breaking
```

<details>
<summary><strong>Manual steps</strong></summary>

If you have made breaking changes to the package you want to test, and therefore plan on bumping the _major_ part of that package's version, follow these steps:

1. In the project, open `package.json`, and:

   - Note the name of the package.
   - Locate the section responsible for resolution overrides (or create one if it doesn't exist). If you're using Yarn, this is `resolutions`; if you're using NPM or any other package manager, this is `overrides`.

2. Add a new entry that looks like this:

   ```json
   "<ROOT_PACKAGE_NAME>@workspace:./@metamask/<PACKAGE_NAME>": "npm:@<NPM_ORG>/<PACKAGE_NAME>@<PREVIEW_VERSION>"
   ```

   where:

   - `ROOT_PACKAGE_NAME` is the value of the `name` field at the top of `package.json`
   - `NPM_ORG` is the NPM scope that the preview build is published under (note: this is _not_ `@metamask`)
   - `PACKAGE_NAME` is the name of your package
   - `PREVIEW_VERSION` is the version string of the preview build (note: this should _not_ start with `^`)

3. Run `yarn install` to apply the changes.

> **Example:**
>
> - You have breaking changes to `@metamask/network-controller` you want to test
> - You're in a MetaMask client repo
> - The `name` in `package.json` is "metamask"
> - `@metamask/network-controller` is listed at `^12.4.9`
> - You want to use the preview version `12.4.9-preview-e2df9b4`
>
> In this case, you would go to `resolutions` and add this line:
>
> ```json
> "metamask@workspace:./@metamask/network-controller@^12.4.9": "npm:@metamask-previews/network-controller@12.4.9-preview-e2df9b4",
> ```
</details>

### Using a preview build for a patched package

When you go to add a resolution for a package you want to test following steps in either of the sections above, you may find that the package is patched. An entry for a patched dependency looks like this:

```json
"@metamask/<PACKAGE_NAME>": "patch:@metamask/<PACKAGE_NAME>@npm:<ESCAPED_VERSION_RANGE>#~/.yarn/patches/<PATCH_NAME>.patch"
```

where:

- `PACKAGE_NAME` is the name of the package.
- `ESCAPED_VERSION_RANGE` is the version range, but where characters like `^` are escaped (for instance, `^` will appear as `%3A`).
- `PATCH_NAME` is the filename for a patch. It is usually dash-separated, starts with the package name, and ends with the commit ID from which the patch was created.

You will need to ensure that you keep the patch when you use a preview build for the package. To do this:

1. Look for the escaped version range on the right-hand side of the dependency entry and mentally parse it to determine the underlying version range that the patch is being applied to.

2. When you add a resolution, target that version range on the left-hand side as if the patch were not there, and reuse the same `patch:` identifier on the right side, but replace the package name and version string accordingly.

   - Note: Sometimes, for a patched dependency, the patch is present in not only as a dependency entry but also a resolution entry. If a resolution entry already exists, you'll want to replace it (but _only_ if you are making non-breaking changes, otherwise you'll want to add a new resolution).

> **Example 1 (non-breaking changes):**
>
> - You have non-breaking changes to `@metamask/controller-utils` you want to test
> - You're in a MetaMask client repo
> - `@metamask/controller-utils` is listed at `^1.1.4`, and `yarn why` reveals that `^1.0.1` and `^1.1.3` are also being used as version ranges in the dependency tree
> - The dependency entry looks like this:
>   ```json
>   "@metamask/controller-utils": "patch:@metamask/controller-utils@npm%3A1.1.4#~/.yarn/patches/@metamask-controller-utils-npm-1.1.4-cccac388c7.patch"
>   ```
> - A resolution entry also exists which looks like this:
>   ```json
>   "@metamask/controller-utils@npm:^1.1.4": "patch:@metamask/controller-utils@npm%3A1.1.4#~/.yarn/patches/@metamask-controller-utils-npm-1.1.4-cccac388c7.patch"
>   ```
> - You want to use the preview version `1.1.4-preview-e2df9b4`
>
> In this case, you would go to `resolutions`, _remove_ the existing entry, and add these new entries:
>
> ```json
> "@metamask/controller-utils@^1.0.1": "patch:@metamask-previews/controller-utils@npm%3A1.1.4-preview-e2df9b4#~/.yarn/patches/@metamask-controller-utils-npm-1.1.4-cccac388c7.patch"
> "@metamask/controller-utils@^1.1.3": "patch:@metamask-previews/controller-utils@npm%3A1.1.4-preview-e2df9b4#~/.yarn/patches/@metamask-controller-utils-npm-1.1.4-cccac388c7.patch"
> "@metamask/controller-utils@^1.1.4": "patch:@metamask-previews/controller-utils@npm%3A1.1.4-preview-e2df9b4#~/.yarn/patches/@metamask-controller-utils-npm-1.1.4-cccac388c7.patch"
> ```

> **Example 2 (breaking changes):**
>
> - You have breaking changes to `@metamask/network-controller` you want to test
> - You're in a MetaMask client repo
> - The `name` in `package.json` is "metamask"
> - `@metamask/network-controller` is listed at `^12.4.9`
> - The dependency entry looks like this:
>   ```json
>   "@metamask/network-controller": "patch:@metamask/network-controller@npm%3A12.4.9#~/.yarn/patches/@metamask-network-controller-npm-12.4.9-cccac388c7.patch"
>   ```
> - A resolution entry also exists which looks like this:
>   ```json
>   "@metamask/network-controller@npm:^12.4.9": "patch:@metamask/network-controller@npm%3A12.4.9#~/.yarn/patches/@metamask-network-controller-npm-12.4.9-cccac388c7.patch"
>   ```
> - You want to use the preview version `12.4.9-preview-e2df9b4`
>
> In this case, you would go to `resolutions` and leave the existing one there, but _add_ a new one:
>
> ```json
> "metamask@workspace:./@metamask/network-controller@^12.4.9": "patch:@metamask-previews/network-controller@npm%3A12.4.9-preview-e2df9b4#~/.yarn/patches/@metamask-network-controller-npm-12.4.9-cccac388c7.patch"
> ```
