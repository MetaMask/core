import type { Dir } from 'fs';
import { readFileSync } from 'fs';
import { platform as osPlatform } from 'node:os';
import fs from 'fs/promises';

import { join, relative } from 'path';
import { parse as parseYaml } from 'yaml';
import nock from 'nock';

import {
  checkAndDownloadBinaries,
  getBinaryArchiveUrl,
  getCacheDirectory,
} from '.';
import { parseArgs, printBanner } from './options';
import { Architecture, Platform } from './types';
import type { Binary, Checksums } from './types';
import { isCodedError, normalizeSystemArchitecture } from './utils';

type OperationDetails = {
  path?: string;
  repo?: string;
  tag?: string;
  version?: string;
  platform?: Platform;
  arch?: Architecture;
  binaries?: string[];
  binDir?: string;
  cachePath?: string;
  url?: URL;
  checksums?: Checksums;
};

jest.mock('fs/promises', () => {
  const actualFs = jest.requireActual('fs/promises');
  return {
    ...actualFs,
    opendir: jest.fn().mockImplementation((path) => {
      const error = new Error(
        `ENOENT: no such file or directory, opendir '${path}'`,
      );
      (error as NodeJS.ErrnoException).code = 'ENOENT';
      throw error;
    }),
    mkdir: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined),
    symlink: jest.fn(),
    unlink: jest.fn(),
    copyFile: jest.fn(),
    rm: jest.fn(),
  };
});

jest.mock('fs');
jest.mock('yaml');
jest.mock('os', () => ({
  homedir: jest.fn().mockReturnValue('/home/user'),
}));

// Mock node:os and node:process for options.ts tests
jest.mock('node:os', () => ({
  platform: jest.fn().mockReturnValue('linux'),
}));

jest.mock('node:process', () => ({
  argv: ['node', 'script.js'],
  stdout: {
    columns: 80,
  },
}));

jest.mock('./utils', () => ({
  ...jest.requireActual('./utils'),
  normalizeSystemArchitecture: jest.fn().mockReturnValue('x64'),
}));

jest.mock('./options', () => ({
  ...jest.requireActual('./options'),
  parseArgs: jest.fn(),
  printBanner: jest.fn(),
  say: jest.fn(),
  getVersion: jest.fn().mockReturnValue('0.1.0'),
  extractFrom: jest.fn().mockResolvedValue(['mock/path/to/binary']),
}));

const mockInstallBinaries = async (
  downloadedBinaries: Dir,
  BIN_DIR: string,
  cachePath: string,
): Promise<{ operation: string; source?: string; target?: string }[]> => {
  const mockOperations: {
    operation: string;
    source?: string;
    target?: string;
  }[] = [];

  for await (const file of downloadedBinaries) {
    if (!file.isFile()) {
      continue;
    }
    const target = join(file.parentPath, file.name);
    const path = join(BIN_DIR, relative(cachePath, target));

    mockOperations.push({ operation: 'unlink', target: path });

    try {
      await fs.symlink(target, path);
      mockOperations.push({
        operation: 'symlink',
        source: target,
        target: path,
      });
    } catch (e) {
      if (!(isCodedError(e) && ['EPERM', 'EXDEV'].includes(e.code))) {
        throw e;
      }
      mockOperations.push({
        operation: 'copyFile',
        source: target,
        target: path,
      });
    }

    mockOperations.push({ operation: 'getVersion', target: path });
  }

  return mockOperations;
};

const mockDownloadAndInstallFoundryBinaries = async (): Promise<
  { operation: string; details?: OperationDetails }[]
> => {
  const operations: { operation: string; details?: OperationDetails }[] = [];
  const parsedArgs = parseArgs();

  operations.push({ operation: 'getCacheDirectory' });
  const CACHE_DIR = getCacheDirectory();

  if (parsedArgs.command === 'cache clean') {
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
    operations.push({ operation: 'cleanCache', details: { path: CACHE_DIR } });
    return operations;
  }

  const {
    repo,
    version: { version, tag },
    arch,
    platform,
    binaries,
  } = parsedArgs.options;

  operations.push({
    operation: 'getBinaryArchiveUrl',
    details: { repo, tag, version, platform, arch },
  });

  const BIN_ARCHIVE_URL = getBinaryArchiveUrl(
    repo,
    tag,
    version,
    platform,
    arch,
  );
  const url = new URL(BIN_ARCHIVE_URL);

  operations.push({
    operation: 'checkAndDownloadBinaries',
    details: { url, binaries, cachePath: CACHE_DIR, platform, arch },
  });

  operations.push({
    operation: 'installBinaries',
    details: {
      binaries,
      binDir: 'node_modules/.bin',
      cachePath: CACHE_DIR,
    },
  });

  return operations;
};

describe('foundryup', () => {
  describe('getCacheDirectory', () => {
    it('uses global cache when enabled in .yarnrc.yml', () => {
      (parseYaml as jest.Mock).mockReturnValue({ enableGlobalCache: true });
      (readFileSync as jest.Mock).mockReturnValue('dummy yaml content');

      const result = getCacheDirectory();
      expect(result).toMatch(/\/\.cache\/metamask$/u);
    });

    it('uses local cache when global cache is disabled', () => {
      (parseYaml as jest.Mock).mockReturnValue({ enableGlobalCache: false });
      (readFileSync as jest.Mock).mockReturnValue('dummy yaml content');

      const result = getCacheDirectory();
      expect(result).toContain('.metamask/cache');
    });
  });

  describe('getBinaryArchiveUrl', () => {
    it('generates correct download URL for Linux', () => {
      const result = getBinaryArchiveUrl(
        'foundry-rs/foundry',
        'v1.0.0',
        '1.0.0',
        Platform.Linux,
        Architecture.Amd64,
      );

      expect(result).toMatch(/^https:\/\/github.com\/.*\.tar\.gz$/u);
    });

    it('generates correct download URL for Windows', () => {
      const result = getBinaryArchiveUrl(
        'foundry-rs/foundry',
        'v1.0.0',
        '1.0.0',
        Platform.Windows,
        Architecture.Amd64,
      );

      expect(result).toMatch(/^https:\/\/github.com\/.*\.zip$/u);
    });
  });

  describe('checkAndDownloadBinaries', () => {
    const mockUrl = new URL('https://example.com/binaries');
    const mockBinaries = ['forge'] as Binary[];
    const mockCachePath = './test-cache-path';

    beforeEach(() => {
      jest.clearAllMocks();
      nock.cleanAll();
    });

    it('handles download errors gracefully', async () => {
      (fs.opendir as jest.Mock).mockRejectedValue({ code: 'ENOENT' });

      nock.cleanAll();
      nock('https://example.com')
        .head('/binaries')
        .reply(500, 'Internal Server Error')
        .get('/binaries')
        .reply(500, 'Internal Server Error');

      await expect(
        checkAndDownloadBinaries(
          mockUrl,
          mockBinaries,
          mockCachePath,
          Platform.Linux,
          Architecture.Amd64,
        ),
      ).rejects.toThrow('Failed to download binaries');
    });
  });

  describe('installBinaries', () => {
    const mockBinDir = '/mock/bin/dir';
    const mockCachePath = '/mock/cache/path';
    const mockDir = {
      async *[Symbol.asyncIterator]() {
        yield {
          name: 'forge',
          isFile: () => true,
          parentPath: mockCachePath,
        };
      },
    } as unknown as Dir;

    it('should correctly install binaries and create symlinks', async () => {
      const operations = await mockInstallBinaries(
        mockDir,
        mockBinDir,
        mockCachePath,
      );

      expect(operations).toEqual([
        { operation: 'unlink', target: `${mockBinDir}/forge` },
        {
          operation: 'symlink',
          source: `${mockCachePath}/forge`,
          target: `${mockBinDir}/forge`,
        },
        { operation: 'getVersion', target: `${mockBinDir}/forge` },
      ]);
    });

    it('should fall back to copying files when symlink fails with EPERM', async () => {
      const epermError = new Error('EPERM') as NodeJS.ErrnoException;
      epermError.code = 'EPERM';

      (fs.symlink as jest.Mock).mockRejectedValueOnce(epermError);

      const operations = await mockInstallBinaries(
        mockDir,
        mockBinDir,
        mockCachePath,
      );

      expect(operations).toEqual([
        { operation: 'unlink', target: `${mockBinDir}/forge` },
        {
          operation: 'copyFile',
          source: `${mockCachePath}/forge`,
          target: `${mockBinDir}/forge`,
        },
        { operation: 'getVersion', target: `${mockBinDir}/forge` },
      ]);
    });

    it('should throw error for non-permission-related symlink failures', async () => {
      const otherError = new Error('Other error');
      jest.spyOn(fs, 'symlink').mockRejectedValue(otherError);

      await expect(
        mockInstallBinaries(mockDir, mockBinDir, mockCachePath),
      ).rejects.toThrow('Other error');
    });
  });

  describe('downloadAndInstallFoundryBinaries', () => {
    const mockArgs = {
      command: '',
      options: {
        repo: 'foundry-rs/foundry',
        version: {
          version: '1.0.0',
          tag: 'v1.0.0',
        },
        arch: Architecture.Amd64,
        platform: Platform.Linux,
        binaries: ['forge', 'anvil'],
        checksums: {
          algorithm: 'sha256',
          binaries: {
            forge: {
              'linux-amd64': 'mock-checksum',
              'linux-arm64': 'mock-checksum',
              'darwin-amd64': 'mock-checksum',
              'darwin-arm64': 'mock-checksum',
              'win32-amd64': 'mock-checksum',
              'win32-arm64': 'mock-checksum',
            },
            anvil: {
              'linux-amd64': 'mock-checksum',
              'linux-arm64': 'mock-checksum',
              'darwin-amd64': 'mock-checksum',
              'darwin-arm64': 'mock-checksum',
              'win32-amd64': 'mock-checksum',
              'win32-arm64': 'mock-checksum',
            },
          },
        },
      },
    };

    beforeEach(() => {
      jest.clearAllMocks();
      const mockedOptions = jest.requireMock('./options');
      mockedOptions.parseArgs.mockReturnValue(mockArgs);
      mockedOptions.printBanner.mockImplementation(jest.fn());
      mockedOptions.say.mockImplementation(jest.fn());
    });

    it('should execute all operations in order', async () => {
      const result = await mockDownloadAndInstallFoundryBinaries();

      expect(result.map((op) => op.operation)).toEqual([
        'getCacheDirectory',
        'getBinaryArchiveUrl',
        'checkAndDownloadBinaries',
        'installBinaries',
      ]);
    });

    it('should clean cache when command is "cache clean"', async () => {
      const mockedOptions = jest.requireMock('./options');
      mockedOptions.parseArgs.mockReturnValue({
        ...mockArgs,
        command: 'cache clean',
      });

      const result = await mockDownloadAndInstallFoundryBinaries();

      expect(result).toEqual([
        { operation: 'getCacheDirectory' },
        {
          operation: 'cleanCache',
          details: { path: getCacheDirectory() },
        },
      ]);
    });
  });

  // NEW TESTS FOR options.ts
  describe('options.ts', () => {
    // Mock console.log for printBanner tests
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    beforeEach(() => {
      jest.clearAllMocks();
      // Reset process.env before each test
      /* eslint-disable no-process-env */
      delete process.env.FOUNDRYUP_BINARIES;
      delete process.env.FOUNDRYUP_CHECKSUMS;
      delete process.env.FOUNDRYUP_REPO;
      delete process.env.FOUNDRYUP_VERSION;
      delete process.env.FOUNDRYUP_ARCH;
      delete process.env.FOUNDRYUP_PLATFORM;
      /* eslint-enable no-process-env */

      // Reset mocks to default values
      (normalizeSystemArchitecture as jest.Mock).mockReturnValue('x64');
      (osPlatform as jest.Mock).mockReturnValue('linux');
    });

    describe('printBanner', () => {
      it('should print the foundry banner to console', () => {
        // Use actual implementation instead of mock for this test
        jest.unmock('./options');
        const { printBanner: actualPrintBanner } = jest.requireActual('./options');
        
        actualPrintBanner();
        
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('╔═╗ ╔═╗ ╦ ╦ ╔╗╔ ╔╦╗ ╦═╗ ╦ ╦'),
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Portable and modular toolkit'),
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('https://github.com/foundry-rs/'),
        );
        
        // Re-mock for other tests
        jest.doMock('./options', () => ({
          ...jest.requireActual('./options'),
          parseArgs: jest.fn(),
          printBanner: jest.fn(),
        }));
      });
    });

    describe('parseArgs', () => {
      let actualParseArgs: (args?: string[]) => {
        command: string;
        options: {
          binaries: string[];
          repo: string;
          version: { version: string; tag: string };
          arch: string;
          platform: string;
          checksums?: Checksums;
        };
      };

      beforeEach(() => {
        jest.unmock('./options');
        const optionsModule = jest.requireActual('./options');
        actualParseArgs = optionsModule.parseArgs;
      });

      afterEach(() => {
        // Re-mock after each test
        jest.doMock('./options', () => ({
          ...jest.requireActual('./options'),
          parseArgs: jest.fn(),
          printBanner: jest.fn(),
        }));
      });

      describe('default install command', () => {
        it('should parse default install command with no arguments', () => {
          const result = actualParseArgs([]);

          expect(result.command).toBe('install');
          expect(result.options).toEqual(
            expect.objectContaining({
              binaries: ['forge', 'anvil', 'cast'],
              repo: 'foundry-rs/foundry',
              version: { version: 'nightly', tag: 'nightly' },
              arch: 'x64',
              platform: 'linux',
            }),
          );
        });

        it('should parse explicit install command', () => {
          const result = actualParseArgs(['install']);

          expect(result.command).toBe('install');
          expect(result.options).toEqual(
            expect.objectContaining({
              binaries: ['forge', 'anvil', 'cast'],
              repo: 'foundry-rs/foundry',
              version: { version: 'nightly', tag: 'nightly' },
              arch: 'x64',
              platform: 'linux',
            }),
          );
        });
      });

      describe('cache clean command', () => {
        it('should parse cache clean command', () => {
          const result = actualParseArgs(['cache', 'clean']);

          expect(result).toEqual({
            command: 'cache clean',
          });
        });
      });

      describe('binaries option', () => {
        it('should parse single binary with --binaries flag', () => {
          const result = actualParseArgs(['--binaries', 'forge']);
          
          expect(result.command).toBe('install');
          expect(result.options.binaries).toEqual(['forge']);
        });

        it('should parse multiple binaries with --binaries flag', () => {
          const result = actualParseArgs([
            '--binaries',
            'forge',
            'anvil',
            'cast',
          ]);
          expect(result.command).toBe('install');
          expect(result.options.binaries).toEqual(['forge', 'anvil', 'cast']);
        });

        it('should parse binaries with short flag -b', () => {
          const result = actualParseArgs(['-b', 'forge', 'anvil']);
          expect(result.command).toBe('install');
          expect(result.options.binaries).toEqual(['forge', 'anvil']);
        });

        it('should remove duplicate binaries', () => {
          const result = actualParseArgs([
            '--binaries',
            'forge',
            'anvil',
            'forge',
          ]);
          expect(result.command).toBe('install');
          expect(result.options.binaries).toEqual(['forge', 'anvil']);
        });
      });

      describe('checksums option', () => {
        it('should parse checksums from JSON string', () => {
          const checksums = {
            algorithm: 'sha256',
            binaries: {
              forge: {
                'linux-amd64': 'abc123',
              },
            },
          };
          const result = actualParseArgs([
            '--checksums',
            JSON.stringify(checksums),
          ]);

          expect(result.command).toBe('install');
          expect(result.options.checksums).toEqual(checksums);
        });

        it('should parse checksums with short flag -c', () => {
          const checksums = { algorithm: 'sha256', binaries: {} };
          const result = actualParseArgs(['-c', JSON.stringify(checksums)]);

          expect(result.command).toBe('install');
          expect(result.options.checksums).toEqual(checksums);
        });

        it('should throw error for invalid JSON checksums', () => {
          expect(() => {
            actualParseArgs(['--checksums', 'invalid-json']);
          }).toThrow('Invalid checksums');
        });
      });

      describe('repo option', () => {
        it('should parse custom repo with --repo flag', () => {
          const result = actualParseArgs(['--repo', 'custom/repo']);
          expect(result.command).toBe('install');
          expect(result.options.repo).toBe('custom/repo');
        });

        it('should parse repo with short flag -r', () => {
          const result = actualParseArgs(['-r', 'another/repo']);

          expect(result.command).toBe('install');
          expect(result.options.repo).toBe('another/repo');
        });
      });

      describe('version option', () => {
        it('should parse nightly version', () => {
          const result = actualParseArgs(['--version', 'nightly']);

          expect(result.command).toBe('install');
          expect(result.options.version).toEqual({
            version: 'nightly',
            tag: 'nightly',
          });
        });

        it('should parse nightly with date suffix', () => {
          const result = actualParseArgs(['--version', 'nightly-2024-01-01']);

          expect(result.command).toBe('install');
          expect(result.options.version).toEqual({
            version: 'nightly',
            tag: 'nightly-2024-01-01',
          });
        });

        it('should parse semantic version', () => {
          const result = actualParseArgs(['--version', 'v1.2.3']);

          expect(result.command).toBe('install');
          expect(result.options.version).toEqual({
            version: 'v1.2.3',
            tag: 'v1.2.3',
          });
        });

        it('should parse version with short flag -v', () => {
          const result = actualParseArgs(['-v', 'v2.0.0']);

          expect(result.command).toBe('install');
          expect(result.options.version).toEqual({
            version: 'v2.0.0',
            tag: 'v2.0.0',
          });
        });
      });

      describe('architecture option', () => {
        it('should parse architecture with --arch flag', () => {
          const result = actualParseArgs(['--arch', Architecture.Arm64]);

          expect(result.command).toBe('install');
          expect(result.options.arch).toBe(Architecture.Arm64);
        });

        it('should parse architecture with short flag -a', () => {
          const result = actualParseArgs(['-a', Architecture.Amd64]);

          expect(result.command).toBe('install');
          expect(result.options.arch).toBe(Architecture.Amd64);
        });
      });

      describe('platform option', () => {
        it('should parse platform with --platform flag', () => {
          const result = actualParseArgs(['--platform', Platform.Windows]);

          expect(result.command).toBe('install');
          expect(result.options.platform).toBe(Platform.Windows);
        });

        it('should parse platform with short flag -p', () => {
          const result = actualParseArgs(['-p', Platform.Mac]);

          expect(result.command).toBe('install');
          expect(result.options.platform).toBe(Platform.Mac);
        });
      });

      describe('error handling', () => {
        it('should throw error for invalid binary choice', () => {
          expect(() => {
            actualParseArgs(['--binaries', 'invalid-binary']);
          }).toThrow('Invalid binary choice');
        });

        it('should throw error for invalid architecture choice', () => {
          expect(() => {
            actualParseArgs(['--arch', 'invalid-arch']);
          }).toThrow('Invalid architecture choice');
        });

        it('should throw error for invalid platform choice', () => {
          expect(() => {
            actualParseArgs(['--platform', 'invalid-platform']);
          }).toThrow('Invalid platform choice');
        });

        it('should throw error for incomplete cache command', () => {
          expect(() => {
            actualParseArgs(['cache']);
          }).toThrow('Incomplete cache command');
        });

        it('should throw error for unknown flags in strict mode', () => {
          expect(() => {
            actualParseArgs(['--unknown-flag']);
          }).toThrow('Unknown flag');
        });
      });

      describe('combined options', () => {
        it('should parse multiple options together', () => {
          const result = actualParseArgs([
            '--binaries',
            'forge',
            'anvil',
            '--repo',
            'custom/repo',
            '--version',
            'v1.0.0',
            '--arch',
            Architecture.Arm64,
            '--platform',
            Platform.Mac,
          ]);

          expect(result.command).toBe('install');
          expect(result.options).toEqual(
            expect.objectContaining({
              binaries: ['forge', 'anvil'],
              repo: 'custom/repo',
              version: { version: 'v1.0.0', tag: 'v1.0.0' },
              arch: Architecture.Arm64,
              platform: Platform.Mac,
            }),
          );
        });
      });

      describe('version string validation', () => {
        it('should accept version strings starting with v followed by digit', () => {
          const result = actualParseArgs(['--version', 'v1']);
          expect(result.command).toBe('install');
          expect(result.options.version.version).toBe('v1');
        });

        it('should accept complex version strings', () => {
          const result = actualParseArgs(['--version', 'v1.2.3-beta.1']);
          expect(result.command).toBe('install');
          expect(result.options.version.version).toBe('v1.2.3-beta.1');
        });
      });
    });
  });
});
