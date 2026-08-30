/* eslint-disable import-x/no-nodejs-modules, no-restricted-globals */
import {
  cleanInstallerCache,
  downloadFileFromUrl,
  extractTarGzArchive,
  getCacheKey,
  getMetamaskCacheDirectory,
  getPlatformKey,
  installExecutableWrapper,
  isDirectory,
  isFile,
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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const JAVA_TRON_CACHE_NAMESPACE = 'java-tron-up';
const FULL_NODE_CACHE_NAMESPACE = 'fullnode';
const JAVA_CACHE_NAMESPACE = 'java';

export type JavaTronArtifactConfig = ArtifactConfig;

export type JavaTronArtifactPlatformConfig = ArtifactPlatformConfig;

export type JavaTronJavaRuntimeConfig = JavaTronArtifactConfig;

export type JavaTronInstallOptions = {
  binDirectory?: string;
  cacheDirectory?: string;
  cwd?: string;
  fullNode?: JavaTronArtifactConfig;
  javaBinary?: string;
  javaRuntime?: JavaTronJavaRuntimeConfig;
  platform?: string;
};

export type JavaTronInstallResult = {
  binaryPath: string;
  cacheHit: boolean;
  checksum: string;
  fullNodeJar: string;
  javaBinary: string;
  version?: string;
};

export type JavaTronInstallDependencies = InstallDependencies;

export const JAVA_TRON_DEFAULT_FULL_NODE: JavaTronArtifactConfig = {
  version: 'GreatVoyage-v4.8.1',
  platforms: {
    'darwin-arm64': {
      checksum:
        '694431860ee76fc986ed495f9ec19f29ed3bd752a394386e7b3b9886b2292f59',
      size: 202_460_186,
      url: 'https://github.com/tronprotocol/java-tron/releases/download/GreatVoyage-v4.8.1/FullNode-aarch64.jar',
    },
    'darwin-x64': {
      checksum:
        '0e67b2fe75d7077750e73c4fa20725c6e9824657275d96be256ae5da681f9945',
      size: 145_863_030,
      url: 'https://github.com/tronprotocol/java-tron/releases/download/GreatVoyage-v4.8.1/FullNode.jar',
    },
    'linux-arm64': {
      checksum:
        '694431860ee76fc986ed495f9ec19f29ed3bd752a394386e7b3b9886b2292f59',
      size: 202_460_186,
      url: 'https://github.com/tronprotocol/java-tron/releases/download/GreatVoyage-v4.8.1/FullNode-aarch64.jar',
    },
    'linux-x64': {
      checksum:
        '0e67b2fe75d7077750e73c4fa20725c6e9824657275d96be256ae5da681f9945',
      size: 145_863_030,
      url: 'https://github.com/tronprotocol/java-tron/releases/download/GreatVoyage-v4.8.1/FullNode.jar',
    },
  },
};

export const JAVA_TRON_DEFAULT_JAVA_RUNTIME: JavaTronJavaRuntimeConfig = {
  version: 'zulu-java8-x64-java17-arm64',
  platforms: {
    'darwin-arm64': {
      checksum:
        'f2bd5afaaaa4c23eb4bf2c78913c7eb7d3d228e44209ffec652fb72388a2f25c',
      size: 192_646_000,
      url: 'https://cdn.azul.com/zulu/bin/zulu17.66.19-ca-jdk17.0.19-macosx_aarch64.tar.gz',
    },
    'darwin-x64': {
      checksum:
        '4ac2efcae5d49afe1f2419ceb09bd3fb4af9df8411ab80184795960fc18fb5f6',
      size: 41_346_500,
      url: 'https://cdn.azul.com/zulu/bin/zulu8.94.0.17-ca-jre8.0.492-macosx_x64.tar.gz',
    },
    'linux-arm64': {
      checksum:
        'c17d5657a673c0cfc099e9d803ed30498495894d7359fd1064d463093ed9850b',
      size: 199_156_000,
      url: 'https://cdn.azul.com/zulu/bin/zulu17.66.19-ca-jdk17.0.19-linux_aarch64.tar.gz',
    },
    'linux-x64': {
      checksum:
        '39abf1dc6798b5f6b8e9dca4e78994da316a3f990e444c2c483ea04f7f882cf2',
      size: 42_504_400,
      url: 'https://cdn.azul.com/zulu/bin/zulu8.94.0.17-ca-jre8.0.492-linux_x64.tar.gz',
    },
  },
};

export function getJavaTronCacheDirectory({
  cwd = process.cwd(),
  homeDirectory = homedir(),
}: {
  cwd?: string;
  homeDirectory?: string;
} = {}): string {
  return getMetamaskCacheDirectory({
    cwd,
    homeDirectory,
    toolName: JAVA_TRON_CACHE_NAMESPACE,
  });
}

export function readJavaTronInstallOptionsFromPackageJson({
  cwd = process.cwd(),
  packageJsonPath,
}: {
  cwd?: string;
  packageJsonPath?: string;
} = {}): JavaTronInstallOptions {
  const config = readPackageJsonToolConfig({
    cwd,
    packageJsonPath,
    configKeys: ['javaTronUp', 'javatronup', 'java-tron-up'],
  });
  const options: JavaTronInstallOptions = {};

  if (typeof config.binDirectory === 'string') {
    options.binDirectory = config.binDirectory;
  }
  if (typeof config.cacheDirectory === 'string') {
    options.cacheDirectory = config.cacheDirectory;
  }
  if (config.fullNode && typeof config.fullNode === 'object') {
    options.fullNode = config.fullNode as JavaTronArtifactConfig;
  }
  if (config.javaRuntime && typeof config.javaRuntime === 'object') {
    options.javaRuntime = config.javaRuntime as JavaTronJavaRuntimeConfig;
  }

  return options;
}

export function parseJavaTronInstallCliOptions(
  args: string[],
): JavaTronInstallOptions {
  const options: JavaTronInstallOptions = {};
  const fullNode: Partial<JavaTronArtifactPlatformConfig> = {};
  const javaRuntime: Partial<JavaTronArtifactPlatformConfig> = {};

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
      case '--full-node-checksum':
        fullNode.checksum = readCliValue(arg, value);
        index += 1;
        break;
      case '--full-node-url':
        fullNode.url = readCliValue(arg, value);
        index += 1;
        break;
      case '--java-runtime-checksum':
        javaRuntime.checksum = readCliValue(arg, value);
        index += 1;
        break;
      case '--java-runtime-url':
        javaRuntime.url = readCliValue(arg, value);
        index += 1;
        break;
      case '--platform':
        options.platform = readCliValue(arg, value);
        index += 1;
        break;
      default:
        throw new Error(`Unknown java-tron-up install option: ${arg}`);
    }
  }

  if (fullNode.url || fullNode.checksum) {
    options.fullNode = {
      platforms: {
        current: requireCompletePlatformConfig(
          fullNode,
          'FullNode CLI options',
        ),
      },
    };
  }

  if (javaRuntime.url || javaRuntime.checksum) {
    options.javaRuntime = {
      platforms: {
        current: requireCompletePlatformConfig(
          javaRuntime,
          'Java runtime CLI options',
        ),
      },
    };
  }

  return options;
}

export async function installJavaTron(
  options: JavaTronInstallOptions = {},
  dependencies: JavaTronInstallDependencies = {},
): Promise<JavaTronInstallResult> {
  const cwd = options.cwd ?? process.cwd();
  const cacheDirectory =
    options.cacheDirectory ?? getJavaTronCacheDirectory({ cwd });
  const binDirectory =
    options.binDirectory ?? join(cwd, 'node_modules', '.bin');
  const platformKey = options.platform ?? getPlatformKey();
  const fullNode = mergeArtifactConfig(
    JAVA_TRON_DEFAULT_FULL_NODE,
    options.fullNode,
  );
  const javaRuntime = mergeArtifactConfig(
    JAVA_TRON_DEFAULT_JAVA_RUNTIME,
    options.javaRuntime,
  );
  const fullNodeConfig = resolvePlatformConfig(
    fullNode,
    platformKey,
    'java-tron FullNode',
  );
  const javaBinary =
    options.javaBinary ??
    (await installJavaRuntime(
      {
        cacheDirectory,
        javaRuntime,
        platform: platformKey,
      },
      dependencies,
    ));
  const fullNodeResult = await installFullNodeJar(
    {
      cacheDirectory,
      config: fullNodeConfig,
    },
    dependencies,
  );
  const binaryPath = await installExecutableWrapper({
    binDirectory,
    commandName: 'java-tron',
    executableArgs: ['-jar', fullNodeResult.fullNodeJar],
    executablePath: javaBinary,
    pathResolution: 'absolute',
  });

  return {
    binaryPath,
    cacheHit: fullNodeResult.cacheHit,
    checksum: fullNodeConfig.checksum,
    fullNodeJar: fullNodeResult.fullNodeJar,
    javaBinary,
    version: fullNode.version,
  };
}

export async function cleanJavaTronCache(
  options: Pick<JavaTronInstallOptions, 'cacheDirectory' | 'cwd'> = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const cacheDirectory =
    options.cacheDirectory ?? getJavaTronCacheDirectory({ cwd });

  await cleanInstallerCache({
    cacheDirectory,
    namespace: JAVA_TRON_CACHE_NAMESPACE,
  });
}

export async function installJavaRuntime(
  {
    cacheDirectory = getJavaTronCacheDirectory(),
    javaRuntime = JAVA_TRON_DEFAULT_JAVA_RUNTIME,
    platform = getPlatformKey(),
  }: {
    cacheDirectory?: string;
    javaRuntime?: JavaTronJavaRuntimeConfig;
    platform?: string;
  } = {},
  dependencies: JavaTronInstallDependencies = {},
): Promise<string> {
  const platformConfig = resolvePlatformConfig(
    javaRuntime,
    platform,
    'java-tron Java runtime',
  );
  const cacheKey = getCacheKey(platformConfig);
  const cacheRoot = join(
    cacheDirectory,
    JAVA_TRON_CACHE_NAMESPACE,
    JAVA_CACHE_NAMESPACE,
    cacheKey,
  );
  const sourceChecksumPath = join(cacheRoot, '.source-checksum');
  const existingJavaBinary = findJavaBinary(cacheRoot);

  if (
    existingJavaBinary &&
    existsSync(sourceChecksumPath) &&
    readFileSync(sourceChecksumPath, 'utf8') === platformConfig.checksum
  ) {
    return existingJavaBinary;
  }

  const tempRoot = `${cacheRoot}.downloading`;
  const archivePath = join(tempRoot, 'java-runtime.tar.gz');
  const downloadFile = dependencies.downloadFile ?? downloadFileFromUrl;
  const extractArchive = dependencies.extractArchive ?? extractTarGzArchive;

  await rm(tempRoot, { force: true, recursive: true });
  await rm(cacheRoot, { force: true, recursive: true });
  await mkdir(tempRoot, { recursive: true });

  try {
    await downloadFile(platformConfig.url, archivePath);
    await verifyFileChecksum(
      archivePath,
      platformConfig.checksum,
      'Downloaded Java runtime',
    );
    await extractArchive(archivePath, tempRoot);

    const javaBinary = findJavaBinary(tempRoot);
    if (!javaBinary) {
      throw new Error(
        `Java runtime archive for ${platform} did not contain bin/java.`,
      );
    }

    await writeFile(
      join(tempRoot, '.source-checksum'),
      platformConfig.checksum,
    );
    await mkdir(dirname(cacheRoot), { recursive: true });
    await rename(tempRoot, cacheRoot);

    return javaBinary.replace(tempRoot, cacheRoot);
  } catch (error) {
    await rm(tempRoot, { force: true, recursive: true });
    await rm(cacheRoot, { force: true, recursive: true });
    throw error;
  }
}

async function installFullNodeJar(
  {
    cacheDirectory,
    config,
  }: {
    cacheDirectory: string;
    config: JavaTronArtifactPlatformConfig;
  },
  dependencies: JavaTronInstallDependencies,
): Promise<{ cacheHit: boolean; fullNodeJar: string }> {
  const cacheKey = getCacheKey(config);
  const cacheRoot = join(
    cacheDirectory,
    JAVA_TRON_CACHE_NAMESPACE,
    FULL_NODE_CACHE_NAMESPACE,
    cacheKey,
  );
  const fullNodeJar = join(cacheRoot, 'FullNode.jar');

  if (existsSync(fullNodeJar)) {
    await verifyFileChecksum(
      fullNodeJar,
      config.checksum,
      'Cached java-tron FullNode',
    );
    return { cacheHit: true, fullNodeJar };
  }

  const tempRoot = `${cacheRoot}.downloading`;
  const tempFullNodeJar = join(tempRoot, 'FullNode.jar');
  const downloadFile = dependencies.downloadFile ?? downloadFileFromUrl;

  await rm(tempRoot, { force: true, recursive: true });
  await rm(cacheRoot, { force: true, recursive: true });
  await mkdir(tempRoot, { recursive: true });

  try {
    await downloadFile(config.url, tempFullNodeJar);
    await verifyFileChecksum(
      tempFullNodeJar,
      config.checksum,
      'Downloaded java-tron FullNode',
    );
    await mkdir(dirname(cacheRoot), { recursive: true });
    await rename(tempRoot, cacheRoot);

    return { cacheHit: false, fullNodeJar };
  } catch (error) {
    await rm(tempRoot, { force: true, recursive: true });
    await rm(cacheRoot, { force: true, recursive: true });
    throw error;
  }
}

function findJavaBinary(root: string): string | undefined {
  if (!isDirectory(root)) {
    return undefined;
  }

  const candidate = join(root, 'bin', 'java');
  if (isFile(candidate)) {
    return candidate;
  }

  for (const entry of readdirSync(root)) {
    const child = join(root, entry);
    if (!isDirectory(child)) {
      continue;
    }

    const found = findJavaBinary(child);
    if (found) {
      return found;
    }
  }

  return undefined;
}
