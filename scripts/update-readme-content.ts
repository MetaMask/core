#!yarn tsx

import execa from 'execa';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';

import type { Workspace } from './lib/dependency-graph.js';
import { generateDependencyGraph } from './lib/dependency-graph.js';

const DEPENDENCY_GRAPH_START_MARKER = '<!-- start dependency graph -->';
const DEPENDENCY_GRAPH_END_MARKER = '<!-- end dependency graph -->';
const PACKAGE_LIST_START_MARKER = '<!-- start package list -->';
const PACKAGE_LIST_END_MARKER = '<!-- end package list -->';
const README_PATH = path.resolve(import.meta.dirname, '../README.md');

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * The entrypoint to this script.
 *
 * Uses `yarn workspaces list` to:
 *
 * 1. Retrieve all of the workspace packages in this project and their relationships to each other.
 * 2. Produce a Markdown fragment that represents a Mermaid graph.
 * 3. Produce a Markdown fragment that represents a list of the workspace packages, and links to them.
 * 4. Update the README with the new content, or check that it is up to date if `--check` is given.
 */
async function main(): Promise<void> {
  const { check: isCheckMode } = await yargs(process.argv.slice(2))
    .option('check', {
      type: 'boolean',
      default: false,
      description:
        'Check whether the README is up to date without writing changes.',
    })
    .strict()
    .help('help')
    .usage(
      `Update the list and graph of packages in the README.\nUsage: $0 [command] [options]`,
    ).argv;
  const workspaces = await retrieveWorkspaces();
  const existingReadmeContent = await fs.promises.readFile(README_PATH, 'utf8');

  const newReadmeContent = await generateNewReadmeContent(
    existingReadmeContent,
    generatePackageList(workspaces),
    generateDependencyGraph(workspaces),
  );

  if (isCheckMode) {
    if (existingReadmeContent === newReadmeContent) {
      console.log('README content is up to date.');
    } else {
      console.error(
        'README content is out of date. Run `yarn readme-content:update` to update it.',
      );
      // `process` is a constant.
      // eslint-disable-next-line require-atomic-updates
      process.exitCode = 1;
    }
  } else {
    await fs.promises.writeFile(README_PATH, newReadmeContent);
    console.log('README content updated. Make sure to commit the changes!');
  }
}

/**
 * Uses the `yarn` executable to gather the Yarn workspaces inside of this
 * project (the packages that are matched by the `workspaces` field inside of
 * `package.json`).
 *
 * @returns The list of workspaces.
 */
async function retrieveWorkspaces(): Promise<Workspace[]> {
  const { stdout } = await execa('yarn', [
    'workspaces',
    'list',
    '--json',
    '--no-private',
    '--verbose',
  ]);

  return stdout.split('\n').map((line) => JSON.parse(line));
}

/**
 * Generates the Markdown fragment that represents a list of the workspace packages in this project.
 *
 * @param workspaces - The Yarn workspaces inside of this project.
 * @returns The new package list Markdown fragment.
 */
function generatePackageList(workspaces: Workspace[]): string {
  return workspaces
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((workspace) => `- [\`${workspace.name}\`](${workspace.location})`)
    .join('\n');
}

/**
 * Generates a new version of the README by replacing the list and graph
 * sections with the given content.
 *
 * @param existingReadmeContent - The existing content of the README.
 * @param newPackageList - The new list of packages to use.
 * @param newDependencyGraph - The new graph of packages to use.
 * @returns The new README content.
 */
async function generateNewReadmeContent(
  existingReadmeContent: string,
  newPackageList: string,
  newDependencyGraph: string,
): Promise<string> {
  let newReadmeContent = existingReadmeContent;

  newReadmeContent = newReadmeContent.replace(
    new RegExp(
      `(${PACKAGE_LIST_START_MARKER}).+(${PACKAGE_LIST_END_MARKER})`,
      'su',
    ),
    (_match, startMarker, endMarker) =>
      [startMarker, '', newPackageList, '', endMarker].join('\n'),
  );

  newReadmeContent = newReadmeContent.replace(
    new RegExp(
      `(${DEPENDENCY_GRAPH_START_MARKER}).+(${DEPENDENCY_GRAPH_END_MARKER})`,
      'su',
    ),
    (_match, startMarker, endMarker) =>
      [startMarker, '', newDependencyGraph, '', endMarker].join('\n'),
  );

  return newReadmeContent;
}
