import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { computeChangedWorkspaces } from './lib/workspaces.mjs';

/**
 * List workspaces that need to be checked given a merge base.
 *
 * Outputs a JSON object to stdout:
 * - `names`: package names of changed workspaces and their transitive dependants
 * - `locations`: workspace-relative paths (e.g. `packages/foo`) for the same set
 * - `hasRootChange`: true if any non-ignored root file changed (triggers a full run)
 *
 * Usage: `tsx scripts/get-changed-workspaces.mts --merge-base <sha> [--head-ref <ref>] [--include-dependencies]`
 */
const argv = await yargs(hideBin(process.argv))
  .usage('$0 --merge-base <sha> [--head-ref <ref>] [--include-dependencies]')
  .option('merge-base', {
    type: 'string',
    describe: 'Merge base SHA',
    demandOption: true,
  })
  .option('head-ref', {
    type: 'string',
    describe: 'PR branch tip SHA (defaults to HEAD)',
  })
  .option('include-dependencies', {
    type: 'boolean',
    default: false,
    describe:
      'Also expand to transitive dependencies (needed for TypeScript builds)',
  })
  .help()
  .parseAsync();

const { mergeBase, headRef = 'HEAD', includeDependencies } = argv;

const { workspaces, hasRootChange } = await computeChangedWorkspaces({
  includeDependencies,
  mergeBase,
  headRef,
});

console.log(
  JSON.stringify({
    names: workspaces.map(({ name }) => name),
    locations: workspaces.map(({ location }) => location),
    hasRootChange,
  }),
);
