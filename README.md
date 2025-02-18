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

- [`@metamask/accounts-controller`](packages/accounts-controller)
- [`@metamask/address-book-controller`](packages/address-book-controller)
- [`@metamask/announcement-controller`](packages/announcement-controller)
- [`@metamask/approval-controller`](packages/approval-controller)
- [`@metamask/assets-controllers`](packages/assets-controllers)
- [`@metamask/base-controller`](packages/base-controller)
- [`@metamask/bridge-controller`](packages/bridge-controller)
- [`@metamask/build-utils`](packages/build-utils)
- [`@metamask/composable-controller`](packages/composable-controller)
- [`@metamask/controller-utils`](packages/controller-utils)
- [`@metamask/earn-controller`](packages/earn-controller)
- [`@metamask/ens-controller`](packages/ens-controller)
- [`@metamask/eth-json-rpc-provider`](packages/eth-json-rpc-provider)
- [`@metamask/gas-fee-controller`](packages/gas-fee-controller)
- [`@metamask/json-rpc-engine`](packages/json-rpc-engine)
- [`@metamask/json-rpc-middleware-stream`](packages/json-rpc-middleware-stream)
- [`@metamask/keyring-controller`](packages/keyring-controller)
- [`@metamask/logging-controller`](packages/logging-controller)
- [`@metamask/message-manager`](packages/message-manager)
- [`@metamask/multichain`](packages/multichain)
- [`@metamask/multichain-network-controller`](packages/multichain-network-controller)
- [`@metamask/multichain-transactions-controller`](packages/multichain-transactions-controller)
- [`@metamask/name-controller`](packages/name-controller)
- [`@metamask/network-controller`](packages/network-controller)
- [`@metamask/notification-services-controller`](packages/notification-services-controller)
- [`@metamask/permission-controller`](packages/permission-controller)
- [`@metamask/permission-log-controller`](packages/permission-log-controller)
- [`@metamask/phishing-controller`](packages/phishing-controller)
- [`@metamask/polling-controller`](packages/polling-controller)
- [`@metamask/preferences-controller`](packages/preferences-controller)
- [`@metamask/profile-sync-controller`](packages/profile-sync-controller)
- [`@metamask/queued-request-controller`](packages/queued-request-controller)
- [`@metamask/rate-limit-controller`](packages/rate-limit-controller)
- [`@metamask/remote-feature-flag-controller`](packages/remote-feature-flag-controller)
- [`@metamask/selected-network-controller`](packages/selected-network-controller)
- [`@metamask/signature-controller`](packages/signature-controller)
- [`@metamask/token-search-discovery-controller`](packages/token-search-discovery-controller)
- [`@metamask/transaction-controller`](packages/transaction-controller)
- [`@metamask/user-operation-controller`](packages/user-operation-controller)

<!-- end package list -->

<!-- start dependency graph -->

```mermaid
%%{ init: { 'flowchart': { 'curve': 'bumpX' } } }%%
graph LR;
linkStyle default opacity:0.5
  accounts_controller(["@metamask/accounts-controller"]);
  address_book_controller(["@metamask/address-book-controller"]);
  announcement_controller(["@metamask/announcement-controller"]);
  approval_controller(["@metamask/approval-controller"]);
  assets_controllers(["@metamask/assets-controllers"]);
  base_controller(["@metamask/base-controller"]);
  build_utils(["@metamask/build-utils"]);
  composable_controller(["@metamask/composable-controller"]);
  controller_utils(["@metamask/controller-utils"]);
  earn_controller(["@metamask/earn-controller"]);
  ens_controller(["@metamask/ens-controller"]);
  eth_json_rpc_provider(["@metamask/eth-json-rpc-provider"]);
  gas_fee_controller(["@metamask/gas-fee-controller"]);
  json_rpc_engine(["@metamask/json-rpc-engine"]);
  json_rpc_middleware_stream(["@metamask/json-rpc-middleware-stream"]);
  keyring_controller(["@metamask/keyring-controller"]);
  logging_controller(["@metamask/logging-controller"]);
  message_manager(["@metamask/message-manager"]);
  multichain(["@metamask/multichain"]);
  multichain_network_controller(["@metamask/multichain-network-controller"]);
  multichain_transactions_controller(["@metamask/multichain-transactions-controller"]);
  name_controller(["@metamask/name-controller"]);
  network_controller(["@metamask/network-controller"]);
  notification_services_controller(["@metamask/notification-services-controller"]);
  permission_controller(["@metamask/permission-controller"]);
  permission_log_controller(["@metamask/permission-log-controller"]);
  phishing_controller(["@metamask/phishing-controller"]);
  polling_controller(["@metamask/polling-controller"]);
  preferences_controller(["@metamask/preferences-controller"]);
  profile_sync_controller(["@metamask/profile-sync-controller"]);
  queued_request_controller(["@metamask/queued-request-controller"]);
  rate_limit_controller(["@metamask/rate-limit-controller"]);
  remote_feature_flag_controller(["@metamask/remote-feature-flag-controller"]);
  selected_network_controller(["@metamask/selected-network-controller"]);
  signature_controller(["@metamask/signature-controller"]);
  token_search_discovery_controller(["@metamask/token-search-discovery-controller"]);
  transaction_controller(["@metamask/transaction-controller"]);
  user_operation_controller(["@metamask/user-operation-controller"]);
  accounts_controller --> base_controller;
  accounts_controller --> keyring_controller;
  accounts_controller --> network_controller;
  address_book_controller --> base_controller;
  address_book_controller --> controller_utils;
  announcement_controller --> base_controller;
  approval_controller --> base_controller;
  assets_controllers --> base_controller;
  assets_controllers --> controller_utils;
  assets_controllers --> polling_controller;
  assets_controllers --> accounts_controller;
  assets_controllers --> approval_controller;
  assets_controllers --> keyring_controller;
  assets_controllers --> network_controller;
  assets_controllers --> permission_controller;
  assets_controllers --> preferences_controller;
  base_controller --> json_rpc_engine;
  composable_controller --> base_controller;
  composable_controller --> json_rpc_engine;
  earn_controller --> base_controller;
  earn_controller --> controller_utils;
  earn_controller --> accounts_controller;
  earn_controller --> network_controller;
  ens_controller --> base_controller;
  ens_controller --> controller_utils;
  ens_controller --> network_controller;
  eth_json_rpc_provider --> json_rpc_engine;
  gas_fee_controller --> base_controller;
  gas_fee_controller --> controller_utils;
  gas_fee_controller --> polling_controller;
  gas_fee_controller --> network_controller;
  json_rpc_middleware_stream --> json_rpc_engine;
  keyring_controller --> base_controller;
  keyring_controller --> message_manager;
  logging_controller --> base_controller;
  logging_controller --> controller_utils;
  message_manager --> base_controller;
  message_manager --> controller_utils;
  multichain --> controller_utils;
  multichain --> json_rpc_engine;
  multichain --> network_controller;
  multichain --> permission_controller;
  multichain_network_controller --> base_controller;
  multichain_network_controller --> keyring_controller;
  multichain_transactions_controller --> base_controller;
  multichain_transactions_controller --> polling_controller;
  multichain_transactions_controller --> accounts_controller;
  multichain_transactions_controller --> keyring_controller;
  name_controller --> base_controller;
  name_controller --> controller_utils;
  network_controller --> base_controller;
  network_controller --> controller_utils;
  network_controller --> eth_json_rpc_provider;
  network_controller --> json_rpc_engine;
  notification_services_controller --> base_controller;
  notification_services_controller --> controller_utils;
  notification_services_controller --> keyring_controller;
  notification_services_controller --> profile_sync_controller;
  permission_controller --> base_controller;
  permission_controller --> controller_utils;
  permission_controller --> json_rpc_engine;
  permission_controller --> approval_controller;
  permission_log_controller --> base_controller;
  permission_log_controller --> json_rpc_engine;
  phishing_controller --> base_controller;
  phishing_controller --> controller_utils;
  polling_controller --> base_controller;
  polling_controller --> controller_utils;
  polling_controller --> network_controller;
  preferences_controller --> base_controller;
  preferences_controller --> controller_utils;
  preferences_controller --> keyring_controller;
  profile_sync_controller --> base_controller;
  profile_sync_controller --> keyring_controller;
  profile_sync_controller --> network_controller;
  profile_sync_controller --> accounts_controller;
  queued_request_controller --> base_controller;
  queued_request_controller --> controller_utils;
  queued_request_controller --> json_rpc_engine;
  queued_request_controller --> network_controller;
  queued_request_controller --> selected_network_controller;
  rate_limit_controller --> base_controller;
  remote_feature_flag_controller --> base_controller;
  remote_feature_flag_controller --> controller_utils;
  selected_network_controller --> base_controller;
  selected_network_controller --> json_rpc_engine;
  selected_network_controller --> network_controller;
  selected_network_controller --> permission_controller;
  signature_controller --> base_controller;
  signature_controller --> controller_utils;
  signature_controller --> approval_controller;
  signature_controller --> keyring_controller;
  signature_controller --> logging_controller;
  signature_controller --> network_controller;
  token_search_discovery_controller --> base_controller;
  transaction_controller --> base_controller;
  transaction_controller --> controller_utils;
  transaction_controller --> accounts_controller;
  transaction_controller --> approval_controller;
  transaction_controller --> eth_json_rpc_provider;
  transaction_controller --> gas_fee_controller;
  transaction_controller --> network_controller;
  user_operation_controller --> base_controller;
  user_operation_controller --> controller_utils;
  user_operation_controller --> polling_controller;
  user_operation_controller --> approval_controller;
  user_operation_controller --> gas_fee_controller;
  user_operation_controller --> keyring_controller;
  user_operation_controller --> network_controller;
  user_operation_controller --> transaction_controller;
```

<!-- end dependency graph -->

(This section may be regenerated at any time by running `yarn update-readme-content`.)
