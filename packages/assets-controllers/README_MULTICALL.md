# ERC20 and Native Token Balances for Multiple Addresses with Multicall3

This document explains how to use the new `getERC20BalancesForMultipleAddresses` function that efficiently retrieves ERC20 token balances and native token balances for multiple addresses and multiple tokens using Multicall3's aggregate3 function.

## Function Overview

The function is available in two locations:

1. **Core function**: `getERC20BalancesForMultipleAddresses` in `multicall.ts`
2. **Controller method**: `getERC20BalancesForMultipleAddresses` in `AssetsContractController`

## Usage Examples

### Using the Core Function

```typescript
import { getERC20BalancesForMultipleAddresses } from './multicall';

// Example token addresses (ERC20 contracts)
const tokenAddresses = [
  '0xA0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8', // USDC
  '0xB0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8C8', // USDT
  '0xC0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8C8', // DAI
];
// Note: Native token balances (ETH, MATIC, etc.) are automatically included
// and mapped to the zero address (0x0000000000000000000000000000000000000000)

// Example user addresses
const userAddresses = [
  '0x1111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222',
  '0x3333333333333333333333333333333333333333',
];

const chainId = '0x1'; // Ethereum Mainnet
const provider = new Web3Provider(/* your provider */);

try {
  const balances = await getERC20BalancesForMultipleAddresses(
    tokenAddresses,
    userAddresses,
    chainId,
    provider,
  );

  // Result structure:
  // {
  //   '0xA0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8': {
  //     '0x1111111111111111111111111111111111111111': BN('1000000000000000000'),
  //     '0x2222222222222222222222222222222222222222': BN('2000000000000000000'),
  //     '0x3333333333333333333333333333333333333333': BN('3000000000000000000'),
  //   },
  //   '0xB0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8C8': {
  //     '0x1111111111111111111111111111111111111111': BN('5000000000000000000'),
  //     '0x2222222222222222222222222222222222222222': BN('6000000000000000000'),
  //     '0x3333333333333333333333333333333333333333': BN('7000000000000000000'),
  //   },
  //   '0x0000000000000000000000000000000000000000': { // Native token (ETH, MATIC, etc.)
  //     '0x1111111111111111111111111111111111111111': BN('10000000000000000000'),
  //     '0x2222222222222222222222222222222222222222': BN('20000000000000000000'),
  //     '0x3333333333333333333333333333333333333333': BN('30000000000000000000'),
  //   },
  //   // ... more tokens
  // }

  console.log('Balances retrieved successfully:', balances);
} catch (error) {
  console.error('Error retrieving balances:', error);
}
```

### Using the AssetsContractController

```typescript
import { AssetsContractController } from './AssetsContractController';

// Assuming you have an instance of AssetsContractController
const assetsContractController = new AssetsContractController({
  messenger: /* your messenger */,
  chainId: '0x1',
});

const tokenAddresses = [
  '0xA0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8', // USDC
  '0xB0b86a33E6441b8c4C8C8C8C8C8C8C8C8C8C8C8C8C8', // USDT
];

const userAddresses = [
  '0x1111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222',
];

try {
  const balances = await assetsContractController.getERC20BalancesForMultipleAddresses(
    tokenAddresses,
    userAddresses,
    // Optional: networkClientId
    // Optional: includeNative (default: true)
  );

  console.log('Balances retrieved successfully:', balances);
} catch (error) {
  console.error('Error retrieving balances:', error);
}
```

## Benefits

1. **Efficiency**: Uses Multicall3's aggregate3 function to batch multiple `balanceOf` calls into a single RPC request
2. **Native Token Support**: Automatically includes native token balances (ETH, MATIC, etc.) mapped to the zero address
3. **Error Handling**: Individual calls can fail without affecting others (allowFailure: true)
4. **Performance**: Significantly faster than making individual balanceOf calls for each token/address combination
5. **Network Support**: Works on all chains that support Multicall3

## Supported Networks

The function works on networks that have Multicall3 deployed, including:
- Ethereum Mainnet (0x1)
- Polygon (0x89)
- Arbitrum One (0xa4b1)
- Optimism (0xa)
- Base (0x2105)
- And many more...

## Error Handling

The function includes comprehensive error handling:
- Returns empty object for empty input arrays
- Throws error for unsupported chains
- Logs decoding errors but continues processing other results
- Gracefully handles individual call failures

## Return Type

```typescript
Record<string, Record<string, BN>>
```

Where:
- Outer key: Token contract address (including `0x0000000000000000000000000000000000000000` for native tokens)
- Inner key: User address
- Value: Balance as BN (BigNumber from bn.js)

## Performance Considerations

- The function creates calls for every combination of token address and user address
- Native token balances are included by default (can be disabled with `includeNative: false`)
- For large arrays, consider batching to avoid hitting RPC limits
- The total number of calls = tokenAddresses.length × userAddresses.length + (userAddresses.length if includeNative) 
