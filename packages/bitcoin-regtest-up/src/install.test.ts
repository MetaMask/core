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
  BITCOIN_REGTEST_DEFAULT_CORE,
  cleanBitcoinRegtestCache,
  getBitcoinRegtestCacheDirectory,
  installBitcoinRegtest,
  parseBitcoinRegtestInstallCliOptions,
  readBitcoinRegtestInstallOptionsFromPackageJson,
} from './install.js';
import type { BitcoinRegtestInstallDependencies } from './install.js';

describe('bitcoin-regtest-up installer', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
    tempDirs = [];
  });

  it('pins a runnable Bitcoin Core release', () => {
    assert.equal(BITCOIN_REGTEST_DEFAULT_CORE.version, '30.2');
    assert.equal(
      BITCOIN_REGTEST_DEFAULT_CORE.platforms['darwin-arm64']?.checksum,
      'c2ecab62891de22228043815cb6211549a32272be3d5d052ff19847d3420bd10',
    );
    assert.equal(
      BITCOIN_REGTEST_DEFAULT_CORE.platforms['linux-x64']?.checksum,
      '6aa7bb4feb699c4c6262dd23e4004191f6df7f373b5d5978b5bcdd4bb72f75d8',
    );
  });

  it('uses the global MetaMask cache when Yarn global cache is enabled', () => {
    const cwd = createTempDir();
    const homeDirectory = join(cwd, 'home');
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: true\n');

    assert.equal(
      getBitcoinRegtestCacheDirectory({ cwd, homeDirectory }),
      join(homeDirectory, '.cache', 'metamask'),
    );
  });

  it('uses the local MetaMask cache when Yarn global cache is disabled', () => {
    const cwd = createTempDir();
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: false\n');

    assert.equal(
      getBitcoinRegtestCacheDirectory({ cwd }),
      join(cwd, '.metamask', 'cache'),
    );
  });

  it('uses the local MetaMask cache when .yarnrc.yml is missing', () => {
    const cwd = createTempDir();

    assert.equal(
      getBitcoinRegtestCacheDirectory({ cwd }),
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
        getBitcoinRegtestCacheDirectory({ cwd }),
        join(cwd, '.metamask', 'cache'),
      );
    } finally {
      chmodSync(yarnRcPath, 0o644);
    }
  });

  it('returns empty installer options when package.json is missing', () => {
    const cwd = createTempDir();

    assert.deepEqual(
      readBitcoinRegtestInstallOptionsFromPackageJson({ cwd }),
      {},
    );
  });

  it('reads pinned installer options from package.json', () => {
    const cwd = createTempDir();
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        bitcoinRegtestUp: {
          bitcoinCore: {
            platforms: {
              'linux-x64': {
                checksum: sha256('bitcoin-core-from-package-json'),
                url: 'https://example.test/bitcoin.tar.gz',
              },
            },
            version: 'test-version',
          },
        },
      }),
    );

    assert.deepEqual(readBitcoinRegtestInstallOptionsFromPackageJson({ cwd }), {
      bitcoinCore: {
        platforms: {
          'linux-x64': {
            checksum: sha256('bitcoin-core-from-package-json'),
            url: 'https://example.test/bitcoin.tar.gz',
          },
        },
        version: 'test-version',
      },
    });
  });

  it('parses installer CLI options', () => {
    assert.deepEqual(
      parseBitcoinRegtestInstallCliOptions([
        '--cache-directory',
        '/tmp/cache',
        '--bin-directory',
        '/tmp/bin',
        '--bitcoin-core-url',
        'https://example.test/bitcoin.tar.gz',
        '--bitcoin-core-checksum',
        'abc123',
      ]),
      {
        binDirectory: '/tmp/bin',
        bitcoinCore: {
          platforms: {
            current: {
              checksum: 'abc123',
              url: 'https://example.test/bitcoin.tar.gz',
            },
          },
        },
        cacheDirectory: '/tmp/cache',
      },
    );
  });

  it('downloads, verifies, caches, and installs Bitcoin Core wrappers', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const downloads: { destination: string; url: string }[] = [];
    const bitcoinCoreContent = 'fake bitcoin core archive';
    const dependencies = createDependencies({ bitcoinCoreContent, downloads });

    const result = await installBitcoinRegtest(
      {
        binDirectory,
        bitcoinCore: {
          platforms: {
            'darwin-arm64': {
              checksum: sha256(bitcoinCoreContent),
              url: 'https://example.test/bitcoin.tar.gz',
            },
          },
          version: 'test-bitcoin',
        },
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
      },
      dependencies,
    );

    assert.equal(result.cacheHit, false);
    assert.equal(result.version, 'test-bitcoin');
    assert.equal(result.bitcoindBinary, join(binDirectory, 'bitcoind'));
    assert.equal(result.bitcoinCliBinary, join(binDirectory, 'bitcoin-cli'));
    assert.ok(existsSync(result.bitcoindBinary));
    assert.ok(existsSync(result.bitcoinCliBinary));
    assert.ok(
      readFileSync(result.bitcoindBinary, 'utf8').includes(
        `const executablePath = ${JSON.stringify(result.sourceBitcoindBinary)};`,
      ),
    );
    assert.deepEqual(
      downloads.map(({ url }) => url),
      ['https://example.test/bitcoin.tar.gz'],
    );

    const wrapperOutput = execFileSync(
      process.execPath,
      [result.bitcoindBinary, '-version'],
      { encoding: 'utf8' },
    );
    assert.equal(wrapperOutput.trim(), 'bitcoind -version');
  });

  it('merges partial bitcoinCore overrides with pinned defaults', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const overrideContent = 'override linux archive';
    const overrideDownloads: { destination: string; url: string }[] = [];
    const defaultDownloads: { destination: string; url: string }[] = [];
    const partialOverride = {
      platforms: {
        'linux-x64': {
          checksum: sha256(overrideContent),
          url: 'https://example.test/override-linux.tar.gz',
        },
      },
      version: 'override-version',
    };

    const overrideResult = await installBitcoinRegtest(
      {
        binDirectory,
        bitcoinCore: partialOverride,
        cacheDirectory,
        cwd,
        platform: 'linux-x64',
      },
      createDependencies({
        bitcoinCoreContent: overrideContent,
        downloads: overrideDownloads,
      }),
    );

    assert.equal(overrideResult.version, 'override-version');
    assert.deepEqual(
      overrideDownloads.map(({ url }) => url),
      ['https://example.test/override-linux.tar.gz'],
    );

    await assert.rejects(
      () =>
        installBitcoinRegtest(
          {
            binDirectory,
            bitcoinCore: partialOverride,
            cacheDirectory,
            cwd,
            platform: 'darwin-arm64',
          },
          {
            downloadFile: async (url, destination): Promise<void> => {
              defaultDownloads.push({ destination, url });
              throw new Error('stop after recording download url');
            },
          },
        ),
      /stop after recording download url/u,
    );
    assert.deepEqual(
      defaultDownloads.map(({ url }) => url),
      [BITCOIN_REGTEST_DEFAULT_CORE.platforms['darwin-arm64']?.url],
    );
  });

  it('exits non-zero when the wrapped executable terminates via a signal', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const bitcoinCoreContent = 'signal-terminated bitcoin core archive';

    const result = await installBitcoinRegtest(
      {
        binDirectory,
        bitcoinCore: {
          platforms: {
            'darwin-arm64': {
              checksum: sha256(bitcoinCoreContent),
              url: 'https://example.test/bitcoin.tar.gz',
            },
          },
        },
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
      },
      createDependencies({ bitcoinCoreContent }),
    );

    writeFileSync(
      result.sourceBitcoindBinary,
      `#!/usr/bin/env node\nprocess.kill(process.pid, 'SIGTERM');\n`,
      { mode: 0o755 },
    );

    assert.throws(
      () => {
        execFileSync(process.execPath, [result.bitcoindBinary, '-version']);
      },
      (error: NodeJS.ErrnoException) =>
        (error.status !== undefined && error.status !== 0) ||
        Boolean(error.signal),
    );
  });

  it('replaces stale bin symlinks without modifying their targets', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const bitcoinCoreContent = 'fake bitcoin core archive';
    const staleBitcoindTarget = join(cwd, 'stale-bitcoind-target');
    const staleBitcoinCliTarget = join(cwd, 'stale-bitcoin-cli-target');

    await mkdir(binDirectory, { recursive: true });
    writeFileSync(staleBitcoindTarget, 'do not overwrite bitcoind');
    writeFileSync(staleBitcoinCliTarget, 'do not overwrite bitcoin-cli');
    symlinkSync(staleBitcoindTarget, join(binDirectory, 'bitcoind'));
    symlinkSync(staleBitcoinCliTarget, join(binDirectory, 'bitcoin-cli'));

    const result = await installBitcoinRegtest(
      {
        binDirectory,
        bitcoinCore: {
          platforms: {
            'darwin-arm64': {
              checksum: sha256(bitcoinCoreContent),
              url: 'https://example.test/bitcoin.tar.gz',
            },
          },
        },
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
      },
      createDependencies({ bitcoinCoreContent }),
    );

    assert.equal(
      readFileSync(staleBitcoindTarget, 'utf8'),
      'do not overwrite bitcoind',
    );
    assert.equal(
      readFileSync(staleBitcoinCliTarget, 'utf8'),
      'do not overwrite bitcoin-cli',
    );
    assert.equal(lstatSync(result.bitcoindBinary).isSymbolicLink(), false);
    assert.equal(lstatSync(result.bitcoinCliBinary).isSymbolicLink(), false);
  });

  it('installs a bitcoind wrapper for Bitcoin Core archives that ship bitcoin-node', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const bitcoinCoreContent = 'fake bitcoin core archive with bitcoin-node';

    const result = await installBitcoinRegtest(
      {
        binDirectory,
        bitcoinCore: {
          platforms: {
            'darwin-arm64': {
              checksum: sha256(bitcoinCoreContent),
              url: 'https://example.test/bitcoin.tar.gz',
            },
          },
          version: 'test-bitcoin-node',
        },
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
      },
      createDependencies({
        bitcoinCoreContent,
        daemonBinaryName: 'bitcoin-node',
      }),
    );

    assert.ok(result.sourceBitcoindBinary.endsWith('/libexec/bitcoin-node'));
    assert.ok(existsSync(result.bitcoindBinary));

    const wrapperOutput = execFileSync(
      process.execPath,
      [result.bitcoindBinary, '-version'],
      { encoding: 'utf8' },
    );
    assert.equal(wrapperOutput.trim(), 'bitcoin-node -version');
  });

  it('installs a bitcoind wrapper for Bitcoin Core archives that ship the bitcoin launcher', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const bitcoinCoreContent =
      'fake bitcoin core archive with bitcoin launcher';

    const result = await installBitcoinRegtest(
      {
        binDirectory,
        bitcoinCore: {
          platforms: {
            'darwin-arm64': {
              checksum: sha256(bitcoinCoreContent),
              url: 'https://example.test/bitcoin.tar.gz',
            },
          },
          version: 'test-bitcoin-launcher',
        },
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
      },
      createDependencies({
        bitcoinCoreContent,
        daemonBinaryName: 'bitcoin',
      }),
    );

    assert.ok(result.sourceBitcoindBinary.endsWith('/bin/bitcoin'));
    assert.ok(existsSync(result.bitcoindBinary));

    const wrapperOutput = execFileSync(
      process.execPath,
      [result.bitcoindBinary, '-version'],
      { encoding: 'utf8' },
    );
    assert.equal(wrapperOutput.trim(), 'bitcoin node -version');
  });

  it('reuses cached Bitcoin Core artifacts without downloading again', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const bitcoinCoreContent = 'cached bitcoin core archive';
    const bitcoinCore = {
      platforms: {
        'linux-x64': {
          checksum: sha256(bitcoinCoreContent),
          url: 'https://example.test/bitcoin.tar.gz',
        },
      },
      version: 'cached-version',
    };

    await installBitcoinRegtest(
      { binDirectory, bitcoinCore, cacheDirectory, cwd, platform: 'linux-x64' },
      createDependencies({ bitcoinCoreContent }),
    );

    const result = await installBitcoinRegtest(
      { binDirectory, bitcoinCore, cacheDirectory, cwd, platform: 'linux-x64' },
      {
        downloadFile: async (): Promise<void> => {
          throw new Error('cache miss');
        },
      },
    );

    assert.equal(result.cacheHit, true);
  });

  it('replaces cached Bitcoin Core artifacts when the daemon is not runnable', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const bitcoinCoreContent = 'fresh bitcoin core archive';
    const checksum = sha256(bitcoinCoreContent);
    const url = 'https://example.test/bitcoin.tar.gz';
    const cacheKey = sha256(`${url}:${checksum}`);
    const cachedBinDirectory = join(
      cacheDirectory,
      'bitcoin-regtest-up',
      'bitcoin-core',
      cacheKey,
      'bitcoin-30.2',
      'bin',
    );
    const downloads: { destination: string; url: string }[] = [];

    await mkdir(cachedBinDirectory, { recursive: true });
    await writeFile(
      join(cachedBinDirectory, '..', '..', '.source-checksum'),
      checksum,
    );
    await writeFile(
      join(cachedBinDirectory, 'bitcoin'),
      '#!/usr/bin/env node\nprocess.exit(1);\n',
      { mode: 0o755 },
    );
    await writeExecutable(
      join(cachedBinDirectory, 'bitcoin-cli'),
      'bitcoin-cli',
    );

    const result = await installBitcoinRegtest(
      {
        binDirectory,
        bitcoinCore: {
          platforms: {
            'darwin-arm64': {
              checksum,
              url,
            },
          },
          version: 'cached-version',
        },
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
      },
      createDependencies({ bitcoinCoreContent, downloads }),
    );

    assert.equal(result.cacheHit, false);
    assert.equal(downloads.length, 1);
    assert.ok(result.sourceBitcoindBinary.endsWith('/bin/bitcoind'));
  });

  it('cleans only the bitcoin-regtest-up cache namespace', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    await mkdir(join(cacheDirectory, 'bitcoin-regtest-up', 'old'), {
      recursive: true,
    });
    await mkdir(join(cacheDirectory, 'foundryup', 'kept'), {
      recursive: true,
    });

    await cleanBitcoinRegtestCache({ cacheDirectory, cwd });

    assert.equal(existsSync(join(cacheDirectory, 'bitcoin-regtest-up')), false);
    assert.equal(existsSync(join(cacheDirectory, 'foundryup', 'kept')), true);
  });

  function createTempDir(): string {
    const tempDir = mkdtempSync(join(tmpdir(), 'bitcoin-regtest-up-test-'));
    tempDirs.push(tempDir);
    return tempDir;
  }
});

function createDependencies({
  bitcoinCoreContent,
  daemonBinaryName = 'bitcoind',
  downloads = [],
}: {
  bitcoinCoreContent: string;
  daemonBinaryName?: string;
  downloads?: { destination: string; url: string }[];
}): BitcoinRegtestInstallDependencies {
  return {
    downloadFile: async (url, destination): Promise<void> => {
      downloads.push({ destination, url });
      await writeFile(destination, bitcoinCoreContent);
    },
    extractArchive: async (_archivePath, destination): Promise<void> => {
      const binDirectory = join(destination, 'bitcoin-30.2', 'bin');
      const libexecDirectory = join(destination, 'bitcoin-30.2', 'libexec');
      await mkdir(binDirectory, { recursive: true });
      await mkdir(libexecDirectory, { recursive: true });
      await writeExecutable(
        join(
          daemonBinaryName === 'bitcoin-node' ? libexecDirectory : binDirectory,
          daemonBinaryName,
        ),
        daemonBinaryName,
      );
      await writeExecutable(join(binDirectory, 'bitcoin-cli'), 'bitcoin-cli');
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
