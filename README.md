# Core Monorepo

This monorepo is a collection of packages used across multiple MetaMask clients (e.g. [`metamask-extension`](https://github.com/MetaMask/metamask-extension/), [`metamask-mobile`](https://github.com/MetaMask/metamask-mobile/)).

## Contributing

See the [Contributor Documentation](./docs) for help on:

- Setting up your development environment
- Working with the monorepo
- Testing changes in clients
- Issuing new releases
- Creating a new package

## Installation/Usage

Each package in this repository has its own README where you can find installation and usage instructions. See `packages/` for more.

## Agent skills

This repo can install MetaMask agent skills for Claude, Cursor, and Codex/OpenAI.
`yarn setup` keeps the public [`MetaMask/skills`](https://github.com/MetaMask/skills)
cache available through the shared `@metamask/skills` CLI. Run `yarn skills` any
time to install or refresh the gitignored generated skills under `.claude/skills/`,
`.cursor/rules/`, and `.agents/skills/`.

By default, all stable skills that support Core are installed when you run `yarn skills`.
Set `SKILLS_AUTO_UPDATE=1` to opt into best-effort regeneration during setup. The shared package keeps sync/cache behavior uniform with Mobile and Extension.
To persist a local selection, copy `.skills.local.example` to `.skills.local` and
set values such as `SKILLS_DOMAINS=perps`.

```bash
yarn skills                         # refresh default stable Core skills
yarn skills --domain perps          # install only the perps domain
yarn skills --select                # interactively choose domains
yarn skills --reset                 # clear saved local selection
```

## Packages

<!-- start package list -->

- [`@metamask/account-tree-controller`](packages/account-tree-controller)
- [`@metamask/accounts-controller`](packages/accounts-controller)
- [`@metamask/address-book-controller`](packages/address-book-controller)
- [`@metamask/advanced-chart-core`](packages/advanced-chart-core)
- [`@metamask/ai-controllers`](packages/ai-controllers)
- [`@metamask/analytics-controller`](packages/analytics-controller)
- [`@metamask/analytics-data-regulation-controller`](packages/analytics-data-regulation-controller)
- [`@metamask/announcement-controller`](packages/announcement-controller)
- [`@metamask/app-metadata-controller`](packages/app-metadata-controller)
- [`@metamask/approval-controller`](packages/approval-controller)
- [`@metamask/assets-controller`](packages/assets-controller)
- [`@metamask/assets-controllers`](packages/assets-controllers)
- [`@metamask/authenticated-user-storage`](packages/authenticated-user-storage)
- [`@metamask/base-controller`](packages/base-controller)
- [`@metamask/base-data-service`](packages/base-data-service)
- [`@metamask/bitcoin-regtest-up`](packages/bitcoin-regtest-up)
- [`@metamask/bridge-controller`](packages/bridge-controller)
- [`@metamask/bridge-status-controller`](packages/bridge-status-controller)
- [`@metamask/build-utils`](packages/build-utils)
- [`@metamask/chain-agnostic-permission`](packages/chain-agnostic-permission)
- [`@metamask/chomp-api-service`](packages/chomp-api-service)
- [`@metamask/claims-controller`](packages/claims-controller)
- [`@metamask/client-controller`](packages/client-controller)
- [`@metamask/client-utils`](packages/client-utils)
- [`@metamask/compliance-controller`](packages/compliance-controller)
- [`@metamask/composable-controller`](packages/composable-controller)
- [`@metamask/config-registry-controller`](packages/config-registry-controller)
- [`@metamask/connectivity-controller`](packages/connectivity-controller)
- [`@metamask/controller-utils`](packages/controller-utils)
- [`@metamask/core-backend`](packages/core-backend)
- [`@metamask/cryptography`](packages/cryptography)
- [`@metamask/delegation-controller`](packages/delegation-controller)
- [`@metamask/earn-controller`](packages/earn-controller)
- [`@metamask/eip-5792-middleware`](packages/eip-5792-middleware)
- [`@metamask/eip-7702-internal-rpc-middleware`](packages/eip-7702-internal-rpc-middleware)
- [`@metamask/eip1193-permission-middleware`](packages/eip1193-permission-middleware)
- [`@metamask/eth-block-tracker`](packages/eth-block-tracker)
- [`@metamask/eth-json-rpc-middleware`](packages/eth-json-rpc-middleware)
- [`@metamask/eth-json-rpc-provider`](packages/eth-json-rpc-provider)
- [`@metamask/foundryup`](packages/foundryup)
- [`@metamask/gas-fee-controller`](packages/gas-fee-controller)
- [`@metamask/gator-permissions-controller`](packages/gator-permissions-controller)
- [`@metamask/geolocation-controller`](packages/geolocation-controller)
- [`@metamask/java-tron-up`](packages/java-tron-up)
- [`@metamask/json-rpc-engine`](packages/json-rpc-engine)
- [`@metamask/json-rpc-middleware-stream`](packages/json-rpc-middleware-stream)
- [`@metamask/keyring-controller`](packages/keyring-controller)
- [`@metamask/kyc-controller`](packages/kyc-controller)
- [`@metamask/local-node-utils`](packages/local-node-utils)
- [`@metamask/logging-controller`](packages/logging-controller)
- [`@metamask/message-manager`](packages/message-manager)
- [`@metamask/messenger`](packages/messenger)
- [`@metamask/messenger-cli`](packages/messenger-cli)
- [`@metamask/money-account-api-data-service`](packages/money-account-api-data-service)
- [`@metamask/money-account-balance-service`](packages/money-account-balance-service)
- [`@metamask/money-account-controller`](packages/money-account-controller)
- [`@metamask/money-account-upgrade-controller`](packages/money-account-upgrade-controller)
- [`@metamask/money-account-utils`](packages/money-account-utils)
- [`@metamask/multichain-account-service`](packages/multichain-account-service)
- [`@metamask/multichain-api-middleware`](packages/multichain-api-middleware)
- [`@metamask/multichain-network-controller`](packages/multichain-network-controller)
- [`@metamask/multichain-transactions-controller`](packages/multichain-transactions-controller)
- [`@metamask/name-controller`](packages/name-controller)
- [`@metamask/network-connection-banner-controller`](packages/network-connection-banner-controller)
- [`@metamask/network-controller`](packages/network-controller)
- [`@metamask/network-enablement-controller`](packages/network-enablement-controller)
- [`@metamask/notification-services-controller`](packages/notification-services-controller)
- [`@metamask/passkey-controller`](packages/passkey-controller)
- [`@metamask/permission-controller`](packages/permission-controller)
- [`@metamask/permission-log-controller`](packages/permission-log-controller)
- [`@metamask/perps-controller`](packages/perps-controller)
- [`@metamask/phishing-controller`](packages/phishing-controller)
- [`@metamask/platform-api-docs`](packages/platform-api-docs)
- [`@metamask/polling-controller`](packages/polling-controller)
- [`@metamask/preferences-controller`](packages/preferences-controller)
- [`@metamask/profile-controller`](packages/profile-controller)
- [`@metamask/profile-metrics-controller`](packages/profile-metrics-controller)
- [`@metamask/profile-sync-controller`](packages/profile-sync-controller)
- [`@metamask/ramps-controller`](packages/ramps-controller)
- [`@metamask/rate-limit-controller`](packages/rate-limit-controller)
- [`@metamask/react-data-query`](packages/react-data-query)
- [`@metamask/remote-feature-flag-controller`](packages/remote-feature-flag-controller)
- [`@metamask/sample-controllers`](packages/sample-controllers)
- [`@metamask/seedless-onboarding-controller`](packages/seedless-onboarding-controller)
- [`@metamask/selected-network-controller`](packages/selected-network-controller)
- [`@metamask/sentinel-api-service`](packages/sentinel-api-service)
- [`@metamask/shield-controller`](packages/shield-controller)
- [`@metamask/signature-controller`](packages/signature-controller)
- [`@metamask/smart-transactions-controller`](packages/smart-transactions-controller)
- [`@metamask/snap-account-service`](packages/snap-account-service)
- [`@metamask/social-controllers`](packages/social-controllers)
- [`@metamask/solana-test-validator-up`](packages/solana-test-validator-up)
- [`@metamask/stellar-quickstart-up`](packages/stellar-quickstart-up)
- [`@metamask/storage-service`](packages/storage-service)
- [`@metamask/subscription-controller`](packages/subscription-controller)
- [`@metamask/transaction-controller`](packages/transaction-controller)
- [`@metamask/transaction-pay-controller`](packages/transaction-pay-controller)
- [`@metamask/user-operation-controller`](packages/user-operation-controller)
- [`@metamask/utils`](packages/utils)
- [`@metamask/wallet`](packages/wallet)
- [`@metamask/wallet-cli`](packages/wallet-cli)
- [`@metamask/watch-only-account-service`](packages/watch-only-account-service)

<!-- end package list -->

(This section may be regenerated at any time by running `yarn update-readme-content`.)
