import execa from 'execa';
import fs from 'fs';
import path from 'path';
import prettier from 'prettier';

import { MonorepoFiles } from './constants';
import * as fsUtils from './fs-utils';
import type { PackageData } from './utils';
import { finalizeAndWriteData, readMonorepoFiles } from './utils';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    stat: jest.fn(),
  },
}));

jest.mock('execa', () => jest.fn());

jest.mock('prettier', () => ({
  format: jest.fn(),
}));

jest.mock('./fs-utils', () => ({
  readAllFiles: jest.fn(),
  writeFiles: jest.fn(),
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
      (fs.promises.readFile as jest.Mock).mockImplementation(
        async (filePath: string) => {
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
        },
      );

      const monorepoFileData = await readMonorepoFiles();

      expect(monorepoFileData).toStrictEqual({
        tsConfig: JSON.parse(tsConfig),
        tsConfigBuild: JSON.parse(tsConfigBuild),
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

      (fs.promises.stat as jest.Mock).mockResolvedValueOnce({
        isDirectory: () => false,
      });

      (fsUtils.readAllFiles as jest.Mock).mockResolvedValueOnce({
        'src/index.ts': 'export default 42;',
        'src/index.test.ts': 'export default 42;',
        'mock1.file':
          'CURRENT_YEAR NODE_VERSIONS PACKAGE_NAME PACKAGE_DESCRIPTION PACKAGE_DIRECTORY_NAME',
        'mock2.file': 'CURRENT_YEAR NODE_VERSIONS PACKAGE_NAME',
        'mock3.file': 'PACKAGE_DESCRIPTION PACKAGE_DIRECTORY_NAME',
      });

      (prettier.format as jest.Mock).mockImplementation((input) => input);

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
      expect(prettier.format).toHaveBeenCalledTimes(2);
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/tsconfig\.json$/u),
        JSON.stringify({
          references: [{ path: './packages/bar' }, { path: './packages/foo' }],
        }),
      );
      expect(fs.promises.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/tsconfig\.build\.json$/u),
        JSON.stringify({
          references: [
            { path: './packages/bar' },
            { path: './packages/foo/tsconfig.build.json' },
          ],
        }),
      );

      // Postprocessing
      expect(execa).toHaveBeenCalledTimes(2);
      expect(execa).toHaveBeenCalledWith('yarn', ['install'], {
        cwd: expect.any(String),
      });
      expect(execa).toHaveBeenCalledWith('yarn', ['update-readme-content'], {
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

      (fs.promises.stat as jest.Mock).mockResolvedValueOnce({
        isDirectory: () => true,
      });

      await expect(
        finalizeAndWriteData(packageData, monorepoFileData),
      ).rejects.toThrow(/^The package directory already exists:/u);

      expect(fs.promises.mkdir).not.toHaveBeenCalled();
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });
  });
});
