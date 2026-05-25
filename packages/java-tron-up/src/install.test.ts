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
import type { JavaTronInstallDependencies } from './install';

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
    });
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
        platform: 'darwin-arm64',
      },
      dependencies,
    );

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

  function createTempDir(): string {
    const tempDir = mkdtempSync(join(tmpdir(), 'java-tron-up-test-'));
    tempDirs.push(tempDir);
    return tempDir;
  }
});

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
    extractArchive: async (_archivePath, destination): Promise<void> => {
      const javaBinary = join(destination, 'jdk', 'bin', 'java');
      await mkdir(join(destination, 'jdk', 'bin'), { recursive: true });
      await writeFile(
        javaBinary,
        '#!/bin/sh\nflag="$1"\njar="$2"\nshift 2\necho "java $flag $(basename "$jar") $*"\n',
      );
      chmodSync(javaBinary, 0o755);
    },
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
