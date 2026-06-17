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
import { dirname, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';

const SOLANA_TEST_VALIDATOR_CACHE_NAMESPACE = 'solana-test-validator-up';
const RELEASE_CACHE_NAMESPACE = 'release';

export type SolanaTestValidatorArtifactConfig = {
  platforms: Record<
    string,
    SolanaTestValidatorArtifactPlatformConfig | undefined
  >;
  version?: string;
};

export type SolanaTestValidatorArtifactPlatformConfig = {
  checksum: string;
  size?: number;
  url: string;
};

export type SolanaTestValidatorInstallOptions = {
  binDirectory?: string;
  cacheDirectory?: string;
  cwd?: string;
  platform?: string;
  release?: SolanaTestValidatorArtifactConfig;
};

export type SolanaTestValidatorInstallResult = {
  binaryPath: string;
  cacheHit: boolean;
  checksum: string;
  solanaBinary: string;
  validatorBinary: string;
  version?: string;
};

export type SolanaTestValidatorInstallDependencies = {
  downloadFile?: (url: string, destination: string) => Promise<void>;
  extractArchive?: (archivePath: string, destination: string) => Promise<void>;
};

type SolanaTestValidatorPackageJson = {
  'solana-test-validator-up'?: SolanaTestValidatorPackageJsonConfig;
  solanaTestValidatorUp?: SolanaTestValidatorPackageJsonConfig;
  solanatestvalidatorup?: SolanaTestValidatorPackageJsonConfig;
};

type SolanaTestValidatorPackageJsonConfig = Pick<
  SolanaTestValidatorInstallOptions,
  'binDirectory' | 'cacheDirectory' | 'release'
>;

export const SOLANA_TEST_VALIDATOR_DEFAULT_RELEASE: SolanaTestValidatorArtifactConfig =
  {
    version: 'v3.1.14',
    platforms: {
      'darwin-arm64': {
        checksum:
          '54cfc2680bd6426fda04619ee01933f40a649c8056f3a61ba20dc54dd427ebed',
        size: 77_158_067,
        url: 'https://github.com/anza-xyz/agave/releases/download/v3.1.14/solana-release-aarch64-apple-darwin.tar.bz2',
      },
      'darwin-x64': {
        checksum:
          'e3768ed01daa1e3cfc02af3e3eb396cec2d48a99ecf80cd5d7bdff510f808d1f',
        size: 81_239_759,
        url: 'https://github.com/anza-xyz/agave/releases/download/v3.1.14/solana-release-x86_64-apple-darwin.tar.bz2',
      },
      'linux-x64': {
        checksum:
          '06f97c065cc977cbec2f13ffc9bc9d3b92fef485431fcb370a269de69532ef51',
        size: 215_235_690,
        url: 'https://github.com/anza-xyz/agave/releases/download/v3.1.14/solana-release-x86_64-unknown-linux-gnu.tar.bz2',
      },
    },
  };

export function getSolanaTestValidatorCacheDirectory({
  cwd = process.cwd(),
  homeDirectory = homedir(),
}: {
  cwd?: string;
  homeDirectory?: string;
} = {}): string {
  const yarnRcPath = join(cwd, '.yarnrc.yml');

  try {
    const yarnRc = readFileSync(yarnRcPath, 'utf8');
    if (/^\s*enableGlobalCache:\s*true\s*$/mu.test(yarnRc)) {
      return join(homeDirectory, '.cache', 'metamask');
    }
  } catch (error) {
    if (!isFileMissingError(error)) {
      console.warn(
        `Warning: Error reading ${yarnRcPath}, using local solana-test-validator-up cache:`,
        error,
      );
    }
  }

  return join(cwd, '.metamask', 'cache');
}

export function readSolanaTestValidatorInstallOptionsFromPackageJson({
  cwd = process.cwd(),
  packageJsonPath = join(cwd, 'package.json'),
}: {
  cwd?: string;
  packageJsonPath?: string;
} = {}): SolanaTestValidatorInstallOptions {
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8'),
  ) as SolanaTestValidatorPackageJson;
  const config =
    packageJson.solanaTestValidatorUp ??
    packageJson.solanatestvalidatorup ??
    packageJson['solana-test-validator-up'];
  const options: SolanaTestValidatorInstallOptions = {};

  if (config?.binDirectory) {
    options.binDirectory = config.binDirectory;
  }
  if (config?.cacheDirectory) {
    options.cacheDirectory = config.cacheDirectory;
  }
  if (config?.release) {
    options.release = config.release;
  }

  return options;
}

export function parseSolanaTestValidatorInstallCliOptions(
  args: string[],
): SolanaTestValidatorInstallOptions {
  const options: SolanaTestValidatorInstallOptions = {};
  const release: Partial<SolanaTestValidatorArtifactPlatformConfig> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    switch (arg) {
      case '--bin-directory':
        options.binDirectory = readCliValue(arg, value);
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
      case '--release-checksum':
        release.checksum = readCliValue(arg, value);
        index += 1;
        break;
      case '--release-url':
        release.url = readCliValue(arg, value);
        index += 1;
        break;
      default:
        throw new Error(
          `Unknown solana-test-validator-up install option: ${arg}`,
        );
    }
  }

  if (release.url || release.checksum) {
    options.release = {
      platforms: {
        current: requireCompletePlatformConfig(
          release,
          'Solana release CLI options',
        ),
      },
    };
  }

  return options;
}

export async function installSolanaTestValidator(
  options: SolanaTestValidatorInstallOptions = {},
  dependencies: SolanaTestValidatorInstallDependencies = {},
): Promise<SolanaTestValidatorInstallResult> {
  const cwd = options.cwd ?? process.cwd();
  const cacheDirectory =
    options.cacheDirectory ?? getSolanaTestValidatorCacheDirectory({ cwd });
  const binDirectory =
    options.binDirectory ?? join(cwd, 'node_modules', '.bin');
  const platformKey = options.platform ?? getPlatformKey();
  const release = options.release ?? SOLANA_TEST_VALIDATOR_DEFAULT_RELEASE;
  const releaseConfig = resolvePlatformConfig(
    release,
    platformKey,
    'Solana release',
  );
  const releaseResult = await installSolanaRelease(
    { cacheDirectory, config: releaseConfig },
    dependencies,
  );
  const binaryPath = await installExecutableWrapper({
    binDirectory,
    commandName: 'solana-test-validator',
    executablePath: releaseResult.validatorBinary,
  });
  await installExecutableWrapper({
    binDirectory,
    commandName: 'solana',
    executablePath: releaseResult.solanaBinary,
  });

  return {
    binaryPath,
    cacheHit: releaseResult.cacheHit,
    checksum: releaseConfig.checksum,
    solanaBinary: releaseResult.solanaBinary,
    validatorBinary: releaseResult.validatorBinary,
    version: release.version,
  };
}

export async function cleanSolanaTestValidatorCache(
  options: Pick<
    SolanaTestValidatorInstallOptions,
    'cacheDirectory' | 'cwd'
  > = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const cacheDirectory =
    options.cacheDirectory ?? getSolanaTestValidatorCacheDirectory({ cwd });

  await rm(join(cacheDirectory, SOLANA_TEST_VALIDATOR_CACHE_NAMESPACE), {
    force: true,
    recursive: true,
  });
}

async function installSolanaRelease(
  {
    cacheDirectory,
    config,
  }: {
    cacheDirectory: string;
    config: SolanaTestValidatorArtifactPlatformConfig;
  },
  dependencies: SolanaTestValidatorInstallDependencies,
): Promise<{
  cacheHit: boolean;
  solanaBinary: string;
  validatorBinary: string;
}> {
  const cacheKey = getCacheKey(config);
  const cacheRoot = join(
    cacheDirectory,
    SOLANA_TEST_VALIDATOR_CACHE_NAMESPACE,
    RELEASE_CACHE_NAMESPACE,
    cacheKey,
  );
  const checksumPath = join(cacheRoot, '.source-checksum');
  const cached = findSolanaBinaries(cacheRoot);

  if (
    cached &&
    existsSync(checksumPath) &&
    readFileSync(checksumPath, 'utf8') === config.checksum
  ) {
    return { cacheHit: true, ...cached };
  }

  const tempRoot = `${cacheRoot}.downloading`;
  const archivePath = join(tempRoot, 'solana-release.tar.bz2');
  const downloadFile = dependencies.downloadFile ?? downloadFileFromUrl;
  const extractArchive = dependencies.extractArchive ?? extractTarBz2Archive;

  await rm(tempRoot, { force: true, recursive: true });
  await rm(cacheRoot, { force: true, recursive: true });
  await mkdir(tempRoot, { recursive: true });

  try {
    await downloadFile(config.url, archivePath);
    await verifyFileChecksum(
      archivePath,
      config.checksum,
      'Downloaded Solana release',
    );
    await extractArchive(archivePath, tempRoot);

    const binaries = findSolanaBinaries(tempRoot);
    if (!binaries) {
      throw new Error(
        'Solana release archive did not contain bin/solana-test-validator and bin/solana.',
      );
    }

    await writeFile(checksumPath.replace(cacheRoot, tempRoot), config.checksum);
    await mkdir(dirname(cacheRoot), { recursive: true });
    await rename(tempRoot, cacheRoot);

    return {
      cacheHit: false,
      solanaBinary: binaries.solanaBinary.replace(tempRoot, cacheRoot),
      validatorBinary: binaries.validatorBinary.replace(tempRoot, cacheRoot),
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
  executablePath,
}: {
  binDirectory: string;
  commandName: string;
  executablePath: string;
}): Promise<string> {
  const binaryPath = join(binDirectory, commandName);
  const relativeExecutablePath = relative(binDirectory, executablePath);

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
const path = require('node:path');

const executablePath = path.resolve(__dirname, ${JSON.stringify(relativeExecutablePath)});
const result = spawnSync(executablePath, process.argv.slice(2), {
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 0);
`,
  );
  await chmod(binaryPath, 0o755);

  return binaryPath;
}

function findSolanaBinaries(
  root: string,
): { solanaBinary: string; validatorBinary: string } | undefined {
  const validatorBinary = findExecutable(root, 'solana-test-validator');
  const solanaBinary = findExecutable(root, 'solana');

  if (!validatorBinary || !solanaBinary) {
    return undefined;
  }

  return { solanaBinary, validatorBinary };
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

function resolvePlatformConfig(
  config: SolanaTestValidatorArtifactConfig,
  platform: string,
  label: string,
): SolanaTestValidatorArtifactPlatformConfig {
  const platformConfig = config.platforms[platform] ?? config.platforms.current;

  if (!platformConfig) {
    throw new Error(`No ${label} is configured for ${platform}.`);
  }

  return platformConfig;
}

function requireCompletePlatformConfig(
  config: Partial<SolanaTestValidatorArtifactPlatformConfig>,
  label: string,
): SolanaTestValidatorArtifactPlatformConfig {
  if (!config.url || !config.checksum) {
    throw new Error(`${label} require both a URL and a checksum.`);
  }

  return {
    checksum: config.checksum,
    url: config.url,
  };
}

function getCacheKey(
  config: SolanaTestValidatorArtifactPlatformConfig,
): string {
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

async function extractTarBz2Archive(
  archivePath: string,
  destination: string,
): Promise<void> {
  await runCommand('tar', ['-xjf', archivePath, '-C', destination]);
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
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(
          `${command} ${args.join(' ')} failed with code ${code}: ${stderr}`,
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
