import type {
  CodeownersRule,
  CodeownersSection,
} from './scripts/manage-codeowners/types';

/**
 * Metadata about a package in the monorepo, used to generate CODEOWNERS
 * rules for it.
 */
type PackageInfo = {
  /**
   * The GitHub team(s) that own this package's top-level directory.
   */
  teams: string[];

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
 * of truth for which team(s) own a package, and is used to populate the
 * sections in `codeownersSections` below.
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
  },
  'analytics-data-regulation-controller': {
    teams: ['@MetaMask/mobile-platform', '@MetaMask/extension-platform'],
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
  },
  'wallet-framework-docs': {
    teams: ['@MetaMask/core-platform'],
  },
};

/**
 * The CODEOWNERS sections, in the order they should appear in the generated
 * `.github/CODEOWNERS` file.
 */
const codeownersSections: CodeownersSection[] = [
  buildFirstSection(),
  ...buildTeamSections(),
  buildJointTeamOwnershipSection(),
  buildInitializationSection(),
  buildPackageReleaseSection(),
];

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
 * Build sections within CODEOWNERS that define teams and the packages they own.
 *
 * @returns The team sections.
 */
function buildTeamSections(): CodeownersSection[] {
  return [
    {
      title: 'Accounts Team',
      rules: [
        buildRuleForPackage('accounts-controller'),
        buildRuleForPackage('multichain-transactions-controller'),
        buildRuleForPackage('multichain-account-service'),
        buildRuleForPackage('account-tree-controller'),
        buildRuleForPackage('profile-sync-controller'),
        buildRuleForPackage('money-account-controller'),
        buildRuleForPackage('snap-account-service'),
      ],
    },
    {
      title: 'Auth Team',
      rules: [buildRuleForPackage('authenticated-user-storage')],
    },
    {
      title: 'Assets Team',
      rules: [
        buildRuleForPackage('assets-controllers'),
        buildRuleForPackage('network-enablement-controller'),
        buildRuleForPackage('assets-controller'),
      ],
    },
    {
      title: 'Confirmations Team',
      rules: [
        buildRuleForPackage('address-book-controller'),
        buildRuleForPackage('approval-controller'),
        buildRuleForPackage('ens-controller'),
        buildRuleForPackage('gas-fee-controller'),
        buildRuleForPackage('logging-controller'),
        buildRuleForPackage('message-manager'),
        buildRuleForPackage('name-controller'),
        buildRuleForPackage('signature-controller'),
        buildRuleForPackage('transaction-controller'),
        buildRuleForPackage('transaction-pay-controller'),
        buildRuleForPackage('user-operation-controller'),
      ],
    },
    {
      title: 'Transactions Team',
      rules: [buildRuleForPackage('smart-transactions-controller')],
    },
    {
      title: 'Delegation Team',
      rules: [
        buildRuleForPackage('delegation-controller'),
        buildRuleForPackage('gator-permissions-controller'),
        buildRuleForPackage('eip-7702-internal-rpc-middleware'),
      ],
    },
    {
      title: 'Earn Team',
      rules: [
        buildRuleForPackage('earn-controller'),
        buildRuleForPackage('money-account-balance-service'),
        buildRuleForPackage('money-account-api-data-service'),
        buildRuleForPackage('chomp-api-service'),
        buildRuleForPackage('money-account-upgrade-controller'),
      ],
    },
    {
      title: 'Social AI Team',
      rules: [
        buildRuleForPackage('ai-controllers'),
        buildRuleForPackage('social-controllers'),
      ],
    },
    {
      title: 'Money Movement Team',
      rules: [buildRuleForPackage('ramps-controller')],
    },
    {
      title: 'Networks Team',
      rules: [buildRuleForPackage('config-registry-controller')],
    },
    {
      title: 'Engagement Team',
      rules: [buildRuleForPackage('notification-services-controller')],
    },
    {
      title: 'Perps Team',
      rules: [
        buildRuleForPackage('compliance-controller'),
        buildRuleForPackage('perps-controller'),
      ],
    },
    {
      title: 'Product Safety Team',
      rules: [buildRuleForPackage('phishing-controller')],
    },
    {
      title: 'Swaps-Bridge Team',
      rules: [
        buildRuleForPackage('bridge-controller'),
        buildRuleForPackage('bridge-status-controller'),
      ],
    },
    {
      title: 'Mobile Platform Team',
      rules: [
        buildRuleForPackage('app-metadata-controller'),
        buildRuleForPackage('analytics-controller'),
        buildRuleForPackage('analytics-data-regulation-controller'),
        buildRuleForPackage('geolocation-controller'),
      ],
    },
    {
      title: 'Core Platform Team',
      rules: [
        buildRuleForPackage('base-controller'),
        buildRuleForPackage('base-data-service'),
        buildRuleForPackage('build-utils'),
        buildRuleForPackage('chain-agnostic-permission'),
        buildRuleForPackage('composable-controller'),
        buildRuleForPackage('connectivity-controller'),
        buildRuleForPackage('controller-utils'),
        buildRuleForPackage('eip-5792-middleware'),
        buildRuleForPackage('eip1193-permission-middleware'),
        buildRuleForPackage('eth-block-tracker'),
        buildRuleForPackage('eth-json-rpc-middleware'),
        buildRuleForPackage('eth-json-rpc-provider'),
        buildRuleForPackage('json-rpc-engine'),
        buildRuleForPackage('json-rpc-middleware-stream'),
        buildRuleForPackage('messenger'),
        buildRuleForPackage('messenger-cli'),
        buildRuleForPackage('multichain-api-middleware'),
        buildRuleForPackage('network-connection-banner-controller'),
        buildRuleForPackage('permission-controller'),
        buildRuleForPackage('permission-log-controller'),
        buildRuleForPackage('platform-api-docs'),
        buildRuleForPackage('polling-controller'),
        buildRuleForPackage('preferences-controller'),
        buildRuleForPackage('rate-limit-controller'),
        buildRuleForPackage('react-data-query'),
        buildRuleForPackage('sample-controllers'),
        buildRuleForPackage('selected-network-controller'),
        buildRuleForPackage('wallet'),
        buildRuleForPackage('wallet-cli'),
        buildRuleForPackage('wallet-framework-docs'),
      ],
    },
    {
      title: 'Web3Auth Team',
      rules: [
        buildRuleForPackage('seedless-onboarding-controller'),
        buildRuleForPackage('passkey-controller'),
        buildRuleForPackage('shield-controller'),
        buildRuleForPackage('subscription-controller'),
        buildRuleForPackage('claims-controller'),
      ],
    },
  ];
}

/**
 * Builds the section that defines packages owned by multiple teams.
 *
 * @returns The "Joint team ownership" section.
 */
function buildJointTeamOwnershipSection(): CodeownersSection {
  return {
    title: 'Joint team ownership',
    rules: [
      buildRuleForPackage('announcement-controller'),
      buildRuleForPackage('client-utils'),
      buildRuleForPackage('core-backend'),
      {
        pattern: '/packages/eth-json-rpc-middleware/src/methods',
        owners: ['@MetaMask/confirmations', '@MetaMask/core-platform'],
      },
      {
        pattern: '/packages/eth-json-rpc-middleware/src/wallet.*',
        owners: ['@MetaMask/confirmations', '@MetaMask/core-platform'],
      },
      buildRuleForPackage('foundryup'),
      buildRuleForPackage('bitcoin-regtest-up'),
      buildRuleForPackage('java-tron-up'),
      buildRuleForPackage('local-node-utils'),
      buildRuleForPackage('solana-test-validator-up'),
      buildRuleForPackage('stellar-quickstart-up'),
      buildRuleForPackage('keyring-controller'),
      buildRuleForPackage('multichain-network-controller'),
      buildRuleForPackage('network-controller'),
      buildRuleForPackage('remote-feature-flag-controller'),
      buildRuleForPackage('sentinel-api-service'),
      buildRuleForPackage('storage-service'),
      buildRuleForPackage('client-controller'),
      buildRuleForPackage('profile-metrics-controller'),
    ],
  };
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
    rules: Object.keys(PACKAGES)
      .filter((name) => PACKAGES[name].initializationPath !== undefined)
      .sort()
      .map((name) => {
        const { teams, initializationPath } = PACKAGES[name];
        return {
          pattern: `/packages/wallet/src/initialization/instances/${initializationPath}/`,
          owners: teams,
        };
      }),
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
  // These packages are currently not alphabetized.
  const packageNames = [
    'account-tree-controller',
    'accounts-controller',
    'analytics-controller',
    'analytics-data-regulation-controller',
    'address-book-controller',
    'announcement-controller',
    'client-utils',
    'approval-controller',
    'assets-controllers',
    'assets-controller',
    'config-registry-controller',
    'delegation-controller',
    'earn-controller',
    'money-account-balance-service',
    'money-account-api-data-service',
    'ens-controller',
    'gas-fee-controller',
    'gator-permissions-controller',
    'geolocation-controller',
    'keyring-controller',
    'passkey-controller',
    'logging-controller',
    'message-manager',
    'multichain-account-service',
    'name-controller',
    'notification-services-controller',
    'compliance-controller',
    'perps-controller',
    'phishing-controller',
    'ramps-controller',
    'authenticated-user-storage',
    'profile-metrics-controller',
    'profile-sync-controller',
    'signature-controller',
    'smart-transactions-controller',
    'sentinel-api-service',
    'transaction-controller',
    'transaction-pay-controller',
    'user-operation-controller',
    'multichain-transactions-controller',
    'bridge-controller',
    'remote-feature-flag-controller',
    'storage-service',
    'bridge-status-controller',
    'app-metadata-controller',
    'foundryup',
    'bitcoin-regtest-up',
    'java-tron-up',
    'local-node-utils',
    'solana-test-validator-up',
    'stellar-quickstart-up',
    'seedless-onboarding-controller',
    'shield-controller',
    'network-enablement-controller',
    'subscription-controller',
    'core-backend',
    'claims-controller',
    'ai-controllers',
    'client-controller',
    'social-controllers',
    'money-account-controller',
    'chomp-api-service',
    'money-account-upgrade-controller',
    'snap-account-service',
  ] as const satisfies (keyof typeof PACKAGES)[];

  return {
    title: 'Package Release related',
    rules: packageNames.flatMap((name) => {
      const { teams } = PACKAGES[name];
      const workspacePath = `/packages/${name}`;
      const owners = teams.includes('@MetaMask/core-platform')
        ? teams
        : [...teams, '@MetaMask/core-platform'];
      return [
        { pattern: `${workspacePath}/package.json`, owners },
        { pattern: `${workspacePath}/CHANGELOG.md`, owners },
      ];
    }),
  };
}

/**
 * Builds the rule that maps a package's directory to the team(s) that own it.
 *
 * @param name - The package's directory name under `/packages`.
 * @returns The rule for the package.
 */
function buildRuleForPackage(name: keyof typeof PACKAGES): CodeownersRule {
  return { pattern: `/packages/${name}`, owners: PACKAGES[name].teams };
}

export default codeownersSections;
