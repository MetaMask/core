/* eslint-disable import-x/no-nodejs-modules, no-restricted-globals */
import {
  cleanInstallerCache,
  getCacheKey,
  getMetamaskCacheDirectory,
  installExecutableWrapper,
  readCliValue,
  readPackageJsonToolConfig,
  runCommand,
} from '@metamask/local-node-utils';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const STELLAR_QUICKSTART_CACHE_NAMESPACE = 'stellar-quickstart-up';
const IMAGE_CACHE_NAMESPACE = 'image';

export type StellarQuickstartImageConfig = {
  digest?: string;
  reference: string;
  version: string;
};

export type StellarQuickstartInstallOptions = {
  binDirectory?: string;
  cacheDirectory?: string;
  cwd?: string;
  dockerBinary?: string;
  image?: Partial<StellarQuickstartImageConfig>;
  runArgs?: string[];
};

export type StellarQuickstartInstallResult = {
  binaryPath: string;
  cacheHit: boolean;
  digest?: string;
  imageReference: string;
  version: string;
};

export type StellarQuickstartInstallDependencies = {
  inspectDockerImage?: (
    dockerBinary: string,
    imageReference: string,
  ) => Promise<string>;
  pullDockerImage?: (
    dockerBinary: string,
    imageReference: string,
  ) => Promise<void>;
  runCommand?: typeof runCommand;
};

type StellarQuickstartPackageJsonConfig = Pick<
  StellarQuickstartInstallOptions,
  'binDirectory' | 'cacheDirectory' | 'image' | 'runArgs'
>;

export const STELLAR_QUICKSTART_DEFAULT_IMAGE: StellarQuickstartImageConfig = {
  version: 'latest',
  reference: 'stellar/quickstart:latest',
  digest:
    'sha256:8ddf3ed87a5c07eab5202b0fd95f06fb5db3f48cacd7e69fdc0e22925f181168',
};

export const STELLAR_QUICKSTART_DEFAULT_RUN_ARGS = [
  'run',
  '--rm',
  '-i',
  '-p',
  '8000:8000',
];

export function getStellarQuickstartCacheDirectory({
  cwd = process.cwd(),
  homeDirectory,
}: {
  cwd?: string;
  homeDirectory?: string;
} = {}): string {
  return getMetamaskCacheDirectory({
    cwd,
    homeDirectory,
    toolName: STELLAR_QUICKSTART_CACHE_NAMESPACE,
  });
}

export function readStellarQuickstartInstallOptionsFromPackageJson({
  cwd = process.cwd(),
  packageJsonPath = join(cwd, 'package.json'),
}: {
  cwd?: string;
  packageJsonPath?: string;
} = {}): StellarQuickstartInstallOptions {
  const config = readPackageJsonToolConfig({
    cwd,
    packageJsonPath,
    configKeys: [
      'stellarQuickstartUp',
      'stellarquickstartup',
      'stellar-quickstart-up',
    ],
  }) as Partial<StellarQuickstartPackageJsonConfig>;
  const options: StellarQuickstartInstallOptions = {};

  if (config.binDirectory) {
    options.binDirectory = config.binDirectory;
  }
  if (config.cacheDirectory) {
    options.cacheDirectory = config.cacheDirectory;
  }
  if (config.image) {
    options.image = config.image;
  }
  if (config.runArgs) {
    options.runArgs = config.runArgs;
  }

  return options;
}

export function parseStellarQuickstartInstallCliOptions(
  args: string[],
): StellarQuickstartInstallOptions {
  const options: StellarQuickstartInstallOptions = {};
  const image: Partial<StellarQuickstartImageConfig> = {};

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
      case '--docker-binary':
        options.dockerBinary = readCliValue(arg, value);
        index += 1;
        break;
      case '--image-digest':
        image.digest = readCliValue(arg, value);
        index += 1;
        break;
      case '--image-reference':
        image.reference = readCliValue(arg, value);
        index += 1;
        break;
      default:
        throw new Error(
          `Unknown stellar-quickstart-up install option: ${arg}`,
        );
    }
  }

  if (image.reference || image.digest) {
    options.image = image;
  }

  return options;
}

export async function installStellarQuickstart(
  options: StellarQuickstartInstallOptions = {},
  dependencies: StellarQuickstartInstallDependencies = {},
): Promise<StellarQuickstartInstallResult> {
  const cwd = options.cwd ?? process.cwd();
  const cacheDirectory =
    options.cacheDirectory ?? getStellarQuickstartCacheDirectory({ cwd });
  const binDirectory =
    options.binDirectory ?? join(cwd, 'node_modules', '.bin');
  const dockerBinary = options.dockerBinary ?? 'docker';
  const image = mergeImageConfig(
    STELLAR_QUICKSTART_DEFAULT_IMAGE,
    options.image,
  );
  const runArgs = options.runArgs ?? STELLAR_QUICKSTART_DEFAULT_RUN_ARGS;
  const runCommandImpl = dependencies.runCommand ?? runCommand;
  const pullDockerImage = dependencies.pullDockerImage ?? pullDockerImageDefault;
  const inspectDockerImage =
    dependencies.inspectDockerImage ?? inspectDockerImageDefault;

  await runCommandImpl(dockerBinary, ['version']);

  const imageResult = await installStellarQuickstartImage(
    {
      cacheDirectory,
      dockerBinary,
      image,
    },
    { inspectDockerImage, pullDockerImage },
  );
  const binaryPath = await installExecutableWrapper({
    binDirectory,
    commandName: 'stellar-quickstart',
    executableArgs: [...runArgs, imageResult.imageReference],
    executablePath: dockerBinary,
    pathResolution: 'absolute',
  });

  return {
    binaryPath,
    cacheHit: imageResult.cacheHit,
    digest: imageResult.digest,
    imageReference: imageResult.imageReference,
    version: image.version,
  };
}

export async function cleanStellarQuickstartCache(
  options: Pick<
    StellarQuickstartInstallOptions,
    'cacheDirectory' | 'cwd'
  > = {},
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const cacheDirectory =
    options.cacheDirectory ?? getStellarQuickstartCacheDirectory({ cwd });

  await cleanInstallerCache({
    cacheDirectory,
    namespace: STELLAR_QUICKSTART_CACHE_NAMESPACE,
  });
}

function mergeImageConfig(
  defaults: StellarQuickstartImageConfig,
  override?: Partial<StellarQuickstartImageConfig>,
): StellarQuickstartImageConfig {
  return {
    ...defaults,
    ...override,
  };
}

async function installStellarQuickstartImage(
  {
    cacheDirectory,
    dockerBinary,
    image,
  }: {
    cacheDirectory: string;
    dockerBinary: string;
    image: StellarQuickstartImageConfig;
  },
  dependencies: {
    inspectDockerImage: (
      dockerBinary: string,
      imageReference: string,
    ) => Promise<string>;
    pullDockerImage: (
      dockerBinary: string,
      imageReference: string,
    ) => Promise<void>;
  },
): Promise<{
  cacheHit: boolean;
  digest?: string;
  imageReference: string;
}> {
  const cacheKey = getCacheKey({
    checksum: image.digest ?? image.reference,
    url: image.reference,
  });
  const cacheRoot = join(
    cacheDirectory,
    STELLAR_QUICKSTART_CACHE_NAMESPACE,
    IMAGE_CACHE_NAMESPACE,
    cacheKey,
  );
  const digestPath = join(cacheRoot, '.image-digest');
  const referencePath = join(cacheRoot, '.image-reference');

  if (
    existsSync(digestPath) &&
    existsSync(referencePath) &&
    readFileSync(referencePath, 'utf8') === image.reference &&
    (!image.digest || readFileSync(digestPath, 'utf8') === image.digest)
  ) {
    return {
      cacheHit: true,
      digest: readFileSync(digestPath, 'utf8'),
      imageReference: image.reference,
    };
  }

  await rm(cacheRoot, { force: true, recursive: true });
  await mkdir(cacheRoot, { recursive: true });

  await dependencies.pullDockerImage(dockerBinary, image.reference);
  const digest = await dependencies.inspectDockerImage(
    dockerBinary,
    image.reference,
  );

  if (image.digest && digest !== image.digest) {
    throw new Error(
      `Stellar Quickstart image digest mismatch. Expected ${image.digest}, received ${digest}.`,
    );
  }

  await writeFile(referencePath, image.reference);
  await writeFile(digestPath, digest);

  return {
    cacheHit: false,
    digest,
    imageReference: image.reference,
  };
}

async function pullDockerImageDefault(
  dockerBinary: string,
  imageReference: string,
): Promise<void> {
  await runCommand(dockerBinary, ['pull', imageReference]);
}

async function inspectDockerImageDefault(
  dockerBinary: string,
  imageReference: string,
): Promise<string> {
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync(
    dockerBinary,
    ['image', 'inspect', imageReference, '--format', '{{.Id}}'],
    { encoding: 'utf8' },
  );

  return stdout.trim();
}
