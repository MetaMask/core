# `@metamask/money-account-mfa-whitelist`

Determines which Money Account signature requests can be signed without MFA approval

## Installation

`yarn add @metamask/money-account-mfa-whitelist`

or

`npm install @metamask/money-account-mfa-whitelist`

## Usage

The clients and the MPC Backend call `getMfaRequirement` with two arguments:

- **The request:** what was passed to the Money keyring and what the hash was computed from. This is the untrusted input being checked.
- **What the signer itself knows:** the Money Account whose key signs, the 32-byte hash to sign, the pinned configuration and, optionally, the current time. The backend must take these from its own state, never from the request.

A request that doesn't match a whitelist rule requires MFA, including a malformed request, so the function never throws.

```ts
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import { getMfaRequirement } from '@metamask/money-account-mfa-whitelist';

const config = {
  chainId: '0x8f',
  contracts: DELEGATOR_CONTRACTS['1.3.0'][143],
  musdTokenAddress: '0x…',
  chompDelegateAddress: '0x…',
  vaults: [
    {
      boringVault: '0x…',
      tellerAddress: '0x…',
      vedaVaultAdapterAddress: '0x…',
    },
  ],
  cardSignInDomain: 'link.metamask.io',
};

const requirement = getMfaRequirement(
  { method: 'signTypedData', address: requestAddress, version: 'V4', data },
  { address: signingAddress, hash, config },
);

if (requirement.mfaRequired) {
  console.log(`MFA required: ${requirement.reason}`);
} else {
  console.log(`Whitelisted by ${requirement.rule}`);
}
```

### Whitelist rules

| Rule                        | Method                     | Payload                                                                                                                                                                      |
| --------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chomp-authentication`      | `signPersonalMessage`      | `CHOMP Authentication <timestamp>`, within `maxMessageAge` of now                                                                                                            |
| `rewards-binding`           | `signPersonalMessage`      | `metamask-rewards:money-account-binding:<subject>:<address>:<timestamp>` for the signing account, within `maxMessageAge` of now                                              |
| `card-sign-in`              | `signPersonalMessage`      | A SIWE message for `cardSignInDomain` and the Money Account chain, signed by the account, that is not expired                                                                |
| `eip7702-authorization`     | `signEip7702Authorization` | An authorization to `EIP7702StatelessDeleGatorImpl` on the Money Account chain                                                                                               |
| `vault-standing-delegation` | `signTypedData` (V4)       | A root delegation to the CHOMP delegate with exactly a `ValueLte(0)`, an `ERC20TransferAmount` of mUSD or vault shares, and a `Redeemer` of that vault's adapter             |
| `vault-deposit-delegation`  | `signTypedData` (V4)       | A single-use root delegation (`LimitedCalls(1)`) whose exact executions are `mUSD.approve(boringVault, amount)` followed by `teller.deposit(mUSD, amount, minimumMint, 0x0)` |

Every delegation must be signed by the delegator, use the root authority, and be verified by the pinned `DelegationManager` on the Money Account chain.

### Hash binding

A whitelisted request is only whitelisted if it hashes to exactly `hash`, so the MPC Backend can sign `hash` after inspecting the request. The hash is computed from the same values the whitelist rules inspect:

| Method                     | Hash                                                                       |
| -------------------------- | -------------------------------------------------------------------------- |
| `signPersonalMessage`      | `keccak256("\x19Ethereum Signed Message:\n" ‖ length ‖ message)` (EIP-191) |
| `signTypedData` (V4)       | `keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(delegation))` (EIP-712)   |
| `signEip7702Authorization` | `keccak256(0x05 ‖ rlp([chainId, contractAddress, nonce]))` (EIP-7702)      |

The request must also be for `address`, the account whose key signs the hash. Otherwise MFA is required.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).
