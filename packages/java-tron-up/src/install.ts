/* eslint-disable import-x/no-nodejs-modules, no-restricted-globals */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { chmod, mkdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';
import { arch as osArch, homedir, platform as osPlatform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { parse as parseYaml } from 'yaml';

const JAVA_TRON_CACHE_NAMESPACE = 'java-tron-up';
const FULL_NODE_CACHE_NAMESPACE = 'fullnode';
const JAVA_CACHE_NAMESPACE = 'java';

export type JavaTronArtifactConfig = {
  platforms: Record<string, JavaTronArtifactPlatformConfig | undefined>;
  version?: string;
};

export type JavaTronArtifactPlatformConfig = {
  checksum: string;
  size?: number;
  url: string;
};

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

export type JavaTronInstallDependencies = {
  downloadFile?: (url: string, destination: string) => Promise<void>;
  extractArchive?: (archivePath: string, destination: string) => Promise<void>;
};

type JavaTronPackageJson = {
  'java-tron-up'?: JavaTronPackageJsonConfig;
  javaTronUp?: JavaTronPackageJsonConfig;
  javatronup?: JavaTronPackageJsonConfig;
};

type JavaTronPackageJsonConfig = Pick<
  JavaTronInstallOptions,
  'binDirectory' | 'cacheDirectory' | 'fullNode' | 'javaRuntime'
>;

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
      `Warning: Error reading ${yarnRcPath}, using local java-tron-up cache:`,
      error,
    );
  }

  return enableGlobalCache
    ? join(homeDirectory, '.cache', 'metamask')
    : join(cwd, '.metamask', 'cache');
}

export function readJavaTronInstallOptionsFromPackageJson({
  cwd = process.cwd(),
  packageJsonPath = join(cwd, 'package.json'),
}: {
  cwd?: string;
  packageJsonPath?: string;
} = {}): JavaTronInstallOptions {
  let raw: string;
  try {
    raw = readFileSync(packageJsonPath, 'utf8');
  } catch (error) {
    if (isFileMissingError(error)) {
      return {};
    }
    throw error;
  }
  const packageJson = JSON.parse(raw) as JavaTronPackageJson;
  const config =
    packageJson.javaTronUp ??
    packageJson.javatronup ??
    packageJson['java-tron-up'];
  const options: JavaTronInstallOptions = {};

  if (config?.binDirectory) {
    options.binDirectory = config.binDirectory;
  }
  if (config?.cacheDirectory) {
    options.cacheDirectory = config.cacheDirectory;
  }
  if (config?.fullNode) {
    options.fullNode = config.fullNode;
  }
  if (config?.javaRuntime) {
    options.javaRuntime = config.javaRuntime;
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

  await rm(join(cacheDirectory, JAVA_TRON_CACHE_NAMESPACE), {
    force: true,
    recursive: true,
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
const executableArgs = ${JSON.stringify(executableArgs)};
const result = spawnSync(executablePath, executableArgs.concat(process.argv.slice(2)), {
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

function mergeArtifactConfig(
  defaults: JavaTronArtifactConfig,
  override: JavaTronArtifactConfig | undefined,
): JavaTronArtifactConfig {
  if (!override) {
    return defaults;
  }
  return {
    version: override.version ?? defaults.version,
    platforms: { ...defaults.platforms, ...override.platforms },
  };
}

function resolvePlatformConfig(
  config: JavaTronArtifactConfig,
  platform: string,
  label: string,
): JavaTronArtifactPlatformConfig {
  const platformConfig = config.platforms.current ?? config.platforms[platform];

  if (!platformConfig) {
    throw new Error(`No ${label} is configured for ${platform}.`);
  }

  return platformConfig;
}

function requireCompletePlatformConfig(
  config: Partial<JavaTronArtifactPlatformConfig>,
  label: string,
): JavaTronArtifactPlatformConfig {
  if (!config.url || !config.checksum) {
    throw new Error(`${label} require both a URL and a checksum.`);
  }

  return {
    checksum: config.checksum,
    url: config.url,
  };
}

function getCacheKey(config: JavaTronArtifactPlatformConfig): string {
  return createHash('sha256')
    .update(`${config.url}:${config.checksum}`)
    .digest('hex');
}

async function verifyFileChecksum(
  filePath: string,
  expectedChecksum: string,
  label: string,
): Promise<void> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  const checksum = hash.digest('hex');

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
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `${command} ${args.join(' ')} exited with code ${code}: ${stderr}`,
        ),
      );
    });
  });
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

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function getPlatformKey(): string {
  return `${osPlatform()}-${normalizeSystemArchitecture()}`;
}

function normalizeSystemArchitecture(architecture = osArch()): string {
  if (architecture === 'x64' && osPlatform() === 'darwin') {
    const result = spawnSync('sysctl', ['-n', 'sysctl.proc_translated'], {
      encoding: 'utf8',
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.stdout.trim() === '1') {
      return 'arm64';
    }
  }

  return architecture;
}

function readCliValue(option: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value.`);
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
