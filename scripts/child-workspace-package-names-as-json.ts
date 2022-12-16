#!yarn ts-node

import execa from 'execa';

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * The entrypoint to this script.
 */
async function main() {
  const { stdout } = await execa('yarn', ['workspaces', 'list', '--json']);
  const workspaces = stdout.split('\n').map((line) => JSON.parse(line));
  const childWorkspaceNames = workspaces
    .filter((workspace) => workspace.location !== '.')
    .map((workspace) => workspace.name);
  console.log(JSON.stringify(childWorkspaceNames));
}
