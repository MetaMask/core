# Core Monorepo

This monorepo is a collection of packages used across multiple MetaMask clients (e.g. [`metamask-extension`](https://github.com/MetaMask/metamask-extension/), [`metamask-mobile`](https://github.com/MetaMask/metamask-mobile/)).

## Contributing

See the [Contributor Guide](./docs/contributing.md) for help on:

- Setting up your development environment
- Working with the monorepo
- Testing changes in clients
- Issuing new releases
- Creating a new package

## Installation/Usage

Each package in this repository has its own README where you can find installation and usage instructions. See `packages/` for more.

## Packages

<!-- start package list -->

- [`@metamask/account-tree-controller`](packages/account-tree-controller)
- [`@metamask/accounts-controller`](packages/accounts-controller)
- [`@metamask/address-book-controller`](packages/address-book-controller)
- [`@metamask/analytics-controller`](packages/analytics-controller)
- [`@metamask/announcement-controller`](packages/announcement-controller)
- [`@metamask/app-metadata-controller`](packages/app-metadata-controller)
- [`@metamask/approval-controller`](packages/approval-controller)
- [`@metamask/assets-controllers`](packages/assets-controllers)
- [`@metamask/base-controller`](packages/base-controller)
- [`@metamask/bridge-controller`](packages/bridge-controller)
- [`@metamask/bridge-status-controller`](packages/bridge-status-controller)
- [`@metamask/build-utils`](packages/build-utils)
- [`@metamask/chain-agnostic-permission`](packages/chain-agnostic-permission)
- [`@metamask/claims-controller`](packages/claims-controller)
- [`@metamask/composable-controller`](packages/composable-controller)
- [`@metamask/controller-utils`](packages/controller-utils)
- [`@metamask/core-backend`](packages/core-backend)
- [`@metamask/delegation-controller`](packages/delegation-controller)
- [`@metamask/earn-controller`](packages/earn-controller)
- [`@metamask/eip-5792-middleware`](packages/eip-5792-middleware)
- [`@metamask/eip-7702-internal-rpc-middleware`](packages/eip-7702-internal-rpc-middleware)
- [`@metamask/eip1193-permission-middleware`](packages/eip1193-permission-middleware)
- [`@metamask/ens-controller`](packages/ens-controller)
- [`@metamask/error-reporting-service`](packages/error-reporting-service)
- [`@metamask/eth-block-tracker`](packages/eth-block-tracker)
- [`@metamask/eth-json-rpc-middleware`](packages/eth-json-rpc-middleware)
- [`@metamask/eth-json-rpc-provider`](packages/eth-json-rpc-provider)
- [`@metamask/foundryup`](packages/foundryup)
- [`@metamask/gas-fee-controller`](packages/gas-fee-controller)
- [`@metamask/gator-permissions-controller`](packages/gator-permissions-controller)
- [`@metamask/json-rpc-engine`](packages/json-rpc-engine)
- [`@metamask/json-rpc-middleware-stream`](packages/json-rpc-middleware-stream)
- [`@metamask/keyring-controller`](packages/keyring-controller)
- [`@metamask/logging-controller`](packages/logging-controller)
- [`@metamask/message-manager`](packages/message-manager)
- [`@metamask/messenger`](packages/messenger)
- [`@metamask/multichain-account-service`](packages/multichain-account-service)
- [`@metamask/multichain-api-middleware`](packages/multichain-api-middleware)
- [`@metamask/multichain-network-controller`](packages/multichain-network-controller)
- [`@metamask/multichain-transactions-controller`](packages/multichain-transactions-controller)
- [`@metamask/name-controller`](packages/name-controller)
- [`@metamask/network-controller`](packages/network-controller)
- [`@metamask/network-enablement-controller`](packages/network-enablement-controller)
- [`@metamask/notification-services-controller`](packages/notification-services-controller)
- [`@metamask/permission-controller`](packages/permission-controller)
- [`@metamask/permission-log-controller`](packages/permission-log-controller)
- [`@metamask/phishing-controller`](packages/phishing-controller)
- [`@metamask/polling-controller`](packages/polling-controller)
- [`@metamask/preferences-controller`](packages/preferences-controller)
- [`@metamask/profile-metrics-controller`](packages/profile-metrics-controller)
- [`@metamask/profile-sync-controller`](packages/profile-sync-controller)
- [`@metamask/ramps-controller`](packages/ramps-controller)
- [`@metamask/rate-limit-controller`](packages/rate-limit-controller)
- [`@metamask/remote-feature-flag-controller`](packages/remote-feature-flag-controller)
- [`@metamask/sample-controllers`](packages/sample-controllers)
- [`@metamask/seedless-onboarding-controller`](packages/seedless-onboarding-controller)
- [`@metamask/selected-network-controller`](packages/selected-network-controller)
- [`@metamask/shield-controller`](packages/shield-controller)
- [`@metamask/signature-controller`](packages/signature-controller)
- [`@metamask/storage-service`](packages/storage-service)
- [`@metamask/subscription-controller`](packages/subscription-controller)
- [`@metamask/token-search-discovery-controller`](packages/token-search-discovery-controller)
- [`@metamask/transaction-controller`](packages/transaction-controller)
- [`@metamask/transaction-pay-controller`](packages/transaction-pay-controller)
- [`@metamask/user-operation-controller`](packages/user-operation-controller)

<!-- end package list -->

<!-- start dependency graph -->

```mermaid
%%{ init: { 'flowchart': { 'curve': 'bumpX' } } }%%
graph LR;
linkStyle default opacity:0.5
  account_tree_controller(["@metamask/account-tree-controller"]);
  accounts_controller(["@metamask/accounts-controller"]);
  address_book_controller(["@metamask/address-book-controller"]);
  analytics_controller(["@metamask/analytics-controller"]);
  announcement_controller(["@metamask/announcement-controller"]);
  app_metadata_controller(["@metamask/app-metadata-controller"]);
  approval_controller(["@metamask/approval-controller"]);
  assets_controllers(["@metamask/assets-controllers"]);
  base_controller(["@metamask/base-controller"]);
  bridge_controller(["@metamask/bridge-controller"]);
  bridge_status_controller(["@metamask/bridge-status-controller"]);
  build_utils(["@metamask/build-utils"]);
  chain_agnostic_permission(["@metamask/chain-agnostic-permission"]);
  claims_controller(["@metamask/claims-controller"]);
  composable_controller(["@metamask/composable-controller"]);
  controller_utils(["@metamask/controller-utils"]);
  core_backend(["@metamask/core-backend"]);
  delegation_controller(["@metamask/delegation-controller"]);
  earn_controller(["@metamask/earn-controller"]);
  eip_5792_middleware(["@metamask/eip-5792-middleware"]);
  eip_7702_internal_rpc_middleware(["@metamask/eip-7702-internal-rpc-middleware"]);
  eip1193_permission_middleware(["@metamask/eip1193-permission-middleware"]);
  ens_controller(["@metamask/ens-controller"]);
  error_reporting_service(["@metamask/error-reporting-service"]);
  eth_block_tracker(["@metamask/eth-block-tracker"]);
  eth_json_rpc_middleware(["@metamask/eth-json-rpc-middleware"]);
  eth_json_rpc_provider(["@metamask/eth-json-rpc-provider"]);
  foundryup(["@metamask/foundryup"]);
  gas_fee_controller(["@metamask/gas-fee-controller"]);
  gator_permissions_controller(["@metamask/gator-permissions-controller"]);
  json_rpc_engine(["@metamask/json-rpc-engine"]);
  json_rpc_middleware_stream(["@metamask/json-rpc-middleware-stream"]);
  keyring_controller(["@metamask/keyring-controller"]);
  logging_controller(["@metamask/logging-controller"]);
  message_manager(["@metamask/message-manager"]);
  messenger(["@metamask/messenger"]);
  multichain_account_service(["@metamask/multichain-account-service"]);
  multichain_api_middleware(["@metamask/multichain-api-middleware"]);
  multichain_network_controller(["@metamask/multichain-network-controller"]);
  multichain_transactions_controller(["@metamask/multichain-transactions-controller"]);
  name_controller(["@metamask/name-controller"]);
  network_controller(["@metamask/network-controller"]);
  network_enablement_controller(["@metamask/network-enablement-controller"]);
  notification_services_controller(["@metamask/notification-services-controller"]);
  permission_controller(["@metamask/permission-controller"]);
  permission_log_controller(["@metamask/permission-log-controller"]);
  phishing_controller(["@metamask/phishing-controller"]);
  polling_controller(["@metamask/polling-controller"]);
  preferences_controller(["@metamask/preferences-controller"]);
  profile_metrics_controller(["@metamask/profile-metrics-controller"]);
  profile_sync_controller(["@metamask/profile-sync-controller"]);
  ramps_controller(["@metamask/ramps-controller"]);
  rate_limit_controller(["@metamask/rate-limit-controller"]);
  remote_feature_flag_controller(["@metamask/remote-feature-flag-controller"]);
  sample_controllers(["@metamask/sample-controllers"]);
  seedless_onboarding_controller(["@metamask/seedless-onboarding-controller"]);
  selected_network_controller(["@metamask/selected-network-controller"]);
  shield_controller(["@metamask/shield-controller"]);
  signature_controller(["@metamask/signature-controller"]);
  storage_service(["@metamask/storage-service"]);
  subscription_controller(["@metamask/subscription-controller"]);
  token_search_discovery_controller(["@metamask/token-search-discovery-controller"]);
  transaction_controller(["@metamask/transaction-controller"]);
  transaction_pay_controller(["@metamask/transaction-pay-controller"]);
  user_operation_controller(["@metamask/user-operation-controller"]);
  account_tree_controller --> accounts_controller;
  account_tree_controller --> base_controller;
  account_tree_controller --> keyring_controller;
  account_tree_controller --> messenger;
  account_tree_controller --> multichain_account_service;
  account_tree_controller --> profile_sync_controller;
  accounts_controller --> base_controller;
  accounts_controller --> keyring_controller;
  accounts_controller --> messenger;
  accounts_controller --> network_controller;
  accounts_controller --> controller_utils;
  address_book_controller --> base_controller;
  address_book_controller --> controller_utils;
  address_book_controller --> messenger;
  analytics_controller --> base_controller;
  analytics_controller --> messenger;
  announcement_controller --> base_controller;
  announcement_controller --> messenger;
  app_metadata_controller --> base_controller;
  app_metadata_controller --> messenger;
  approval_controller --> base_controller;
  approval_controller --> messenger;
  assets_controllers --> account_tree_controller;
  assets_controllers --> accounts_controller;
  assets_controllers --> approval_controller;
  assets_controllers --> base_controller;
  assets_controllers --> controller_utils;
  assets_controllers --> core_backend;
  assets_controllers --> keyring_controller;
  assets_controllers --> messenger;
  assets_controllers --> multichain_account_service;
  assets_controllers --> network_controller;
  assets_controllers --> permission_controller;
  assets_controllers --> phishing_controller;
  assets_controllers --> polling_controller;
  assets_controllers --> preferences_controller;
  assets_controllers --> profile_sync_controller;
  assets_controllers --> transaction_controller;
  base_controller --> messenger;
  base_controller --> json_rpc_engine;
  bridge_controller --> accounts_controller;
  bridge_controller --> assets_controllers;
  bridge_controller --> base_controller;
  bridge_controller --> controller_utils;
  bridge_controller --> gas_fee_controller;
  bridge_controller --> messenger;
  bridge_controller --> multichain_network_controller;
  bridge_controller --> network_controller;
  bridge_controller --> polling_controller;
  bridge_controller --> remote_feature_flag_controller;
  bridge_controller --> transaction_controller;
  bridge_controller --> eth_json_rpc_provider;
  bridge_status_controller --> accounts_controller;
  bridge_status_controller --> base_controller;
  bridge_status_controller --> bridge_controller;
  bridge_status_controller --> controller_utils;
  bridge_status_controller --> gas_fee_controller;
  bridge_status_controller --> network_controller;
  bridge_status_controller --> polling_controller;
  bridge_status_controller --> transaction_controller;
  chain_agnostic_permission --> controller_utils;
  chain_agnostic_permission --> network_controller;
  chain_agnostic_permission --> permission_controller;
  claims_controller --> base_controller;
  claims_controller --> controller_utils;
  claims_controller --> messenger;
  claims_controller --> keyring_controller;
  claims_controller --> profile_sync_controller;
  composable_controller --> base_controller;
  composable_controller --> messenger;
  composable_controller --> json_rpc_engine;
  core_backend --> accounts_controller;
  core_backend --> controller_utils;
  core_backend --> keyring_controller;
  core_backend --> messenger;
  core_backend --> profile_sync_controller;
  delegation_controller --> accounts_controller;
  delegation_controller --> base_controller;
  delegation_controller --> keyring_controller;
  delegation_controller --> messenger;
  earn_controller --> account_tree_controller;
  earn_controller --> base_controller;
  earn_controller --> controller_utils;
  earn_controller --> messenger;
  earn_controller --> network_controller;
  earn_controller --> transaction_controller;
  eip_5792_middleware --> messenger;
  eip_5792_middleware --> transaction_controller;
  eip_5792_middleware --> keyring_controller;
  eip_7702_internal_rpc_middleware --> controller_utils;
  eip1193_permission_middleware --> chain_agnostic_permission;
  eip1193_permission_middleware --> controller_utils;
  eip1193_permission_middleware --> json_rpc_engine;
  eip1193_permission_middleware --> permission_controller;
  ens_controller --> base_controller;
  ens_controller --> controller_utils;
  ens_controller --> messenger;
  ens_controller --> network_controller;
  error_reporting_service --> base_controller;
  error_reporting_service --> messenger;
  eth_block_tracker --> eth_json_rpc_provider;
  eth_block_tracker --> json_rpc_engine;
  eth_json_rpc_middleware --> eth_block_tracker;
  eth_json_rpc_middleware --> eth_json_rpc_provider;
  eth_json_rpc_middleware --> json_rpc_engine;
  eth_json_rpc_middleware --> message_manager;
  eth_json_rpc_middleware --> error_reporting_service;
  eth_json_rpc_middleware --> network_controller;
  eth_json_rpc_provider --> json_rpc_engine;
  gas_fee_controller --> base_controller;
  gas_fee_controller --> controller_utils;
  gas_fee_controller --> network_controller;
  gas_fee_controller --> polling_controller;
  gator_permissions_controller --> base_controller;
  gator_permissions_controller --> messenger;
  gator_permissions_controller --> transaction_controller;
  json_rpc_middleware_stream --> json_rpc_engine;
  keyring_controller --> base_controller;
  keyring_controller --> messenger;
  logging_controller --> base_controller;
  logging_controller --> controller_utils;
  logging_controller --> messenger;
  message_manager --> base_controller;
  message_manager --> controller_utils;
  message_manager --> messenger;
  multichain_account_service --> accounts_controller;
  multichain_account_service --> base_controller;
  multichain_account_service --> error_reporting_service;
  multichain_account_service --> keyring_controller;
  multichain_account_service --> messenger;
  multichain_api_middleware --> chain_agnostic_permission;
  multichain_api_middleware --> controller_utils;
  multichain_api_middleware --> json_rpc_engine;
  multichain_api_middleware --> network_controller;
  multichain_api_middleware --> permission_controller;
  multichain_api_middleware --> multichain_transactions_controller;
  multichain_network_controller --> accounts_controller;
  multichain_network_controller --> base_controller;
  multichain_network_controller --> controller_utils;
  multichain_network_controller --> messenger;
  multichain_network_controller --> network_controller;
  multichain_network_controller --> keyring_controller;
  multichain_transactions_controller --> accounts_controller;
  multichain_transactions_controller --> base_controller;
  multichain_transactions_controller --> messenger;
  multichain_transactions_controller --> polling_controller;
  multichain_transactions_controller --> keyring_controller;
  name_controller --> base_controller;
  name_controller --> controller_utils;
  name_controller --> messenger;
  network_controller --> base_controller;
  network_controller --> controller_utils;
  network_controller --> error_reporting_service;
  network_controller --> eth_block_tracker;
  network_controller --> eth_json_rpc_middleware;
  network_controller --> eth_json_rpc_provider;
  network_controller --> json_rpc_engine;
  network_controller --> messenger;
  network_enablement_controller --> base_controller;
  network_enablement_controller --> controller_utils;
  network_enablement_controller --> messenger;
  network_enablement_controller --> multichain_network_controller;
  network_enablement_controller --> network_controller;
  network_enablement_controller --> transaction_controller;
  notification_services_controller --> base_controller;
  notification_services_controller --> controller_utils;
  notification_services_controller --> keyring_controller;
  notification_services_controller --> messenger;
  notification_services_controller --> profile_sync_controller;
  permission_controller --> approval_controller;
  permission_controller --> base_controller;
  permission_controller --> controller_utils;
  permission_controller --> json_rpc_engine;
  permission_controller --> messenger;
  permission_log_controller --> base_controller;
  permission_log_controller --> json_rpc_engine;
  permission_log_controller --> messenger;
  phishing_controller --> base_controller;
  phishing_controller --> controller_utils;
  phishing_controller --> messenger;
  phishing_controller --> transaction_controller;
  polling_controller --> base_controller;
  polling_controller --> controller_utils;
  polling_controller --> network_controller;
  preferences_controller --> base_controller;
  preferences_controller --> controller_utils;
  preferences_controller --> keyring_controller;
  preferences_controller --> messenger;
  profile_metrics_controller --> accounts_controller;
  profile_metrics_controller --> base_controller;
  profile_metrics_controller --> controller_utils;
  profile_metrics_controller --> keyring_controller;
  profile_metrics_controller --> messenger;
  profile_metrics_controller --> polling_controller;
  profile_metrics_controller --> profile_sync_controller;
  profile_sync_controller --> address_book_controller;
  profile_sync_controller --> base_controller;
  profile_sync_controller --> keyring_controller;
  profile_sync_controller --> messenger;
  rate_limit_controller --> base_controller;
  rate_limit_controller --> messenger;
  remote_feature_flag_controller --> base_controller;
  remote_feature_flag_controller --> controller_utils;
  remote_feature_flag_controller --> messenger;
  sample_controllers --> base_controller;
  sample_controllers --> messenger;
  sample_controllers --> network_controller;
  sample_controllers --> controller_utils;
  seedless_onboarding_controller --> base_controller;
  seedless_onboarding_controller --> keyring_controller;
  seedless_onboarding_controller --> messenger;
  selected_network_controller --> base_controller;
  selected_network_controller --> json_rpc_engine;
  selected_network_controller --> messenger;
  selected_network_controller --> network_controller;
  selected_network_controller --> permission_controller;
  shield_controller --> base_controller;
  shield_controller --> controller_utils;
  shield_controller --> messenger;
  shield_controller --> signature_controller;
  shield_controller --> transaction_controller;
  signature_controller --> accounts_controller;
  signature_controller --> approval_controller;
  signature_controller --> base_controller;
  signature_controller --> controller_utils;
  signature_controller --> gator_permissions_controller;
  signature_controller --> keyring_controller;
  signature_controller --> logging_controller;
  signature_controller --> messenger;
  signature_controller --> network_controller;
  storage_service --> messenger;
  subscription_controller --> base_controller;
  subscription_controller --> controller_utils;
  subscription_controller --> messenger;
  subscription_controller --> polling_controller;
  subscription_controller --> profile_sync_controller;
  subscription_controller --> transaction_controller;
  token_search_discovery_controller --> base_controller;
  token_search_discovery_controller --> messenger;
  transaction_controller --> accounts_controller;
  transaction_controller --> approval_controller;
  transaction_controller --> base_controller;
  transaction_controller --> controller_utils;
  transaction_controller --> gas_fee_controller;
  transaction_controller --> messenger;
  transaction_controller --> network_controller;
  transaction_controller --> remote_feature_flag_controller;
  transaction_controller --> eth_block_tracker;
  transaction_controller --> eth_json_rpc_provider;
  transaction_pay_controller --> assets_controllers;
  transaction_pay_controller --> base_controller;
  transaction_pay_controller --> bridge_controller;
  transaction_pay_controller --> bridge_status_controller;
  transaction_pay_controller --> controller_utils;
  transaction_pay_controller --> gas_fee_controller;
  transaction_pay_controller --> messenger;
  transaction_pay_controller --> network_controller;
  transaction_pay_controller --> remote_feature_flag_controller;
  transaction_pay_controller --> transaction_controller;
  user_operation_controller --> approval_controller;
  user_operation_controller --> base_controller;
  user_operation_controller --> controller_utils;
  user_operation_controller --> gas_fee_controller;
  user_operation_controller --> keyring_controller;
  user_operation_controller --> messenger;
  user_operation_controller --> network_controller;
  user_operation_controller --> polling_controller;
  user_operation_controller --> transaction_controller;
  user_operation_controller --> eth_block_tracker;
```

<!-- end dependency graph -->

(This section may be regenerated at any time by running `yarn update-readme-content`.)
