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
  const initializationRules = buildInitializationRules(packages);

  return {
    title: 'Packages',
    rules: [],
    subsections: Object.entries(packages)
      .sort(([firstPackageName], [secondPackageName]) =>
        firstPackageName.localeCompare(secondPackageName),
      )
      .map(([packageName, packageInfo]) => ({
        title: packageName,
        rules: buildPackageRules(packageName, packageInfo, initializationRules),
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
 * @param initializationRules - Rules for Wallet package initialization code.
 * @returns The package's rules.
 */
function buildPackageRules(
  packageDirectoryName: string,
  packageInfo: PackageInfo,
  initializationRules: CodeownersRule[],
): CodeownersRule[] {
  const owners = [...packageInfo.teams].sort();

  const rules: CodeownersRule[] = [
    { pattern: `/packages/${packageDirectoryName}`, owners },
  ];

  if (packageDirectoryName === 'wallet') {
    rules.push(...initializationRules);
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

/**
 * Builds rules for package initialization code in the Wallet package. These are
 * emitted directly after the generic Wallet package rule so they take precedence
 * in GitHub's last-match-wins CODEOWNERS evaluation.
 *
 * @param packages - Package ownership metadata, as defined in the codeowners
 * configuration file.
 * @returns The initialization rules, sorted by package name.
 */
function buildInitializationRules(
  packages: Record<string, PackageInfo>,
): CodeownersRule[] {
  return Object.entries(packages)
    .sort(([firstPackageName], [secondPackageName]) =>
      firstPackageName.localeCompare(secondPackageName),
    )
    .flatMap(([, packageInfo]) => {
      if (packageInfo.initializationPath === undefined) {
        return [];
      }

      return {
        pattern: `/packages/wallet/src/initialization/instances/${packageInfo.initializationPath}/`,
        owners: [...packageInfo.teams].sort(),
      };
    });
}
