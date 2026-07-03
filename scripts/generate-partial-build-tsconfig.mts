import {
  getTypeScriptWorkspaces,
  computeChangedWorkspaces,
} from './lib/workspaces.mjs';

/**
 * Generate a filtered tsconfig.build.json for partial CI builds.
 *
 * Given a merge base SHA, outputs a tsconfig that references only the
 * TypeScript packages that changed since that commit plus their transitive
 * dependants and dependencies. Pipe the output to a temp file and pass it
 * to `ts-bridge --project`.
 *
 * Dependencies are always included because TypeScript project references
 * require every referenced project's dist output to already exist on disk.
 *
 * Usage: `tsx scripts/generate-partial-build-tsconfig.mts <merge-base-sha> [<head-sha>]`
 */
async function main() {
  const mergeBase = process.argv[2];
  if (!mergeBase) {
    console.error(
      'Usage: generate-partial-build-tsconfig.mts <merge-base-sha> [<head-sha>]',
    );
    process.exitCode = 1;
    return;
  }

  const headRef = process.argv[3] ?? 'HEAD';

  const workspaces = await getTypeScriptWorkspaces();
  const packagesToBuild = await computeChangedWorkspaces(
    workspaces,
    mergeBase,
    headRef,
    true,
  );

  const references = workspaces
    .filter(({ name }) => packagesToBuild.has(name))
    .map(({ location }) => ({ path: `./${location}/tsconfig.build.json` }));

  if (references.length === 0) {
    return;
  }

  console.log(JSON.stringify({ files: [], include: [], references }, null, 2));
}

await main();
