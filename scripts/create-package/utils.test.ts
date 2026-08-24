import { jest } from '@jest/globals';
import * as commentJson from 'comment-json';
import type { Stats } from 'fs';
import path from 'path';

import { MonorepoFiles } from './constants.js';
import type { PackageData } from './utils.js';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards. `utils.ts` reaches for the default and the named
// exports of `fs`, so the mock exposes the same object as both.
const fsMock = {
  existsSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    stat: jest.fn(),
  },
};

jest.unstable_mockModule('fs', () => ({ ...fsMock, default: fsMock }));

jest.unstable_mockModule('execa', () => ({ default: jest.fn() }));

jest.unstable_mockModule('prettier', () => ({
  format: jest.fn(),
}));

jest.unstable_mockModule('./fs-utils.js', () => ({
  readAllFiles: jest.fn(),
  writeFiles: jest.fn(),
}));

const { default: fs } = await import('fs');
const { default: execa } = await import('execa');
const { format } = await import('prettier');
const fsUtils = await import('./fs-utils.js');
const { finalizeAndWriteData, readMonorepoFiles } = await import('./utils.js');

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
      const readFile = jest.mocked(
        fs.promises.readFile,
      ) as unknown as jest.Mock<(filePath: string) => Promise<string>>;

      readFile.mockImplementation(async (filePath) => {
        switch (path.basename(filePath)) {
          case MonorepoFiles.TsConfig:
            return tsConfig;
          case MonorepoFiles.TsConfigBuild:
            return tsConfigBuild;
          case MonorepoFiles.PackageJson:
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

      jest.mocked(fs.promises.stat).mockRejectedValue(mockError);

      jest.mocked(fsUtils.readAllFiles).mockResolvedValueOnce({
        'src/index.ts': 'export default 42;',
        'src/index.test.ts': 'export default 42;',
        'mock1.file':
          'CURRENT_YEAR NODE_VERSIONS PACKAGE_NAME PACKAGE_DESCRIPTION PACKAGE_DIRECTORY_NAME',
        'mock2.file': 'CURRENT_YEAR NODE_VERSIONS PACKAGE_NAME',
        'mock3.file': 'PACKAGE_DESCRIPTION PACKAGE_DIRECTORY_NAME',
      });

      jest.mocked(format).mockImplementation(async (input) => input);

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

      jest.mocked(fs.promises.stat).mockResolvedValue({} as Stats);

      await expect(
        finalizeAndWriteData(packageData, monorepoFileData),
      ).rejects.toThrow(/^The package directory already exists:/u);

      expect(fs.promises.mkdir).not.toHaveBeenCalled();
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });

    it('throws if fs.stat fails with an error other than ENOENT', async () => {
      const mockError = new Error('Permission denied') as NodeJS.ErrnoException;
      mockError.code = 'EACCES';

      jest.mocked(fs.promises.stat).mockRejectedValue(mockError);

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
