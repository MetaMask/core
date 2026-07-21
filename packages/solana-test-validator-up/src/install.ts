/* eslint-disable import-x/no-nodejs-modules, no-restricted-globals */
import {
  cleanInstallerCache,
  downloadFileFromUrl,
  extractTarBz2Archive,
  findExecutable,
  getCacheKey,
  getMetamaskCacheDirectory,
  getPlatformKey,
  installExecutableWrapper,
  mergeArtifactConfig,
  readCliValue,
  readPackageJsonToolConfig,
  requireCompletePlatformConfig,
  resolvePlatformConfig,
  verifyFileChecksum,
} from '@metamask/local-node-utils';
import type {
  ArtifactConfig,
  ArtifactPlatformConfig,
  InstallDependencies,
} from '@metamask/local-node-utils';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const SOLANA_TEST_VALIDATOR_CACHE_NAMESPACE = 'solana-test-validator-up';
const RELEASE_CACHE_NAMESPACE = 'release';

export type SolanaTestValidatorArtifactConfig = ArtifactConfig;

export type SolanaTestValidatorArtifactPlatformConfig = ArtifactPlatformConfig;

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

export type SolanaTestValidatorInstallDependencies = InstallDependencies;

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
  homeDirectory,
}: {
  cwd?: string;
  homeDirectory?: string;
} = {}): string {
  return getMetamaskCacheDirectory({
    cwd,
    homeDirectory,
    toolName: SOLANA_TEST_VALIDATOR_CACHE_NAMESPACE,
  });
}

export function readSolanaTestValidatorInstallOptionsFromPackageJson({
  cwd = process.cwd(),
  packageJsonPath = join(cwd, 'package.json'),
}: {
  cwd?: string;
  packageJsonPath?: string;
} = {}): SolanaTestValidatorInstallOptions {
  const config = readPackageJsonToolConfig({
    cwd,
    packageJsonPath,
    configKeys: [
      'solanaTestValidatorUp',
      'solanatestvalidatorup',
      'solana-test-validator-up',
    ],
  }) as Partial<SolanaTestValidatorPackageJsonConfig>;
  const options: SolanaTestValidatorInstallOptions = {};

  if (config.binDirectory) {
    options.binDirectory = config.binDirectory;
  }
  if (config.cacheDirectory) {
    options.cacheDirectory = config.cacheDirectory;
  }
  if (config.release) {
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
  const release = mergeArtifactConfig(
    SOLANA_TEST_VALIDATOR_DEFAULT_RELEASE,
    options.release,
  );
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
    pathResolution: 'relative',
  });
  await installExecutableWrapper({
    binDirectory,
    commandName: 'solana',
    executablePath: releaseResult.solanaBinary,
    pathResolution: 'relative',
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

  await cleanInstallerCache({
    cacheDirectory,
    namespace: SOLANA_TEST_VALIDATOR_CACHE_NAMESPACE,
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
