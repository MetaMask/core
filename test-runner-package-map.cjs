const { getWorkspaceLocations } = require('@metamask/action-utils');
const path = require('node:path');

const { workspaces } = require('./package.json');

// Do not add to this list: new packages are expected to use Vitest.
const PACKAGES_ON_JEST = new Set([
  '@metamask/account-tree-controller',
  '@metamask/address-book-controller',
  '@metamask/advanced-chart-core',
  '@metamask/analytics-controller',
  '@metamask/analytics-data-regulation-controller',
  '@metamask/announcement-controller',
  '@metamask/app-metadata-controller',
  '@metamask/assets-controller',
  '@metamask/assets-controllers',
  '@metamask/base-data-service',
  '@metamask/bitcoin-regtest-up',
  '@metamask/bridge-controller',
  '@metamask/bridge-status-controller',
  '@metamask/build-utils',
  '@metamask/chain-agnostic-permission',
  '@metamask/client-controller',
  '@metamask/client-utils',
  '@metamask/compliance-controller',
  '@metamask/composable-controller',
  '@metamask/config-registry-controller',
  '@metamask/connectivity-controller',
  '@metamask/core-backend',
  '@metamask/cryptography',
  '@metamask/eip-5792-middleware',
  '@metamask/eip-7702-internal-rpc-middleware',
  '@metamask/eip1193-permission-middleware',
  '@metamask/eth-block-tracker',
  '@metamask/eth-json-rpc-middleware',
  '@metamask/eth-json-rpc-provider',
  '@metamask/foundryup',
  '@metamask/gas-fee-controller',
  '@metamask/geolocation-controller',
  '@metamask/java-tron-up',
  '@metamask/json-rpc-engine',
  '@metamask/json-rpc-middleware-stream',
  '@metamask/kyc-controller',
  '@metamask/local-node-utils',
  '@metamask/logging-controller',
  '@metamask/message-manager',
  '@metamask/messenger-cli',
  '@metamask/money-account-controller',
  '@metamask/multichain-account-service',
  '@metamask/multichain-api-middleware',
  '@metamask/multichain-network-controller',
  '@metamask/multichain-transactions-controller',
  '@metamask/name-controller',
  '@metamask/network-connection-banner-controller',
  '@metamask/network-controller',
  '@metamask/network-enablement-controller',
  '@metamask/notification-services-controller',
  '@metamask/permission-controller',
  '@metamask/permission-log-controller',
  '@metamask/perps-controller',
  '@metamask/platform-api-docs',
  '@metamask/preferences-controller',
  '@metamask/profile-controller',
  '@metamask/profile-metrics-controller',
  '@metamask/profile-sync-controller',
  '@metamask/ramps-controller',
  '@metamask/rate-limit-controller',
  '@metamask/react-data-query',
  '@metamask/remote-feature-flag-controller',
  '@metamask/selected-network-controller',
  '@metamask/sentinel-api-service',
  '@metamask/signature-controller',
  '@metamask/smart-transactions-controller',
  '@metamask/snap-account-service',
  '@metamask/solana-test-validator-up',
  '@metamask/stellar-quickstart-up',
  '@metamask/storage-service',
  '@metamask/transaction-controller',
  '@metamask/transaction-pay-controller',
  '@metamask/transaction-pay-middleware',
  '@metamask/wallet',
  '@metamask/wallet-cli',
  '@metamask/wallet-framework-docs',
]);

/**
 * Finds the locations of the workspaces still on Jest.
 *
 * @returns {Promise<string[]>} Locations relative to the repository root.
 */
async function getJestWorkspaceLocations() {
  const locations = await getWorkspaceLocations(workspaces, __dirname);

  return locations.filter((location) =>
    PACKAGES_ON_JEST.has(`@metamask/${path.basename(location)}`),
  );
}

module.exports = { PACKAGES_ON_JEST, getJestWorkspaceLocations };
