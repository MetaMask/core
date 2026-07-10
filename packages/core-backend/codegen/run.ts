/**
 * Runs Kubb code generation programmatically via `safeBuild` from
 * `@kubb/core`, instead of through `@kubb/cli`.
 *
 * Invoking the build API directly keeps the dependency tree slimmer (no CLI,
 * config discovery, TS config loader or subprocess runner) — the config is a
 * regular TypeScript module imported below, and this script is executed with
 * `tsx` as part of `yarn codegen` (see `package.json`).
 */

import { safeBuild } from '@kubb/core';
import process from 'node:process';

import config from './kubb.config';

/**
 * Runs the Kubb build and reports the outcome.
 */
async function main(): Promise<void> {
  console.log(`Generating ${config.name ?? 'API bindings'} with Kubb...`);

  const { files, failedPlugins, error } = await safeBuild({ config });

  for (const failedPlugin of failedPlugins) {
    console.error(
      `Plugin ${failedPlugin.plugin.name} failed:`,
      failedPlugin.error,
    );
  }
  if (error) {
    throw error;
  }
  if (failedPlugins.size > 0) {
    throw new Error(`${failedPlugins.size} Kubb plugin(s) failed`);
  }

  console.log(`Generated ${files.length} files in ${config.output.path}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
