#!/usr/bin/env node
/* eslint-disable no-restricted-globals */
import {
  cleanSolanaTestValidatorCache,
  installSolanaTestValidator,
  parseSolanaTestValidatorInstallCliOptions,
  readSolanaTestValidatorInstallOptionsFromPackageJson,
} from '../install';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === '--help' || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'cache' && args[0] === 'clean') {
    await cleanSolanaTestValidatorCache({
      ...readSolanaTestValidatorInstallOptionsFromPackageJson(),
      ...parseSolanaTestValidatorInstallCliOptions(args.slice(1)),
    });
    console.log('[solana-test-validator-up] cache cleaned');
    return;
  }

  const installArgs = command === 'install' ? args : process.argv.slice(2);
  const result = await installSolanaTestValidator({
    ...readSolanaTestValidatorInstallOptionsFromPackageJson(),
    ...parseSolanaTestValidatorInstallCliOptions(installArgs),
  });

  console.log(
    `[solana-test-validator-up] Solana release ${
      result.cacheHit ? 'found in cache' : 'installed'
    }`,
  );
  console.log(
    `[solana-test-validator-up] solana-test-validator installed at ${result.binaryPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function printHelp(): void {
  console.log(`Usage: solana-test-validator-up [install] [options]
       solana-test-validator-up cache clean [options]

Commands:
  install      Install solana-test-validator and solana CLI. Default command.
  cache clean  Remove cached solana-test-validator-up artifacts.

Options:
  --bin-directory <path>      Directory for executable wrappers.
                               Defaults to node_modules/.bin.
  --cache-directory <path>    Cache directory. Defaults to .metamask/cache.
  --release-url <url>         Solana release archive URL for the current platform.
  --release-checksum <hash>   Expected Solana release SHA-256 checksum.
  --platform <platform>       Override platform key, e.g. linux-x64.
  --help                      Show this help text.`);
}
