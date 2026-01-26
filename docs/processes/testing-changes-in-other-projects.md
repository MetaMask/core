# Testing changes to packages in other projects

If you have a project that depends on a package in this monorepo, you may want to load those changes into the project without having to create a whole new monorepo release. How you do this depends on your use case.

### Testing changes to packages locally

If you're developing your project locally and want to test changes to a package, you can follow these steps:

1. First, you must build the monorepo, by running `yarn build`.
2. Next, you need to connect the package to your project by overriding the resolution logic in your package manager to replace the published version of the package with the local version.

   1. Open `package.json` in the project and locate the dependency entry for the package.
   2. Locate the section responsible for resolution overrides (or create it if it doesn't exist). If you're using Yarn, this is `resolutions`; if you're using NPM or any other package manager, this is `overrides`.
   3. Add a line to this section that mirrors the dependency entry on the left-hand side and points to the local path on the right-hand side:

      ```
      "@metamask/<PACKAGE_NAME>@<PUBLISHED_VERSION_RANGE>": "file:<PATH_TO_CORE>/packages/<PACKAGE_NAME>"
      ```

      > **Example:**
      >
      > - If your project uses Yarn, `@metamask/controller-utils` is listed in dependencies at `^1.1.4`, and your clone of the `core` repo is at the same level as your project, add the following to `resolutions`:
      >
      >   ```
      >   "@metamask/controller-utils@^1.1.4": "file:../core/packages/controller-utils"
      >   ```

   4. Run `yarn install`.

3. Due to the use of Yarn's `file:` protocol, if you update the package in the monorepo, then you'll need to run `yarn install` in the project again.

### Testing changes to packages with preview builds

If you want to test changes to a package where it would be unwieldy or impossible to use a local version, such as on CI, you can publish a preview build and configure your project to use it.

#### Publishing preview builds as a MetaMask contributor

If you're a member of the MetaMask organization, you can create preview builds based on a pull request by following these steps:

1. Post a comment on the pull request with the text `@metamaskbot publish-preview`. This starts the `publish-preview` GitHub action, which will create preview builds for all packages in the monorepo.
2. After a few minutes, the action should complete and you will see a new comment that lists the newly published packages along with their versions.

   Note two things about each package:

   - The name is scoped to `@metamask-previews` instead of `@metamask`.
   - The ID of the last commit in the branch is appended to the version, e.g. `1.2.3-preview-e2df9b4` instead of `1.2.3`.

Now you can [use these preview builds in your project](#using-preview-builds).

If you make more changes to a package, follow step 2 again, making sure to update the reference to the package in your project's `package.json` to use the newly published preview version.

#### Publishing preview builds as an independent contributor

If you've forked this repository, you can create preview builds based on a branch by following these steps:

1. First, since an NPM scope is used to host preview build releases, you'll need access to one. If you do not, you can either [create a new organization](https://www.npmjs.com/org/create) or [convert your existing username into an organization](https://www.npmjs.com/org/upgrade).

2. Once you've done this, open the `package.json` for each package that you want to publish and change the scope in the name from `@metamask` to `@<NPM_ORG>`, replacing `NPM_ORG` with your NPM organization.

3. Next, run the following command to create and publish the preview builds (again, replacing `NPM_ORG` as appropriate):

   ```
   yarn prepare-preview-builds "@<NPM_ORG>" "$(git rev-parse --short HEAD)" && yarn build && yarn publish-previews
   ```

   You should be able to see the published version of each package in the output. Note two things:

   - The name is scoped to the NPM organization you entered instead of `@metamask`.
   - The ID of the last commit in the branch is appended to the version, e.g. `1.2.3-preview-e2df9b4` instead of `1.2.3`.

Now you can [use these preview builds in your project](#using-preview-builds).

If you make more changes to a package, follow step 3 again, making sure to update the reference to the package in your project's `package.json` to use the newly published preview version.

#### Using preview builds

To use a preview build for a package within a project, you need to override the resolution logic for your package manager so that the "production" version of that package is replaced with the preview version. Here's how you do that:

1. Open `package.json` in the project and locate the dependency entry for the core package for which you want to use a preview build.
2. Locate the section responsible for resolution overrides (or create it if it doesn't exist). If you're using Yarn, this is `resolutions`; if you're using NPM or any other package manager, this is `overrides`.
3. Add a line to this section that mirrors the dependency entry on the left-hand side and points to the preview version on the right-hand side:

   ```
   "@metamask/<PACKAGE_NAME>@<PRODUCTION_VERSION_RANGE>": "npm:@<NPM_ORG>/<PACKAGE_NAME>@<PREVIEW_VERSION>"
   ```

   > **Example:**
   >
   > - If your project uses Yarn, `@metamask/controller-utils` is listed in dependencies at `^1.1.4`, and you want to use the preview version `1.2.3-preview-e2df9b4`, add the following to `resolutions`:
   >
   >   ```
   >   "@metamask/controller-utils@^1.1.4": "npm:@metamask-previews/controller-utils@1.2.3-preview-e2df9b4"
   >   ```

4. Run `yarn install`.
