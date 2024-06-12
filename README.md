# Core Monorepo

This monorepo is a collection of packages used across multiple MetaMask clients (e.g. [`metamask-extension`](https://github.com/MetaMask/metamask-extension/), [`metamask-mobile`](https://github.com/MetaMask/metamask-mobile/)).

## Modules

This repository contains the following packages [^fn1]:

<!-- start package list -->

- [`@metamask/accounts-controller`](packages/accounts-controller)
- [`@metamask/address-book-controller`](packages/address-book-controller)
- [`@metamask/announcement-controller`](packages/announcement-controller)
- [`@metamask/approval-controller`](packages/approval-controller)
- [`@metamask/assets-controllers`](packages/assets-controllers)
- [`@metamask/base-controller`](packages/base-controller)
- [`@metamask/build-utils`](packages/build-utils)
- [`@metamask/chain-controller`](packages/chain-controller)
- [`@metamask/composable-controller`](packages/composable-controller)
- [`@metamask/controller-utils`](packages/controller-utils)
- [`@metamask/ens-controller`](packages/ens-controller)
- [`@metamask/eth-json-rpc-provider`](packages/eth-json-rpc-provider)
- [`@metamask/gas-fee-controller`](packages/gas-fee-controller)
- [`@metamask/json-rpc-engine`](packages/json-rpc-engine)
- [`@metamask/json-rpc-middleware-stream`](packages/json-rpc-middleware-stream)
- [`@metamask/keyring-controller`](packages/keyring-controller)
- [`@metamask/logging-controller`](packages/logging-controller)
- [`@metamask/message-manager`](packages/message-manager)
- [`@metamask/name-controller`](packages/name-controller)
- [`@metamask/network-controller`](packages/network-controller)
- [`@metamask/notification-controller`](packages/notification-controller)
- [`@metamask/notification-services-controller`](packages/notification-services-controller)
- [`@metamask/permission-controller`](packages/permission-controller)
- [`@metamask/permission-log-controller`](packages/permission-log-controller)
- [`@metamask/phishing-controller`](packages/phishing-controller)
- [`@metamask/polling-controller`](packages/polling-controller)
- [`@metamask/preferences-controller`](packages/preferences-controller)
- [`@metamask/profile-sync-controller`](packages/profile-sync-controller)
- [`@metamask/queued-request-controller`](packages/queued-request-controller)
- [`@metamask/rate-limit-controller`](packages/rate-limit-controller)
- [`@metamask/selected-network-controller`](packages/selected-network-controller)
- [`@metamask/signature-controller`](packages/signature-controller)
- [`@metamask/transaction-controller`](packages/transaction-controller)
- [`@metamask/user-operation-controller`](packages/user-operation-controller)

<!-- end package list -->

Or, in graph form [^fn1]:

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
  chain_controller(["@metamask/chain-controller"]);
  composable_controller(["@metamask/composable-controller"]);
  controller_utils(["@metamask/controller-utils"]);
  ens_controller(["@metamask/ens-controller"]);
  eth_json_rpc_provider(["@metamask/eth-json-rpc-provider"]);
  gas_fee_controller(["@metamask/gas-fee-controller"]);
  json_rpc_engine(["@metamask/json-rpc-engine"]);
  json_rpc_middleware_stream(["@metamask/json-rpc-middleware-stream"]);
  keyring_controller(["@metamask/keyring-controller"]);
  logging_controller(["@metamask/logging-controller"]);
  message_manager(["@metamask/message-manager"]);
  name_controller(["@metamask/name-controller"]);
  network_controller(["@metamask/network-controller"]);
  notification_controller(["@metamask/notification-controller"]);
  notification_services_controller(["@metamask/notification-services-controller"]);
  permission_controller(["@metamask/permission-controller"]);
  permission_log_controller(["@metamask/permission-log-controller"]);
  phishing_controller(["@metamask/phishing-controller"]);
  polling_controller(["@metamask/polling-controller"]);
  preferences_controller(["@metamask/preferences-controller"]);
  profile_sync_controller(["@metamask/profile-sync-controller"]);
  queued_request_controller(["@metamask/queued-request-controller"]);
  rate_limit_controller(["@metamask/rate-limit-controller"]);
  selected_network_controller(["@metamask/selected-network-controller"]);
  signature_controller(["@metamask/signature-controller"]);
  transaction_controller(["@metamask/transaction-controller"]);
  user_operation_controller(["@metamask/user-operation-controller"]);
  accounts_controller --> base_controller;
  accounts_controller --> keyring_controller;
  address_book_controller --> base_controller;
  address_book_controller --> controller_utils;
  announcement_controller --> base_controller;
  approval_controller --> base_controller;
  assets_controllers --> accounts_controller;
  assets_controllers --> approval_controller;
  assets_controllers --> base_controller;
  assets_controllers --> controller_utils;
  assets_controllers --> keyring_controller;
  assets_controllers --> network_controller;
  assets_controllers --> polling_controller;
  assets_controllers --> preferences_controller;
  chain_controller --> base_controller;
  composable_controller --> base_controller;
  composable_controller --> json_rpc_engine;
  ens_controller --> base_controller;
  ens_controller --> controller_utils;
  ens_controller --> network_controller;
  eth_json_rpc_provider --> json_rpc_engine;
  gas_fee_controller --> base_controller;
  gas_fee_controller --> controller_utils;
  gas_fee_controller --> network_controller;
  gas_fee_controller --> polling_controller;
  json_rpc_middleware_stream --> json_rpc_engine;
  keyring_controller --> base_controller;
  keyring_controller --> message_manager;
  logging_controller --> base_controller;
  logging_controller --> controller_utils;
  message_manager --> base_controller;
  message_manager --> controller_utils;
  name_controller --> base_controller;
  name_controller --> controller_utils;
  network_controller --> base_controller;
  network_controller --> controller_utils;
  network_controller --> eth_json_rpc_provider;
  network_controller --> json_rpc_engine;
  notification_controller --> base_controller;
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
  queued_request_controller --> base_controller;
  queued_request_controller --> controller_utils;
  queued_request_controller --> json_rpc_engine;
  queued_request_controller --> network_controller;
  queued_request_controller --> selected_network_controller;
  rate_limit_controller --> base_controller;
  selected_network_controller --> base_controller;
  selected_network_controller --> json_rpc_engine;
  selected_network_controller --> network_controller;
  selected_network_controller --> permission_controller;
  signature_controller --> approval_controller;
  signature_controller --> base_controller;
  signature_controller --> controller_utils;
  signature_controller --> keyring_controller;
  signature_controller --> logging_controller;
  signature_controller --> message_manager;
  transaction_controller --> approval_controller;
  transaction_controller --> base_controller;
  transaction_controller --> controller_utils;
  transaction_controller --> gas_fee_controller;
  transaction_controller --> network_controller;
  user_operation_controller --> approval_controller;
  user_operation_controller --> base_controller;
  user_operation_controller --> controller_utils;
  user_operation_controller --> gas_fee_controller;
  user_operation_controller --> keyring_controller;
  user_operation_controller --> network_controller;
  user_operation_controller --> polling_controller;
  user_operation_controller --> transaction_controller;
```

<!-- end dependency graph -->

Refer to individual packages for usage instructions.

## Learn more

For instructions on performing common development-related tasks, see [contributing to the monorepo](./docs/contributing.md).

[^fn1]: The package list and dependency graph should be programmatically generated by running `yarn update-readme-content`.
