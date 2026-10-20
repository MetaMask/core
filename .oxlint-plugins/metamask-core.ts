import { eslintCompatPlugin } from '@oxlint/plugins';

import { noBarrelFiles } from './rules/no-barrel-files.ts';
import { noWildcardExports } from './rules/no-wildcard-exports.ts';

/**
 * Oxlint plugin containing custom rules for this monorepo.
 *
 * This is loaded via `jsPlugins` in `oxlint.config.ts`, and its rules are
 * referenced there with the `metamask-core/` prefix.
 */
// We use `eslintCompatPlugin` as it's more performant (according to the Oxlint
// documentation, anyway).
const plugin = eslintCompatPlugin({
  meta: {
    name: 'metamask-core',
  },
  rules: {
    'no-wildcard-exports': noWildcardExports,
    'no-barrel-files': noBarrelFiles,
  },
});

export default plugin;
