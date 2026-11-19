import * as commentJson from 'comment-json';
import { execa } from 'execa';
import fs from 'fs';
import type { Stats } from 'fs';
import path from 'path';
import { format } from 'prettier';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import { MONOREPO_FILES } from './constants.ts';
import * as fsUtils from './fs-utils.ts';
import { finalizeAndWriteData, readMonorepoFiles } from './utils.ts';
import type { PackageData } from './utils.ts';

// `utils.ts` reaches for the default and the named exports of `fs`, so the
// mock exposes the same object as both. It is hoisted so the `vi.mock` factory
// below can reach it.
const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
  promises: {
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn(),
  },
}));

vi.mock('fs', () => ({ ...fsMock, default: fsMock }));

vi.mock(import('execa'), () => ({ execa: vi.fn() }));

vi.mock(import('prettier'), () => ({
  format: vi.fn(),
}));

vi.mock(import('./fs-utils.ts'), () => ({
  readAllFiles: vi.fn(),
  writeFiles: vi.fn(),
}));

describe('create-package/utils', () => {
  describe('readMonorepoFiles', () => {
    const tsConfig = JSON.stringify({
      references: [{ path: '../packages/foo' }],
    });
    const tsConfigBuild = JSON.stringify({
      references: [{ path: '../packages/foo' }],
    });
    const packageJson = JSON.stringify({
      engines: { node: '>=18.0.0' },
    });

    it('should read the expected monorepo files', async () => {
      // `readFile` is overloaded, which `mockImplementation` cannot match, so
      // it is narrowed to the single signature `utils.ts` relies on.
      const readFile = vi.mocked(fs.promises.readFile) as unknown as Mock<
        (filePath: string) => Promise<string>
      >;

      readFile.mockImplementation(async (filePath) => {
        switch (path.basename(filePath)) {
          case MONOREPO_FILES.TsConfig:
            return tsConfig;
          case MONOREPO_FILES.TsConfigBuild:
            return tsConfigBuild;
          case MONOREPO_FILES.PackageJson:
            return packageJson;
          default:
            throw new Error(`Unexpected file: ${path.basename(filePath)}`);
        }
      });

      const monorepoFileData = await readMonorepoFiles();

      expect(monorepoFileData).toStrictEqual({
        tsConfig: commentJson.parse(tsConfig),
        tsConfigBuild: commentJson.parse(tsConfigBuild),
        nodeVersions: '>=18.0.0',
      });
    });
  });

  describe('finalizeAndWriteData', () => {
    it('should write the expected files', async () => {
      const packageData: PackageData = {
        name: '@metamask/foo',
        description: 'A foo package.',
        directoryName: 'foo',
        nodeVersions: '>=18.0.0',
        currentYear: '2023',
      };

      const monorepoFileData = {
        tsConfig: {
          references: [{ path: './packages/bar' }],
        },
        tsConfigBuild: {
          references: [{ path: './packages/bar' }],
        },
        nodeVersions: '>=18.0.0',
      };

      const mockError = new Error('Not found') as NodeJS.ErrnoException;
      mockError.code = 'ENOENT';

      vi.mocked(fs.promises.stat).mockRejectedValue(mockError);

      vi.mocked(fsUtils.readAllFiles).mockResolvedValueOnce({
        'src/index.ts': 'export default 42;',
        'src/index.test.ts': 'export default 42;',
        'mock1.file':
          'CURRENT_YEAR NODE_VERSIONS @metamask/package-template PACKAGE_DESCRIPTION PACKAGE_DIRECTORY_NAME',
        'mock2.file': 'CURRENT_YEAR NODE_VERSIONS @metamask/package-template',
        'mock3.file': 'PACKAGE_DESCRIPTION PACKAGE_DIRECTORY_NAME',
      });

      vi.mocked(format).mockImplementation(async (input) => input);

      await finalizeAndWriteData(packageData, monorepoFileData);

      // processTemplateFiles and writeFiles
      expect(fsUtils.readAllFiles).toHaveBeenCalledTimes(1);
      expect(fsUtils.readAllFiles).toHaveBeenCalledWith(
        expect.stringMatching(/\/package-template$/u),
      );

      expect(fsUtils.writeFiles).toHaveBeenCalledTimes(1);
      expect(fsUtils.writeFiles).toHaveBeenCalledWith(
        expect.stringMatching(/packages\/foo$/u),
        {
          'src/index.ts': 'export default 42;',
          'src/index.test.ts': 'export default 42;',
          'mock1.file': '2023 >=18.0.0 @metamask/foo A foo package. foo',
          'mock2.file': '2023 >=18.0.0 @metamask/foo',
          'mock3.file': 'A foo package. foo',
        },
      );

      // Writing monorepo files
      expect(fs.promises.writeFile).toHaveBeenCalledTimes(2);
      expect(format).toHaveBeenCalledTimes(2);
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/tsconfig\.json$/u),
        JSON.stringify(
          {
            references: [
              { path: './packages/bar' },
              { path: './packages/foo' },
            ],
          },
          null,
          2,
        ),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/tsconfig\.build\.json$/u),
        JSON.stringify(
          {
            references: [
              { path: './packages/bar' },
              { path: './packages/foo/tsconfig.build.json' },
            ],
          },
          null,
          2,
        ),
      );

      // Postprocessing
      expect(execa).toHaveBeenCalledTimes(2);
      expect(execa).toHaveBeenCalledWith('yarn', ['install'], {
        cwd: expect.any(String),
      });
      expect(execa).toHaveBeenCalledWith('yarn', ['readme-content:update'], {
        cwd: expect.any(String),
      });
    });

    it('removes the "private" field from the template package.json', async () => {
      const packageData: PackageData = {
        name: '@metamask/foo',
        description: 'A foo package.',
        directoryName: 'foo',
        nodeVersions: '>=18.0.0',
        currentYear: '2023',
      };

      const monorepoFileData = {
        tsConfig: { references: [] },
        tsConfigBuild: { references: [] },
        nodeVersions: '>=18.0.0',
      };

      const mockError = new Error('Not found') as NodeJS.ErrnoException;
      mockError.code = 'ENOENT';
      vi.mocked(fs.promises.stat).mockRejectedValue(mockError);

      vi.mocked(fsUtils.readAllFiles).mockResolvedValueOnce({
        'package.json': JSON.stringify({
          name: '@metamask/package-template',
          private: true,
          version: '1.0.0',
        }),
      });

      vi.mocked(format).mockImplementation(async (input) => input);

      await finalizeAndWriteData(packageData, monorepoFileData);

      expect(fsUtils.writeFiles).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          'package.json': JSON.stringify(
            { name: '@metamask/foo', version: '1.0.0' },
            null,
            2,
          ),
        }),
      );
    });

    it('excludes generated files from the template directory', async () => {
      const packageData: PackageData = {
        name: '@metamask/foo',
        description: 'A foo package.',
        directoryName: 'foo',
        nodeVersions: '>=18.0.0',
        currentYear: '2023',
      };

      const monorepoFileData = {
        tsConfig: { references: [] },
        tsConfigBuild: { references: [] },
        nodeVersions: '>=18.0.0',
      };

      const mockError = new Error('Not found') as NodeJS.ErrnoException;
      mockError.code = 'ENOENT';
      vi.mocked(fs.promises.stat).mockRejectedValue(mockError);

      vi.mocked(fsUtils.readAllFiles).mockResolvedValueOnce({
        'src/index.ts': 'export default 42;',
        'dist/index.js': 'export default 42;',
        'dist/index.d.ts': 'export default 42;',
        'coverage/lcov.info': '',
        'tsconfig.tsbuildinfo': '{}',
      });

      vi.mocked(format).mockImplementation(async (input) => input);

      await finalizeAndWriteData(packageData, monorepoFileData);

      expect(fsUtils.writeFiles).toHaveBeenCalledWith(expect.any(String), {
        'src/index.ts': 'export default 42;',
      });
    });

    it('throws if the package directory already exists', async () => {
      const packageData: PackageData = {
        name: '@metamask/foo',
        description: 'A foo package.',
        directoryName: 'foo',
        nodeVersions: '20.0.0',
        currentYear: '2023',
      };

      const monorepoFileData = {
        tsConfig: {
          references: [{ path: './packages/bar' }],
        },
        tsConfigBuild: {
          references: [{ path: './packages/bar' }],
        },
        nodeVersions: '20.0.0',
      };

      vi.mocked(fs.promises.stat).mockResolvedValue({} as Stats);

      await expect(
        finalizeAndWriteData(packageData, monorepoFileData),
      ).rejects.toThrow(/^The package directory already exists:/u);

      expect(fs.promises.mkdir).not.toHaveBeenCalled();
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it('throws if fs.stat fails with an error other than ENOENT', async () => {
      const mockError = new Error('Permission denied') as NodeJS.ErrnoException;
      mockError.code = 'EACCES';

      vi.mocked(fs.promises.stat).mockRejectedValue(mockError);

      const packageData: PackageData = {
        name: '@metamask/foo',
        description: 'A foo package.',
        directoryName: 'foo',
        nodeVersions: '20.0.0',
        currentYear: '2023',
      };

      const monorepoFileData = {
        tsConfig: {
          references: [{ path: './packages/bar' }],
        },
        tsConfigBuild: {
          references: [{ path: './packages/bar' }],
        },
        nodeVersions: '20.0.0',
      };

      await expect(
        finalizeAndWriteData(packageData, monorepoFileData),
      ).rejects.toThrow('Permission denied');
    });
  });
});
