#!yarn ts-node

import fs from 'fs';
import os from 'os';
import path from 'path';
import execa from 'execa';
import which from 'which';

/**
 * Retrieves the path to `dot`, which is one of the tools within the Graphviz
 * toolkit to render a graph.
 *
 * @returns The path if `dot` exists or else null.
 */
async function getDotExecutablePath() {
  try {
    return await which('dot');
  } catch (error) {
    if (error.message === 'dot not found') {
      return null;
    }
    throw error;
  }
}

/**
 * Uses `yarn workspaces list` to retrieve all of the workspace packages in this
 * repo and their relationship to each other, produces code that can be
 * passed to the `dot` tool, and writes that to a file.
 *
 * @param dotFilePath - The path to the file that will be written and ultimately
 * passed to `dot`.
 */
async function generateGraphDotFile(dotFilePath) {
  const { stdout } = await execa('yarn', [
    'workspaces',
    'list',
    '--json',
    '--verbose',
  ]);

  const modules = stdout
    .split('\n')
    .map((line) => JSON.parse(line))
    .slice(1);

  const nodes = modules.map((mod) => {
    const fullPackageName = mod.name;
    const shortPackageName = fullPackageName
      .replace(/^@metamask\//u, '')
      .replace(/-/gu, '_');
    return `  ${shortPackageName} [label="${fullPackageName}"];`;
  });

  const connections = [];
  modules.forEach((mod) => {
    const fullPackageName = mod.name;
    const shortPackageName = fullPackageName
      .replace(/^@metamask\//u, '')
      .replace(/-/gu, '_');
    mod.workspaceDependencies.forEach((dependency) => {
      const shortDependencyName = dependency
        .replace(/^packages\//u, '')
        .replace(/-/gu, '_');
      connections.push(`  ${shortPackageName} -> ${shortDependencyName};`);
    });
  });

  const graphSource = [
    'digraph G {',
    '  rankdir="LR";',
    ...nodes,
    ...connections,
    '}',
  ].join('\n');

  await fs.promises.writeFile(dotFilePath, graphSource);
}

/**
 * Uses `dot` to render the dependency graph.
 *
 * @param dotExecutablePath - The path to `dot`.
 * @param dotFilePath - The path to file that instructs `dot` how to render the
 * graph.
 * @param graphFilePath - The path to the image file that will be written.
 */
async function renderGraph(dotExecutablePath, dotFilePath, graphFilePath) {
  await execa(dotExecutablePath, [
    dotFilePath,
    '-T',
    'png',
    '-o',
    graphFilePath,
  ]);
}

/**
 * The entrypoint to this script.
 */
async function main() {
  const tempDirectory = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), 'controllers-'),
  );
  const dotFilePath = path.join(tempDirectory, 'dependency-graph.dot');
  const graphFilePath = path.resolve(
    __dirname,
    '../assets/dependency-graph.png',
  );
  const dotExecutablePath = await getDotExecutablePath();

  if (dotExecutablePath) {
    await generateGraphDotFile(dotFilePath);
    await renderGraph(dotExecutablePath, dotFilePath, graphFilePath);
    console.log(`Done! Graph written to ${graphFilePath}.`);
  } else {
    throw new Error(
      "It looks like you don't have Graphviz installed. You'll need to install this to generate the dependency graph.",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
