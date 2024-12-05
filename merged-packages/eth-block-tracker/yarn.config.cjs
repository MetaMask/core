/** @type {import('@yarnpkg/types')} */
const { defineConfig } = require('@yarnpkg/types');
const { readFile } = require('fs/promises');
const { basename, resolve } = require('path');

/**
 * Aliases for the Yarn type definitions, to make the code more readable.
 *
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Workspace} Workspace
 * @typedef {import('@yarnpkg/types').Yarn.Constraints.Dependency} Dependency
 */

/**
 * The base URL for the GitHub repository.
 *
 * @type {string}
 */
const BASE_URL = 'https://github.com/MetaMask/';

/**
 * Get the name of the workspace. The workspace name is expected to be in the
 * form `@metamask/workspace-name`, and this function will extract
 * `workspace-name`.
 *
 * @param {Workspace} workspace - The workspace.
 * @returns {string} The name of the workspace.
 */
function getWorkspaceName(workspace) {
  return basename(workspace.ident);
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
 * Expect that the workspace has the given field, and that it is a non-null
 * value. If the field is not present, or is null, this will log an error, and
 * cause the constraint to fail.
 *
 * If a value is provided, this will also verify that the field is equal to the
 * given value.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} field - The field to check.
 * @param {any} [value] - The value to check.
 */
function expectWorkspaceField(workspace, field, value) {
  const fieldValue = workspace.manifest[field];
  if (fieldValue === null) {
    workspace.error(`Missing required field "${field}".`);
    return;
  }

  if (value) {
    workspace.set(field, value);
  }
}

/**
 * Expect that the workspace has a description, and that it is a non-null
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

  if (description.endsWith('.')) {
    workspace.set('description', description.slice(0, -1));
  }
}

/**
 * Expect that if a dependency is listed under "dependencies", it is not also
 * listed under "devDependencies". If it is, this will log an error, and cause
 * the constraint to fail.
 *
 * @param {Workspace} workspace - The workspace to check.
 */
function expectWorkspaceDependencies(workspace) {
  workspace.pkg.dependencies.forEach((dependency) => {
    // `workspace.pkg` does not have a `devDependencies` field, so we need to
    // check the `manifest` instead.
    const isDependency = Boolean(
      workspace.manifest.dependencies?.[dependency.ident],
    );
    const isDevDependency = Boolean(
      workspace.manifest.devDependencies?.[dependency.ident],
    );

    if (isDependency && isDevDependency) {
      workspace.unset(`devDependencies.${dependency.ident}`);
    }
  });
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
 * @param {string} workspaceName - The name of the workspace.
 * @returns {Promise<void>}
 */
async function expectReadme(workspace, workspaceName) {
  const readme = await getWorkspaceFile(workspace, 'README.md');
  if (
    workspaceName !== 'metamask-module-template' &&
    readme.includes('## Template Instructions')
  ) {
    workspace.error(
      'The README.md contains template instructions. These instructions should be removed.',
    );
  }

  if (!readme.includes(`yarn add @metamask/${workspaceName}`)) {
    workspace.error(
      `The README.md does not contain an example of how to install the package using Yarn (\`yarn add @metamask/${workspaceName}\`). Please add an example.`,
    );
  }

  if (!readme.includes(`npm install @metamask/${workspaceName}`)) {
    workspace.error(
      `The README.md does not contain an example of how to install the package using npm (\`npm install @metamask/${workspaceName}\`). Please add an example.`,
    );
  }
}

/**
 * Expect that the workspace has a pull_request_template.md file, and that it
 * is a non-empty string. The pull_request_template.md is expected to:
 *
 * - Not contain an examples section (unless the workspace is the module
 * template itself).
 *
 * @param {Workspace} workspace - The workspace to check.
 * @param {string} workspaceName - The name of the workspace.
 * @returns {Promise<void>}
 */
async function expectPullRequestTemplate(workspace, workspaceName) {
  if (workspaceName === 'metamask-module-template') {
    return;
  }

  const pullRequestTemplate = await getWorkspaceFile(
    workspace,
    '.github/pull_request_template.md',
  );

  if (!pullRequestTemplate) {
    workspace.error(
      'The pull_request_template.md is missing. This should be added.',
    );
  }

  if (pullRequestTemplate.includes('## Examples')) {
    workspace.error(
      'The pull_request_template.md contains an examples section. This section should be removed.',
    );
  }
}

/**
 * Expect that the workspace has a valid `exports` field. The `exports` field
 * is expected to:
 *
 * - Export a `types` entrypoint as the first export, or not at all.
 *
 * This is required for proper TypeScript support when using `Node16` (or later)
 * module resolution.
 *
 * @param {Workspace} workspace - The workspace to check.
 * @returns {void}
 */
function expectExports(workspace) {
  const { exports: manifestExports } = workspace.manifest;
  Object.entries(manifestExports)
    .filter(([, exportValue]) => typeof exportValue !== 'string')
    .forEach(([exportName, exportObject]) => {
      const keys = Object.keys(exportObject);
      if (keys.includes('types') && keys[0] !== 'types') {
        workspace.error(
          `The "types" export must be the first export in the "exports" field for the export "${exportName}".`,
        );
      }
    });
}

module.exports = defineConfig({
  async constraints({ Yarn }) {
    const workspace = Yarn.workspace();
    const workspaceName = getWorkspaceName(workspace);
    const workspaceRepository = `${BASE_URL}${workspaceName}`;

    // The package must have a name, version, description, and license.
    expectWorkspaceField(workspace, 'name', `@metamask/${workspaceName}`);
    expectWorkspaceField(workspace, 'version');
    expectWorkspaceField(workspace, 'license');
    expectWorkspaceDescription(workspace);

    // The package must have a valid README.md file.
    await expectReadme(workspace, workspaceName);

    // The package must have a valid pull request template.
    // await expectPullRequestTemplate(workspace, workspaceName);

    expectWorkspaceDependencies(workspace);

    // The homepage of the package must match its name.
    // workspace.set('homepage', `${workspaceRepository}#readme`);

    // The bugs URL of the package must point to the Issues page for the
    // repository.
    // workspace.set('bugs.url', `${workspaceRepository}/issues`);

    // The package must specify Git as the repository type, and match the URL of
    // a repository within the MetaMask organization.
    workspace.set('repository.type', 'git');
    workspace.set('repository.url', `${workspaceRepository}.git`);

    // The package must specify the expected minimum Node versions
    workspace.set('engines.node', '^18.16 || ^20 || >=22');

    // The package must provide the location of the entrypoint and its matching
    // type declaration file.
    workspace.set('main', 'dist/index.js');
    workspace.set('types', 'dist/index.d.ts');

    // expectExports(workspace);

    // The list of files included in the package must only include files
    // generated during the build process.
    workspace.set('files', ['dist/']);

    // The package is public, and should be published to the npm registry.
    workspace.unset('private');
    workspace.set('publishConfig.access', 'public');
    workspace.set('publishConfig.registry', 'https://registry.npmjs.org/');
  },
});
