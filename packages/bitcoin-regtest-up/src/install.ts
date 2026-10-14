/* eslint-disable import-x/no-nodejs-modules, no-restricted-globals */
import {
  cleanInstallerCache,
  downloadFileFromUrl,
  extractTarGzArchive,
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
  runCommand,
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

const BITCOIN_REGTEST_CACHE_NAMESPACE = 'bitcoin-regtest-up';
const BITCOIN_CORE_CACHE_NAMESPACE = 'bitcoin-core';

export type BitcoinRegtestArtifactConfig = ArtifactConfig;

export type BitcoinRegtestArtifactPlatformConfig = ArtifactPlatformConfig;

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

export type BitcoinRegtestInstallDependencies = InstallDependencies;

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
  homeDirectory,
}: {
  cwd?: string;
  homeDirectory?: string;
} = {}): string {
  return getMetamaskCacheDirectory({
    cwd,
    homeDirectory,
    toolName: BITCOIN_REGTEST_CACHE_NAMESPACE,
  });
}

export function readBitcoinRegtestInstallOptionsFromPackageJson({
  cwd = process.cwd(),
  packageJsonPath = join(cwd, 'package.json'),
}: {
  cwd?: string;
  packageJsonPath?: string;
} = {}): BitcoinRegtestInstallOptions {
  const config = readPackageJsonToolConfig({
    cwd,
    packageJsonPath,
    configKeys: ['bitcoinRegtestUp', 'bitcoinregtestup', 'bitcoin-regtest-up'],
  }) as Partial<BitcoinRegtestPackageJsonConfig>;
  const options: BitcoinRegtestInstallOptions = {};

  if (config.binDirectory) {
    options.binDirectory = config.binDirectory;
  }
  if (config.bitcoinCore) {
    options.bitcoinCore = config.bitcoinCore;
  }
  if (config.cacheDirectory) {
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
    pathResolution: 'absolute',
  });
  const bitcoinCliBinary = await installExecutableWrapper({
    binDirectory,
    commandName: 'bitcoin-cli',
    executablePath: bitcoinCoreResult.sourceBitcoinCliBinary,
    pathResolution: 'absolute',
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

  await cleanInstallerCache({
    cacheDirectory,
    namespace: BITCOIN_REGTEST_CACHE_NAMESPACE,
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
