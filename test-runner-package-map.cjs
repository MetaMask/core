const { getWorkspaceLocations } = require('@metamask/action-utils');
const path = require('node:path');

const { workspaces } = require('./package.json');

// Do not add to this list: new packages are expected to use Vitest.
const PACKAGES_ON_JEST = new Set([
  '@metamask/analytics-controller',
  '@metamask/analytics-data-regulation-controller',
  '@metamask/app-metadata-controller',
  '@metamask/assets-controller',
  '@metamask/assets-controllers',
  '@metamask/base-data-service',
  '@metamask/build-utils',
  '@metamask/chain-agnostic-permission',
  '@metamask/client-controller',
  '@metamask/compliance-controller',
  '@metamask/composable-controller',
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
  '@metamask/geolocation-controller',
  '@metamask/json-rpc-engine',
  '@metamask/json-rpc-middleware-stream',
  '@metamask/messenger-cli',
  '@metamask/multichain-api-middleware',
  '@metamask/network-connection-banner-controller',
  '@metamask/network-controller',
  '@metamask/network-enablement-controller',
  '@metamask/permission-controller',
  '@metamask/permission-log-controller',
  '@metamask/perps-controller',
  '@metamask/platform-api-docs',
  '@metamask/preferences-controller',
  '@metamask/profile-metrics-controller',
  '@metamask/rate-limit-controller',
  '@metamask/react-data-query',
  '@metamask/remote-feature-flag-controller',
  '@metamask/selected-network-controller',
  '@metamask/storage-service',
  '@metamask/wallet',
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
