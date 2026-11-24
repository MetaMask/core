import { access } from 'node:fs/promises';
import type { InlineConfig } from 'vite';
import { loadConfigFromFile } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRootConfig,
  getPackageDirectories,
} from './create-vitest-config.ts';
import { getAllWorkspaces } from './workspaces.ts';

vi.mock(import('node:fs/promises'), async (importOriginal) => ({
  ...(await importOriginal()),
  access: vi.fn(),
}));

vi.mock(import('vite'), async (importOriginal) => ({
  ...(await importOriginal()),
  loadConfigFromFile: vi.fn(),
}));

vi.mock('./workspaces.ts', () => ({
  getAllWorkspaces: vi.fn(),
  ROOT_WORKSPACE: '/repo/',
}));

/**
 * Make the given package config files "exist", and make loading them return
 * the given Vitest `test` options.
 *
 * @param configs - The `test` options of each package config, keyed by the
 * path of the config file relative to the monorepo root.
 */
function mockPackageConfigs(
  configs: Record<string, InlineConfig['test']>,
): void {
  vi.mocked(access).mockImplementation(async (filePath) => {
    if (!(String(filePath).replace('/repo/', '') in configs)) {
      throw new Error('ENOENT');
    }
  });

  vi.mocked(loadConfigFromFile).mockImplementation(async (_env, filePath) => ({
    path: `${filePath}`,
    config: { test: configs[`${filePath}`.replace('/repo/', '')] },
    dependencies: [],
  }));
}

describe('getPackageDirectories', () => {
  it('returns the sorted locations of all workspaces, including private ones', async () => {
    vi.mocked(getAllWorkspaces).mockResolvedValue([
      { name: '@metamask/b', location: 'packages/b' },
      { name: '@metamask/a', location: 'packages/a' },
    ]);

    expect(await getPackageDirectories()).toStrictEqual([
      'packages/a',
      'packages/b',
    ]);
    expect(getAllWorkspaces).toHaveBeenCalledWith({ includePrivate: true });
  });
});

describe('createRootConfig', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    process.argv = ['node', 'vitest'];
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  describe('without coverage', () => {
    it('creates a project for each package that has a Vitest config', async () => {
      mockPackageConfigs({
        'packages/a/vitest.config.ts': {},
        'packages/b/vitest.config.mts': {},
      });

      const config = await createRootConfig(['packages/a', 'packages/b']);

      expect(config.test).toStrictEqual({
        watch: false,
        projects: [
          'packages/a/vitest.config.{ts,mts}',
          'packages/b/vitest.config.{ts,mts}',
        ],
      });
    });

    it('skips packages without a Vitest config', async () => {
      mockPackageConfigs({ 'packages/a/vitest.config.ts': {} });

      const config = await createRootConfig(['packages/a', 'packages/b']);

      expect(config.test?.projects).toStrictEqual([
        'packages/a/vitest.config.{ts,mts}',
      ]);
    });

    it('does not load the package configs', async () => {
      mockPackageConfigs({ 'packages/a/vitest.config.ts': {} });

      await createRootConfig(['packages/a']);

      expect(loadConfigFromFile).not.toHaveBeenCalled();
    });
  });

  describe('with coverage', () => {
    beforeEach(() => {
      process.argv = ['node', 'vitest', '--coverage', '--shard', '1/2'];
    });

    it('uses the `v8` provider', async () => {
      mockPackageConfigs({ 'packages/a/vitest.config.ts': {} });

      const config = await createRootConfig(['packages/a']);

      expect(config.test?.coverage?.provider).toBe('v8');
    });

    it('includes and excludes the files of each package', async () => {
      mockPackageConfigs({
        'packages/a/vitest.config.ts': {
          coverage: {
            include: ['src/**/*.ts'],
            exclude: ['src/**/index.ts', 'src/mock.ts'],
          },
        },
        'packages/b/vitest.config.ts': {
          coverage: {
            include: ['src/**/*.ts'],
            exclude: ['**/__fixtures__/**', '!src/keep.ts'],
          },
        },
      });

      const config = await createRootConfig(['packages/a', 'packages/b']);

      expect(config.test?.coverage).toMatchObject({
        include: ['packages/a/src/**/*.ts', 'packages/b/src/**/*.ts'],
        exclude: [
          'packages/a/src/**/index.ts',
          'packages/a/src/mock.ts',
          '**/__fixtures__/**',
          '!src/keep.ts',
        ],
      });
    });

    it('treats a package without coverage options as having none', async () => {
      mockPackageConfigs({ 'packages/a/vitest.config.ts': {} });

      const config = await createRootConfig(['packages/a']);

      expect(config.test?.coverage).toMatchObject({
        include: [],
        exclude: [],
      });
    });

    it('treats a package config that cannot be loaded as having no coverage options', async () => {
      vi.mocked(access).mockResolvedValue(undefined);
      vi.mocked(loadConfigFromFile).mockResolvedValue(null);

      const config = await createRootConfig(['packages/a']);

      expect(config.test?.coverage).toMatchObject({
        include: [],
        exclude: [],
      });
    });

    it('does not report or check thresholds when collecting', async () => {
      mockPackageConfigs({
        'packages/a/vitest.config.ts': {
          coverage: { thresholds: { lines: 100 } },
        },
      });

      const config = await createRootConfig(['packages/a']);

      expect(config.test?.coverage).toMatchObject({
        reporter: [],
        thresholds: {},
      });
    });

    describe('when merging reports', () => {
      beforeEach(() => {
        process.argv = ['node', 'vitest', '--merge-reports', '--coverage'];
      });

      it('prints a summary', async () => {
        mockPackageConfigs({ 'packages/a/vitest.config.ts': {} });

        const config = await createRootConfig(['packages/a']);

        expect(config.test?.coverage?.reporter).toStrictEqual(['text-summary']);
      });

      it('applies the thresholds of a package to its source files', async () => {
        mockPackageConfigs({
          'packages/a/vitest.config.ts': {
            coverage: { thresholds: { branches: 100, lines: 90 } },
          },
          'packages/b/vitest.config.ts': {
            coverage: { thresholds: { branches: 95.5 } },
          },
        });

        const config = await createRootConfig(['packages/a', 'packages/b']);

        expect(config.test?.coverage?.thresholds).toStrictEqual({
          'packages/a/src/**': { branches: 100, lines: 90 },
          'packages/b/src/**': { branches: 95.5 },
        });
      });

      it('applies the file-specific thresholds of a package relative to the monorepo', async () => {
        mockPackageConfigs({
          'packages/a/vitest.config.ts': {
            coverage: {
              thresholds: {
                branches: 100,
                'src/special.ts': { branches: 80 },
              },
            },
          },
        });

        const config = await createRootConfig(['packages/a']);

        expect(config.test?.coverage?.thresholds).toStrictEqual({
          'packages/a/src/**': { branches: 100 },
          'packages/a/src/special.ts': { branches: 80 },
        });
      });

      it('does not apply a package-wide threshold if a package only has file-specific thresholds', async () => {
        mockPackageConfigs({
          'packages/a/vitest.config.ts': {
            coverage: {
              thresholds: { 'src/special.ts': { branches: 80 } },
            },
          },
        });

        const config = await createRootConfig(['packages/a']);

        expect(config.test?.coverage?.thresholds).toStrictEqual({
          'packages/a/src/special.ts': { branches: 80 },
        });
      });

      it('does not check packages without thresholds', async () => {
        mockPackageConfigs({
          'packages/a/vitest.config.ts': {},
          'packages/b/vitest.config.ts': {
            coverage: { thresholds: { lines: 100 } },
          },
        });

        const config = await createRootConfig(['packages/a', 'packages/b']);

        expect(config.test?.coverage?.thresholds).toStrictEqual({
          'packages/b/src/**': { lines: 100 },
        });
      });
    });
  });
});
