#!/usr/bin/env node
/* eslint-disable no-restricted-globals */
import {
  cleanBitcoinRegtestCache,
  installBitcoinRegtest,
  parseBitcoinRegtestInstallCliOptions,
  readBitcoinRegtestInstallOptionsFromPackageJson,
} from '../install';

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === '--help' || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'cache' && args[0] === 'clean') {
    await cleanBitcoinRegtestCache({
      ...readBitcoinRegtestInstallOptionsFromPackageJson(),
      ...parseBitcoinRegtestInstallCliOptions(args.slice(1)),
    });
    console.log('[bitcoin-regtest-up] cache cleaned');
    return;
  }

  const installArgs = command === 'install' ? args : process.argv.slice(2);
  const result = await installBitcoinRegtest({
    ...readBitcoinRegtestInstallOptionsFromPackageJson(),
    ...parseBitcoinRegtestInstallCliOptions(installArgs),
  });

  console.log(
    `[bitcoin-regtest-up] Bitcoin Core ${
      result.cacheHit ? 'found in cache' : 'installed'
    }`,
  );
  console.log(
    `[bitcoin-regtest-up] bitcoind installed at ${result.bitcoindBinary}`,
  );
  console.log(
    `[bitcoin-regtest-up] bitcoin-cli installed at ${result.bitcoinCliBinary}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function printHelp(): void {
  console.log(`Usage: bitcoin-regtest-up [install] [options]
       bitcoin-regtest-up cache clean [options]

Commands:
  install      Install Bitcoin Core bitcoind and bitcoin-cli. Default command.
  cache clean  Remove cached bitcoin-regtest-up artifacts.

Options:
  --bin-directory <path>          Directory for executable wrappers.
                                   Defaults to node_modules/.bin.
  --cache-directory <path>        Cache directory. Defaults to .metamask/cache.
  --bitcoin-core-url <url>        Bitcoin Core archive URL for the current platform.
  --bitcoin-core-checksum <hash>  Expected Bitcoin Core SHA-256 checksum.
  --platform <platform>           Override platform key, e.g. linux-x64.
  --help                          Show this help text.`);
}
