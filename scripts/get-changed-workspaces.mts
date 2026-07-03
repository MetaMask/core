import {
  getAllWorkspaces,
  computeChangedWorkspaces,
} from './lib/workspaces.mjs';

/**
 * List workspace package names that need to be checked given a merge base.
 *
 * Outputs a JSON array of package names to stdout. Always includes packages
 * that changed since the merge base plus their transitive dependants. Pass
 * `--include-dependencies` to also include transitive dependencies (needed
 * for TypeScript project reference builds where dist outputs must exist).
 *
 * Usage: `tsx scripts/get-changed-workspaces.mts <merge-base-sha> [<head-sha>] [--include-dependencies]`
 */
const args = process.argv.slice(2);
const includeDependencies = args.includes('--include-dependencies');
const positional = args.filter((arg) => !arg.startsWith('--'));

const mergeBase = positional[0];
if (!mergeBase) {
  console.error(
    'Usage: get-changed-workspaces.mts <merge-base-sha> [<head-sha>] [--include-dependencies]',
  );
  process.exitCode = 1;
  process.exit();
}

const headRef = positional[1] ?? 'HEAD';

const workspaces = await getAllWorkspaces();
const changed = await computeChangedWorkspaces(
  workspaces,
  mergeBase,
  headRef,
  includeDependencies,
);

const names = workspaces
  .filter(({ name }) => changed.has(name))
  .map(({ name }) => name);

console.log(JSON.stringify(names));
