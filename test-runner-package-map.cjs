const { getWorkspaceLocations } = require('@metamask/action-utils');
const path = require('node:path');

const { workspaces } = require('./package.json');

// Do not add to this list: new packages are expected to use Vitest.
const PACKAGES_ON_JEST = new Set([
  '@metamask/assets-controller',
  '@metamask/chain-agnostic-permission',
  '@metamask/eip-5792-middleware',
  '@metamask/eip-7702-internal-rpc-middleware',
  '@metamask/eip1193-permission-middleware',
  '@metamask/eth-block-tracker',
  '@metamask/eth-json-rpc-middleware',
  '@metamask/eth-json-rpc-provider',
  '@metamask/json-rpc-engine',
  '@metamask/json-rpc-middleware-stream',
  '@metamask/multichain-api-middleware',
  '@metamask/network-controller',
  '@metamask/permission-controller',
  '@metamask/permission-log-controller',
  '@metamask/perps-controller',
  '@metamask/selected-network-controller',
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
