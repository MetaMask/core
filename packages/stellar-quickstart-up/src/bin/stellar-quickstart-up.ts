#!/usr/bin/env node
/* eslint-disable no-restricted-globals */
import {
  cleanStellarQuickstartCache,
  installStellarQuickstart,
  parseStellarQuickstartInstallCliOptions,
  readStellarQuickstartInstallOptionsFromPackageJson,
} from '../install';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === '--help' || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'cache' && args[0] === 'clean') {
    await cleanStellarQuickstartCache({
      ...readStellarQuickstartInstallOptionsFromPackageJson(),
      ...parseStellarQuickstartInstallCliOptions(args.slice(1)),
    });
    console.log('[stellar-quickstart-up] cache cleaned');
    return;
  }

  const installArgs = command === 'install' ? args : process.argv.slice(2);
  const result = await installStellarQuickstart({
    ...readStellarQuickstartInstallOptionsFromPackageJson(),
    ...parseStellarQuickstartInstallCliOptions(installArgs),
  });

  console.log(
    `[stellar-quickstart-up] Stellar Quickstart image ${
      result.cacheHit ? 'found in cache' : 'installed'
    }`,
  );
  console.log(
    `[stellar-quickstart-up] stellar-quickstart installed at ${result.binaryPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function printHelp(): void {
  console.log(`Usage: stellar-quickstart-up [install] [options]
       stellar-quickstart-up cache clean [options]

Commands:
  install      Pull the Stellar Quickstart image and install wrappers. Default command.
  cache clean  Remove cached stellar-quickstart-up artifacts.

Options:
  --bin-directory <path>         Directory for executable wrappers.
                                 Defaults to node_modules/.bin.
  --cache-directory <path>       Cache directory. Defaults to .metamask/cache.
  --docker-binary <path>         Docker CLI binary. Defaults to docker.
  --image-reference <reference>  Docker image reference override.
  --image-digest <digest>        Expected Docker image digest.
  --help                         Show this help text.`);
}
