#!/usr/bin/env node
/* eslint-disable no-restricted-globals */
import {
  cleanJavaTronCache,
  installJavaTron,
  parseJavaTronInstallCliOptions,
  readJavaTronInstallOptionsFromPackageJson,
} from '../install.js';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === '--help' || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'cache' && args[0] === 'clean') {
    await cleanJavaTronCache({
      ...readJavaTronInstallOptionsFromPackageJson(),
      ...parseJavaTronInstallCliOptions(args.slice(1)),
    });
    console.log('[java-tron-up] cache cleaned');
    return;
  }

  const installArgs = command === 'install' ? args : process.argv.slice(2);
  const result = await installJavaTron({
    ...readJavaTronInstallOptionsFromPackageJson(),
    ...parseJavaTronInstallCliOptions(installArgs),
  });

  console.log(
    `[java-tron-up] java-tron ${
      result.cacheHit ? 'found in cache' : 'installed'
    } at ${result.fullNodeJar}`,
  );
  console.log(`[java-tron-up] Java runtime installed at ${result.javaBinary}`);
  console.log(`[java-tron-up] binary installed at ${result.binaryPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function printHelp(): void {
  console.log(`Usage: java-tron-up [install] [options]
       java-tron-up cache clean [options]

Commands:
  install      Install java-tron and the managed Java runtime. Default command.
  cache clean  Remove cached java-tron-up artifacts.

Options:
  --bin-directory <path>         Directory for the java-tron executable.
                                  Defaults to node_modules/.bin.
  --cache-directory <path>       Cache directory. Defaults to .metamask/cache.
  --full-node-url <url>          FullNode.jar URL for the current platform.
  --full-node-checksum <hash>    Expected FullNode.jar SHA-256 checksum.
  --java-runtime-url <url>       Java runtime archive URL for the current platform.
  --java-runtime-checksum <hash> Expected Java runtime SHA-256 checksum.
  --platform <platform>          Override platform key, e.g. linux-x64.
  --help                         Show this help text.`);
}
