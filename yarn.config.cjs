// @ts-check
// This file is used to define, among other configuration, rules that Yarn will
// execute when you run `yarn constraints`. These rules primarily check the
// manifests of each package in the monorepo to ensure they follow a standard
// format, but also check the presence of certain files as well.

/** @type {import('@yarnpkg/types')} */
const { defineConfig } = require('@yarnpkg/types');
const { readFile } = require('fs/promises');
const { get } = require('lodash');
const { basename, resolve } = require('path');
const semver = require('semver');
const { inspect } = require('util');

/**
 * Aliases for the Yarn type definitions, to make the code more readable.
 *
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Yarn} Yarn
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Workspace} Workspace
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Dependency} Dependency
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.DependencyType} DependencyType
 */

module.exports = defineConfig({
  async constraints({ Yarn }) {
    const rootWorkspace = Yarn.workspace({ cwd: '.' });
    if (rootWorkspace === null) {
      throw new Error('Could not find root workspace');
    }

    const repositoryUri = rootWorkspace.manifest.repository.url.replace(
      /\.git$/u,
      '',
    );

    for (const workspace of Yarn.workspaces()) {
      const workspaceBasename = getWorkspaceBasename(workspace);
      const isChildWorkspace = workspace.cwd !== '.';
      const isPrivate =
        'private' in workspace.manifest && workspace.manifest.private === true;
      const dependenciesByIdentAndType = getDependenciesByIdentAndType(
        Yarn.dependencies({ workspace }),
      );

      // All packages must have a name.
      expectWorkspaceField(workspace, 'name');

      if (isChildWorkspace) {
        // All non-root packages must have a name that matches its directory
        // (e.g., a package in a workspace directory called `foo` must be called
        // `@metamask/foo`).
        expectWorkspaceField(
          workspace,
          'name',
          `@metamask/${workspaceBasename}`,
        );

        // All non-root packages must have a version.
        expectWorkspaceField(workspace, 'version');

        // All non-root packages must have a description that ends in a period.
        expectWorkspaceDescription(workspace);

        // All non-root packages must have the same set of NPM keywords.
        expectWorkspaceField(workspace, 'keywords', ['MetaMask', 'Ethereum']);

        // All non-root packages must have a homepage URL that includes its name.
        expectWorkspaceField(
          workspace,
          'homepage',
          `${repositoryUri}/tree/main/packages/${workspaceBasename}#readme`,
        );

        // All non-root packages must have a URL for reporting bugs that points
        // to the Issues page for the repository.
        expectWorkspaceField(workspace, 'bugs.url', `${repositoryUri}/issues`);

        // All non-root packages must specify a Git repository within the
        // MetaMask GitHub organization.
        expectWorkspaceField(workspace, 'repository.type', 'git');
        expectWorkspaceField(
          workspace,
          'repository.url',
          `${repositoryUri}.git`,
        );

        // All non-root packages must have a license, defaulting to MIT.
        await expectWorkspaceLicense(workspace);

        // All non-root packages must not have side effects. (An exception is
        // made for `@metamask/base-controller`).
        if (workspace.ident !== '@metamask/base-controller') {
          expectWorkspaceField(workspace, 'sideEffects', false);
        }

        // All non-root packages must set up ESM- and CommonJS-compatible
        // exports correctly.
        expectCorrectWorkspaceExports(workspace);

        // All non-root packages must have the same "build" script.
        expectWorkspaceField(
          workspace,
          'scripts.build',
          'ts-bridge --project tsconfig.build.json --verbose --clean --no-references',
        );

        // All non-root packages must have the same "build:docs" script.
        expectWorkspaceField(workspace, 'scripts.build:docs', 'typedoc');

        if (isPrivate) {
          // All private, non-root packages must not have a "publish:preview"
          // script.
          workspace.unset('scripts.publish:preview');
        } else {
          // All non-private, non-root packages must have the same
          // "publish:preview" script.
          expectWorkspaceField(
            workspace,
            'scripts.publish:preview',
            'yarn npm publish --tag preview',
          );
        }

        // No non-root packages may have a "prepack" script.
        workspace.unset('scripts.prepack');

        // All non-root package must have valid "changelog:update" and
        // "changelog:validate" scripts.
        expectCorrectWorkspaceChangelogScripts(workspace);

        // All non-root packages must have a valid "since-latest-release" script.
        expectWorkspaceField(
          workspace,
          'scripts.since-latest-release',
          '../../scripts/since-latest-release.sh',
        );

        // All non-root packages must have the same "test" script.
        expectWorkspaceField(
          workspace,
          'scripts.test',
          'NODE_OPTIONS=--experimental-vm-modules jest --reporters=jest-silent-reporter',
        );

        // All non-root packages must have the same "test:clean" script.
        expectWorkspaceField(
          workspace,
          'scripts.test:clean',
          'NODE_OPTIONS=--experimental-vm-modules jest --clearCache',
        );

        // All non-root packages must have the same "test:verbose" script.
        expectWorkspaceField(
          workspace,
          'scripts.test:verbose',
          'NODE_OPTIONS=--experimental-vm-modules jest --verbose',
        );

        // All non-root packages must have the same "test:watch" script.
        expectWorkspaceField(
          workspace,
          'scripts.test:watch',
          'NODE_OPTIONS=--experimental-vm-modules jest --watch',
        );
      }

      if (isChildWorkspace) {
        // The list of files included in all non-root packages must only include
        // files generated during the build process.
        expectWorkspaceArrayField(workspace, 'files', 'dist/');
      } else {
        // The root package must specify an empty set of published files. (This
        // is required in order to be able to import anything in
        // development-only scripts, as otherwise the
        // `node/no-unpublished-require` ESLint rule will disallow it.)
        expectWorkspaceField(workspace, 'files', []);
      }

      // If one workspace package lists another workspace package within
      // `dependencies` or `devDependencies`, the version used within the
      // dependency range must match the current version of the dependency.
      expectUpToDateWorkspaceDependenciesAndDevDependencies(Yarn, workspace);

      // If one workspace package lists another workspace package within
      // `peerDependencies`, the dependency range must satisfy the current
      // version of that package.
      expectUpToDateWorkspacePeerDependencies(Yarn, workspace);

      // No dependency may be listed under both `dependencies` and
      // `devDependencies`.
      expectDependenciesNotInBothProdAndDev(
        workspace,
        dependenciesByIdentAndType,
      );

      // If one workspace package (A) lists another workspace package (B) in its
      // `dependencies`, and B is a controller package, then we need to ensure
      // that B is also listed in A's `peerDependencies` and that the version
      // range satisfies the current version of B.
      expectControllerDependenciesListedAsPeerDependencies(
        Yarn,
        workspace,
        dependenciesByIdentAndType,
      );

      // The root workspace (and only the root workspace) must specify the Yarn
      // version required for development.
      if (isChildWorkspace) {
        workspace.unset('packageManager');
      } else {
        expectWorkspaceField(workspace, 'packageManager', 'yarn@4.2.2');
      }

      // All packages must specify a minimum Node.js version of 18.18.
      expectWorkspaceField(workspace, 'engines.node', '^18.18 || >=20');

      // All non-root public packages should be published to the NPM registry;
      // all non-root private packages should not.
      if (isPrivate) {
        workspace.unset('publishConfig');
      } else {
        expectWorkspaceField(workspace, 'publishConfig.access', 'public');
        expectWorkspaceField(
          workspace,
          'publishConfig.registry',
          'https://registry.npmjs.org/',
        );
      }

      if (isChildWorkspace) {
        // All non-root packages must have a valid README.md file.
        await expectReadme(workspace, workspaceBasename);
      }
    }

    // All version ranges in `dependencies` and `devDependencies` for the same
    // dependency across the monorepo must be the same.
    expectConsistentDependenciesAndDevDependencies(Yarn);
  },
});

/**
 * Construct a nested map of dependencies. The inner layer categorizes
 * instances of the same dependency by its location in the manifest; the outer
 * layer categorizes the inner layer by the name of the dependency.
 *
 * @param {Dependency[]} dependencies - The list of dependencies to transform.
 * @returns {Map<string, Map<DependencyType, Dependency>>} The resulting map.
 */
function getDependenciesByIdentAndType(dependencies) {
  const dependenciesByIdentAndType = new Map();

  for (const dependency of dependencies) {
    const dependenciesForIdent = dependenciesByIdentAndType.get(
      dependency.ident,
    );

    if (dependenciesForIdent === undefined) {
      dependenciesByIdentAndType.set(
        dependency.ident,
        new Map([[dependency.type, dependency]]),
      );
    } else {
      dependenciesForIdent.set(dependency.type, dependency);
    }
  }

  return dependenciesByIdentAndType;
}

/**
 * Construct a nested map of non-peer dependencies (`dependencies` and
 * `devDependencies`). The inner layer categorizes instances of the same
 * dependency by the version range specified; the outer layer categorizes the
 * inner layer by the name of the dependency itself.
 *
 * @param {Dependency[]} dependencies - The list of dependencies to transform.
 * @returns {Map<string, Map<string, Dependency[]>>} The resulting map.
 */
function getNonPeerDependenciesByIdent(dependencies) {
  const nonPeerDependenciesByIdent = new Map();

  for (const dependency of dependencies) {
    if (dependency.type === 'peerDependencies') {
      continue;
    }

    const dependencyRangesForIdent = nonPeerDependenciesByIdent.get(
      dependency.ident,
    );

    if (dependencyRangesForIdent === undefined) {
      nonPeerDependenciesByIdent.set(
        dependency.ident,
        new Map([[dependency.range, [dependency]]]),
      );
    } else {
      const dependenciesForDependencyRange = dependencyRangesForIdent.get(
        dependency.range,
      );

      if (dependenciesForDependencyRange === undefined) {
        dependencyRangesForIdent.set(dependency.range, [dependency]);
      } else {
        dependenciesForDependencyRange.push(dependency);
      }
    }
  }

  return nonPeerDependenciesByIdent;
}

/**
 * Get the basename of the workspace's directory. The workspace directory is
 * expected to be in the form `<directory>/<package-name>`, and this function
 * will extract `<package-name>`.
 *
 * @param {Workspace} workspace - The workspace.
 * @returns {string} The name of the workspace.
 */
function getWorkspaceBasename(workspace) {
  return basename(workspace.cwd);
}

/**
 * Get the absolute path to a file within the workspace.
 *
 * @param {Workspace} workspace - The workspace.
 * @param {string} path - The path to the file, relative to the workspace root.
 * @returns {string} The absolute path to the file.
 */
function getWorkspacePath(workspace, path) {
  return resolve(__dirname, workspace.cwd, path);
}

/**
 * Get the contents of a file within the workspace. The file is expected to be
 * encoded as UTF-8.
 *
 * @param {Workspace} workspace - The workspace.
 * @param {string} path - The path to the file, relative to the workspace root.
 * @returns {Promise<string>} The contents of the file.
 */
async function getWorkspaceFile(workspace, path) {
  return await readFile(getWorkspacePath(workspace, path), 'utf8');
}

/**
 * Attempts to access the given file to know whether the file exists.
 *
 * @param {Workspace} workspace - The workspace.
 * @param {string} path - The path to the file, relative to the workspace root.
 * @returns {Promise<boolean>} True if the file exists, false otherwise.
 */
async function workspaceFileExists(workspace, path) {
  try {
    await getWorkspaceFile(workspace, path);
  } catch (error) {
    if ('code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
  return true;
}

/**
 * Expect that the workspace has the given field, and that it is a non-null
 * value. If the field is not present, or is null, this will log an error, and
 * cause the constraint to fail.
 *
 * If a value is provided, this will also verify that the field is equal to the
 * given value.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} fieldName - The field to check.
 * @param {unknown} [expectedValue] - The value to check.
 */
function expectWorkspaceField(workspace, fieldName, expectedValue = undefined) {
  const fieldValue = get(workspace.manifest, fieldName);

  if (expectedValue !== undefined && expectedValue !== null) {
    workspace.set(fieldName, expectedValue);
  } else if (expectedValue === null) {
    workspace.unset(fieldName);
  } else if (
    expectedValue === undefined &&
    (fieldValue === undefined || fieldValue === null)
  ) {
    workspace.error(`Missing required field "${fieldName}".`);
  }
}

/**
 * Expect that the workspace has the given field, and that it is an array-like
 * property containing the specified value. If the field is not present, is not
 * an array, or does not contain the value, this will log an error, and cause
 * the constraint to fail.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} fieldName - The field to check.
 * @param {unknown} expectedValue - The value that should be contained in the array.
 */
function expectWorkspaceArrayField(
  workspace,
  fieldName,
  expectedValue = undefined,
) {
  let fieldValue = get(workspace.manifest, fieldName);

  if (expectedValue) {
    if (!Array.isArray(fieldValue)) {
      fieldValue = [];
    }

    if (!fieldValue.includes(expectedValue)) {
      fieldValue.push(expectedValue);
      workspace.set(fieldName, fieldValue);
    }
  } else if (fieldValue === undefined || fieldValue === null) {
    workspace.error(`Missing required field "${fieldName}".`);
  }
}

/**
 * Expect that the workspace has a description, and that it is a non-empty
 * string. If the description is not present, or is null, this will log an
 * error, and cause the constraint to fail.
 *
 * This will also verify that the description does not end with a period.
 *
 * @param {Workspace} workspace - The workspace to check.
 */
function expectWorkspaceDescription(workspace) {
  expectWorkspaceField(workspace, 'description');

  const { description } = workspace.manifest;

  if (typeof description !== 'string') {
    workspace.error(
      `Expected description to be a string, but got ${typeof description}.`,
    );
    return;
  }

  if (description === '') {
    workspace.error(`Expected description not to be an empty string.`);
    return;
  }

  if (description.endsWith('.')) {
    workspace.set('description', description.slice(0, -1));
  }
}

/**
 * Expect that the workspace has a license file, and that the `license` field is
 * set. By default, this should be MIT, although some packages have pre-existing
 * license that we cannot change.
 *
 * @param {Workspace} workspace - The workspace to check.
 */
async function expectWorkspaceLicense(workspace) {
  if (
    !(await workspaceFileExists(workspace, 'LICENSE')) &&
    !(await workspaceFileExists(workspace, 'LICENCE'))
  ) {
    workspace.error('Could not find LICENSE file');
  }

  if (
    workspace.manifest.license === null ||
    workspace.manifest.license === undefined
  ) {
    expectWorkspaceField(workspace, 'license', 'MIT');
  } else if (
    [
      '@metamask/json-rpc-engine',
      '@metamask/json-rpc-middleware-stream',
      '@metamask/permission-log-controller',
      '@metamask/eth-json-rpc-provider',
    ].includes(workspace.manifest.name)
  ) {
    expectWorkspaceField(workspace, 'license');
  }
}

/**
 * Expect that the workspace has exports set up correctly.
 *
 * @param {Workspace} workspace - The workspace to check.
 */
function expectCorrectWorkspaceExports(workspace) {
  // All non-root packages must provide the location of the ESM-compatible
  // JavaScript entrypoint and its matching type declaration file.
  expectWorkspaceField(
    workspace,
    'exports["."].import.types',
    './dist/index.d.mts',
  );
  expectWorkspaceField(
    workspace,
    'exports["."].import.default',
    './dist/index.mjs',
  );

  // All non-root package must provide the location of the CommonJS-compatible
  // entrypoint and its matching type declaration file.
  expectWorkspaceField(
    workspace,
    'exports["."].require.types',
    './dist/index.d.cts',
  );
  expectWorkspaceField(
    workspace,
    'exports["."].require.default',
    './dist/index.cjs',
  );
  expectWorkspaceField(workspace, 'main', './dist/index.cjs');
  expectWorkspaceField(workspace, 'types', './dist/index.d.cts');

  // Types should not be set in the export object directly, but rather in the
  // `import` and `require` subfields.
  expectWorkspaceField(workspace, 'exports["."].types', null);

  // All non-root packages must export a `package.json` file.
  expectWorkspaceField(
    workspace,
    'exports["./package.json"]',
    './package.json',
  );
}

/**
 * Expect that the workspace has "changelog:update" and "changelog:validate"
 * scripts, and that these package scripts call a common script by passing the
 * name of the package as the first argument.
 *
 * @param {Workspace} workspace - The workspace to check.
 */
function expectCorrectWorkspaceChangelogScripts(workspace) {
  /**
   * @type {Record<string, { expectedStartString: string, script: string, match: RegExpMatchArray | null }>}
   */
  const scripts = ['update', 'validate'].reduce((obj, variant) => {
    const expectedStartString = `../../scripts/${variant}-changelog.sh ${workspace.manifest.name}`;
    /** @type {string} */
    const script = workspace.manifest.scripts[`changelog:${variant}`] ?? '';
    const match = script.match(new RegExp(`^${expectedStartString}(.*)$`, 'u'));
    return { ...obj, [variant]: { expectedStartString, script, match } };
  }, {});

  if (
    scripts.update.match &&
    scripts.validate.match &&
    scripts.update.match[1] !== scripts.validate.match[1]
  ) {
    workspace.error(
      'Expected package\'s "changelog:validate" and "changelog:update" scripts to pass the same arguments to their underlying scripts',
    );
  }

  for (const [
    variant,
    { expectedStartString, script, match },
  ] of Object.entries(scripts)) {
    expectWorkspaceField(workspace, `scripts.changelog:${variant}`);

    if (script !== '' && !match) {
      workspace.error(
        `Expected package's "changelog:${variant}" script to be or start with "${expectedStartString}", but it was "${script}".`,
      );
    }
  }
}

/**
 * Expect that if the workspace package lists another workspace package within
 * `dependencies` or `devDependencies`, the version used within the dependency
 * range is exactly equal to the current version of the dependency (and the
 * range uses the `^` modifier).
 *
 * @param {Yarn} Yarn - The Yarn "global".
 * @param {Workspace} workspace - The workspace to check.
 */
function expectUpToDateWorkspaceDependenciesAndDevDependencies(
  Yarn,
  workspace,
) {
  for (const dependency of Yarn.dependencies({ workspace })) {
    const dependencyWorkspace = Yarn.workspace({ ident: dependency.ident });

    if (
      dependencyWorkspace !== null &&
      dependency.type !== 'peerDependencies'
    ) {
      dependency.update(`^${dependencyWorkspace.manifest.version}`);
    }
  }
}

/**
 * Expect that if the workspace package lists another workspace package within
 * `peerDependencies`, the dependency range satisfies the current version of
 * that package.
 *
 * @param {Yarn} Yarn - The Yarn "global".
 * @param {Workspace} workspace - The workspace to check.
 */
function expectUpToDateWorkspacePeerDependencies(Yarn, workspace) {
  for (const dependency of Yarn.dependencies({ workspace })) {
    const dependencyWorkspace = Yarn.workspace({ ident: dependency.ident });

    if (
      dependencyWorkspace !== null &&
      dependency.type === 'peerDependencies'
    ) {
      const dependencyWorkspaceVersion = new semver.SemVer(
        dependencyWorkspace.manifest.version,
      );
      if (
        !semver.satisfies(
          dependencyWorkspace.manifest.version,
          dependency.range,
        )
      ) {
        expectWorkspaceField(
          workspace,
          `peerDependencies["${dependency.ident}"]`,
          `^${dependencyWorkspaceVersion.major}.0.0`,
        );
      }
    }
  }
}

/**
 * Expect that a workspace package does not list a dependency in both
 * `dependencies` and `devDependencies`.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {Map<string, Map<DependencyType, Dependency>>} dependenciesByIdentAndType - Map of
 * dependency ident to dependency type and dependency.
 */
function expectDependenciesNotInBothProdAndDev(
  workspace,
  dependenciesByIdentAndType,
) {
  for (const [
    dependencyIdent,
    dependencyInstancesByType,
  ] of dependenciesByIdentAndType.entries()) {
    if (
      dependencyInstancesByType.size > 1 &&
      !dependencyInstancesByType.has('peerDependencies')
    ) {
      workspace.error(
        `\`${dependencyIdent}\` cannot be listed in both \`dependencies\` and \`devDependencies\``,
      );
    }
  }
}

/**
 * Expect that if the workspace package lists another workspace package in its
 * dependencies, and it is a controller package, that the controller package is
 * listed in the workspace's `peerDependencies` and the version range satisfies
 * the current version of the controller package.
 *
 * The expectation in this case is that the client will instantiate B in order
 * to pass it into A. Therefore, it needs to list not only A as a dependency,
 * but also B. Additionally, the version of B that the client is using with A
 * needs to match the version that A itself is expecting internally.
 *
 * Note that this constraint does not apply for packages that seem to represent
 * instantiable controllers but actually represent abstract classes.
 *
 * @param {Yarn} Yarn - The Yarn "global".
 * @param {Workspace} workspace - The workspace to check.
 * @param {Map<string, Map<DependencyType, Dependency>>} dependenciesByIdentAndType - Map of
 * dependency ident to dependency type and dependency.
 */
function expectControllerDependenciesListedAsPeerDependencies(
  Yarn,
  workspace,
  dependenciesByIdentAndType,
) {
  for (const [
    dependencyIdent,
    dependencyInstancesByType,
  ] of dependenciesByIdentAndType.entries()) {
    if (!dependencyInstancesByType.has('dependencies')) {
      continue;
    }

    const dependencyWorkspace = Yarn.workspace({ ident: dependencyIdent });

    if (
      dependencyWorkspace !== null &&
      dependencyIdent.endsWith('-controller') &&
      dependencyIdent !== '@metamask/base-controller' &&
      dependencyIdent !== '@metamask/polling-controller' &&
      !dependencyInstancesByType.has('peerDependencies')
    ) {
      const dependencyWorkspaceVersion = new semver.SemVer(
        dependencyWorkspace.manifest.version,
      );
      expectWorkspaceField(
        workspace,
        `peerDependencies["${dependencyIdent}"]`,
        `^${dependencyWorkspaceVersion.major}.0.0`,
      );
    }
  }
}

const ALLOWED_INCONSISTENT_DEPENDENCIES = Object.entries({
  '@metamask/rpc-errors': ['^7.0.0'],
});

/**
 * Filter out dependency ranges which are not to be considered in `expectConsistentDependenciesAndDevDependencies`.
 *
 * @param {string} dependencyIdent - The dependency being filtered for
 * @param {Map<string, Dependency>} dependenciesByRange - Dependencies by range
 * @returns {Map<string, Dependency>} The resulting map.
 */
function getInconsistentDependenciesAndDevDependencies(
  dependencyIdent,
  dependenciesByRange,
) {
  for (const [
    allowedPackage,
    ignoredRange,
  ] of ALLOWED_INCONSISTENT_DEPENDENCIES) {
    if (allowedPackage === dependencyIdent) {
      return new Map(
        Object.entries(dependenciesByRange).filter(
          ([range]) => !ignoredRange.includes(range),
        ),
      );
    }
  }
  return dependenciesByRange;
}

/**
 * Expect that all version ranges in `dependencies` and `devDependencies` for
 * the same dependency across the entire monorepo are the same. As it is
 * impossible to compare NPM version ranges, let the user decide if there are
 * conflicts. (`peerDependencies` is a special case, and we handle that
 * particularly for workspace packages elsewhere.)
 *
 * @param {Yarn} Yarn - The Yarn "global".
 */
function expectConsistentDependenciesAndDevDependencies(Yarn) {
  const nonPeerDependenciesByIdent = getNonPeerDependenciesByIdent(
    Yarn.dependencies(),
  );

  for (const [
    dependencyIdent,
    dependenciesByRange,
  ] of nonPeerDependenciesByIdent.entries()) {
    if (dependenciesByRange.size <= 1) {
      continue;
    }
    const dependenciesToConsider =
      getInconsistentDependenciesAndDevDependencies(
        dependencyIdent,
        dependenciesByRange,
      );
    const dependencyRanges = [...dependenciesToConsider.keys()].sort();
    for (const dependencies of dependenciesToConsider.values()) {
      for (const dependency of dependencies) {
        dependency.error(
          `Expected version range for ${dependencyIdent} (in ${
            dependency.type
          }) to be consistent across monorepo. Pick one: ${inspect(
            dependencyRanges,
          )}`,
        );
      }
    }
  }
}

/**
 * Expect that the workspace has a README.md file, and that it is a non-empty
 * string. The README.md is expected to:
 *
 * - Not contain template instructions (unless the workspace is the module
 * template itself).
 * - Match the version of Node.js specified in the `.nvmrc` file.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} workspaceBasename - The name of the workspace.
 * @returns {Promise<void>}
 */
async function expectReadme(workspace, workspaceBasename) {
  const readme = await getWorkspaceFile(workspace, 'README.md');

  if (
    workspaceBasename !== 'metamask-module-template' &&
    readme.includes('## Template Instructions')
  ) {
    workspace.error(
      'The README.md contains template instructions. These instructions should be removed.',
    );
  }

  if (!readme.includes(`yarn add @metamask/${workspaceBasename}`)) {
    workspace.error(
      `The README.md does not contain an example of how to install the package using Yarn (\`yarn add @metamask/${workspaceBasename}\`). Please add an example.`,
    );
  }

  if (!readme.includes(`npm install @metamask/${workspaceBasename}`)) {
    workspace.error(
      `The README.md does not contain an example of how to install the package using npm (\`npm install @metamask/${workspaceBasename}\`). Please add an example.`,
    );
  }
}
