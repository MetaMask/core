// This file defines the mapping between GitHub teams and the packages they
// codeown within this repo (and defines other, custom codeowner rules).
//
// Please keep the teams referenced in this file synchronized with the
// `teams.json` file in the repository root. That file is used for some
// automated workflows.

import type { CodeownersConfig } from './scripts/manage-codeowners/types.js';

const config = {
  packages: {
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
        '@MetaMask/emerging-opportunities',
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
      initializationPath: 'claims-controller',
    },
    'claims-service': {
      teams: ['@MetaMask/web3auth'],
      initializationPath: 'claims-service',
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
      teams: ['@MetaMask/networks', '@MetaMask/emerging-opportunities'],
    },
    'connectivity-controller': {
      teams: ['@MetaMask/core-platform'],
      initializationPath: 'connectivity-controller',
    },
    'controller-utils': {
      teams: ['@MetaMask/core-platform'],
    },
    'core-backend': {
      teams: ['@MetaMask/metamask-assets'],
    },
    cryptography: {
      teams: ['@MetaMask/core-platform'],
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
        '@MetaMask/emerging-opportunities',
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
    'kyc-controller': {
      teams: ['@MetaMask/universal-kyc'],
    },
    'local-node-utils': {
      teams: [
        '@MetaMask/mobile-platform',
        '@MetaMask/extension-platform',
        '@MetaMask/networks',
        '@MetaMask/emerging-opportunities',
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
    'money-account-utils': {
      teams: ['@MetaMask/earn'],
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
    'shield-api-service': {
      teams: ['@MetaMask/web3auth'],
      initializationPath: 'shield-api-service',
    },
    'shield-controller': {
      teams: ['@MetaMask/web3auth'],
      initializationPath: 'shield-controller',
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
        '@MetaMask/emerging-opportunities',
      ],
    },
    'stellar-quickstart-up': {
      teams: [
        '@MetaMask/mobile-platform',
        '@MetaMask/extension-platform',
        '@MetaMask/networks',
        '@MetaMask/emerging-opportunities',
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
      initializationPath: 'subscription-controller',
    },
    'subscription-service': {
      teams: ['@MetaMask/web3auth'],
      initializationPath: 'subscription-service',
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
    utils: {
      teams: ['@MetaMask/core-platform'],
    },
    wallet: {
      teams: ['@MetaMask/core-platform'],
    },
    'wallet-cli': {
      teams: ['@MetaMask/core-platform'],
    },
    'wallet-framework-docs': {
      teams: ['@MetaMask/core-platform'],
    },
  },
  overrides: [
    { pattern: '/.github/', owners: ['@MetaMask/core-platform'] },
    {
      pattern: '/packages/eth-json-rpc-middleware/src/methods',
      owners: ['@MetaMask/confirmations', '@MetaMask/core-platform'],
    },
    {
      pattern: '/packages/eth-json-rpc-middleware/src/wallet.*',
      owners: ['@MetaMask/confirmations', '@MetaMask/core-platform'],
    },
  ],
} satisfies CodeownersConfig;

export default config;
