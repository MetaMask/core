import type {
  CodeownersRule,
  CodeownersSection,
} from './scripts/manage-codeowners/types.js';

/**
 * The GitHub teams that may own packages in this monorepo.
 */
type Team =
  | '@MetaMask/accounts-engineers'
  | '@MetaMask/auth-engineers'
  | '@MetaMask/confirmations'
  | '@MetaMask/core-extension-ux'
  | '@MetaMask/core-platform'
  | '@MetaMask/delegation'
  | '@MetaMask/earn'
  | '@MetaMask/engagement'
  | '@MetaMask/extension-platform'
  | '@MetaMask/metamask-assets'
  | '@MetaMask/mobile-core-ux'
  | '@MetaMask/mobile-platform'
  | '@MetaMask/money-movement'
  | '@MetaMask/networks'
  | '@MetaMask/ocap-kernel'
  | '@MetaMask/perps'
  | '@MetaMask/product-safety'
  | '@MetaMask/social-ai'
  | '@MetaMask/swaps-engineers'
  | '@MetaMask/transactions'
  | '@MetaMask/web3auth';

/**
 * The title of the CODEOWNERS section for each team that is the sole owner of
 * at least one package, in the order the sections should appear in the
 * generated `.github/CODEOWNERS` file.
 */
const TEAM_SECTION_TITLES = {
  '@MetaMask/accounts-engineers': 'Accounts Team',
  '@MetaMask/auth-engineers': 'Auth Team',
  '@MetaMask/metamask-assets': 'Assets Team',
  '@MetaMask/confirmations': 'Confirmations Team',
  '@MetaMask/transactions': 'Transactions Team',
  '@MetaMask/delegation': 'Delegation Team',
  '@MetaMask/earn': 'Earn Team',
  '@MetaMask/social-ai': 'Social AI Team',
  '@MetaMask/money-movement': 'Money Movement Team',
  '@MetaMask/networks': 'Networks Team',
  '@MetaMask/engagement': 'Engagement Team',
  '@MetaMask/perps': 'Perps Team',
  '@MetaMask/product-safety': 'Product Safety Team',
  '@MetaMask/swaps-engineers': 'Swaps-Bridge Team',
  '@MetaMask/mobile-platform': 'Mobile Platform Team',
  '@MetaMask/core-platform': 'Core Platform Team',
  '@MetaMask/web3auth': 'Web3Auth Team',
} as const satisfies Partial<Record<Team, string>>;

/**
 * The title of the CODEOWNERS section for packages owned by multiple teams.
 */
const JOINT_SECTION_TITLE = 'Joint team ownership';

/**
 * The title of a CODEOWNERS section that a package's directory rule can be
 * listed under.
 */
type SectionTitle =
  | (typeof TEAM_SECTION_TITLES)[keyof typeof TEAM_SECTION_TITLES]
  | typeof JOINT_SECTION_TITLE;

/**
 * Metadata about a package in the monorepo, used to generate CODEOWNERS
 * rules for it.
 */
type PackageInfo = {
  /**
   * The GitHub team(s) that own this package's top-level directory.
   */
  teams: [Team, ...Team[]];

  /**
   * The section that the package's directory rule is listed under. Defaults
   * to the sole owning team's section, or to "Joint team ownership" when the
   * package is owned by multiple teams. Set this to keep a multi-team package
   * under a specific team's section.
   */
  section?: SectionTitle;

  /**
   * The package's directory name under
   * `/packages/wallet/src/initialization/instances`, used to generate its rule
   * in the "Initialization" section. Omit this if the package has not been
   * added to the Wallet Library yet.
   */
  initializationPath?: string;
};

/**
 * Metadata about each package in the monorepo that has a CODEOWNERS entry,
 * keyed by its directory name under `/packages`. This is the single source
 * of truth from which every package-level rule is derived; adding a package
 * to CODEOWNERS only requires adding an entry here.
 */
const PACKAGES: Record<string, PackageInfo> = {
  'account-tree-controller': {
    teams: ['@MetaMask/accounts-engineers'],
  },
  'accounts-controller': {
    teams: ['@MetaMask/accounts-engineers'],
    initializationPath: 'accounts-controller',
  },
  'address-book-controller': {
    teams: ['@MetaMask/confirmations'],
    initializationPath: 'address-book-controller',
  },
  'ai-controllers': {
    teams: ['@MetaMask/social-ai'],
  },
  'analytics-controller': {
    teams: ['@MetaMask/mobile-platform', '@MetaMask/extension-platform'],
    section: 'Mobile Platform Team',
  },
  'analytics-data-regulation-controller': {
    teams: ['@MetaMask/mobile-platform', '@MetaMask/extension-platform'],
    section: 'Mobile Platform Team',
  },
  'announcement-controller': {
    teams: ['@MetaMask/core-extension-ux', '@MetaMask/mobile-core-ux'],
  },
  'app-metadata-controller': {
    teams: ['@MetaMask/mobile-platform'],
  },
  'approval-controller': {
    teams: ['@MetaMask/confirmations'],
    initializationPath: 'approval-controller',
  },
  'assets-controller': {
    teams: ['@MetaMask/metamask-assets'],
  },
  'assets-controllers': {
    teams: ['@MetaMask/metamask-assets'],
  },
  'authenticated-user-storage': {
    teams: ['@MetaMask/auth-engineers'],
  },
  'base-controller': {
    teams: ['@MetaMask/core-platform'],
  },
  'base-data-service': {
    teams: ['@MetaMask/core-platform'],
  },
  'bitcoin-regtest-up': {
    teams: [
      '@MetaMask/mobile-platform',
      '@MetaMask/extension-platform',
      '@MetaMask/networks',
    ],
  },
  'bridge-controller': {
    teams: ['@MetaMask/swaps-engineers'],
  },
  'bridge-status-controller': {
    teams: ['@MetaMask/swaps-engineers'],
  },
  'build-utils': {
    teams: ['@MetaMask/core-platform'],
  },
  'chain-agnostic-permission': {
    teams: ['@MetaMask/core-platform'],
  },
  'chomp-api-service': {
    teams: ['@MetaMask/earn', '@MetaMask/delegation'],
    section: 'Earn Team',
  },
  'claims-controller': {
    teams: ['@MetaMask/web3auth'],
  },
  'client-controller': {
    teams: [
      '@MetaMask/core-platform',
      '@MetaMask/extension-platform',
      '@MetaMask/mobile-platform',
    ],
  },
  'client-utils': {
    teams: ['@MetaMask/core-extension-ux', '@MetaMask/mobile-core-ux'],
  },
  'compliance-controller': {
    teams: ['@MetaMask/perps'],
  },
  'composable-controller': {
    teams: ['@MetaMask/core-platform'],
  },
  'config-registry-controller': {
    teams: ['@MetaMask/networks'],
  },
  'connectivity-controller': {
    teams: ['@MetaMask/core-platform'],
    initializationPath: 'connectivity-controller',
  },
  'controller-utils': {
    teams: ['@MetaMask/core-platform'],
  },
  'core-backend': {
    teams: ['@MetaMask/core-platform', '@MetaMask/metamask-assets'],
  },
  'delegation-controller': {
    teams: ['@MetaMask/delegation'],
  },
  'earn-controller': {
    teams: ['@MetaMask/earn'],
  },
  'eip-5792-middleware': {
    teams: ['@MetaMask/core-platform'],
  },
  'eip-7702-internal-rpc-middleware': {
    teams: ['@MetaMask/delegation', '@MetaMask/core-platform'],
    section: 'Delegation Team',
  },
  'eip1193-permission-middleware': {
    teams: ['@MetaMask/core-platform'],
  },
  'ens-controller': {
    teams: ['@MetaMask/confirmations'],
  },
  'eth-block-tracker': {
    teams: ['@MetaMask/core-platform'],
  },
  'eth-json-rpc-middleware': {
    teams: ['@MetaMask/core-platform'],
  },
  'eth-json-rpc-provider': {
    teams: ['@MetaMask/core-platform'],
  },
  foundryup: {
    teams: ['@MetaMask/mobile-platform', '@MetaMask/extension-platform'],
  },
  'gas-fee-controller': {
    teams: ['@MetaMask/confirmations'],
    initializationPath: 'gas-fee-controller',
  },
  'gator-permissions-controller': {
    teams: ['@MetaMask/delegation'],
  },
  'geolocation-controller': {
    teams: ['@MetaMask/mobile-platform'],
  },
  'java-tron-up': {
    teams: [
      '@MetaMask/mobile-platform',
      '@MetaMask/extension-platform',
      '@MetaMask/networks',
    ],
  },
  'json-rpc-engine': {
    teams: ['@MetaMask/core-platform'],
  },
  'json-rpc-middleware-stream': {
    teams: ['@MetaMask/core-platform'],
  },
  'keyring-controller': {
    teams: ['@MetaMask/accounts-engineers', '@MetaMask/core-platform'],
    initializationPath: 'keyring-controller',
  },
  'local-node-utils': {
    teams: [
      '@MetaMask/mobile-platform',
      '@MetaMask/extension-platform',
      '@MetaMask/networks',
    ],
  },
  'logging-controller': {
    teams: ['@MetaMask/confirmations'],
  },
  'message-manager': {
    teams: ['@MetaMask/confirmations'],
  },
  messenger: {
    teams: ['@MetaMask/core-platform'],
  },
  'messenger-cli': {
    teams: ['@MetaMask/core-platform'],
  },
  'money-account-api-data-service': {
    teams: ['@MetaMask/earn'],
  },
  'money-account-balance-service': {
    teams: ['@MetaMask/earn'],
  },
  'money-account-controller': {
    teams: ['@MetaMask/accounts-engineers'],
  },
  'money-account-upgrade-controller': {
    teams: ['@MetaMask/earn', '@MetaMask/delegation'],
    section: 'Earn Team',
  },
  'multichain-account-service': {
    teams: ['@MetaMask/accounts-engineers'],
  },
  'multichain-api-middleware': {
    teams: ['@MetaMask/core-platform'],
  },
  'multichain-network-controller': {
    teams: [
      '@MetaMask/core-platform',
      '@MetaMask/accounts-engineers',
      '@MetaMask/metamask-assets',
    ],
  },
  'multichain-transactions-controller': {
    teams: ['@MetaMask/accounts-engineers'],
  },
  'name-controller': {
    teams: ['@MetaMask/confirmations'],
  },
  'network-connection-banner-controller': {
    teams: ['@MetaMask/core-platform'],
  },
  'network-controller': {
    teams: ['@MetaMask/core-platform', '@MetaMask/metamask-assets'],
  },
  'network-enablement-controller': {
    teams: ['@MetaMask/metamask-assets'],
  },
  'notification-services-controller': {
    teams: ['@MetaMask/engagement'],
  },
  'passkey-controller': {
    teams: ['@MetaMask/web3auth'],
    initializationPath: 'passkey-controller',
  },
  'permission-controller': {
    teams: ['@MetaMask/core-platform'],
  },
  'permission-log-controller': {
    teams: ['@MetaMask/core-platform'],
  },
  'perps-controller': {
    teams: ['@MetaMask/perps'],
  },
  'phishing-controller': {
    teams: ['@MetaMask/product-safety'],
  },
  'platform-api-docs': {
    teams: ['@MetaMask/core-platform'],
  },
  'polling-controller': {
    teams: ['@MetaMask/core-platform'],
  },
  'preferences-controller': {
    teams: ['@MetaMask/core-platform'],
  },
  'profile-metrics-controller': {
    teams: ['@MetaMask/mobile-platform', '@MetaMask/extension-platform'],
  },
  'profile-sync-controller': {
    teams: ['@MetaMask/accounts-engineers'],
  },
  'ramps-controller': {
    teams: ['@MetaMask/money-movement'],
  },
  'rate-limit-controller': {
    teams: ['@MetaMask/core-platform'],
  },
  'react-data-query': {
    teams: ['@MetaMask/core-platform'],
  },
  'remote-feature-flag-controller': {
    teams: [
      '@MetaMask/extension-platform',
      '@MetaMask/mobile-platform',
      '@MetaMask/core-platform',
    ],
    initializationPath: 'remote-feature-flag-controller',
  },
  'sample-controllers': {
    teams: ['@MetaMask/core-platform'],
  },
  'seedless-onboarding-controller': {
    teams: ['@MetaMask/web3auth'],
    initializationPath: 'seedless-onboarding-controller',
  },
  'selected-network-controller': {
    teams: ['@MetaMask/core-platform'],
  },
  'sentinel-api-service': {
    teams: ['@MetaMask/confirmations', '@MetaMask/transactions'],
  },
  'shield-controller': {
    teams: ['@MetaMask/web3auth'],
  },
  'signature-controller': {
    teams: ['@MetaMask/confirmations'],
  },
  'smart-transactions-controller': {
    teams: ['@MetaMask/transactions'],
  },
  'snap-account-service': {
    teams: ['@MetaMask/accounts-engineers'],
  },
  'social-controllers': {
    teams: ['@MetaMask/social-ai'],
  },
  'solana-test-validator-up': {
    teams: [
      '@MetaMask/mobile-platform',
      '@MetaMask/extension-platform',
      '@MetaMask/networks',
    ],
  },
  'stellar-quickstart-up': {
    teams: [
      '@MetaMask/mobile-platform',
      '@MetaMask/extension-platform',
      '@MetaMask/networks',
    ],
  },
  'storage-service': {
    teams: [
      '@MetaMask/extension-platform',
      '@MetaMask/mobile-platform',
      '@MetaMask/core-platform',
    ],
    initializationPath: 'storage-service',
  },
  'subscription-controller': {
    teams: ['@MetaMask/web3auth'],
  },
  'transaction-controller': {
    teams: ['@MetaMask/confirmations'],
    initializationPath: 'transaction-controller',
  },
  'transaction-pay-controller': {
    teams: ['@MetaMask/confirmations'],
  },
  'user-operation-controller': {
    teams: ['@MetaMask/confirmations'],
  },
  wallet: {
    teams: ['@MetaMask/core-platform'],
  },
  'wallet-cli': {
    teams: ['@MetaMask/core-platform', '@MetaMask/ocap-kernel'],
    section: 'Core Platform Team',
  },
  'wallet-framework-docs': {
    teams: ['@MetaMask/core-platform'],
  },
};

/**
 * Rules that live in the "Joint team ownership" section but cover paths
 * within a package rather than a whole package, so they cannot be derived
 * from `PACKAGES`.
 */
const ADDITIONAL_JOINT_RULES: CodeownersRule[] = [
  {
    pattern: '/packages/eth-json-rpc-middleware/src/methods',
    owners: ['@MetaMask/confirmations', '@MetaMask/core-platform'],
  },
  {
    pattern: '/packages/eth-json-rpc-middleware/src/wallet.*',
    owners: ['@MetaMask/confirmations', '@MetaMask/core-platform'],
  },
];

/**
 * The CODEOWNERS sections, in the order they should appear in the generated
 * `.github/CODEOWNERS` file.
 */
const codeownersSections: CodeownersSection[] = [
  buildFirstSection(),
  ...buildTeamAndJointSections(),
  buildInitializationSection(),
  buildPackageReleaseSection(),
];

/**
 * Lists the entries in `PACKAGES`, sorted by package name.
 *
 * @returns The sorted package entries.
 */
function sortedPackageEntries(): [string, PackageInfo][] {
  return Object.entries(PACKAGES).sort(([nameA], [nameB]) =>
    nameA.localeCompare(nameB),
  );
}

/**
 * Determines whether a team has its own section in CODEOWNERS.
 *
 * @param team - The team to check.
 * @returns Whether the team has an entry in `TEAM_SECTION_TITLES`.
 */
function hasOwnSection(team: Team): team is keyof typeof TEAM_SECTION_TITLES {
  return Object.prototype.hasOwnProperty.call(TEAM_SECTION_TITLES, team);
}

/**
 * Determines the section that a package's directory rule is listed under: the
 * explicitly configured section if present, otherwise the sole owning team's
 * section, or the "Joint team ownership" section for packages owned by
 * multiple teams.
 *
 * @param name - The package's directory name under `/packages`.
 * @param packageInfo - The package's metadata.
 * @returns The title of the section for the package.
 */
function sectionTitleForPackage(
  name: string,
  packageInfo: PackageInfo,
): SectionTitle {
  if (packageInfo.section !== undefined) {
    return packageInfo.section;
  }
  if (packageInfo.teams.length > 1) {
    return JOINT_SECTION_TITLE;
  }
  const [team] = packageInfo.teams;
  if (hasOwnSection(team)) {
    return TEAM_SECTION_TITLES[team];
  }
  throw new Error(
    `Package "${name}" is solely owned by "${team}", which has no section. Add the team to TEAM_SECTION_TITLES, or set an explicit \`section\` on the package.`,
  );
}

/**
 * Builds the section at the top of CODEOWNERS that is reserved for files that
 * should always be owned by Core Platform.
 *
 * @returns The first section.
 */
function buildFirstSection(): CodeownersSection {
  return {
    rules: [{ pattern: '/.github/', owners: ['@MetaMask/core-platform'] }],
  };
}

/**
 * Builds the sections that map each package's directory to the team(s) that
 * own it: one section per team in `TEAM_SECTION_TITLES`, followed by the
 * "Joint team ownership" section. Each package is placed in the section
 * determined by `sectionTitleForPackage`, and rules are sorted by pattern
 * within each section.
 *
 * @returns The team sections and the "Joint team ownership" section.
 */
function buildTeamAndJointSections(): CodeownersSection[] {
  const rulesBySection = new Map<SectionTitle, CodeownersRule[]>([
    [JOINT_SECTION_TITLE, [...ADDITIONAL_JOINT_RULES]],
  ]);
  for (const [name, packageInfo] of sortedPackageEntries()) {
    const title = sectionTitleForPackage(name, packageInfo);
    rulesBySection.set(title, [
      ...(rulesBySection.get(title) ?? []),
      { pattern: `/packages/${name}`, owners: [...packageInfo.teams] },
    ]);
  }

  const sectionTitles: SectionTitle[] = [
    ...Object.values(TEAM_SECTION_TITLES),
    JOINT_SECTION_TITLE,
  ];
  return sectionTitles.flatMap((title) => {
    const rules = rulesBySection.get(title) ?? [];
    return rules.length === 0
      ? []
      : [
          {
            title,
            rules: rules.sort((ruleA, ruleB) =>
              ruleA.pattern.localeCompare(ruleB.pattern),
            ),
          },
        ];
  });
}

/**
 * Builds the section that maps initialization code for packages in `@metamask/wallet` to the
 * teams that own those packages.
 *
 * @returns The "Initialization" section.
 */
function buildInitializationSection(): CodeownersSection {
  return {
    title: 'Initialization',
    rules: sortedPackageEntries().flatMap(
      ([, { teams, initializationPath }]) =>
        initializationPath === undefined
          ? []
          : [
              {
                pattern: `/packages/wallet/src/initialization/instances/${initializationPath}/`,
                owners: [...teams],
              },
            ],
    ),
  };
}

/**
 * Builds the "Package Release related" section from all packages in `PACKAGES`.
 * The Core Platform team is added to each rule's owners (if not already
 * present), since that team co-owns the release process for every package.
 *
 * @returns The "Package Release related" CODEOWNERS section.
 */
function buildPackageReleaseSection(): CodeownersSection {
  return {
    title: 'Package Release related',
    rules: sortedPackageEntries().flatMap(([name, { teams }]) => {
      const workspacePath = `/packages/${name}`;
      const owners: Team[] = teams.includes('@MetaMask/core-platform')
        ? [...teams]
        : [...teams, '@MetaMask/core-platform'];
      return [
        { pattern: `${workspacePath}/package.json`, owners },
        { pattern: `${workspacePath}/CHANGELOG.md`, owners },
      ];
    }),
  };
}

export default codeownersSections;
