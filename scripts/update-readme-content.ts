#!yarn tsx

import execa from 'execa';
import fs from 'fs';
import path from 'path';
import yargs from 'yargs';

type Workspace = {
  location: string;
  name: string;
  workspaceDependencies: string[];
};

const DEPENDENCY_GRAPH_START_MARKER = '<!-- start dependency graph -->';
const DEPENDENCY_GRAPH_END_MARKER = '<!-- end dependency graph -->';
const PACKAGE_LIST_START_MARKER = '<!-- start package list -->';
const PACKAGE_LIST_END_MARKER = '<!-- end package list -->';
const README_PATH = path.resolve(__dirname, '../README.md');

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
 * Generates the Markdown fragment that represents a Mermaid graph of the
 * dependencies between the workspace packages in this project.
 *
 * @param workspaces - The Yarn workspaces inside of this project.
 * @returns The new dependency graph Markdown fragment.
 */
function generateDependencyGraph(workspaces: Workspace[]): string {
  const nodeLines = buildMermaidNodeLines(workspaces);
  const connectionLines = buildMermaidConnectionLines(workspaces);
  return assembleMermaidMarkdownFragment(nodeLines, connectionLines);
}

/**
 * Builds a piece of the Mermaid graph by defining a node for each workspace
 * package within this project.
 *
 * @param workspaces - The Yarn workspaces inside of this project.
 * @returns A set of lines that will go into the final Mermaid graph.
 */
function buildMermaidNodeLines(workspaces: Workspace[]): string[] {
  return workspaces.map((workspace) => {
    const fullPackageName = workspace.name;
    const shortPackageName = fullPackageName
      .replace(/^@metamask\//u, '')
      .replace(/-/gu, '_');
    return `${shortPackageName}(["${fullPackageName}"]);`;
  });
}

/**
 * Builds a piece of the Mermaid graph by defining connections between nodes
 * that correspond to dependencies between workspace packages within this
 * project.
 *
 * @param workspaces - The Yarn workspaces inside of this project.
 * @returns A set of lines that will go into the final Mermaid graph.
 */
function buildMermaidConnectionLines(workspaces: Workspace[]): string[] {
  const connections: string[] = [];
  workspaces.forEach((workspace) => {
    const fullPackageName = workspace.name;
    const shortPackageName = fullPackageName
      .replace(/^@metamask\//u, '')
      .replace(/-/gu, '_');
    workspace.workspaceDependencies.forEach((dependency) => {
      const shortDependencyName = dependency
        .replace(/^packages\//u, '')
        .replace(/-/gu, '_');
      connections.push(`${shortPackageName} --> ${shortDependencyName};`);
    });
  });
  return connections;
}

/**
 * Creates the Mermaid graph from the given node lines and connection lines,
 * wrapping it in a triple-backtick directive so that it can be embedded within
 * a Markdown document.
 *
 * @param nodeLines - The set of nodes in the graph as lines.
 * @param connectionLines - The set of connections in the graph as lines.
 * @returns The graph in string format.
 */
function assembleMermaidMarkdownFragment(
  nodeLines: string[],
  connectionLines: string[],
): string {
  return [
    '```mermaid',
    "%%{ init: { 'flowchart': { 'curve': 'bumpX' } } }%%",
    'graph LR;',
    'linkStyle default opacity:0.5',
    ...nodeLines.map((line) => `  ${line}`),
    ...connectionLines.map((line) => `  ${line}`),
    '```',
  ].join('\n');
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
