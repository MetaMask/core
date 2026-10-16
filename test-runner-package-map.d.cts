export const PACKAGES_ON_JEST: Set<string>;

/**
 * Finds the locations of the workspaces still on Jest.
 *
 * @returns Locations relative to the repository root.
 */
export function getJestWorkspaceLocations(): Promise<string[]>;
