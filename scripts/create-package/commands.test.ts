import { jest } from '@jest/globals';
import type { Arguments } from 'yargs';

import type { CreatePackageOptions } from './commands.js';

// `jest.mock` does not apply to ES modules, so the module registry is stubbed
// with `jest.unstable_mockModule` and the modules under test are imported
// dynamically afterwards.
jest.unstable_mockModule('./utils.js', () => ({
  finalizeAndWriteData: jest.fn(),
  readMonorepoFiles: jest.fn(),
}));

const utils = await import('./utils.js');
const { createPackageHandler } = await import('./commands.js');

// January 2 to avoid time zone issues.
jest.useFakeTimers().setSystemTime(new Date('2023-01-02'));

describe('create-package/commands', () => {
  describe('createPackageHandler', () => {
    it('should create the expected package', async () => {
      jest.mocked(utils.readMonorepoFiles).mockResolvedValue({
        tsConfig: {
          references: [{ path: '../packages/foo' }],
        },
        tsConfigBuild: {
          references: [{ path: '../packages/foo' }],
        },
        nodeVersions: '>=18.0.0',
      });

      const args: Arguments<CreatePackageOptions> = {
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
