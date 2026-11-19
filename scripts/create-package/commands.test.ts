import { describe, expect, it, vi } from 'vitest';
import type { Arguments } from 'yargs';

import { createPackageHandler } from './commands.ts';
import type { CreatePackageOptions } from './commands.ts';
import * as utils from './utils.ts';

vi.mock(import('./utils.ts'), () => ({
  finalizeAndWriteData: vi.fn(),
  readMonorepoFiles: vi.fn(),
}));

// January 2 to avoid time zone issues.
vi.useFakeTimers().setSystemTime(new Date('2023-01-02'));

describe('create-package/commands', () => {
  describe('createPackageHandler', () => {
    it('should create the expected package', async () => {
      vi.mocked(utils.readMonorepoFiles).mockResolvedValue({
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
