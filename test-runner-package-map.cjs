const { readdirSync } = require('node:fs');
const path = require('node:path');

const { workspaces } = require('./package.json');

// Do not add to this list: new packages are expected to use Vitest.
const PACKAGES_ON_JEST = new Set([
  '@metamask/account-tree-controller',
  '@metamask/accounts-controller',
  '@metamask/address-book-controller',
  '@metamask/advanced-chart-core',
  '@metamask/ai-controllers',
  '@metamask/analytics-controller',
  '@metamask/analytics-data-regulation-controller',
  '@metamask/announcement-controller',
  '@metamask/app-metadata-controller',
  '@metamask/approval-controller',
  '@metamask/assets-controller',
  '@metamask/assets-controllers',
  '@metamask/authenticated-user-storage',
  '@metamask/base-controller',
  '@metamask/base-data-service',
  '@metamask/bitcoin-regtest-up',
  '@metamask/bridge-controller',
  '@metamask/bridge-status-controller',
  '@metamask/build-utils',
  '@metamask/chain-agnostic-permission',
  '@metamask/chomp-api-service',
  '@metamask/claims-controller',
  '@metamask/client-controller',
  '@metamask/client-utils',
  '@metamask/compliance-controller',
  '@metamask/composable-controller',
  '@metamask/config-registry-controller',
  '@metamask/connectivity-controller',
  '@metamask/controller-utils',
  '@metamask/core-backend',
  '@metamask/cryptography',
  '@metamask/delegation-controller',
  '@metamask/earn-controller',
  '@metamask/eip-5792-middleware',
  '@metamask/eip-7702-internal-rpc-middleware',
  '@metamask/eip1193-permission-middleware',
  '@metamask/eth-block-tracker',
  '@metamask/eth-json-rpc-middleware',
  '@metamask/eth-json-rpc-provider',
  '@metamask/foundryup',
  '@metamask/gas-fee-controller',
  '@metamask/gator-permissions-controller',
  '@metamask/geolocation-controller',
  '@metamask/java-tron-up',
  '@metamask/json-rpc-engine',
  '@metamask/json-rpc-middleware-stream',
  '@metamask/keyring-controller',
  '@metamask/kyc-controller',
  '@metamask/local-node-utils',
  '@metamask/logging-controller',
  '@metamask/message-manager',
  '@metamask/messenger',
  '@metamask/messenger-cli',
  '@metamask/money-account-api-data-service',
  '@metamask/money-account-balance-service',
  '@metamask/money-account-controller',
  '@metamask/money-account-mfa-whitelist',
  '@metamask/money-account-upgrade-controller',
  '@metamask/money-account-utils',
  '@metamask/multichain-account-service',
  '@metamask/multichain-api-middleware',
  '@metamask/multichain-network-controller',
  '@metamask/multichain-transactions-controller',
  '@metamask/name-controller',
  '@metamask/network-connection-banner-controller',
  '@metamask/network-controller',
  '@metamask/network-enablement-controller',
  '@metamask/notification-services-controller',
  '@metamask/package-template',
  '@metamask/passkey-controller',
  '@metamask/permission-controller',
  '@metamask/permission-log-controller',
  '@metamask/perps-controller',
  '@metamask/phishing-controller',
  '@metamask/platform-api-docs',
  '@metamask/polling-controller',
  '@metamask/preferences-controller',
  '@metamask/profile-controller',
  '@metamask/profile-metrics-controller',
  '@metamask/profile-sync-controller',
  '@metamask/ramps-controller',
  '@metamask/rate-limit-controller',
  '@metamask/react-data-query',
  '@metamask/remote-feature-flag-controller',
  '@metamask/sample-controllers',
  '@metamask/seedless-onboarding-controller',
  '@metamask/selected-network-controller',
  '@metamask/sentinel-api-service',
  '@metamask/shield-controller',
  '@metamask/signature-controller',
  '@metamask/smart-transactions-controller',
  '@metamask/snap-account-service',
  '@metamask/social-controllers',
  '@metamask/solana-test-validator-up',
  '@metamask/stellar-quickstart-up',
  '@metamask/storage-service',
  '@metamask/subscription-controller',
  '@metamask/transaction-controller',
  '@metamask/transaction-pay-controller',
  '@metamask/transaction-pay-middleware',
  '@metamask/user-operation-controller',
  '@metamask/utils',
  '@metamask/wallet',
  '@metamask/wallet-cli',
  '@metamask/wallet-framework-docs',
]);

/**
 * Expands one `workspaces` pattern to the directories it matches.
 *
 * Only the `<dir>/*` shape the field actually uses is handled, and anything
 * else throws rather than silently matching nothing. `fs.globSync` would be
 * the obvious tool but needs a newer Node than this repo's engines range.
 *
 * @param {string} pattern - A pattern from the root `workspaces` field.
 * @returns {string[]} Matching directories, relative to the repository root.
 */
function expandWorkspacePattern(pattern) {
  const parent = path.dirname(pattern);
  if (path.basename(pattern) !== '*' || parent.includes('*')) {
    throw new Error(`Unsupported workspaces pattern: ${pattern}`);
  }

  let entries;
  try {
    entries = readdirSync(path.join(__dirname, parent), {
      withFileTypes: true,
    });
  } catch (error) {
    // A declared pattern that matches nothing yet, such as an empty `examples`.
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.posix.join(parent, entry.name));
}

// Taken from the `workspaces` field rather than assuming `packages/`, so a
// workspace added anywhere else is still assigned a runner.
const locations = workspaces.flatMap(expandWorkspacePattern);

// A constraint pins every package's name to its directory.
const onJest = (location) =>
  PACKAGES_ON_JEST.has(`@metamask/${path.basename(location)}`);

const JEST_WORKSPACES = locations.filter(onJest);
const VITEST_WORKSPACES = locations.filter((location) => !onJest(location));

module.exports = { PACKAGES_ON_JEST, JEST_WORKSPACES, VITEST_WORKSPACES };
