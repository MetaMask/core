/* eslint-disable jest/expect-expect, n/no-sync */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  SOLANA_TEST_VALIDATOR_DEFAULT_RELEASE,
  cleanSolanaTestValidatorCache,
  getSolanaTestValidatorCacheDirectory,
  installSolanaTestValidator,
  parseSolanaTestValidatorInstallCliOptions,
  readSolanaTestValidatorInstallOptionsFromPackageJson,
} from './install.js';
import type { SolanaTestValidatorInstallDependencies } from './install.js';

describe('solana-test-validator-up installer', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
    tempDirs = [];
  });

  it('pins an Agave release with Solana validator archives', () => {
    assert.equal(SOLANA_TEST_VALIDATOR_DEFAULT_RELEASE.version, 'v3.1.14');
    assert.equal(
      SOLANA_TEST_VALIDATOR_DEFAULT_RELEASE.platforms['darwin-arm64']?.checksum,
      '54cfc2680bd6426fda04619ee01933f40a649c8056f3a61ba20dc54dd427ebed',
    );
    assert.equal(
      SOLANA_TEST_VALIDATOR_DEFAULT_RELEASE.platforms['linux-x64']?.checksum,
      '06f97c065cc977cbec2f13ffc9bc9d3b92fef485431fcb370a269de69532ef51',
    );
  });

  it('uses the global MetaMask cache when Yarn global cache is enabled', () => {
    const cwd = createTempDir();
    const homeDirectory = join(cwd, 'home');
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: true\n');

    assert.equal(
      getSolanaTestValidatorCacheDirectory({ cwd, homeDirectory }),
      join(homeDirectory, '.cache', 'metamask'),
    );
  });

  it('uses the local MetaMask cache when Yarn global cache is disabled', () => {
    const cwd = createTempDir();
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: false\n');

    assert.equal(
      getSolanaTestValidatorCacheDirectory({ cwd }),
      join(cwd, '.metamask', 'cache'),
    );
  });

  it('uses the local MetaMask cache when .yarnrc.yml is missing', () => {
    const cwd = createTempDir();

    assert.equal(
      getSolanaTestValidatorCacheDirectory({ cwd }),
      join(cwd, '.metamask', 'cache'),
    );
  });

  it('uses the local MetaMask cache when .yarnrc.yml is unreadable', () => {
    const cwd = createTempDir();
    const yarnRcPath = join(cwd, '.yarnrc.yml');
    writeFileSync(yarnRcPath, 'enableGlobalCache: true\n');
    chmodSync(yarnRcPath, 0o000);

    try {
      assert.equal(
        getSolanaTestValidatorCacheDirectory({ cwd }),
        join(cwd, '.metamask', 'cache'),
      );
    } finally {
      chmodSync(yarnRcPath, 0o644);
    }
  });

  it('returns empty options when package.json is absent', () => {
    const cwd = createTempDir();

    assert.deepEqual(
      readSolanaTestValidatorInstallOptionsFromPackageJson({ cwd }),
      {},
    );
  });

  it('reads pinned installer options from package.json', () => {
    const cwd = createTempDir();
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        solanaTestValidatorUp: {
          release: {
            platforms: {
              'linux-x64': {
                checksum:
                  '06f97c065cc977cbec2f13ffc9bc9d3b92fef485431fcb370a269de69532ef51',
                url: 'https://example.test/solana-release.tar.bz2',
              },
            },
            version: 'test-version',
          },
        },
      }),
    );

    assert.deepEqual(
      readSolanaTestValidatorInstallOptionsFromPackageJson({ cwd }),
      {
        release: {
          platforms: {
            'linux-x64': {
              checksum:
                '06f97c065cc977cbec2f13ffc9bc9d3b92fef485431fcb370a269de69532ef51',
              url: 'https://example.test/solana-release.tar.bz2',
            },
          },
          version: 'test-version',
        },
      },
    );
  });

  it('parses installer CLI options', () => {
    assert.deepEqual(
      parseSolanaTestValidatorInstallCliOptions([
        '--cache-directory',
        '/tmp/cache',
        '--bin-directory',
        '/tmp/bin',
        '--release-url',
        'https://example.test/solana-release.tar.bz2',
        '--release-checksum',
        'abc123',
      ]),
      {
        binDirectory: '/tmp/bin',
        cacheDirectory: '/tmp/cache',
        release: {
          platforms: {
            current: {
              checksum: 'abc123',
              url: 'https://example.test/solana-release.tar.bz2',
            },
          },
        },
      },
    );
  });

  it('merges partial release overrides with pinned defaults', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const downloads: { destination: string; url: string }[] = [];
    const releaseContent = 'fake solana release archive';
    const customUrl = 'https://example.test/custom-darwin-arm64.tar.bz2';
    const partialRelease = {
      platforms: {
        'darwin-arm64': {
          checksum: sha256(releaseContent),
          url: customUrl,
        },
      },
    };

    await installSolanaTestValidator(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
        release: partialRelease,
      },
      createDependencies({ downloads, releaseContent }),
    );

    assert.equal(downloads[0]?.url, customUrl);

    downloads.length = 0;

    await assert.rejects(async () => {
      await installSolanaTestValidator(
        {
          binDirectory,
          cacheDirectory,
          cwd,
          platform: 'linux-x64',
          release: partialRelease,
        },
        createDependencies({ downloads, releaseContent }),
      );
    }, /checksum mismatch/u);

    assert.equal(
      downloads[0]?.url,
      SOLANA_TEST_VALIDATOR_DEFAULT_RELEASE.platforms['linux-x64']?.url,
    );
  });

  it('downloads, verifies, caches, and installs Solana CLI wrappers', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const downloads: { destination: string; url: string }[] = [];
    const releaseContent = 'fake solana release archive';
    const dependencies = createDependencies({ downloads, releaseContent });

    const result = await installSolanaTestValidator(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
        release: {
          platforms: {
            'darwin-arm64': {
              checksum: sha256(releaseContent),
              url: 'https://example.test/solana-release-aarch64.tar.bz2',
            },
          },
          version: 'test-solana',
        },
      },
      dependencies,
    );

    assert.equal(result.cacheHit, false);
    assert.equal(result.version, 'test-solana');
    assert.equal(
      result.binaryPath,
      join(binDirectory, 'solana-test-validator'),
    );
    assert.ok(result.solanaBinary.endsWith('/bin/solana'));
    assert.ok(result.validatorBinary.endsWith('/bin/solana-test-validator'));
    assert.ok(existsSync(result.binaryPath));
    assert.deepEqual(
      downloads.map(({ url }) => url),
      ['https://example.test/solana-release-aarch64.tar.bz2'],
    );

    const wrapperOutput = execFileSync(
      process.execPath,
      [result.binaryPath, '--version'],
      { encoding: 'utf8' },
    );
    assert.equal(wrapperOutput.trim(), 'solana-test-validator --version');
  });

  it('exits non-zero when the child terminates via a signal', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const releaseContent = 'fake solana release archive';
    const dependencies: SolanaTestValidatorInstallDependencies = {
      ...createDependencies({ releaseContent }),
      extractArchive: async (_archivePath, destination): Promise<void> => {
        const solanaBinDirectory = join(destination, 'solana-release', 'bin');
        await mkdir(solanaBinDirectory, { recursive: true });
        await writeFile(
          join(solanaBinDirectory, 'solana-test-validator'),
          "#!/usr/bin/env node\nprocess.kill(process.pid, 'SIGTERM');\n",
          { mode: 0o755 },
        );
        await writeExecutable(join(solanaBinDirectory, 'solana'), 'solana');
      },
    };

    const result = await installSolanaTestValidator(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
        release: {
          platforms: {
            'darwin-arm64': {
              checksum: sha256(releaseContent),
              url: 'https://example.test/solana-release-aarch64.tar.bz2',
            },
          },
        },
      },
      dependencies,
    );

    assert.throws(
      () => {
        execFileSync(process.execPath, [result.binaryPath], {
          stdio: 'ignore',
        });
      },
      (error: NodeJS.ErrnoException) => {
        assert.ok(error.status === 1 || error.signal !== undefined);
        return true;
      },
    );
  });

  it('replaces stale bin symlinks without modifying their targets', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const releaseContent = 'fake solana release archive';
    const staleValidatorTarget = join(cwd, 'stale-validator-target');
    const staleSolanaTarget = join(cwd, 'stale-solana-target');

    await mkdir(binDirectory, { recursive: true });
    writeFileSync(staleValidatorTarget, 'do not overwrite validator');
    writeFileSync(staleSolanaTarget, 'do not overwrite solana');
    symlinkSync(
      staleValidatorTarget,
      join(binDirectory, 'solana-test-validator'),
    );
    symlinkSync(staleSolanaTarget, join(binDirectory, 'solana'));

    const result = await installSolanaTestValidator(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
        release: {
          platforms: {
            'darwin-arm64': {
              checksum: sha256(releaseContent),
              url: 'https://example.test/solana-release-aarch64.tar.bz2',
            },
          },
        },
      },
      createDependencies({ releaseContent }),
    );

    assert.equal(
      readFileSync(staleValidatorTarget, 'utf8'),
      'do not overwrite validator',
    );
    assert.equal(
      readFileSync(staleSolanaTarget, 'utf8'),
      'do not overwrite solana',
    );
    assert.equal(lstatSync(result.binaryPath).isSymbolicLink(), false);
    assert.equal(
      lstatSync(join(binDirectory, 'solana')).isSymbolicLink(),
      false,
    );
  });

  it('reuses cached release artifacts without downloading again', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const releaseContent = 'cached solana release archive';
    const release = {
      platforms: {
        'linux-x64': {
          checksum: sha256(releaseContent),
          url: 'https://example.test/solana-release.tar.bz2',
        },
      },
      version: 'cached-version',
    };

    await installSolanaTestValidator(
      { binDirectory, cacheDirectory, cwd, platform: 'linux-x64', release },
      createDependencies({ releaseContent }),
    );

    const result = await installSolanaTestValidator(
      { binDirectory, cacheDirectory, cwd, platform: 'linux-x64', release },
      {
        downloadFile: async (): Promise<void> => {
          throw new Error('cache miss');
        },
      },
    );

    assert.equal(result.cacheHit, true);
  });

  it('cleans only the solana-test-validator-up cache namespace', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    await mkdir(join(cacheDirectory, 'solana-test-validator-up', 'old'), {
      recursive: true,
    });
    await mkdir(join(cacheDirectory, 'foundryup', 'kept'), {
      recursive: true,
    });

    await cleanSolanaTestValidatorCache({ cacheDirectory, cwd });

    assert.equal(
      existsSync(join(cacheDirectory, 'solana-test-validator-up')),
      false,
    );
    assert.equal(existsSync(join(cacheDirectory, 'foundryup', 'kept')), true);
  });

  function createTempDir(): string {
    const tempDir = mkdtempSync(
      join(tmpdir(), 'solana-test-validator-up-test-'),
    );
    tempDirs.push(tempDir);
    return tempDir;
  }
});

function createDependencies({
  downloads = [],
  releaseContent,
}: {
  downloads?: { destination: string; url: string }[];
  releaseContent: string;
}): SolanaTestValidatorInstallDependencies {
  return {
    downloadFile: async (url, destination): Promise<void> => {
      downloads.push({ destination, url });
      await writeFile(destination, releaseContent);
    },
    extractArchive: async (_archivePath, destination): Promise<void> => {
      const binDirectory = join(destination, 'solana-release', 'bin');
      await mkdir(binDirectory, { recursive: true });
      await writeExecutable(
        join(binDirectory, 'solana-test-validator'),
        'solana-test-validator',
      );
      await writeExecutable(join(binDirectory, 'solana'), 'solana');
    },
  };
}

async function writeExecutable(path: string, name: string): Promise<void> {
  await writeFile(
    path,
    `#!/usr/bin/env node\nconsole.log(${JSON.stringify(name)} + ' ' + process.argv.slice(2).join(' '));\n`,
    { mode: 0o755 },
  );
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
