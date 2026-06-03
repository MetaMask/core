import nock from 'nock';
/* eslint-disable n/no-sync */
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
  readdirSync,
  mkdirSync,
} from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  JAVA_TRON_DEFAULT_FULL_NODE,
  cleanJavaTronCache,
  getJavaTronCacheDirectory,
  installJavaTron,
  parseJavaTronInstallCliOptions,
  readJavaTronInstallOptionsFromPackageJson,
} from './install';
import type {
  JavaTronInstallDependencies,
  JavaTronInstallResult,
} from './install';

jest.mock('node:os', () => ({
  ...jest.requireActual('node:os'),
  platform: (): string => 'darwin',
  arch: (): string => 'arm64',
}));

describe('java-tron-up installer', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
    tempDirs = [];
  });

  it('pins the current latest java-tron release', () => {
    expect(JAVA_TRON_DEFAULT_FULL_NODE.version).toBe('GreatVoyage-v4.8.1');
    expect(
      JAVA_TRON_DEFAULT_FULL_NODE.platforms['darwin-arm64']?.checksum,
    ).toBe('694431860ee76fc986ed495f9ec19f29ed3bd752a394386e7b3b9886b2292f59');
    expect(JAVA_TRON_DEFAULT_FULL_NODE.platforms['linux-x64']?.checksum).toBe(
      '0e67b2fe75d7077750e73c4fa20725c6e9824657275d96be256ae5da681f9945',
    );
  });

  it('uses the local MetaMask cache when Yarn global cache is disabled', () => {
    const cwd = createTempDir();
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: false\n');

    expect(getJavaTronCacheDirectory({ cwd })).toBe(
      join(cwd, '.metamask', 'cache'),
    );
  });

  it('reads pinned installer options from package.json', () => {
    const cwd = createTempDir();
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        javaTronUp: {
          fullNode: {
            platforms: {
              'linux-x64': {
                checksum: sha256('jar-from-package-json'),
                url: 'https://example.test/FullNode.jar',
              },
            },
            version: 'test-version',
          },
        },
      }),
    );

    expect(readJavaTronInstallOptionsFromPackageJson({ cwd })).toStrictEqual({
      fullNode: {
        platforms: {
          'linux-x64': {
            checksum: sha256('jar-from-package-json'),
            url: 'https://example.test/FullNode.jar',
          },
        },
        version: 'test-version',
      },
    });
  });

  it('parses installer CLI options', () => {
    expect(
      parseJavaTronInstallCliOptions([
        '--cache-directory',
        '/tmp/cache',
        '--bin-directory',
        '/tmp/bin',
        '--full-node-url',
        'https://example.test/FullNode.jar',
        '--full-node-checksum',
        'abc123',
        '--java-runtime-checksum',
        'def456',
        '--java-runtime-url',
        'https://jre.example.test/download',
        '--platform',
        'darwin-arm64',
      ]),
    ).toStrictEqual({
      binDirectory: '/tmp/bin',
      cacheDirectory: '/tmp/cache',
      fullNode: {
        platforms: {
          current: {
            checksum: 'abc123',
            url: 'https://example.test/FullNode.jar',
          },
        },
      },
      javaRuntime: {
        platforms: {
          current: {
            checksum: 'def456',
            url: 'https://jre.example.test/download',
          },
        },
      },
      platform: 'darwin-arm64',
    });
  });

  it('throws if invalid CLI option', () => {
    expect(() =>
      parseJavaTronInstallCliOptions([
        '--cache-directory',
        '/tmp/cache',
        '--bin-directory',
        '/tmp/bin',
        '--full-node-url',
        'https://example.test/FullNode.jar',
        '--full-node-checksum',
        'abc123',
        '--java-runtime-checksum',
        'def456',
        '--java-runtime-url',
        'https://jre.example.test/download',
        '--platform',
        'darwin-arm64',
        '--invalid',
        'option',
      ]),
    ).toThrow('Unknown java-tron-up install option: --invalid');
  });

  it('throws if CLI full-node options have checksum but no url', () => {
    expect(() =>
      parseJavaTronInstallCliOptions(['--full-node-checksum', 'abc123']),
    ).toThrow('FullNode CLI options require both a URL and a checksum.');
  });

  it('throws if CLI java-runtime options have checksum but no url', () => {
    expect(() =>
      parseJavaTronInstallCliOptions(['--java-runtime-checksum', 'abc123']),
    ).toThrow('Java runtime CLI options require both a URL and a checksum.');
  });

  it('throws if CLI option is missing a value', () => {
    expect(() => parseJavaTronInstallCliOptions(['--full-node-url'])).toThrow(
      '--full-node-url requires a value.',
    );
  });

  it('throws if CLI full-node options are incomplete', () => {
    expect(() =>
      parseJavaTronInstallCliOptions([
        '--full-node-url',
        'https://x.test/x.jar',
      ]),
    ).toThrow('FullNode CLI options require both a URL and a checksum.');
  });

  it('throws if no platform config found', async () => {
    await expect(
      installJavaTron({
        platform: 'firefox-os-x64',
        fullNode: { platforms: {} },
      }),
    ).rejects.toThrow(
      'No java-tron FullNode is configured for firefox-os-x64.',
    );
  });

  it('uses home cache when enableGlobalCache is true', () => {
    const cwd = createTempDir();
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: true\n');
    expect(
      getJavaTronCacheDirectory({ cwd, homeDirectory: '/fake/home' }),
    ).toBe('/fake/home/.cache/metamask');
  });

  it('downloads, verifies, caches, and installs the java-tron wrapper', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const downloads: { destination: string; url: string }[] = [];
    const fullNodeContent = 'fake fullnode jar';
    const javaArchiveContent = 'fake java archive';
    const dependencies = createDependencies({
      downloads,
      fullNodeContent,
      javaArchiveContent,
    });

    const result = await runInstallJavaTron({
      fullNodeContent,
      javaArchiveContent,
      dependencies,
      binDirectory,
      cacheDirectory,
      cwd,
      platform: 'darwin-arm64',
    });

    expect(result.cacheHit).toBe(false);
    expect(result.version).toBe('test-java-tron');
    expect(result.binaryPath).toBe(join(binDirectory, 'java-tron'));
    expect(readFileSync(result.fullNodeJar, 'utf8')).toBe(fullNodeContent);
    expect(result.javaBinary).toMatch(/\/bin\/java$/u);
    expect(existsSync(result.binaryPath)).toBe(true);
    expect(downloads.map(({ url }) => url)).toStrictEqual([
      'https://example.test/java.tar.gz',
      'https://example.test/FullNode-aarch64.jar',
    ]);

    const wrapperOutput = execFileSync(
      process.execPath,
      [result.binaryPath, '-v'],
      {
        encoding: 'utf8',
      },
    );
    expect(wrapperOutput.trim()).toBe('java -jar FullNode.jar -v');
  });

  it('downloads, verifies, caches, and installs the java-tron wrapper without downloadFile dep', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const downloads: { destination: string; url: string }[] = [];
    const fullNodeContent = 'fake fullnode jar';
    const javaArchiveContent = 'fake java archive';
    const dependencies = createDependencies({
      downloads,
      fullNodeContent,
      javaArchiveContent,
    });

    nock('https://example.test')
      .get('/java.tar.gz')
      .reply(200, javaArchiveContent);

    nock('https://example.test')
      .get('/FullNode-aarch64.jar')
      .reply(200, fullNodeContent);

    const result = await runInstallJavaTron({
      fullNodeContent,
      javaArchiveContent,
      dependencies: {
        extractArchive: dependencies.extractArchive,
      },
      binDirectory,
      cacheDirectory,
      cwd,
      platform: 'darwin-arm64',
    });

    expect(result.cacheHit).toBe(false);
    expect(result.version).toBe('test-java-tron');
    expect(result.binaryPath).toBe(join(binDirectory, 'java-tron'));
    expect(readFileSync(result.fullNodeJar, 'utf8')).toBe(fullNodeContent);
    expect(result.javaBinary).toMatch(/\/bin\/java$/u);
    expect(existsSync(result.binaryPath)).toBe(true);
    // dependencies.downloadFile didn't run. downloadFileFromUrl did instead.
    expect(downloads.map(({ url }) => url)).toStrictEqual([]);

    const wrapperOutput = execFileSync(
      process.execPath,
      [result.binaryPath, '-v'],
      {
        encoding: 'utf8',
      },
    );
    expect(wrapperOutput.trim()).toBe('java -jar FullNode.jar -v');
  });

  it('throws on non-200 HTTP response', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const fullNodeContent = 'fake fullnode jar';
    const javaArchiveContent = 'fake java archive';
    const dependencies = createDependencies({
      fullNodeContent,
      javaArchiveContent,
    });

    nock('https://example.test').get('/java.tar.gz').reply(404, '');

    await expect(
      runInstallJavaTron({
        fullNodeContent,
        javaArchiveContent,
        dependencies: { extractArchive: dependencies.extractArchive },
        binDirectory,
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
      }),
    ).rejects.toThrow(
      'Request to https://example.test/java.tar.gz failed with 404',
    );
  });

  it('follows HTTP redirects when downloading', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const fullNodeContent = 'fake fullnode jar';
    const javaArchiveContent = 'fake java archive';
    const dependencies = createDependencies({
      fullNodeContent,
      javaArchiveContent,
    });

    nock('https://example.test').get('/java.tar.gz').reply(301, '', {
      location: 'https://example.test/java-redirected.tar.gz',
    });
    nock('https://example.test')
      .get('/java-redirected.tar.gz')
      .reply(200, javaArchiveContent);
    nock('https://example.test')
      .get('/FullNode-aarch64.jar')
      .reply(200, fullNodeContent);

    const result = await runInstallJavaTron({
      fullNodeContent,
      javaArchiveContent,
      dependencies: { extractArchive: dependencies.extractArchive },
      binDirectory,
      cacheDirectory,
      cwd,
      platform: 'darwin-arm64',
    });

    expect(result.cacheHit).toBe(false);
    expect(existsSync(result.binaryPath)).toBe(true);
  });

  it('throws on too many redirects', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const fullNodeContent = 'fake fullnode jar';
    const javaArchiveContent = 'fake java archive';
    const dependencies = createDependencies({
      fullNodeContent,
      javaArchiveContent,
    });

    for (let i = 0; i < 6; i++) {
      nock('https://example.test')
        .get('/java.tar.gz')
        .reply(301, '', { location: 'https://example.test/java.tar.gz' });
    }

    await expect(
      runInstallJavaTron({
        fullNodeContent,
        javaArchiveContent,
        dependencies: { extractArchive: dependencies.extractArchive },
        binDirectory,
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
      }),
    ).rejects.toThrow('Too many redirects downloading');
  });

  it('throws on checksum mismatch', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const dependencies = createDependencies({
      fullNodeContent: 'fake fullnode jar',
      javaArchiveContent: 'fake java archive',
    });

    await expect(
      installJavaTron(
        {
          binDirectory,
          cacheDirectory,
          cwd,
          platform: 'darwin-arm64',
          javaRuntime: {
            platforms: {
              'darwin-arm64': {
                checksum: 'wrongchecksum',
                url: 'https://example.test/java.tar.gz',
              },
            },
          },
          fullNode: {
            platforms: {
              'darwin-arm64': {
                checksum: sha256('fake fullnode jar'),
                url: 'https://example.test/FullNode-aarch64.jar',
              },
            },
          },
        },
        dependencies,
      ),
    ).rejects.toThrow('Downloaded Java runtime checksum mismatch.');
  });

  it('rethrows non-ENOENT unlink errors', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const fullNodeContent = 'fake fullnode jar';
    const javaArchiveContent = 'fake java archive';

    await mkdir(binDirectory, { recursive: true });
    writeFileSync(join(binDirectory, 'java-tron'), 'existing');
    chmodSync(binDirectory, 0o444); // read-only dir, unlink will fail with EACCES

    await expect(
      runInstallJavaTron({
        fullNodeContent,
        javaArchiveContent,
        dependencies: createDependencies({
          fullNodeContent,
          javaArchiveContent,
        }),
        binDirectory,
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
      }),
    ).rejects.toThrow('EACCES: permission denied');

    chmodSync(binDirectory, 0o755); // restore so cleanup works
  });

  it('downloads, verifies, caches, and installs the java-tron wrapper without the extractArchive dep', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const downloads: { destination: string; url: string }[] = [];
    const fullNodeContent = 'fake fullnode jar';
    const javaArchiveContent = await createJavaArchive(createTempDir());
    const dependencies = createDependencies({
      downloads,
      fullNodeContent,
      javaArchiveContent,
    });

    const result = await runInstallJavaTron({
      fullNodeContent,
      javaArchiveContent,
      dependencies: {
        downloadFile: dependencies.downloadFile,
      },
      binDirectory,
      cacheDirectory,
      cwd,
      platform: 'darwin-arm64',
    });

    expect(result.cacheHit).toBe(false);
    expect(result.version).toBe('test-java-tron');
    expect(result.binaryPath).toBe(join(binDirectory, 'java-tron'));
    expect(readFileSync(result.fullNodeJar, 'utf8')).toBe(fullNodeContent);
    expect(result.javaBinary).toMatch(/\/bin\/java$/u);
    expect(existsSync(result.binaryPath)).toBe(true);
    expect(downloads.map(({ url }) => url)).toStrictEqual([
      'https://example.test/java.tar.gz',
      'https://example.test/FullNode-aarch64.jar',
    ]);

    const wrapperOutput = execFileSync(
      process.execPath,
      [result.binaryPath, '-v'],
      {
        encoding: 'utf8',
      },
    );
    expect(wrapperOutput.trim()).toBe('java -jar FullNode.jar -v');
  });

  it('downloads, verifies, caches, and installs the java-tron wrapper without input platform', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const downloads: { destination: string; url: string }[] = [];
    const fullNodeContent = 'fake fullnode jar';
    const javaArchiveContent = 'fake java archive';
    const dependencies = createDependencies({
      downloads,
      fullNodeContent,
      javaArchiveContent,
    });

    const result = await runInstallJavaTron({
      fullNodeContent,
      javaArchiveContent,
      dependencies,
      binDirectory,
      cacheDirectory,
      cwd,
    });

    expect(result.cacheHit).toBe(false);
    expect(result.version).toBe('test-java-tron');
    expect(result.binaryPath).toBe(join(binDirectory, 'java-tron'));
    expect(readFileSync(result.fullNodeJar, 'utf8')).toBe(fullNodeContent);
    expect(result.javaBinary).toMatch(/\/bin\/java$/u);
    expect(existsSync(result.binaryPath)).toBe(true);
    expect(downloads.map(({ url }) => url)).toStrictEqual([
      'https://example.test/java.tar.gz',
      'https://example.test/FullNode-aarch64.jar',
    ]);

    const wrapperOutput = execFileSync(
      process.execPath,
      [result.binaryPath, '-v'],
      {
        encoding: 'utf8',
      },
    );
    expect(wrapperOutput.trim()).toBe('java -jar FullNode.jar -v');
  });

  it('throws in installJavaRuntime and cleans up when incorrect archive', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const downloads: { destination: string; url: string }[] = [];
    const fullNodeContent = 'fake fullnode jar';
    const javaArchiveContent = 'fake java archive';
    const dependencies = createDependencies({
      downloads,
      fullNodeContent,
      javaArchiveContent,
    });

    await expect(
      runInstallJavaTron({
        fullNodeContent,
        javaArchiveContent,
        dependencies: {
          downloadFile: dependencies.downloadFile,
          extractArchive: jest.fn(),
        },
        binDirectory,
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
      }),
    ).rejects.toThrow(
      'Java runtime archive for darwin-arm64 did not contain bin/java.',
    );

    // Expect cleanup
    const javaCacheDir = join(cacheDirectory, 'java-tron-up', 'java');
    const entries = existsSync(javaCacheDir) ? readdirSync(javaCacheDir) : [];
    expect(entries).toHaveLength(0);
  });

  it('throws in installFullNodeJar and cleans up when error', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const downloads: { destination: string; url: string }[] = [];
    const fullNodeContent = 'fake fullnode jar';
    const javaArchiveContent = 'fake java archive';
    const dependencies = createDependencies({
      downloads,
      fullNodeContent,
      javaArchiveContent,
    });

    await expect(
      runInstallJavaTron({
        fullNodeContent,
        javaArchiveContent,
        dependencies: {
          downloadFile: async (url, destination) => {
            // To fail only for installFullNodeJar
            if (url.includes('FullNode')) {
              throw new Error('custom error');
            }
            await writeFile(destination, javaArchiveContent);
          },
          extractArchive: dependencies.extractArchive,
        },
        binDirectory,
        cacheDirectory,
        cwd,
        platform: 'darwin-arm64',
      }),
    ).rejects.toThrow('custom error');

    // Expect cleanup
    const fullNodeCacheDir = join(cacheDirectory, 'java-tron-up', 'fullnode');
    const entries = existsSync(fullNodeCacheDir)
      ? readdirSync(fullNodeCacheDir)
      : [];
    expect(entries).toHaveLength(0);
  });

  it('replaces stale bin symlinks without modifying their targets', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const fullNodeContent = 'fake fullnode jar';
    const javaArchiveContent = 'fake java archive';
    const staleTarget = join(cwd, 'stale-java-tron-target');

    await mkdir(binDirectory, { recursive: true });
    writeFileSync(staleTarget, 'do not overwrite');
    symlinkSync(staleTarget, join(binDirectory, 'java-tron'));

    const result = await installJavaTron(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        fullNode: {
          platforms: {
            'darwin-arm64': {
              checksum: sha256(fullNodeContent),
              url: 'https://example.test/FullNode-aarch64.jar',
            },
          },
        },
        javaRuntime: {
          platforms: {
            'darwin-arm64': {
              checksum: sha256(javaArchiveContent),
              url: 'https://example.test/java.tar.gz',
            },
          },
        },
        platform: 'darwin-arm64',
      },
      createDependencies({ fullNodeContent, javaArchiveContent }),
    );

    expect(readFileSync(staleTarget, 'utf8')).toBe('do not overwrite');
    expect(lstatSync(result.binaryPath).isSymbolicLink()).toBe(false);
  });

  it('reuses cached artifacts without downloading again', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const fullNodeContent = 'cached fullnode jar';
    const javaArchiveContent = 'cached java archive';

    await installJavaTron(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        fullNode: {
          platforms: {
            'linux-x64': {
              checksum: sha256(fullNodeContent),
              url: 'https://example.test/FullNode.jar',
            },
          },
          version: 'cached-version',
        },
        javaRuntime: {
          platforms: {
            'linux-x64': {
              checksum: sha256(javaArchiveContent),
              url: 'https://example.test/java.tar.gz',
            },
          },
          version: 'cached-java',
        },
        platform: 'linux-x64',
      },
      createDependencies({ fullNodeContent, javaArchiveContent }),
    );

    const result = await installJavaTron(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        fullNode: {
          platforms: {
            'linux-x64': {
              checksum: sha256(fullNodeContent),
              url: 'https://example.test/FullNode.jar',
            },
          },
          version: 'cached-version',
        },
        javaRuntime: {
          platforms: {
            'linux-x64': {
              checksum: sha256(javaArchiveContent),
              url: 'https://example.test/java.tar.gz',
            },
          },
          version: 'cached-java',
        },
        platform: 'linux-x64',
      },
      {
        downloadFile: async () => {
          throw new Error('cache miss');
        },
      },
    );

    expect(result.cacheHit).toBe(true);
    expect(readFileSync(result.fullNodeJar, 'utf8')).toBe(fullNodeContent);
  });

  it('cleans only the java-tron-up cache namespace', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    await mkdir(join(cacheDirectory, 'java-tron-up', 'old'), {
      recursive: true,
    });
    await mkdir(join(cacheDirectory, 'foundryup', 'kept'), {
      recursive: true,
    });

    await cleanJavaTronCache({ cacheDirectory, cwd });

    expect(existsSync(join(cacheDirectory, 'java-tron-up'))).toBe(false);
    expect(existsSync(join(cacheDirectory, 'foundryup', 'kept'))).toBe(true);
  });

  it('reads pinned installer options from package.json with javatronup key', () => {
    const cwd = createTempDir();
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        javatronup: {
          fullNode: {
            platforms: {
              'linux-x64': {
                checksum: sha256('jar-from-package-json'),
                url: 'https://example.test/FullNode.jar',
              },
            },
            version: 'test-version',
          },
        },
      }),
    );

    expect(readJavaTronInstallOptionsFromPackageJson({ cwd })).toStrictEqual({
      fullNode: {
        platforms: {
          'linux-x64': {
            checksum: sha256('jar-from-package-json'),
            url: 'https://example.test/FullNode.jar',
          },
        },
        version: 'test-version',
      },
    });
  });

  it('reads pinned installer options from package.json with java-tron-up key', () => {
    const cwd = createTempDir();
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        'java-tron-up': {
          fullNode: {
            platforms: {
              'linux-x64': {
                checksum: sha256('jar-from-package-json'),
                url: 'https://example.test/FullNode.jar',
              },
            },
            version: 'test-version',
          },
        },
      }),
    );

    expect(readJavaTronInstallOptionsFromPackageJson({ cwd })).toStrictEqual({
      fullNode: {
        platforms: {
          'linux-x64': {
            checksum: sha256('jar-from-package-json'),
            url: 'https://example.test/FullNode.jar',
          },
        },
        version: 'test-version',
      },
    });
  });

  it('reads binDirectory, cacheDirectory, and javaRuntime from package.json', () => {
    const cwd = createTempDir();
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        javaTronUp: {
          binDirectory: '/tmp/bin',
          cacheDirectory: '/tmp/cache',
          javaRuntime: {
            platforms: {
              'linux-x64': {
                checksum: sha256('runtime'),
                url: 'https://example.test/java.tar.gz',
              },
            },
          },
        },
      }),
    );

    expect(readJavaTronInstallOptionsFromPackageJson({ cwd })).toStrictEqual({
      binDirectory: '/tmp/bin',
      cacheDirectory: '/tmp/cache',
      javaRuntime: {
        platforms: {
          'linux-x64': {
            checksum: sha256('runtime'),
            url: 'https://example.test/java.tar.gz',
          },
        },
      },
    });
  });

  it('warns and falls back on non-ENOENT yarnrc read error', () => {
    const cwd = createTempDir();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    mkdirSync(join(cwd, '.yarnrc.yml'));

    expect(getJavaTronCacheDirectory({ cwd })).toBe(
      join(cwd, '.metamask', 'cache'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warning: Error reading'),
      expect.anything(),
    );
    jest.restoreAllMocks();
  });

  function createTempDir(): string {
    const tempDir = mkdtempSync(join(tmpdir(), 'java-tron-up-test-'));
    tempDirs.push(tempDir);
    return tempDir;
  }
});

async function runInstallJavaTron({
  fullNodeContent,
  javaArchiveContent,
  dependencies,
  binDirectory,
  cacheDirectory,
  cwd,
  platform,
}: {
  fullNodeContent: string;
  javaArchiveContent: string;
  dependencies: JavaTronInstallDependencies;
  binDirectory: string;
  cacheDirectory: string;
  cwd: string;
  platform?: string;
}): Promise<JavaTronInstallResult> {
  return installJavaTron(
    {
      binDirectory,
      cacheDirectory,
      cwd,
      fullNode: {
        platforms: {
          'darwin-arm64': {
            checksum: sha256(fullNodeContent),
            url: 'https://example.test/FullNode-aarch64.jar',
          },
        },
        version: 'test-java-tron',
      },
      javaRuntime: {
        platforms: {
          'darwin-arm64': {
            checksum: sha256(javaArchiveContent),
            url: 'https://example.test/java.tar.gz',
          },
        },
        version: 'test-java',
      },
      platform,
    },
    dependencies,
  );
}

async function populateJavaBinary(destination: string): Promise<void> {
  const javaBinary = join(destination, 'jdk', 'bin', 'java');
  await mkdir(join(destination, 'jdk', 'bin'), { recursive: true });
  await writeFile(
    javaBinary,
    '#!/bin/sh\nflag="$1"\njar="$2"\nshift 2\necho "java $flag $(basename "$jar") $*"\n',
  );
  chmodSync(javaBinary, 0o755);
}

async function createJavaArchive(dir: string): Promise<Buffer> {
  await populateJavaBinary(dir);
  execFileSync('tar', ['-czf', 'java.tar.gz', 'jdk'], { cwd: dir });
  return readFileSync(join(dir, 'java.tar.gz'));
}

function createDependencies({
  downloads = [],
  fullNodeContent,
  javaArchiveContent,
}: {
  downloads?: { destination: string; url: string }[];
  fullNodeContent: string;
  javaArchiveContent: string;
}): JavaTronInstallDependencies {
  return {
    downloadFile: async (url, destination): Promise<void> => {
      downloads.push({ destination, url });
      await writeFile(
        destination,
        url.includes('FullNode') ? fullNodeContent : javaArchiveContent,
      );
    },
    extractArchive: async (_archivePath, destination): Promise<void> =>
      populateJavaBinary(destination),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
