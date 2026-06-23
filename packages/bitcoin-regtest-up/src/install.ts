/* eslint-disable import-x/no-nodejs-modules, no-restricted-globals */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import { arch as osArch, homedir, platform as osPlatform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parse as parseYaml } from 'yaml';

const BITCOIN_REGTEST_CACHE_NAMESPACE = 'bitcoin-regtest-up';
const BITCOIN_CORE_CACHE_NAMESPACE = 'bitcoin-core';

export type BitcoinRegtestArtifactConfig = {
  platforms: Record<string, BitcoinRegtestArtifactPlatformConfig | undefined>;
  version?: string;
};

export type BitcoinRegtestArtifactPlatformConfig = {
  checksum: string;
  size?: number;
  url: string;
};

export type BitcoinRegtestInstallOptions = {
  binDirectory?: string;
  bitcoinCore?: BitcoinRegtestArtifactConfig;
  cacheDirectory?: string;
  cwd?: string;
  platform?: string;
};

export type BitcoinRegtestInstallResult = {
  bitcoinCliBinary: string;
  bitcoindBinary: string;
  cacheHit: boolean;
  checksum: string;
  sourceBitcoindArgs: string[];
  sourceBitcoinCliBinary: string;
  sourceBitcoindBinary: string;
  version?: string;
};

export type BitcoinRegtestInstallDependencies = {
  downloadFile?: (url: string, destination: string) => Promise<void>;
  extractArchive?: (archivePath: string, destination: string) => Promise<void>;
};

type BitcoinRegtestPackageJson = {
  'bitcoin-regtest-up'?: BitcoinRegtestPackageJsonConfig;
  bitcoinRegtestUp?: BitcoinRegtestPackageJsonConfig;
  bitcoinregtestup?: BitcoinRegtestPackageJsonConfig;
};

type BitcoinRegtestPackageJsonConfig = Pick<
  BitcoinRegtestInstallOptions,
  'binDirectory' | 'bitcoinCore' | 'cacheDirectory'
>;

export const BITCOIN_REGTEST_DEFAULT_CORE: BitcoinRegtestArtifactConfig = {
  version: '30.2',
  platforms: {
    'darwin-arm64': {
      checksum:
        'c2ecab62891de22228043815cb6211549a32272be3d5d052ff19847d3420bd10',
      url: 'https://bitcoincore.org/bin/bitcoin-core-30.2/bitcoin-30.2-arm64-apple-darwin.tar.gz',
    },
    'darwin-x64': {
      checksum:
        '99d5cee9b9c37be506396c30837a4b98e320bfea71c474d6120a7e8eb6075c7b',
      url: 'https://bitcoincore.org/bin/bitcoin-core-30.2/bitcoin-30.2-x86_64-apple-darwin.tar.gz',
    },
    'linux-arm64': {
      checksum:
        '73e76c14edc79808a0511c744d102ffbb494807ee90cbcba176568243254b532',
      url: 'https://bitcoincore.org/bin/bitcoin-core-30.2/bitcoin-30.2-aarch64-linux-gnu.tar.gz',
    },
    'linux-x64': {
      checksum:
        '6aa7bb4feb699c4c6262dd23e4004191f6df7f373b5d5978b5bcdd4bb72f75d8',
      url: 'https://bitcoincore.org/bin/bitcoin-core-30.2/bitcoin-30.2-x86_64-linux-gnu.tar.gz',
    },
  },
};

export function getBitcoinRegtestCacheDirectory({
  cwd = process.cwd(),
  homeDirectory = homedir(),
}: {
  cwd?: string;
  homeDirectory?: string;
} = {}): string {
  const yarnRcPath = join(cwd, '.yarnrc.yml');
  let enableGlobalCache = false;

  try {
    const parsedConfig = parseYaml(readFileSync(yarnRcPath, 'utf8'));
    enableGlobalCache = parsedConfig?.enableGlobalCache ?? false;
  } catch (error) {
    if (isFileMissingError(error)) {
      return join(cwd, '.metamask', 'cache');
    }
    console.warn(
      `Warning: Error reading ${yarnRcPath}, using local bitcoin-regtest-up cache:`,
      error,
    );
  }

  return enableGlobalCache
    ? join(homeDirectory, '.cache', 'metamask')
    : join(cwd, '.metamask', 'cache');
}

export function readBitcoinRegtestInstallOptionsFromPackageJson({
  cwd = process.cwd(),
  packageJsonPath = join(cwd, 'package.json'),
}: {
  cwd?: string;
  packageJsonPath?: string;
} = {}): BitcoinRegtestInstallOptions {
  let raw: string;
  try {
    raw = readFileSync(packageJsonPath, 'utf8');
  } catch (error) {
    if (isFileMissingError(error)) {
      return {};
    }
    throw error;
  }
  const packageJson = JSON.parse(raw) as BitcoinRegtestPackageJson;
  const config =
    packageJson.bitcoinRegtestUp ??
    packageJson.bitcoinregtestup ??
    packageJson['bitcoin-regtest-up'];
  const options: BitcoinRegtestInstallOptions = {};

  if (config?.binDirectory) {
    options.binDirectory = config.binDirectory;
  }
  if (config?.bitcoinCore) {
    options.bitcoinCore = config.bitcoinCore;
  }
  if (config?.cacheDirectory) {
    options.cacheDirectory = config.cacheDirectory;
  }

  return options;
}

export function parseBitcoinRegtestInstallCliOptions(
  args: string[],
): BitcoinRegtestInstallOptions {
  const options: BitcoinRegtestInstallOptions = {};
  const bitcoinCore: Partial<BitcoinRegtestArtifactPlatformConfig> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case '--bin-directory':
        options.binDirectory = readCliValue(arg, value);
        index += 1;
        break;
      case '--bitcoin-core-checksum':
        bitcoinCore.checksum = readCliValue(arg, value);
        index += 1;
        break;
      case '--bitcoin-core-url':
        bitcoinCore.url = readCliValue(arg, value);
        index += 1;
        break;
      case '--cache-directory':
        options.cacheDirectory = readCliValue(arg, value);
        index += 1;
        break;
      case '--platform':
        options.platform = readCliValue(arg, value);
        index += 1;
        break;
      default:
        throw new Error(`Unknown bitcoin-regtest-up install option: ${arg}`);
    }
  }

  if (bitcoinCore.url || bitcoinCore.checksum) {
    options.bitcoinCore = {
      platforms: {
        current: requireCompletePlatformConfig(
          bitcoinCore,
          'Bitcoin Core CLI options',
        ),
      },
    };
  }

  return options;
}

export async function installBitcoinRegtest(
  options: BitcoinRegtestInstallOptions = {},
  dependencies: BitcoinRegtestInstallDependencies = {},
): Promise<BitcoinRegtestInstallResult> {
  const cwd = options.cwd ?? process.cwd();
  const cacheDirectory =
    options.cacheDirectory ?? getBitcoinRegtestCacheDirectory({ cwd });
  const binDirectory =
    options.binDirectory ?? join(cwd, 'node_modules', '.bin');
  const platformKey = options.platform ?? getPlatformKey();
  const bitcoinCore = mergeArtifactConfig(
    BITCOIN_REGTEST_DEFAULT_CORE,
    options.bitcoinCore,
  );
  const bitcoinCoreConfig = resolvePlatformConfig(
    bitcoinCore,
    platformKey,
    'Bitcoin Core archive',
  );
  const bitcoinCoreResult = await installBitcoinCoreArchive(
    { cacheDirectory, config: bitcoinCoreConfig },
    dependencies,
  );
  const bitcoindBinary = await installExecutableWrapper({
    binDirectory,
    commandName: 'bitcoind',
    executableArgs: bitcoinCoreResult.sourceBitcoindArgs,
    executablePath: bitcoinCoreResult.sourceBitcoindBinary,
  });
  const bitcoinCliBinary = await installExecutableWrapper({
    binDirectory,
    commandName: 'bitcoin-cli',
    executablePath: bitcoinCoreResult.sourceBitcoinCliBinary,
  });

  return {
    bitcoinCliBinary,
    bitcoindBinary,
    cacheHit: bitcoinCoreResult.cacheHit,
    checksum: bitcoinCoreConfig.checksum,
    sourceBitcoindArgs: bitcoinCoreResult.sourceBitcoindArgs,
    sourceBitcoinCliBinary: bitcoinCoreResult.sourceBitcoinCliBinary,
    sourceBitcoindBinary: bitcoinCoreResult.sourceBitcoindBinary,
    version: bitcoinCore.version,
  };
}

export async function cleanBitcoinRegtestCache(
  options: Pick<BitcoinRegtestInstallOptions, 'cacheDirectory' | 'cwd'> = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const cacheDirectory =
    options.cacheDirectory ?? getBitcoinRegtestCacheDirectory({ cwd });

  await rm(join(cacheDirectory, BITCOIN_REGTEST_CACHE_NAMESPACE), {
    force: true,
    recursive: true,
  });
}

async function installBitcoinCoreArchive(
  {
    cacheDirectory,
    config,
  }: {
    cacheDirectory: string;
    config: BitcoinRegtestArtifactPlatformConfig;
  },
  dependencies: BitcoinRegtestInstallDependencies,
): Promise<{
  cacheHit: boolean;
  sourceBitcoindArgs: string[];
  sourceBitcoinCliBinary: string;
  sourceBitcoindBinary: string;
}> {
  const cacheKey = getCacheKey(config);
  const cacheRoot = join(
    cacheDirectory,
    BITCOIN_REGTEST_CACHE_NAMESPACE,
    BITCOIN_CORE_CACHE_NAMESPACE,
    cacheKey,
  );
  const checksumPath = join(cacheRoot, '.source-checksum');
  const cached = findBitcoinCoreBinaries(cacheRoot);

  if (
    cached &&
    existsSync(checksumPath) &&
    readFileSync(checksumPath, 'utf8') === config.checksum &&
    (await areBitcoinCoreBinariesRunnable(cached))
  ) {
    return { cacheHit: true, ...cached };
  }

  const tempRoot = `${cacheRoot}.downloading`;
  const archivePath = join(tempRoot, 'bitcoin-core.tar.gz');
  const downloadFile = dependencies.downloadFile ?? downloadFileFromUrl;
  const extractArchive = dependencies.extractArchive ?? extractTarGzArchive;

  await rm(tempRoot, { force: true, recursive: true });
  await rm(cacheRoot, { force: true, recursive: true });
  await mkdir(tempRoot, { recursive: true });

  try {
    await downloadFile(config.url, archivePath);
    await verifyFileChecksum(
      archivePath,
      config.checksum,
      'Downloaded Bitcoin Core',
    );
    await extractArchive(archivePath, tempRoot);

    const binaries = findBitcoinCoreBinaries(tempRoot);
    if (!binaries) {
      throw new Error(
        'Bitcoin Core archive did not contain a node daemon (bitcoind, bitcoin-node, or bitcoin) and bin/bitcoin-cli.',
      );
    }
    await assertBitcoinCoreBinariesRunnable(binaries);

    await writeFile(checksumPath.replace(cacheRoot, tempRoot), config.checksum);
    await mkdir(dirname(cacheRoot), { recursive: true });
    await rename(tempRoot, cacheRoot);

    return {
      cacheHit: false,
      sourceBitcoindArgs: binaries.sourceBitcoindArgs,
      sourceBitcoinCliBinary: binaries.sourceBitcoinCliBinary.replace(
        tempRoot,
        cacheRoot,
      ),
      sourceBitcoindBinary: binaries.sourceBitcoindBinary.replace(
        tempRoot,
        cacheRoot,
      ),
    };
  } catch (error) {
    await rm(tempRoot, { force: true, recursive: true });
    await rm(cacheRoot, { force: true, recursive: true });
    throw error;
  }
}

async function installExecutableWrapper({
  binDirectory,
  commandName,
  executableArgs = [],
  executablePath,
}: {
  binDirectory: string;
  commandName: string;
  executableArgs?: string[];
  executablePath: string;
}): Promise<string> {
  const binaryPath = join(binDirectory, commandName);
  const resolvedExecutablePath = resolve(executablePath);

  await mkdir(binDirectory, { recursive: true });
  await unlink(binaryPath).catch((error) => {
    if (!isFileMissingError(error)) {
      throw error;
    }
  });
  await writeFile(
    binaryPath,
    `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');

const executablePath = ${JSON.stringify(resolvedExecutablePath)};
const result = spawnSync(executablePath, ${JSON.stringify(executableArgs)}.concat(process.argv.slice(2)), {
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
  process.exit(1);
}

process.exit(result.status ?? 0);
`,
  );
  await chmod(binaryPath, 0o755);

  return binaryPath;
}

async function areBitcoinCoreBinariesRunnable(binaries: {
  sourceBitcoindArgs: string[];
  sourceBitcoinCliBinary: string;
  sourceBitcoindBinary: string;
}): Promise<boolean> {
  try {
    await assertBitcoinCoreBinariesRunnable(binaries);
    return true;
  } catch {
    return false;
  }
}

async function assertBitcoinCoreBinariesRunnable(binaries: {
  sourceBitcoindArgs: string[];
  sourceBitcoinCliBinary: string;
  sourceBitcoindBinary: string;
}): Promise<void> {
  await runCommand(binaries.sourceBitcoindBinary, [
    ...binaries.sourceBitcoindArgs,
    '-version',
  ]);
  await runCommand(binaries.sourceBitcoinCliBinary, ['-version']);
}

function findBitcoinCoreBinaries(root: string):
  | {
      sourceBitcoindArgs: string[];
      sourceBitcoinCliBinary: string;
      sourceBitcoindBinary: string;
    }
  | undefined {
  const sourceBitcoinCliBinary = findExecutable(root, 'bitcoin-cli');
  const sourceBitcoindBinary = findBitcoinCoreDaemonBinary(root);

  if (!sourceBitcoindBinary || !sourceBitcoinCliBinary) {
    return undefined;
  }

  return {
    sourceBitcoindArgs: sourceBitcoindBinary.name === 'bitcoin' ? ['node'] : [],
    sourceBitcoinCliBinary,
    sourceBitcoindBinary: sourceBitcoindBinary.path,
  };
}

function findBitcoinCoreDaemonBinary(
  root: string,
): { name: string; path: string } | undefined {
  for (const name of ['bitcoind', 'bitcoin-node', 'bitcoin']) {
    const path = findExecutable(root, name);
    if (path) {
      return { name, path };
    }
  }

  return undefined;
}

function findExecutable(root: string, name: string): string | undefined {
  if (!existsSync(root)) {
    return undefined;
  }

  for (const entry of readdirSync(root)) {
    const entryPath = join(root, entry);
    const stat = statSync(entryPath);
    if (stat.isDirectory()) {
      const found = findExecutable(entryPath, name);
      if (found) {
        return found;
      }
    } else if (entry === name) {
      return entryPath;
    }
  }

  return undefined;
}

function mergeArtifactConfig(
  defaults: BitcoinRegtestArtifactConfig,
  override: BitcoinRegtestArtifactConfig | undefined,
): BitcoinRegtestArtifactConfig {
  if (!override) {
    return defaults;
  }
  return {
    version: override.version ?? defaults.version,
    platforms: { ...defaults.platforms, ...override.platforms },
  };
}

function resolvePlatformConfig(
  config: BitcoinRegtestArtifactConfig,
  platform: string,
  label: string,
): BitcoinRegtestArtifactPlatformConfig {
  const platformConfig = config.platforms.current ?? config.platforms[platform];

  if (!platformConfig) {
    throw new Error(`No ${label} is configured for ${platform}.`);
  }

  return platformConfig;
}

function requireCompletePlatformConfig(
  config: Partial<BitcoinRegtestArtifactPlatformConfig>,
  label: string,
): BitcoinRegtestArtifactPlatformConfig {
  if (!config.url || !config.checksum) {
    throw new Error(`${label} require both a URL and a checksum.`);
  }

  return {
    checksum: config.checksum,
    url: config.url,
  };
}

function getCacheKey(config: BitcoinRegtestArtifactPlatformConfig): string {
  return createHash('sha256')
    .update(`${config.url}:${config.checksum}`)
    .digest('hex');
}

async function verifyFileChecksum(
  filePath: string,
  expectedChecksum: string,
  label: string,
): Promise<void> {
  const checksum = createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');

  if (checksum !== expectedChecksum) {
    throw new Error(
      `${label} checksum mismatch. Expected ${expectedChecksum}, got ${checksum}.`,
    );
  }
}

async function downloadFileFromUrl(
  url: string,
  destination: string,
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await pipeline(
    await openDownloadStream(new URL(url)),
    createWriteStream(destination),
  );
}

async function openDownloadStream(
  url: URL,
  redirectsRemaining = 5,
): Promise<NodeJS.ReadableStream> {
  const request = url.protocol === 'http:' ? requestHttp : requestHttps;

  return await new Promise((resolvePromise, rejectPromise) => {
    const req = request(url, (response) => {
      const { headers, statusCode, statusMessage } = response;

      if (
        statusCode &&
        statusCode >= 300 &&
        statusCode < 400 &&
        headers.location
      ) {
        response.resume();
        if (redirectsRemaining <= 0) {
          rejectPromise(new Error(`Too many redirects downloading ${url}`));
          return;
        }

        openDownloadStream(
          new URL(headers.location, url),
          redirectsRemaining - 1,
        )
          .then(resolvePromise)
          .catch(rejectPromise);
        return;
      }

      if (!statusCode || statusCode < 200 || statusCode >= 300) {
        response.resume();
        rejectPromise(
          new Error(
            `Request to ${url} failed with ${statusCode ?? 'unknown'} ${
              statusMessage ?? ''
            }`.trim(),
          ),
        );
        return;
      }

      resolvePromise(response);
    });

    req.on('error', rejectPromise);
    req.end();
  });
}

async function extractTarGzArchive(
  archivePath: string,
  destination: string,
): Promise<void> {
  await runCommand('tar', ['-xzf', archivePath, '-C', destination]);
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', rejectPromise);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const exitStatus = signal ? `signal ${signal}` : `code ${code ?? 'null'}`;
      rejectPromise(
        new Error(
          `${command} ${args.join(' ')} failed with ${exitStatus}: ${stderr}`,
        ),
      );
    });
  });
}

function getPlatformKey(): string {
  const platform = osPlatform();
  const arch = osArch();

  if (platform === 'darwin' && arch === 'arm64') {
    return 'darwin-arm64';
  }
  if (platform === 'darwin' && arch === 'x64') {
    return 'darwin-x64';
  }
  if (platform === 'linux' && arch === 'arm64') {
    return 'linux-arm64';
  }
  if (platform === 'linux' && arch === 'x64') {
    return 'linux-x64';
  }

  return `${platform}-${arch}`;
}

function readCliValue(arg: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`${arg} requires a value.`);
  }

  return value;
}

function isFileMissingError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Object.prototype.hasOwnProperty.call(error, 'code') &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
