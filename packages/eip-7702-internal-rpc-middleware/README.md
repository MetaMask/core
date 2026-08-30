# `@metamask/eip-7702-internal-rpc-middleware`

Implements internal JSON-RPC methods that support EIP-7702 account upgrade functionality. These methods are internal to MetaMask and not defined in [EIP-7702](https://eips.ethereum.org/EIPS/eip-7702), but provide the necessary infrastructure for EIP-7702 account upgrades.

## Installation

`yarn add @metamask/eip-7702-internal-rpc-middleware`

or

`npm install @metamask/eip-7702-internal-rpc-middleware`

## JSON-RPC Methods

### wallet_upgradeAccount

Upgrades an EOA account to a smart account using EIP-7702.

**Parameters:**

- `account` (string): Address of the EOA to upgrade
- `chainId` (string, optional): Chain ID for the upgrade (defaults to current)

**Returns:**

- `transactionHash` (string): Hash of the EIP-7702 authorization transaction
- `upgradedAccount` (string): Address of the upgraded account (same as input)
- `delegatedTo` (string): Address of the contract delegated to

**Example:**

```json
{
  "method": "wallet_upgradeAccount",
  "params": [
    {
      "account": "0x1234567890123456789012345678901234567890",
      "chainId": "0x1"
    }
  ]
}
```

### wallet_getAccountUpgradeStatus

Checks if an account has been upgraded using EIP-7702.

**Parameters:**

- `account` (string): Address of the account to check
- `chainId` (string, optional): Chain ID for the check (defaults to current)

**Returns:**

- `account` (string): Address of the checked account
- `isUpgraded` (boolean): Whether the account is upgraded
- `upgradedAddress` (string | null): Address to which the account is upgraded (null if not upgraded)
- `chainId` (string): Chain ID where the check was performed

**Example:**

```json
{
  "method": "wallet_getAccountUpgradeStatus",
  "params": [
    {
      "account": "0x1234567890123456789012345678901234567890",
      "chainId": "0x1"
    }
  ]
}
```

**Example Response (Upgraded Account):**

```json
{
  "account": "0x1234567890123456789012345678901234567890",
  "isUpgraded": true,
  "upgradedAddress": "0xabcdef1234567890abcdef1234567890abcdef12",
  "chainId": "0x1"
}
```

**Example Response (Non-Upgraded Account):**

```json
{
  "account": "0x1234567890123456789012345678901234567890",
  "isUpgraded": false,
  "upgradedAddress": null,
  "chainId": "0x1"
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
