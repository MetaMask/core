#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';

// Configuration
const CLIENTS = {
  extension: '/Volumes/Projects/consensys/metamask-extension',
  mobile: '/Volumes/Projects/consensys/metamask-mobile',
} as const;
const PACKAGES_DIR = path.join(process.cwd(), 'packages');
const TEAMS_FILE = path.join(process.cwd(), 'teams.json');

// Colors for terminal output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
} as const;

type PackageInfo = {
  version: string;
  path: string;
};

type VersionComparison = {
  monorepoMajor: number;
  clientMajor: number;
  difference: number;
  isUpToDate: boolean;
};

type PackageResult = VersionComparison & {
  name: string;
  monorepoVersion: string;
  clientVersion: string;
  teams?: string[];
};

type Results = {
  upToDate: PackageResult[];
  behind: PackageResult[];
  notUsed: { name: string; monorepoVersion: string }[];
};

type TeamMapping = Record<string, string>;

type ClientResults = {
  name: string;
  results: Results | null;
};

/**
 * Extract version from package string, handling patch references.
 *
 * @param versionString - The version string to extract from.
 * @returns The extracted semantic version string.
 */
function extractVersion(versionString: string): string {
  // Remove leading ^ or ~
  let cleanVersion = versionString.replace(/^[\^~]/u, '');

  // Handle patch format: patch:@metamask/assets-controllers@npm%3A73.3.0#...
  if (cleanVersion.startsWith('patch:')) {
    const patchMatch = cleanVersion.match(/patch:.*@npm%3A([^#]+)#/u);
    if (patchMatch && patchMatch[1]) {
      cleanVersion = patchMatch[1];
    } else {
      // Try alternative patch format
      const altMatch = cleanVersion.match(/patch:.*@([0-9]+\.[0-9]+\.[0-9]+)/u);
      if (altMatch && altMatch[1]) {
        cleanVersion = altMatch[1];
      }
    }
  }

  // Handle workspace protocol
  if (cleanVersion.startsWith('workspace:')) {
    cleanVersion = cleanVersion.replace(/^workspace:/u, '');
  }

  // Handle npm protocol
  if (cleanVersion.includes('@npm:')) {
    const npmMatch = cleanVersion.match(/@npm:([0-9]+\.[0-9]+\.[0-9]+)/u);
    if (npmMatch && npmMatch[1]) {
      cleanVersion = npmMatch[1];
    }
  }

  // Final cleanup - ensure we have a valid semver
  const versionMatch = cleanVersion.match(/([0-9]+\.[0-9]+\.[0-9]+[^#]*)/u);
  if (versionMatch && versionMatch[1]) {
    return versionMatch[1];
  }

  return cleanVersion;
}

/**
 * Read package.json file.
 *
 * @param filePath - The path to the package.json file.
 * @returns The parsed package.json object or null if failed.
 */
function readPackageJson(filePath: string): Record<string, unknown> | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(
      `Error reading ${filePath}:`,
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Get team mapping from teams.json.
 *
 * @returns Team mapping or empty object if failed.
 */
function getTeamMapping(): TeamMapping {
  try {
    const content = fs.readFileSync(TEAMS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(
      `Warning: Could not read teams.json:`,
      error instanceof Error ? error.message : String(error),
    );
    return {};
  }
}

/**
 * Get all packages from the monorepo.
 *
 * @returns Map of package names to their info.
 */
function getMonorepoPackages(): Map<string, PackageInfo> {
  const packages = new Map<string, PackageInfo>();

  if (!fs.existsSync(PACKAGES_DIR)) {
    console.error('Packages directory not found:', PACKAGES_DIR);
    return packages;
  }

  const entries = fs.readdirSync(PACKAGES_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const packageJsonPath = path.join(
        PACKAGES_DIR,
        entry.name,
        'package.json',
      );
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = readPackageJson(packageJsonPath);
        if (
          packageJson &&
          packageJson.name &&
          typeof packageJson.name === 'string' &&
          packageJson.version &&
          typeof packageJson.version === 'string'
        ) {
          packages.set(packageJson.name, {
            version: packageJson.version,
            path: path.join(PACKAGES_DIR, entry.name),
          });
        }
      }
    }
  }

  return packages;
}

/**
 * Get client dependencies.
 *
 * @param clientPath - The path to the client repository.
 * @returns Combined dependencies and devDependencies or null if failed.
 */
function getClientDependencies(
  clientPath: string,
): Record<string, string> | null {
  const packageJsonPath = path.join(clientPath, 'package.json');
  const packageJson = readPackageJson(packageJsonPath);

  if (!packageJson) {
    return null;
  }

  const allDeps: Record<string, string> = {
    ...((packageJson.dependencies as Record<string, string>) || {}),
    ...((packageJson.devDependencies as Record<string, string>) || {}),
  };

  return allDeps;
}

/**
 * Compare major versions.
 *
 * @param monorepoVersion - The version from the monorepo.
 * @param clientVersion - The version from the client.
 * @returns Version comparison results.
 */
function compareMajorVersions(
  monorepoVersion: string,
  clientVersion: string,
): VersionComparison {
  try {
    const cleanClientVersion = extractVersion(clientVersion);

    // Validate versions
    if (!semver.valid(monorepoVersion)) {
      throw new Error(`Invalid monorepo version: ${monorepoVersion}`);
    }
    if (!semver.valid(cleanClientVersion)) {
      throw new Error(
        `Invalid client version after extraction: ${cleanClientVersion} (original: ${clientVersion})`,
      );
    }

    const monoMajor = semver.major(monorepoVersion);
    const clientMajor = semver.major(cleanClientVersion);

    return {
      monorepoMajor: monoMajor,
      clientMajor,
      difference: monoMajor - clientMajor,
      isUpToDate: monoMajor === clientMajor,
    };
  } catch (error) {
    console.error(
      `Error comparing versions:`,
      error instanceof Error ? error.message : String(error),
    );
    console.error(`  Monorepo version: ${monorepoVersion}`);
    console.error(`  Client version: ${clientVersion}`);
    throw error;
  }
}

/**
 * Check package versions for a specific client.
 *
 * @param clientName - The name of the client.
 * @param clientPath - The path to the client repository.
 * @param monorepoPackages - Map of monorepo packages.
 * @param teamMapping - Team mapping from teams.json.
 * @returns The results of the version check.
 */
function checkClientVersions(
  clientName: string,
  clientPath: string,
  monorepoPackages: Map<string, PackageInfo>,
  teamMapping: TeamMapping,
): Results | null {
  const clientDeps = getClientDependencies(clientPath);
  if (!clientDeps) {
    console.error(`Failed to read ${clientName} package.json`);
    return null;
  }

  const results: Results = {
    upToDate: [],
    behind: [],
    notUsed: [],
  };

  Array.from(monorepoPackages.entries()).forEach(
    ([packageName, packageInfo]) => {
      if (clientDeps[packageName]) {
        try {
          const clientVersionRaw = clientDeps[packageName];
          const clientVersion = extractVersion(clientVersionRaw);
          const comparison = compareMajorVersions(
            packageInfo.version,
            clientVersion,
          );

          const result: PackageResult = {
            name: packageName,
            monorepoVersion: packageInfo.version,
            clientVersion,
            ...comparison,
          };

          // Add team info if available
          const teamKey = packageName.replace('@', '');
          if (teamMapping[teamKey]) {
            result.teams = teamMapping[teamKey].split(',').map((t) => t.trim());
          }

          if (comparison.isUpToDate) {
            results.upToDate.push(result);
          } else if (comparison.difference > 0) {
            results.behind.push(result);
          } else {
            // This shouldn't happen - client version is newer than monorepo
            console.error(
              `WARNING: ${packageName} has an invalid version state in ${clientName}:`,
            );
            console.error(`  Monorepo: v${packageInfo.version}`);
            console.error(`  ${clientName}: v${clientVersion}`);
            console.error(
              `  This suggests the ${clientName} is using a version that doesn't exist in the monorepo!`,
            );
          }
        } catch (error) {
          console.error(
            `Error processing ${packageName} for ${clientName}:`,
            error instanceof Error ? error.message : String(error),
          );
          console.error(`  Raw version string: ${clientDeps[packageName]}`);
        }
      }
    },
  );

  // Calculate not used packages (only once, using extension as reference)
  if (clientName === 'Extension') {
    Array.from(monorepoPackages.entries()).forEach(
      ([packageName, packageInfo]) => {
        if (!clientDeps[packageName]) {
          results.notUsed.push({
            name: packageName,
            monorepoVersion: packageInfo.version,
          });
        }
      },
    );
  }

  return results;
}

/**
 * Display results for a client.
 *
 * @param clientName - The name of the client.
 * @param results - The results to display.
 */
function displayClientResults(clientName: string, results: Results): void {
  console.log(
    `${colors.bold}=== ${clientName.toUpperCase()} PACKAGES ===${colors.reset}\n`,
  );

  // Up to date packages
  if (results.upToDate.length > 0) {
    console.log(
      `${colors.green}${colors.bold}✓ Up to date (${results.upToDate.length} packages)${colors.reset}`,
    );
    results.upToDate.forEach((pkg) => {
      const teamInfo =
        pkg.teams && pkg.teams.length > 0
          ? ` ${colors.blue}[${pkg.teams.join(', ')}]${colors.reset}`
          : '';
      console.log(`  ${colors.green}✓${colors.reset} ${pkg.name}${teamInfo}`);
      console.log(
        `    Monorepo: v${pkg.monorepoVersion} (major: ${pkg.monorepoMajor})`,
      );
      console.log(
        `    ${clientName}: v${pkg.clientVersion} (major: ${pkg.clientMajor})\n`,
      );
    });
  }

  // Behind packages
  if (results.behind.length > 0) {
    console.log(
      `${colors.red}${colors.bold}✗ Behind (${results.behind.length} packages)${colors.reset}`,
    );
    results.behind
      .sort((a, b) => b.difference - a.difference)
      .forEach((pkg) => {
        const teamInfo =
          pkg.teams && pkg.teams.length > 0
            ? ` ${colors.blue}[${pkg.teams.join(', ')}]${colors.reset}`
            : '';
        console.log(
          `  ${colors.red}✗${colors.reset} ${pkg.name} ${colors.yellow}(${pkg.difference} major version${pkg.difference !== 1 ? 's' : ''} behind)${colors.reset}${teamInfo}`,
        );
        console.log(
          `    Monorepo: v${pkg.monorepoVersion} (major: ${pkg.monorepoMajor})`,
        );
        console.log(
          `    ${clientName}: v${pkg.clientVersion} (major: ${pkg.clientMajor})\n`,
        );
      });
  }
}

/**
 * Main function
 */
function main(): void {
  console.log(
    `${colors.bold}Checking package versions between monorepo and MetaMask clients...${colors.reset}\n`,
  );

  // Get all packages from monorepo
  const monorepoPackages = getMonorepoPackages();
  console.log(`Found ${monorepoPackages.size} packages in monorepo\n`);

  // Get team mapping
  const teamMapping = getTeamMapping();

  // Check each client
  const clientResults: ClientResults[] = [];
  let hasErrors = false;

  for (const [clientKey, clientPath] of Object.entries(CLIENTS)) {
    const clientName = clientKey.charAt(0).toUpperCase() + clientKey.slice(1);
    console.log(`\nChecking ${clientName}...`);

    const results = checkClientVersions(
      clientName,
      clientPath,
      monorepoPackages,
      teamMapping,
    );
    if (results) {
      clientResults.push({ name: clientName, results });
    } else {
      hasErrors = true;
    }
  }

  // Display results for each client
  clientResults.forEach(({ name, results }) => {
    if (results) {
      console.log('\n');
      displayClientResults(name, results);
    }
  });

  // Combined summary
  console.log(`\n${colors.bold}=== COMBINED SUMMARY ===${colors.reset}`);
  console.log(`Total packages in monorepo: ${monorepoPackages.size}`);

  let totalBehind = 0;
  const teamWorkload: Record<string, Set<string>> = {};

  clientResults.forEach(({ name, results }) => {
    if (results) {
      const used = results.upToDate.length + results.behind.length;
      console.log(`\n${name}:`);
      console.log(`  Used: ${used}`);
      console.log(
        `  ${colors.green}Up to date: ${results.upToDate.length}${colors.reset}`,
      );
      console.log(
        `  ${colors.red}Behind: ${results.behind.length}${colors.reset}`,
      );
      totalBehind += results.behind.length;

      // Track team workload
      results.behind.forEach((pkg) => {
        if (pkg.teams) {
          pkg.teams.forEach((team) => {
            if (!teamWorkload[team]) {
              teamWorkload[team] = new Set();
            }
            teamWorkload[team].add(`${pkg.name} (${name})`);
          });
        }
      });
    }
  });

  // Show not used only once
  const firstResults = clientResults[0]?.results;
  if (firstResults) {
    console.log(`\nNot used in any client: ${firstResults.notUsed.length}`);
  }

  // Show team workload summary
  const teamsWithWork = Object.entries(teamWorkload)
    .map(([team, packages]) => ({
      team,
      count: packages.size,
      packages: Array.from(packages),
    }))
    .sort((a, b) => b.count - a.count);

  if (teamsWithWork.length > 0) {
    console.log(`\n${colors.bold}=== TEAM WORKLOAD ===${colors.reset}`);
    teamsWithWork.forEach(({ team, count, packages }) => {
      console.log(
        `\n${colors.blue}${team}${colors.reset}: ${count} package${count !== 1 ? 's' : ''} to upgrade`,
      );
      packages.forEach((pkg) => {
        console.log(`  - ${pkg}`);
      });
    });
  }

  // Throw error if any packages are behind or there were errors
  if (hasErrors) {
    throw new Error('Failed to read one or more client package.json files');
  }

  if (totalBehind > 0) {
    throw new Error(
      `${totalBehind} total packages are behind their monorepo versions across all clients`,
    );
  }
}

// Run the script
main();
