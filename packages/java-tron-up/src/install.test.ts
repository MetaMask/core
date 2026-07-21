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
  JAVA_TRON_DEFAULT_FULL_NODE,
  cleanJavaTronCache,
  getJavaTronCacheDirectory,
  installJavaTron,
  parseJavaTronInstallCliOptions,
  readJavaTronInstallOptionsFromPackageJson,
} from './install.js';
import type { JavaTronInstallDependencies } from './install.js';

describe('java-tron-up installer', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
    tempDirs = [];
  });

  it('pins the current latest java-tron release', () => {
    assert.equal(JAVA_TRON_DEFAULT_FULL_NODE.version, 'GreatVoyage-v4.8.1');
    assert.equal(
      JAVA_TRON_DEFAULT_FULL_NODE.platforms['darwin-arm64']?.checksum,
      '694431860ee76fc986ed495f9ec19f29ed3bd752a394386e7b3b9886b2292f59',
    );
    assert.equal(
      JAVA_TRON_DEFAULT_FULL_NODE.platforms['linux-x64']?.checksum,
      '0e67b2fe75d7077750e73c4fa20725c6e9824657275d96be256ae5da681f9945',
    );
  });

  it('uses the global MetaMask cache when Yarn global cache is enabled', () => {
    const cwd = createTempDir();
    const homeDirectory = createTempDir();
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: true\n');

    assert.equal(
      getJavaTronCacheDirectory({ cwd, homeDirectory }),
      join(homeDirectory, '.cache', 'metamask'),
    );
  });

  it('uses the local MetaMask cache when Yarn global cache is disabled', () => {
    const cwd = createTempDir();
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: false\n');

    assert.equal(
      getJavaTronCacheDirectory({ cwd }),
      join(cwd, '.metamask', 'cache'),
    );
  });

  it('uses the local MetaMask cache when .yarnrc.yml is missing', () => {
    const cwd = createTempDir();

    assert.equal(
      getJavaTronCacheDirectory({ cwd }),
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
        getJavaTronCacheDirectory({ cwd }),
        join(cwd, '.metamask', 'cache'),
      );
    } finally {
      chmodSync(yarnRcPath, 0o644);
    }
  });

  it('merges partial fullNode overrides with pinned defaults', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const downloads: string[] = [];
    const customLinuxUrl = 'https://example.test/custom/FullNode.jar';
    const customLinuxContent = 'overridden linux jar';
    const armDefault = JAVA_TRON_DEFAULT_FULL_NODE.platforms['darwin-arm64'];
    const javaArchiveContent = 'fake java archive';

    const dependencies: JavaTronInstallDependencies = {
      downloadFile: async (url, destination): Promise<void> => {
        downloads.push(url);
        let content = javaArchiveContent;
        if (url === customLinuxUrl) {
          content = customLinuxContent;
        }
        await writeFile(destination, content);
      },
      extractArchive: createDependencies({
        fullNodeContent: '',
        javaArchiveContent,
      }).extractArchive,
    };

    const partialFullNode = {
      platforms: {
        'linux-x64': {
          checksum: sha256(customLinuxContent),
          url: customLinuxUrl,
        },
      },
    };
    const linuxJavaRuntime = {
      platforms: {
        'linux-x64': {
          checksum: sha256(javaArchiveContent),
          url: 'https://example.test/java-linux.tar.gz',
        },
      },
    };
    const armJavaRuntime = {
      platforms: {
        'darwin-arm64': {
          checksum: sha256(javaArchiveContent),
          url: 'https://example.test/java-arm.tar.gz',
        },
      },
    };

    const linuxResult = await installJavaTron(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        fullNode: partialFullNode,
        javaRuntime: linuxJavaRuntime,
        platform: 'linux-x64',
      },
      dependencies,
    );

    assert.equal(
      readFileSync(linuxResult.fullNodeJar, 'utf8'),
      customLinuxContent,
    );
    assert.equal(linuxResult.version, JAVA_TRON_DEFAULT_FULL_NODE.version);

    downloads.length = 0;
    let usedDefaultArmUrl = false;

    await assert.rejects(
      () =>
        installJavaTron(
          {
            binDirectory,
            cacheDirectory,
            cwd,
            fullNode: partialFullNode,
            javaRuntime: armJavaRuntime,
            platform: 'darwin-arm64',
          },
          {
            ...dependencies,
            downloadFile: async (url, destination): Promise<void> => {
              downloads.push(url);
              if (url === armDefault?.url) {
                usedDefaultArmUrl = true;
              }
              await writeFile(destination, javaArchiveContent);
            },
          },
        ),
      /checksum mismatch/u,
    );

    assert.ok(usedDefaultArmUrl);
  });

  it('re-downloads the Java runtime when the cached checksum marker is invalid', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const fullNodeContent = 'cached fullnode jar';
    const javaArchiveContent = 'cached java archive';
    const downloads: string[] = [];
    const platformConfig = {
      checksum: sha256(javaArchiveContent),
      url: 'https://example.test/java.tar.gz',
    };
    const dependencies: JavaTronInstallDependencies = {
      downloadFile: async (url, destination): Promise<void> => {
        downloads.push(url);
        await writeFile(
          destination,
          url.includes('FullNode') ? fullNodeContent : javaArchiveContent,
        );
      },
      extractArchive: createDependencies({
        fullNodeContent,
        javaArchiveContent,
      }).extractArchive,
    };

    const installOptions = {
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
      },
      javaRuntime: {
        platforms: {
          'linux-x64': platformConfig,
        },
      },
      platform: 'linux-x64',
    };

    await installJavaTron(installOptions, dependencies);

    const cacheKey = createHash('sha256')
      .update(`${platformConfig.url}:${platformConfig.checksum}`)
      .digest('hex');
    const sourceChecksumPath = join(
      cacheDirectory,
      'java-tron-up',
      'java',
      cacheKey,
      '.source-checksum',
    );
    writeFileSync(sourceChecksumPath, 'stale-checksum');

    downloads.length = 0;

    await installJavaTron(installOptions, dependencies);

    assert.ok(downloads.includes(platformConfig.url));
  });

  it('exits non-zero when the wrapped process terminates via a signal', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const fullNodeContent = 'fake fullnode jar';
    const signalJavaBinary = join(cwd, 'signal-java');

    writeFileSync(
      signalJavaBinary,
      '#!/usr/bin/env node\nprocess.kill(process.pid, "SIGTERM");\n',
    );
    chmodSync(signalJavaBinary, 0o755);

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
        },
        javaBinary: signalJavaBinary,
        platform: 'linux-x64',
      },
      {
        downloadFile: async (_url, destination): Promise<void> => {
          await writeFile(destination, fullNodeContent);
        },
      },
    );

    let exitStatus: number | null = null;
    try {
      execFileSync(process.execPath, [result.binaryPath], {
        stdio: 'pipe',
      });
    } catch (error) {
      exitStatus = (error as NodeJS.ErrnoException).status ?? null;
    }

    assert.notEqual(exitStatus, 0);
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

    assert.deepEqual(readJavaTronInstallOptionsFromPackageJson({ cwd }), {
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

  it('returns empty options when package.json is absent', () => {
    const cwd = createTempDir(); // no package.json written
    assert.deepEqual(readJavaTronInstallOptionsFromPackageJson({ cwd }), {});
  });

  it('parses installer CLI options', () => {
    assert.deepEqual(
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
      {
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
      },
    );
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

    assert.equal(result.cacheHit, false);
    assert.equal(result.version, 'test-java-tron');
    assert.equal(result.binaryPath, join(binDirectory, 'java-tron'));
    assert.equal(readFileSync(result.fullNodeJar, 'utf8'), fullNodeContent);
    assert.ok(result.javaBinary.endsWith('/bin/java'));
    assert.ok(existsSync(result.binaryPath));
    assert.deepEqual(
      downloads.map(({ url }) => url),
      [
        'https://example.test/java.tar.gz',
        'https://example.test/FullNode-aarch64.jar',
      ],
    );

    const wrapperOutput = execFileSync(
      process.execPath,
      [result.binaryPath, '-v'],
      {
        encoding: 'utf8',
      },
    );
    assert.equal(wrapperOutput.trim(), 'java -jar FullNode.jar -v');
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

    assert.equal(readFileSync(staleTarget, 'utf8'), 'do not overwrite');
    assert.equal(lstatSync(result.binaryPath).isSymbolicLink(), false);
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

    assert.equal(result.cacheHit, true);
    assert.equal(readFileSync(result.fullNodeJar, 'utf8'), fullNodeContent);
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

    assert.equal(existsSync(join(cacheDirectory, 'java-tron-up')), false);
    assert.equal(existsSync(join(cacheDirectory, 'foundryup', 'kept')), true);
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
