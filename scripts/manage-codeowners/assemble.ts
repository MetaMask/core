import type {
  CodeownersConfig,
  CodeownersRule,
  CodeownersSection,
  PackageInfo,
} from './types.js';

const CORE_PLATFORM_TEAM = '@MetaMask/core-platform';

/**
 * Assembles the sections from the codeowners configuration file that will be
 * used to (re-)generate CODEOWNERS.
 *
 * @param config - The configuration specified in `codeowners.ts`.
 * @returns The assembled sections.
 */
export function assembleCodeownersSections(
  config: CodeownersConfig,
): CodeownersSection[] {
  return [
    buildPackagesSection(config.packages),
    {
      title: 'Overrides',
      rules: config.overrides,
    },
  ];
}

/**
 * Builds the Packages section with one nested section for each package, sorted
 * by package name.
 *
 * @param packages - Package ownership metadata, as defined in the codeowners
 * configuration file.
 * @returns The Packages section.
 */
function buildPackagesSection(
  packages: Record<string, PackageInfo>,
): CodeownersSection {
  return {
    title: 'Packages',
    rules: [],
    subsections: Object.entries(packages)
      .sort(([firstPackageName], [secondPackageName]) =>
        firstPackageName.localeCompare(secondPackageName),
      )
      .map(([packageName, packageInfo]) => ({
        title: packageName,
        rules: buildPackageRules(packageName, packageInfo),
      })),
  };
}

/**
 * Builds all CODEOWNERS rules associated with one package. As specified in the
 * codeowners configuration file, one or more teams will own the whole directory
 * for the package, and, optionally, certain initialization files in the Wallet
 * Library. The README, changelog, manifest, and certain configuration files
 * will be co-owned by the Core Platform team.
 *
 * @param packageDirectoryName - The directory in `packages/` where the package
 * is located.
 * @param packageInfo - The package ownership metadata, as defined in the
 * codeowners configuration file.
 * @returns The package's rules.
 */
function buildPackageRules(
  packageDirectoryName: string,
  packageInfo: PackageInfo,
): CodeownersRule[] {
  const owners = [...packageInfo.teams].sort();

  const rules: CodeownersRule[] = [
    { pattern: `/packages/${packageDirectoryName}`, owners },
  ];

  if (packageInfo.initializationPath !== undefined) {
    rules.push({
      pattern: `/packages/wallet/src/initialization/instances/${packageInfo.initializationPath}/`,
      owners,
    });
  }

  const releaseOwners = [
    ...new Set([...packageInfo.teams, CORE_PLATFORM_TEAM]),
  ].sort();
  const workspacePath = `/packages/${packageDirectoryName}`;
  rules.push(
    { pattern: `${workspacePath}/CHANGELOG.md`, owners: releaseOwners },
    { pattern: `${workspacePath}/package.json`, owners: releaseOwners },
    { pattern: `${workspacePath}/tsconfig.*`, owners: releaseOwners },
    { pattern: `${workspacePath}/typedoc.json`, owners: releaseOwners },
  );

  return rules;
}
