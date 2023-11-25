// import prompts from 'prompts';
// import type yargs from 'yargs';

/**
 * ```
 * TODO
 * - References in tsconfig.json and tsconfig.build.json
 *  - We could prompt the user about their intra-monorepo dependencies
 *  - This would help with dependencies and peerDependencies also
 * - License options
 *   - If not MIT, create empty license file for now
 * - Option for just some defaults?
 *
 * Placeholders:
 *
 * CURRENT_YEAR
 * NODE_VERSION
 * PACKAGE_NAME
 * PACKAGE_DESCRIPTION
 * PACKAGE_DIRECTORY_NAME
 *
 * Plan:
 * - Get cwd
 * - Create function for getting all the remaining package data (placeholders)
 *   - By prompting the user, except:
 *     - CURRENT_YEAR, NODE_VERSION (.nvrmc)
 * - Read and modify all the relevant monorepo files (like tsconfig etc.)
 *   - tsconfig.json, tsconfig.build.json
 * - Read and modify all the relevant template files
 *   - We can just do a simple string replace on all of them for the placeholders.
 *   - Set package.json
 * - Write package files to packages/PACKAGE_DIRECTORY_NAME
 * - Rewrite monorepo files
 * - Regenerate dependency graph (execute package command)
 */

/**
 * Creates a new monorepo package.
 */
export async function createPackage() {
  console.log('create-package');
}
