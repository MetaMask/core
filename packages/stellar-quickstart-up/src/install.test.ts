/* eslint-disable jest/expect-expect, n/no-sync */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  STELLAR_QUICKSTART_DEFAULT_IMAGE,
  cleanStellarQuickstartCache,
  getStellarQuickstartCacheDirectory,
  installStellarQuickstart,
  parseStellarQuickstartInstallCliOptions,
  readStellarQuickstartInstallOptionsFromPackageJson,
} from './install';
import type { StellarQuickstartInstallDependencies } from './install';

describe('stellar-quickstart-up installer', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { force: true, recursive: true });
    }
    tempDirs = [];
  });

  it('pins a Stellar Quickstart docker image', () => {
    assert.equal(STELLAR_QUICKSTART_DEFAULT_IMAGE.version, 'latest');
    assert.equal(
      STELLAR_QUICKSTART_DEFAULT_IMAGE.reference,
      'stellar/quickstart:latest',
    );
    assert.equal(
      STELLAR_QUICKSTART_DEFAULT_IMAGE.digest,
      'sha256:8ddf3ed87a5c07eab5202b0fd95f06fb5db3f48cacd7e69fdc0e22925f181168',
    );
  });

  it('uses the global MetaMask cache when Yarn global cache is enabled', () => {
    const cwd = createTempDir();
    const homeDirectory = join(cwd, 'home');
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: true\n');

    assert.equal(
      getStellarQuickstartCacheDirectory({ cwd, homeDirectory }),
      join(homeDirectory, '.cache', 'metamask'),
    );
  });

  it('uses the local MetaMask cache when Yarn global cache is disabled', () => {
    const cwd = createTempDir();
    writeFileSync(join(cwd, '.yarnrc.yml'), 'enableGlobalCache: false\n');

    assert.equal(
      getStellarQuickstartCacheDirectory({ cwd }),
      join(cwd, '.metamask', 'cache'),
    );
  });

  it('returns empty installer options when package.json is missing', () => {
    const cwd = createTempDir();

    assert.deepEqual(
      readStellarQuickstartInstallOptionsFromPackageJson({ cwd }),
      {},
    );
  });

  it('reads installer options from supported package.json keys', async () => {
    const cwd = createTempDir();
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({
        stellarQuickstartUp: {
          cacheDirectory: '/tmp/stellar-cache',
          image: {
            reference: 'stellar/quickstart:testing',
          },
        },
      }),
    );

    assert.deepEqual(
      readStellarQuickstartInstallOptionsFromPackageJson({ cwd }),
      {
        cacheDirectory: '/tmp/stellar-cache',
        image: {
          reference: 'stellar/quickstart:testing',
        },
      },
    );
  });

  it('parses CLI install options', () => {
    assert.deepEqual(
      parseStellarQuickstartInstallCliOptions([
        '--bin-directory',
        '/tmp/bin',
        '--cache-directory',
        '/tmp/cache',
        '--docker-binary',
        '/usr/local/bin/docker',
        '--image-reference',
        'stellar/quickstart:testing',
        '--image-digest',
        'sha256:abc',
      ]),
      {
        binDirectory: '/tmp/bin',
        cacheDirectory: '/tmp/cache',
        dockerBinary: '/usr/local/bin/docker',
        image: {
          reference: 'stellar/quickstart:testing',
          digest: 'sha256:abc',
        },
      },
    );
  });

  it('rejects unknown CLI options', () => {
    assert.throws(
      () => parseStellarQuickstartInstallCliOptions(['--unknown']),
      /Unknown stellar-quickstart-up install option/u,
    );
  });

  it('installs a docker-backed stellar-quickstart wrapper', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const dockerBinary = createDockerStub(cwd);
    const dependencies = createInstallDependencies({
      digest: STELLAR_QUICKSTART_DEFAULT_IMAGE.digest as string,
      dockerBinary,
    });

    const result = await installStellarQuickstart(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        dockerBinary,
      },
      dependencies,
    );

    assert.equal(result.cacheHit, false);
    assert.equal(result.imageReference, 'stellar/quickstart:latest');
    assert.equal(
      result.digest,
      STELLAR_QUICKSTART_DEFAULT_IMAGE.digest,
    );
    assert.equal(result.binaryPath, join(binDirectory, 'stellar-quickstart'));
    assert.equal(dependencies.pullCalls, 1);
    assert.equal(dependencies.inspectCalls, 1);

    const wrapperSource = readFileSync(result.binaryPath, 'utf8');
    assert.match(wrapperSource, /stellar\/quickstart:latest/u);
    assert.match(wrapperSource, /8000:8000/u);
  });

  it('reuses cached image metadata when digest matches', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const dockerBinary = createDockerStub(cwd);
    const dependencies = createInstallDependencies({
      digest: STELLAR_QUICKSTART_DEFAULT_IMAGE.digest as string,
      dockerBinary,
    });

    await installStellarQuickstart(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        dockerBinary,
      },
      dependencies,
    );

    const secondResult = await installStellarQuickstart(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        dockerBinary,
      },
      dependencies,
    );

    assert.equal(secondResult.cacheHit, true);
    assert.equal(dependencies.pullCalls, 1);
    assert.equal(dependencies.inspectCalls, 1);
  });

  it('rejects image digests that do not match the pinned default', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const dockerBinary = createDockerStub(cwd);
    const dependencies = createInstallDependencies({
      digest: 'sha256:deadbeef',
      dockerBinary,
    });

    await assert.rejects(
      installStellarQuickstart(
        {
          binDirectory,
          cacheDirectory,
          cwd,
          dockerBinary,
        },
        dependencies,
      ),
      /digest mismatch/u,
    );
  });

  it('cleans only the stellar-quickstart-up cache namespace', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const namespaceRoot = join(cacheDirectory, 'stellar-quickstart-up');
    await mkdir(join(namespaceRoot, 'image', 'cache-key'), { recursive: true });
    await mkdir(join(cacheDirectory, 'foundryup'), { recursive: true });

    await cleanStellarQuickstartCache({ cacheDirectory, cwd });

    assert.equal(existsSync(namespaceRoot), false);
    assert.equal(existsSync(join(cacheDirectory, 'foundryup')), true);
  });

  it('forwards arguments through the installed wrapper', async () => {
    const cwd = createTempDir();
    const cacheDirectory = join(cwd, '.metamask', 'cache');
    const binDirectory = join(cwd, 'node_modules', '.bin');
    const dockerBinary = createDockerStub(cwd);
    const dependencies = createInstallDependencies({
      digest: STELLAR_QUICKSTART_DEFAULT_IMAGE.digest as string,
      dockerBinary,
    });

    const result = await installStellarQuickstart(
      {
        binDirectory,
        cacheDirectory,
        cwd,
        dockerBinary,
      },
      dependencies,
    );

    const output = execFileSync(result.binaryPath, ['--local'], {
      encoding: 'utf8',
    });

    assert.match(output, /--local/u);
    assert.match(output, /stellar\/quickstart:latest/u);
  });

  function createTempDir(): string {
    const tempDir = mkdtempSync(join(tmpdir(), 'stellar-quickstart-up-'));
    tempDirs.push(tempDir);
    return tempDir;
  }
});

function createDockerStub(cwd: string): string {
  const dockerBinary = join(cwd, 'docker-stub');
  writeFileSync(
    dockerBinary,
    `#!/usr/bin/env node
const [,, command, ...args] = process.argv;
if (command === 'version') {
  process.exit(0);
}
if (command === 'pull') {
  process.stdout.write('pulled ' + args.join(' '));
  process.exit(0);
}
if (command === 'image') {
  process.stdout.write('sha256:8ddf3ed87a5c07eab5202b0fd95f06fb5db3f48cacd7e69fdc0e22925f181168');
  process.exit(0);
}
if (command === 'run') {
  process.stdout.write(args.join(' '));
  process.exit(0);
}
console.error('unexpected docker command', command, args.join(' '));
process.exit(1);
`,
  );
  chmodSync(dockerBinary, 0o755);
  return dockerBinary;
}

function createInstallDependencies({
  digest,
  dockerBinary,
}: {
  digest: string;
  dockerBinary: string;
}): StellarQuickstartInstallDependencies & {
  inspectCalls: number;
  pullCalls: number;
} {
  const state = {
    inspectCalls: 0,
    pullCalls: 0,
  };

  return {
    get inspectCalls(): number {
      return state.inspectCalls;
    },
    get pullCalls(): number {
      return state.pullCalls;
    },
    async inspectDockerImage(): Promise<string> {
      state.inspectCalls += 1;
      return digest;
    },
    async pullDockerImage(
      binary: string,
      imageReference: string,
    ): Promise<void> {
      state.pullCalls += 1;
      assert.equal(binary, dockerBinary);
      assert.equal(imageReference, 'stellar/quickstart:latest');
    },
    async runCommand(command: string, args: string[]): Promise<void> {
      assert.equal(command, dockerBinary);
      assert.deepEqual(args, ['version']);
    },
  };
}
