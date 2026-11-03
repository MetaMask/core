import { fileExists } from '@metamask/node-utils';
import path from 'node:path';
import { loadConfigFromFile } from 'vite';
import { defineConfig } from 'vitest/config';
import type { ViteUserConfig } from 'vitest/config';
import type { CoverageOptions } from 'vitest/node';

import { getAllWorkspaces, ROOT_WORKSPACE } from './workspaces.ts';

/**
 * Packages whose tests are not run as part of the root Vitest projects. The
 * docs package isn't tested in CI, and its tests currently fail.
 */
const EXCLUDED_PACKAGES = ['packages/wallet-framework-docs'];

const CONFIG_EXTENSIONS = ['ts', 'mts'];

/**
 * Find the Vitest config file of a package.
 *
 * @param directory - The package directory, relative to the monorepo root.
 * @returns The absolute path of the config file, or `undefined` if the package
 * has no Vitest config.
 */
async function getConfigPath(directory: string): Promise<string | undefined> {
  const candidates = CONFIG_EXTENSIONS.map((extension) =>
    path.join(ROOT_WORKSPACE, directory, `vitest.config.${extension}`),
  );
  const exists = await Promise.all(candidates.map(fileExists));

  return candidates.find((_candidate, index) => exists[index]);
}

/**
 * Keep only the directories that have tests that run in the root Vitest
 * projects.
 *
 * @param directories - Package directories, relative to the monorepo root
 * (e.g., `packages/foo`).
 * @returns The directories that are included in the root projects.
 */
async function getTestedPackages(directories: string[]): Promise<string[]> {
  const candidates = directories.filter(
    (directory) => !EXCLUDED_PACKAGES.includes(directory),
  );

  const configPaths = await Promise.all(candidates.map(getConfigPath));
  return candidates.filter((_directory, index) => configPaths[index]);
}

/**
 * Get the directories of all workspaces in the monorepo, according to Yarn,
 * including private ones.
 *
 * @returns The package directories, relative to the monorepo root.
 */
export async function getPackageDirectories(): Promise<string[]> {
  const workspaces = await getAllWorkspaces({ includePrivate: true });

  return workspaces.map(({ location }) => location).sort();
}

/**
 * Prefix a package-relative glob with the package directory. Globs that match
 * anywhere (starting with `**`) or negate (starting with `!`) are left as is.
 *
 * @param directory - The package directory.
 * @param glob - The glob, relative to the package.
 * @returns The glob, relative to the monorepo root.
 */
function prefixGlob(directory: string, glob: string): string {
  return glob.startsWith('**') || glob.startsWith('!')
    ? glob
    : `${directory}/${glob}`;
}

/**
 * Load the coverage options from a package's own Vitest config.
 *
 * @param directory - The package directory.
 * @returns The coverage options of the package.
 */
async function loadPackageCoverage(
  directory: string,
): Promise<CoverageOptions> {
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'test' },
    await getConfigPath(directory),
  );

  const config = loaded?.config;
  return config?.test?.coverage ?? {};
}

/**
 * Translate the thresholds of a package to thresholds for the root config. The
 * thresholds of a package are relative to the package, and global thresholds
 * apply to everything in the package.
 *
 * @param directory - The package directory.
 * @param thresholds - The thresholds from the package's config.
 * @returns The thresholds, keyed by glob relative to the monorepo root.
 */
function translateThresholds(
  directory: string,
  thresholds: Exclude<CoverageOptions['thresholds'], undefined>,
): Record<string, unknown> {
  const shared: Record<string, unknown> = {};
  const files: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(thresholds)) {
    if (typeof value === 'object') {
      files[`${directory}/${key}`] = value;
    } else {
      shared[key] = value;
    }
  }

  return {
    ...(Object.keys(shared).length > 0 && { [`${directory}/src/**`]: shared }),
    ...files,
  };
}

/**
 * Create the Vitest config that runs the tests of multiple packages as
 * projects in a single process with a shared worker pool. Use `--project
 * <name>` to pick packages.
 *
 * Coverage is only configured when `--coverage` is passed. Thresholds are
 * per package, and a package's files are split over shards, so they are only
 * checked when merging reports (`--merge-reports --coverage`).
 *
 * @param directories - The package directories to test, relative to the
 * monorepo root (e.g., `packages/foo`). Packages without a Vitest config, and
 * packages that aren't tested in CI, are skipped.
 * @returns The Vitest config.
 */
export async function createRootConfig(
  directories: string[],
): Promise<ViteUserConfig> {
  const packages = await getTestedPackages(directories);

  const projects = packages.map(
    (directory) =>
      `${directory}/vitest.config.{${CONFIG_EXTENSIONS.join(',')}}`,
  );

  if (!process.argv.includes('--coverage')) {
    return defineConfig({ test: { watch: false, projects } });
  }

  const checkThresholds = process.argv.includes('--merge-reports');
  const coverages = await Promise.all(packages.map(loadPackageCoverage));

  const include: string[] = [];
  const exclude: string[] = [];
  let thresholds: Record<string, unknown> = {};

  for (const [index, directory] of packages.entries()) {
    const coverage = coverages[index];

    include.push(
      ...(coverage.include ?? []).map((glob) => prefixGlob(directory, glob)),
    );
    exclude.push(
      ...(coverage.exclude ?? []).map((glob) => prefixGlob(directory, glob)),
    );

    if (checkThresholds && coverage.thresholds) {
      thresholds = {
        ...thresholds,
        ...translateThresholds(directory, coverage.thresholds),
      };
    }
  }

  return defineConfig({
    test: {
      watch: false,
      projects,
      coverage: {
        provider: 'v8',
        include,
        exclude,
        reporter: checkThresholds ? ['text-summary'] : [],
        thresholds,
      },
    },
  });
}
