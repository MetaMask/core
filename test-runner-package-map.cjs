const { getWorkspaceLocations } = require('@metamask/action-utils');
const path = require('node:path');

const { workspaces } = require('./package.json');

// Do not add to this list: new packages are expected to use Vitest.
const PACKAGES_ON_JEST = new Set([
  '@metamask/assets-controller',
  '@metamask/assets-controllers',
  '@metamask/network-controller',
  '@metamask/perps-controller',
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
