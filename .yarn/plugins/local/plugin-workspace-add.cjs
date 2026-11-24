// Local Yarn plugin for `yarn add`. This repository's constraints disallow the
// `workspace:` protocol, so when a workspace package is added as a dependency
// of another package, this plugin:
//
// 1. Replaces the `workspace:^` range with `^<current version>`.
// 2. Runs `yarn run lint:tsconfigs:fix` in each package that was changed, once
//    the install has finished, to update the TypeScript project references.

module.exports = {
  name: 'plugin-workspace-add',
  factory: (require) => {
    const { execUtils, structUtils } = require('@yarnpkg/core');

    const changedWorkspaces = new Set();

    /**
     * Rewrites a `workspace:` range to `^<version>` in the manifest.
     */
    function rewriteWorkspaceRange(workspace, target, descriptor) {
      if (!descriptor.range.startsWith('workspace:')) {
        return;
      }

      const dependency = workspace.project.tryWorkspaceByDescriptor(descriptor);
      const version = dependency?.manifest.version;
      if (!version) {
        return;
      }

      workspace.manifest[target].set(
        descriptor.identHash,
        structUtils.makeDescriptor(descriptor, `^${version}`),
      );

      changedWorkspaces.add(workspace);
    }

    return {
      hooks: {
        // Called when `yarn add` adds a dependency that was not yet present.
        afterWorkspaceDependencyAddition(workspace, target, descriptor) {
          rewriteWorkspaceRange(workspace, target, descriptor);
        },

        // Called when `yarn add` changes the range of an existing dependency.
        afterWorkspaceDependencyReplacement(workspace, target, _from, to) {
          rewriteWorkspaceRange(workspace, target, to);
        },

        async afterAllInstalled() {
          const workspaces = [...changedWorkspaces];
          changedWorkspaces.clear();

          for (const workspace of workspaces) {
            const { code } = await execUtils.pipevp(
              'yarn',
              ['run', 'lint:tsconfigs:fix'],
              {
                cwd: workspace.cwd,
                stdin: process.stdin,
                stdout: process.stdout,
                stderr: process.stderr,
              },
            );

            if (code !== 0) {
              throw new Error(
                `\`lint:tsconfigs:fix\` failed in "${workspace.cwd}" with exit code ${code}.`,
              );
            }
          }
        },
      },
    };
  },
};
