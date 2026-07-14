import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import {
  getAllWorkspaces,
  checkRootChange,
  computeChangedWorkspaces,
  getChangedFiles,
} from './lib/workspaces.mjs';

/**
 * List workspaces that need to be checked given a merge base.
 *
 * Outputs a JSON object to stdout:
 * - `names`: package names of changed workspaces and their transitive dependants
 * - `locations`: workspace-relative paths (e.g. `packages/foo`) for the same set
 * - `hasRootChange`: true if any non-ignored root file changed (triggers a full run)
 *
 * Usage: `tsx scripts/get-changed-workspaces.mts <merge-base-sha> [<head-sha>] [options]`
 */
const argv = await yargs(hideBin(process.argv))
  .usage('$0 <merge-base> [head-sha] [options]')
  .positional('merge-base', {
    type: 'string',
    describe: 'Merge base SHA',
  })
  .positional('head-sha', {
    type: 'string',
    describe: 'PR branch tip SHA (defaults to HEAD)',
  })
  .option('include-dependencies', {
    type: 'boolean',
    default: false,
    describe:
      'Also expand to transitive dependencies (needed for TypeScript builds)',
  })
  .demandCommand(1, 'merge-base is required')
  .help()
  .parseAsync();

const mergeBase = argv._[0] as string;
const headRef = (argv._[1] as string | undefined) ?? 'HEAD';
const workspaces = await getAllWorkspaces();

const changedFiles = await getChangedFiles(mergeBase, headRef);
const hasRootChange = checkRootChange(workspaces, changedFiles);

const changed = await computeChangedWorkspaces(
  workspaces,
  mergeBase,
  headRef,
  argv['include-dependencies'],
  changedFiles,
);

const changedWorkspaces = workspaces.filter(({ name }) => changed.has(name));

console.log(
  JSON.stringify({
    names: changedWorkspaces.map(({ name }) => name),
    locations: changedWorkspaces.map(({ location }) => location),
    hasRootChange,
  }),
);
