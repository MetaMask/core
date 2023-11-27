import fs from 'fs';
import path from 'path';

import { MonorepoFiles, readMonorepoFiles } from './utils';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
  },
}));

describe('create-package/utils', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('readMonorepoFiles', () => {
    const tsConfig = JSON.stringify({
      references: [{ path: '../packages/foo' }],
    });
    const tsConfigBuild = JSON.stringify({
      references: [{ path: '../packages/foo' }],
    });

    it('should read the expected monorepo files', async () => {
      (fs.promises.readFile as jest.Mock).mockImplementation(
        async (filePath: string) => {
          switch (path.basename(filePath)) {
            case MonorepoFiles.TsConfig:
              return tsConfig;
            case MonorepoFiles.TsConfigBuild:
              return tsConfigBuild;
            case MonorepoFiles.Nvmrc:
              return 'v20';
            default:
              throw new Error(`Unexpected file: ${path.basename(filePath)}`);
          }
        },
      );

      const monorepoFileData = await readMonorepoFiles();

      expect(monorepoFileData).toStrictEqual({
        tsConfig: JSON.parse(tsConfig),
        tsConfigBuild: JSON.parse(tsConfigBuild),
        nodeVersion: '20.0.0',
      });
    });

    it('should throw if the .nvmrc file is invalid', async () => {
      (fs.promises.readFile as jest.Mock).mockImplementation(
        async (filePath: string) => {
          switch (path.basename(filePath)) {
            case MonorepoFiles.TsConfig:
              return tsConfig;
            case MonorepoFiles.TsConfigBuild:
              return tsConfigBuild;
            case MonorepoFiles.Nvmrc:
              return 'foobar';
            default:
              throw new Error(`Unexpected file: ${path.basename(filePath)}`);
          }
        },
      );

      await expect(readMonorepoFiles()).rejects.toThrow(
        'Invalid .nvmrc: foobar',
      );
    });
  });
});
