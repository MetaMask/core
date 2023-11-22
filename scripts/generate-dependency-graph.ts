#!yarn ts-node

import execa from 'execa';
import fs from 'fs';
import path from 'path';

type Workspace = {
  name: string;
  workspaceDependencies: string[];
};

const START_MARKER = '<!-- start dependency graph -->';
const END_MARKER = '<!-- end dependency graph -->';
const README_PATH = path.resolve(__dirname, '../README.md');

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * The entrypoint to this script.
 *
 * Uses `yarn workspaces list` to retrieve all of the workspace packages in this
 * project and their relationships to each other, produces a Markdown
 * fragment that represents a Mermaid graph, then updates the README with the
 * graph.
 */
async function main() {
  const workspaces = await retrieveWorkspaces();
  const nodeLines = buildMermaidNodeLines(workspaces);
  const connectionLines = buildMermaidConnectionLines(workspaces);
  const markdownFragment = assembleMermaidMarkdownFragment(
    nodeLines,
    connectionLines,
  );
  await updateReadme(markdownFragment);
  console.log('Dependency graph in the README has been updated.');
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
    '--verbose',
  ]);

  return stdout
    .split('\n')
    .map((line) => JSON.parse(line))
    .slice(1);
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
  const connections = [];
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
 * Updates the dependency graph section in the README with the given Markdown
 * fragment.
 *
 * @param newGraph - The new Markdown fragment.
 */
async function updateReadme(newGraph: string) {
  const readmeContent = await fs.promises.readFile(README_PATH, 'utf8');
  const newReadmeContent = readmeContent.replace(
    new RegExp(`(${START_MARKER}).+(${END_MARKER})`, 'su'),
    (_match, startMarker, endMarker) =>
      [startMarker, '', newGraph, '', endMarker].join('\n'),
  );
  await fs.promises.writeFile(README_PATH, newReadmeContent);
}
