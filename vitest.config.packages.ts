import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { resolveExports } from 'resolve-pkg-maps';
import type { PathConditions } from 'resolve-pkg-maps';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const MONOREPO_ROOT = import.meta.dirname;

const WORKSPACE_PACKAGES_DIRECTORY = path.join(
  fs.realpathSync(MONOREPO_ROOT),
  'packages',
);

/**
 * Find the directory that Node.js would resolve a package to when it is
 * imported from the given file. This resolves the `package.json` of the
 * package rather than the import itself, since the build output that the
 * import points to does not exist when tests run.
 *
 * @param importer - The absolute path of the importing file.
 * @param packageName - The name of the imported package.
 * @returns The real path of the package directory, or `undefined`.
 */
function findInstalledPackage(
  importer: string,
  packageName: string,
): string | undefined {
  try {
    return path.dirname(
      createRequire(importer).resolve(`${packageName}/package.json`),
    );
  } catch {
    return undefined;
  }
}

/**
 * Find the source file of a workspace package export, by resolving the subpath
 * against the `exports` field of the package, and mapping the build output
 * path back to its source path.
 *
 * @param packageDirectory - The directory of the workspace package.
 * @param subpath - The subpath of the export without a leading `./`, e.g.,
 * `sha`, or an empty string for the main export.
 * @returns The path of the source file, or `undefined`.
 */
function findExportSource(
  packageDirectory: string,
  subpath: string,
): string | null {
  const manifest: { exports?: PathConditions } = JSON.parse(
    fs.readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'),
  );

  if (!manifest.exports) {
    return null;
  }

  let target: string | null;
  try {
    [target] = resolveExports(manifest.exports, subpath, ['import']);
  } catch {
    // The subpath is not exported by the package.
    return null;
  }

  if (!target?.startsWith('./dist/') || !target.endsWith('.js')) {
    return null;
  }

  const source = path.join(
    packageDirectory,
    'src',
    `${target.slice('./dist/'.length, -'.js'.length)}.ts`,
  );

  return fs.existsSync(source) ? source : null;
}

/**
 * Published packages can depend on a version range that a workspace package
 * satisfies, in which case Yarn links them to it. Workspace packages have no
 * build output when tests run, so resolve such imports to the source of the
 * workspace package. Imports that resolve to a registry copy are left alone.
 */
const workspacePackageSources: Plugin = {
  name: 'workspace-package-sources',
  enforce: 'pre',
  resolveId(source, importer) {
    const match = /^(@metamask\/[^/]+)(?:\/(.+))?$/u.exec(source);
    if (!importer || !match) {
      return null;
    }

    const [, packageName, subpath = ''] = match;
    const installed = findInstalledPackage(importer.split('?')[0], packageName);
    if (
      installed === undefined ||
      path.dirname(installed) !== WORKSPACE_PACKAGES_DIRECTORY
    ) {
      return null;
    }

    return findExportSource(installed, subpath);
  },
};

/**
 * This configuration is extended by the `vitest.config.ts` configuration in
 * each package.
 *
 * For a detailed explanation of each option, visit:
 * https://vitest.dev/config/
 */
export default defineConfig({
  resolve: {
    // Apply the `paths` option from the package's `tsconfig.json`, which
    // resolves `@metamask/*` imports to the uncompiled source of packages that
    // live in this repo. Tests therefore need no build step, and the mapping
    // lives in one place instead of two.
    tsconfigPaths: true,
  },

  plugins: [workspacePackageSources],

  test: {
    server: {
      deps: {
        inline: [/node_modules\/@metamask\/[^/]+\/(?!.*node_modules\/)/u],
      },
    },

    // Vitest enables watch mode by default. We disable it here, so it can be
    // explicitly enabled with `yarn test:watch`.
    watch: false,

    // The files to include in the test run.
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],

    // The setup files shared by every package.
    setupFiles: [path.join(MONOREPO_ROOT, 'tests/vitest/setup-after-env.ts')],

    // Reset mocks between tests, so a mocked implementation cannot leak from
    // one test into the next.
    mockReset: true,
    restoreMocks: true,

    unstubGlobals: true,

    typecheck: {
      enabled: true,
    },

    coverage: {
      enabled: false,

      // The files to include in the coverage report.
      include: ['src/**/*.ts'],

      // The files to exclude from the coverage report. An index file only
      // re-exports, so it has nothing to cover.
      exclude: [
        'src/**/index.ts',
        'src/**/*.d.ts',
        'src/**/*-method-action-types.ts',
      ],

      // `lcovonly` rather than `lcov`, which also writes a second HTML report.
      reporter: ['text', 'html', 'json-summary', 'lcovonly'],

      // Each package configures its own thresholds.
    },
  },
});
