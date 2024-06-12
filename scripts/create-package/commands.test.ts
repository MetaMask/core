import type { Arguments } from 'yargs';

import type { CreatePackageOptions } from './commands';
import { createPackageHandler } from './commands';
import * as utils from './utils';

jest.mock('./utils', () => ({
  finalizeAndWriteData: jest.fn(),
  readMonorepoFiles: jest.fn(),
}));

// January 2 to avoid time zone issues.
jest.useFakeTimers().setSystemTime(new Date('2023-01-02'));

describe('create-package/commands', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createPackageHandler', () => {
    it('should create the expected package', async () => {
      (utils.readMonorepoFiles as jest.Mock).mockResolvedValue({
        tsConfig: {
          references: [{ path: '../packages/foo' }],
        },
        tsConfigBuild: {
          references: [{ path: '../packages/foo' }],
        },
        nodeVersions: '>=18.0.0',
      });

      const args: Arguments<CreatePackageOptions> = {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/naming-convention
        _: [],
        $0: 'create-package',
        name: '@metamask/new-package',
        description: 'A new MetaMask package.',
      };

      await createPackageHandler(args);

      expect(utils.finalizeAndWriteData).toHaveBeenCalledTimes(1);
      expect(utils.finalizeAndWriteData).toHaveBeenCalledWith(
        {
          name: '@metamask/new-package',
          description: 'A new MetaMask package.',
          directoryName: 'new-package',
          nodeVersions: '>=18.0.0',
          currentYear: '2023',
        },
        {
          tsConfig: {
            references: [{ path: '../packages/foo' }],
          },
          tsConfigBuild: {
            references: [{ path: '../packages/foo' }],
          },
          nodeVersions: '>=18.0.0',
        },
      );
    });
  });
});
