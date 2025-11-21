# MetaMask Pay: mUSD Conversion Implementation Guide

## Overview

This document provides comprehensive guidance for implementing a 1-click stablecoin-to-mUSD conversion flow using the `@metamask/transaction-pay-controller` (MetaMask Pay) and its Relay integration.

## Table of Contents

1. [What is Transaction Pay Controller](#what-is-transaction-pay-controller)
2. [How Relay Integration Works](#how-relay-integration-works)
3. [Understanding the Lifecycle](#understanding-the-lifecycle)
4. [Fee Handling & Abstraction](#fee-handling--abstraction)
5. [Implementation Guide for mUSD Conversion](#implementation-guide-for-musd-conversion)
6. [Code Examples](#code-examples)
7. [Important Considerations](#important-considerations)

---

## What is Transaction Pay Controller

The `TransactionPayController` (branded as "MetaMask Pay") automatically provides ERC-20 or native tokens on appropriate chains to enable and simplify EVM transactions.

### Purpose

Solves the problem where users need tokens on a specific chain but have assets elsewhere:
- User has USDC on Ethereum
- User needs mUSD on Arbitrum
- MetaMask Pay bridges/swaps automatically

### Key Features

1. **Automatic Token Detection**: Identifies required tokens from transaction data
   - ERC-20 transfers (via `0xa9059cbb` function signature)
   - Gas fees (native token requirements)
   - EIP-7702 nested calls

2. **Multi-Strategy Support**: 
   - `RelayStrategy`: Uses Relay API for cross-chain transfers
   - `BridgeStrategy`: Uses MetaMask Bridge API
   - `TestStrategy`: For testing purposes

3. **Quote Management**: Fetches and manages quotes from different providers

4. **Lifecycle Management**: Handles the entire flow from quote to execution

---

## How Relay Integration Works

### Relay API Integration

The `RelayStrategy` integrates with the Relay bridging provider:

```typescript
// packages/transaction-pay-controller/src/strategy/relay/RelayStrategy.ts
export class RelayStrategy implements PayStrategy<RelayQuote> {
  async getQuotes(request: PayStrategyGetQuotesRequest) {
    return getRelayQuotes(request);
  }

  async execute(request: PayStrategyExecuteRequest<RelayQuote>) {
    return await submitRelayQuotes(request);
  }
}
```

### Relay Endpoints

- **Quote Endpoint**: `https://api.relay.link/quote`
- **Status Endpoint**: Provided in quote response for polling
- **Configurable**: Can be overridden via `RemoteFeatureFlagController`

### Quote Request Format

```typescript
const body = {
  amount: request.targetAmountMinimum,           // Amount of target token needed
  destinationChainId: Number(request.targetChainId),
  destinationCurrency: request.targetTokenAddress,
  originChainId: Number(request.sourceChainId),
  originCurrency: request.sourceTokenAddress,    // Source token to pay with
  recipient: request.from,
  tradeType: 'EXPECTED_OUTPUT',                  // Get quote for exact output
  user: request.from,
};
```

### Quote Response Structure

```typescript
type RelayQuote = {
  details: {
    currencyOut: {
      amountFormatted: string;
      amountUsd: string;
      currency: { decimals: number };
      minimumAmount: string;
    };
    timeEstimate: number;
  };
  fees: {
    relayer: {
      amountUsd: string;  // Relay's fee
    };
  };
  steps: {
    items: {
      check: {
        endpoint: string;  // Status polling endpoint
        method: 'GET' | 'POST';
      };
      data: {
        chainId: number;
        data: Hex;
        from: Hex;
        gas?: string;
        maxFeePerGas: string;
        maxPriorityFeePerGas: string;
        to: Hex;
        value: string;
      };
      status: 'complete' | 'incomplete';
    }[];
    kind: 'transaction';
  }[];
  skipTransaction?: boolean;  // If true, Relay handles entire flow
};
```

### Execution Flow

1. **Submit Transactions**: Creates approval + transfer transactions on source chain
2. **Wait for Confirmation**: Polls until source chain transactions confirm
3. **Monitor Relay Status**: Polls Relay API until status is 'success'
4. **Handle Original Transaction**: 
   - If `skipTransaction: false`, publishes original transaction (funds now available)
   - If `skipTransaction: true`, marks transaction as `isIntentComplete` (Relay handled everything)

---

## Understanding the Lifecycle

### Two-Step Initialization

Understanding why you need BOTH steps is crucial:

#### Step 1: `addTransaction` - Defines WHAT You Need

```typescript
const tx = await transactionController.addTransaction({
  to: mUSD_ADDRESS,
  data: transferData,  // transfer 100 mUSD
  from: userAddress,
  chainId: '0xa4b1'   // Arbitrum
});
```

**What happens automatically:**
1. `TransactionPayController` subscribes to `TransactionController:stateChange`
2. Detects the new transaction
3. Calls `parseRequiredTokens()` to analyze transaction data:
   - Looks for ERC-20 transfers via `0xa9059cbb` signature
   - Calculates gas fee requirements
   - Checks for nested calls (EIP-7702)
4. Updates state with required tokens:
   ```typescript
   data.tokens = [
     {
       address: mUSD_ADDRESS,
       amountRaw: '100000000',  // 100 mUSD (6 decimals)
       amountHuman: '100',
       chainId: '0xa4b1',
       symbol: 'mUSD',
       // ... more fields
     }
   ]
   ```

#### Step 2: `updatePaymentToken` - Defines HOW You'll Pay

```typescript
await messenger.call('TransactionPayController:updatePaymentToken', {
  transactionId: tx.id,
  tokenAddress: USDC_ADDRESS,
  chainId: '0x1'  // Ethereum mainnet
});
```

**What happens automatically:**
1. Gets payment token info (decimals, symbol, balance)
2. Updates state with payment token
3. Triggers `updateSourceAmounts()` to calculate how much source token needed
4. Triggers `updateQuotes()` to fetch quotes from Relay
5. Calculates totals and fees
6. Updates transaction metadata with `metamaskPay` field

### State Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: addTransaction                                          │
│ ✓ Transaction added to TransactionController                   │
│ ✓ TransactionPayController detects it                          │
│ ✓ Required tokens identified: [100 mUSD on Arbitrum]          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: updatePaymentToken                                      │
│ ✓ Payment token set: [USDC on Ethereum]                       │
│ ✓ Source amounts calculated: [Need X USDC to get 100 mUSD]    │
│ ✓ Quotes fetched from Relay API                               │
│ ✓ Totals calculated (fees + amounts)                          │
│ ✓ UI displays quote to user                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: User Approves Transaction                               │
│ ✓ Original transaction signed                                  │
│ ✓ TransactionPayPublishHook invoked                           │
│ ✓ RelayStrategy.execute() called                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Relay Execution                                         │
│ ✓ Approval + Transfer transactions created on Ethereum        │
│ ✓ Wait for Ethereum transactions to confirm                   │
│ ✓ Poll Relay status until 'success'                           │
│ ✓ mUSD delivered to Arbitrum                                  │
│ ✓ Original transaction published (if not skipTransaction)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fee Handling & Abstraction

One of the most powerful features is **automatic fee abstraction across chains**.

### How Fees Are Paid

#### On Source Chain (e.g., Ethereum with USDC)

1. **User Pays Gas in Native Token**: User pays ETH for gas on Ethereum
2. **Source Token Deposited**: USDC deposited to Relay's contract
3. **Relay Fee Deducted**: Relay's fee comes from the deposited amount

```typescript
// Relay creates these transactions automatically:
[
  {
    // Transaction 1: Approve USDC
    to: USDC_ADDRESS,
    data: encodeApproval(RELAY_CONTRACT, amount),
    gas: '50000'
  },
  {
    // Transaction 2: Deposit to Relay
    to: RELAY_CONTRACT,
    data: encodeDeposit(...),
    value: '0',
    gas: '200000'
  }
]
```

#### On Target Chain (e.g., Arbitrum with mUSD)

1. **Relay Delivers Tokens**: Relayer on Arbitrum delivers mUSD
2. **Original Transaction Executes**: Your mUSD transfer now has funds
3. **Gas Paid From**: 
   - Either existing balance on Arbitrum
   - Or extra delivered by Relay (depends on quote)

### Special Case: `skipTransaction` Mode

When Relay can handle the entire flow (like Hyperliquid deposits):

```typescript
if (quote.skipTransaction) {
  // Relay does EVERYTHING on target chain
  // User pays ZERO gas on target chain
  // Original transaction is marked as "intent complete"
  updateTransaction({ transactionId }, (tx) => {
    tx.isIntentComplete = true;
    tx.txParams.nonce = undefined;  // Won't be published
  });
}
```

### Fee Breakdown in UI

The controller calculates comprehensive fee information:

```typescript
tx.metamaskPay = {
  bridgeFeeFiat: totals.fees.provider.usd,      // Relay's fee
  chainId: paymentToken.chainId,                 // Source chain
  networkFeeFiat: totals.fees.sourceNetwork.usd, // Gas on source
  tokenAddress: paymentToken.address,            // Source token
  totalFiat: totals.total.usd,                   // Total cost
};
```

**Example Fee Display:**

```
Transfer 100 mUSD on Arbitrum
Paying with: 102.50 USDC on Ethereum

Fees Breakdown:
├─ Relay Fee:              $0.50
├─ Ethereum Gas:           $2.00
├─ Arbitrum Gas:           $0.00 (included)
└─ Total Cost:             $2.50

You'll spend: 102.50 USDC
You'll receive: 100 mUSD (on Arbitrum)
```

---

## Implementation Guide for mUSD Conversion

### Approach 1: Transaction-Driven Flow (Recommended)

This approach works with the current controller design without modifications.

**Concept**: Create a minimal transaction that requires mUSD, then use MetaMask Pay to provide it.

#### Use Cases

1. **Self-Transfer**: Transfer mUSD to yourself
2. **Placeholder Interaction**: Call a contract that accepts mUSD
3. **Actual Use Case**: If user already has a specific mUSD transaction in mind

#### Advantages

- ✅ Works immediately with existing controller
- ✅ No code changes needed
- ✅ Follows intended design pattern
- ✅ Full fee calculation and display
- ✅ All safety checks included

#### Disadvantages

- ⚠️ Requires creating a transaction even for simple conversions
- ⚠️ Gas cost on target chain (though minimal for self-transfer)
- ⚠️ Two-step UX (create tx, then select payment)

### Approach 2: Direct Conversion (Requires Extension)

Modify the controller to support standalone conversions without requiring a transaction.

#### Required Changes

1. Add `addRequiredToken()` method to manually specify needed tokens
2. Modify quote fetching to work without a parent transaction
3. Handle execution without a target transaction to publish
4. Update state management for conversion-only mode

#### Advantages

- ✅ Cleaner UX for pure conversion
- ✅ No gas on target chain needed
- ✅ More flexible for various use cases

#### Disadvantages

- ⚠️ Requires controller modifications
- ⚠️ Needs careful testing
- ⚠️ May need to update fee calculations
- ⚠️ Breaking change considerations

---

## Code Examples

### Example 1: Basic mUSD Self-Transfer Conversion

```typescript
import { TransactionPayController } from '@metamask/transaction-pay-controller';
import { TransactionPayPublishHook } from '@metamask/transaction-pay-controller';
import { TransactionPayStrategy } from '@metamask/transaction-pay-controller';

// 1. Initialize the controller (during app setup)
const transactionPayController = new TransactionPayController({
  messenger,
  getStrategy: async (transaction) => {
    // Use Relay for cross-chain transfers
    return TransactionPayStrategy.Relay;
  },
});

// 2. Set up the publish hook (during app setup)
const publishHook = new TransactionPayPublishHook({
  messenger,
  isSmartTransaction: (chainId) => {
    // Determine if smart transactions are enabled for this chain
    return smartTransactionEnabledChains.includes(chainId);
  },
});

// Register the hook with TransactionController
transactionController.setPublishHook(publishHook.getHook());

// 3. Create a minimal mUSD transaction (when user wants to convert)
const mUSD_ADDRESS = '0x...'; // mUSD contract address
const ARBITRUM_CHAIN_ID = '0xa4b1';
const USER_ADDRESS = '0x...';

// Encode a self-transfer of 100 mUSD
const transferData = encodeFunctionData({
  abi: ERC20_ABI,
  functionName: 'transfer',
  args: [USER_ADDRESS, parseUnits('100', 6)] // 100 mUSD with 6 decimals
});

const targetTransaction = await messenger.call(
  'TransactionController:addTransaction',
  {
    to: mUSD_ADDRESS,
    data: transferData,
    from: USER_ADDRESS,
    chainId: ARBITRUM_CHAIN_ID,
  },
  {
    requireApproval: true,
    origin: 'metamask-pay-musd-conversion',
  }
);

// 4. Wait for required tokens to be identified (happens automatically)
// The controller will detect: "needs 100 mUSD on Arbitrum"

// 5. User selects source stablecoin (USDC on Ethereum)
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ETHEREUM_CHAIN_ID = '0x1';

await messenger.call('TransactionPayController:updatePaymentToken', {
  transactionId: targetTransaction.id,
  tokenAddress: USDC_ADDRESS,
  chainId: ETHEREUM_CHAIN_ID,
});

// 6. Display quotes to user (access from state)
const state = messenger.call('TransactionPayController:getState');
const transactionData = state.transactionData[targetTransaction.id];

console.log('Quotes:', transactionData.quotes);
console.log('Totals:', transactionData.totals);
console.log('Fees:', transactionData.totals?.fees);

// UI displays:
// "Convert 102.50 USDC (Ethereum) → 100 mUSD (Arbitrum)"
// "Relay Fee: $0.50"
// "Gas Fee: $2.00"
// "Total: $2.50"

// 7. User approves transaction
// The publish hook automatically:
// - Creates approval + transfer on Ethereum
// - Waits for confirmation
// - Monitors Relay status
// - Publishes original mUSD transaction once funds arrive
```

### Example 2: Conversion with Real Transaction

If user already has a transaction that needs mUSD:

```typescript
// User wants to deposit 1000 mUSD to a DeFi protocol
const depositData = encodeFunctionData({
  abi: DEFI_PROTOCOL_ABI,
  functionName: 'deposit',
  args: [parseUnits('1000', 6)] // 1000 mUSD
});

const targetTransaction = await messenger.call(
  'TransactionController:addTransaction',
  {
    to: DEFI_PROTOCOL_ADDRESS,
    data: depositData,
    from: USER_ADDRESS,
    chainId: ARBITRUM_CHAIN_ID,
  },
  { requireApproval: true }
);

// Controller detects: "needs 1000 mUSD on Arbitrum"

// User selects payment: "DAI on Ethereum"
await messenger.call('TransactionPayController:updatePaymentToken', {
  transactionId: targetTransaction.id,
  tokenAddress: DAI_ADDRESS,
  chainId: ETHEREUM_CHAIN_ID,
});

// Quotes automatically fetched and displayed
// On approval, MetaMask Pay handles the entire flow
```

### Example 3: Handling Multiple Stablecoin Options

```typescript
// Let user choose from multiple stablecoins
const STABLECOIN_OPTIONS = [
  { symbol: 'USDC', address: '0xA0b8...', chainId: '0x1', name: 'Ethereum' },
  { symbol: 'USDT', address: '0xdAC1...', chainId: '0x1', name: 'Ethereum' },
  { symbol: 'DAI', address: '0x6B17...', chainId: '0x1', name: 'Ethereum' },
  { symbol: 'USDC', address: '0xFF97...', chainId: '0x89', name: 'Polygon' },
];

// For each option, fetch quote to compare
const quotes = await Promise.all(
  STABLECOIN_OPTIONS.map(async (stablecoin) => {
    // Temporarily update payment token
    await messenger.call('TransactionPayController:updatePaymentToken', {
      transactionId: targetTransaction.id,
      tokenAddress: stablecoin.address,
      chainId: stablecoin.chainId,
    });

    // Wait for quotes to update
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get quote from state
    const state = messenger.call('TransactionPayController:getState');
    const data = state.transactionData[targetTransaction.id];

    return {
      stablecoin,
      quote: data.quotes?.[0],
      total: data.totals?.total,
    };
  })
);

// Display all options to user
quotes.forEach(({ stablecoin, total }) => {
  console.log(
    `${stablecoin.symbol} on ${stablecoin.name}: $${total?.usd}`
  );
});

// User selects best option, then approves
```

### Example 4: Monitoring Conversion Progress

```typescript
// After user approves, monitor progress
messenger.subscribe(
  'TransactionController:stateChange',
  (state) => {
    const tx = state.transactions.find(t => t.id === targetTransaction.id);
    
    // Check for required transactions (Relay's approval + transfer)
    if (tx?.requiredTransactionIds?.length) {
      console.log('Relay transactions:', tx.requiredTransactionIds);
      
      // Check their status
      tx.requiredTransactionIds.forEach(reqId => {
        const reqTx = state.transactions.find(t => t.id === reqId);
        console.log(`${reqId}: ${reqTx?.status}`);
      });
    }
    
    // Check if intent is complete (skipTransaction mode)
    if (tx?.isIntentComplete) {
      console.log('Relay completed the entire flow!');
    }
    
    // Check final status
    if (tx?.status === 'confirmed') {
      console.log('Conversion complete!');
    }
  }
);
```

### Example 5: Error Handling

```typescript
try {
  // Create target transaction
  const targetTx = await messenger.call(
    'TransactionController:addTransaction',
    { /* ... */ }
  );

  // Update payment token
  await messenger.call('TransactionPayController:updatePaymentToken', {
    transactionId: targetTx.id,
    tokenAddress: USDC_ADDRESS,
    chainId: ETHEREUM_CHAIN_ID,
  });

  // Check if quotes were fetched
  const state = messenger.call('TransactionPayController:getState');
  const data = state.transactionData[targetTx.id];

  if (!data.quotes || data.quotes.length === 0) {
    throw new Error('No quotes available for this conversion');
  }

  if (data.isLoading) {
    console.log('Still loading quotes...');
  }

  // Check sufficient balance
  const sourceAmount = data.sourceAmounts?.[0]?.sourceAmountHuman;
  const paymentBalance = data.paymentToken?.balanceHuman;

  if (new BigNumber(sourceAmount).gt(paymentBalance)) {
    throw new Error(
      `Insufficient ${data.paymentToken.symbol} balance. ` +
      `Need: ${sourceAmount}, Have: ${paymentBalance}`
    );
  }

} catch (error) {
  if (error.message.includes('Transaction not found')) {
    console.error('Transaction was not created');
  } else if (error.message.includes('Payment token not found')) {
    console.error('Selected token is not available');
  } else if (error.message.includes('Failed to fetch Relay quotes')) {
    console.error('Relay API error:', error);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

---

## Important Considerations

### 1. Controller Dependencies

The `TransactionPayController` requires messenger access to:

```typescript
type AllowedActions =
  | AccountTrackerControllerGetStateAction
  | BridgeControllerActions
  | BridgeStatusControllerActions
  | CurrencyRateControllerActions
  | GasFeeControllerActions
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction
  | RemoteFeatureFlagControllerGetStateAction
  | TokenBalancesControllerGetStateAction
  | TokenListControllerActions
  | TokenRatesControllerGetStateAction
  | TokensControllerGetStateAction
  | TransactionControllerAddTransactionAction
  | TransactionControllerAddTransactionBatchAction
  | TransactionControllerGetStateAction
  | TransactionControllerUpdateTransactionAction;
```

Ensure all these controllers are initialized and accessible via messenger.

### 2. Token Detection Requirements

For automatic token detection to work:
- Token must be in user's token list (`TokensController`)
- Token rates must be available (`TokenRatesController`)
- Token must have proper metadata (decimals, symbol)

If a token isn't detected:
- Add it to the token list first
- Ensure rate APIs support it
- Check that it's on a supported chain

### 3. Relay Limitations

Current Relay integration has some limitations:
- **Polygon Native Token**: Special handling for MATIC → native address conversion
- **Hyperliquid Deposits**: Special case for Arbitrum USDC → Hyperliquid
- **Gas Estimation**: Falls back to `900000` if quote doesn't provide gas
- **Supported Chains**: Limited to chains Relay supports

### 4. Gas Fee Considerations

The controller identifies gas fees as required tokens:
- If gas fee USD value < $1, it requests minimum $1 equivalent
- Gas fees are marked with `allowUnderMinimum: true`
- Gas fees are marked with `skipIfBalance: true` (won't request if user has balance)

This means for your mUSD conversion:
- If user has ETH on Arbitrum → no extra gas token needed
- If user has no ETH on Arbitrum → controller will request it (minimum $1)

### 5. Quote Refresh

Quotes automatically refresh every 30 seconds (default):
- Ensures user sees up-to-date prices
- Can be customized via `PayStrategy.getRefreshInterval()`
- Refresh only happens while transaction is `unapproved`

### 6. Transaction States

Important transaction states to monitor:
- `unapproved`: User hasn't approved yet (quotes active)
- `approved`: User approved, publish hook will execute
- `signed`: Transaction signed but not yet published
- `submitted`: Published to network
- `confirmed`: Transaction confirmed
- `failed`: Transaction failed
- `dropped`: Transaction dropped/replaced

The `TransactionPayController` cleans up its state when transactions reach finalized states.

### 7. Testing Considerations

When testing:
- Use `TransactionPayStrategy.Test` for mock quotes
- Mock the Relay API responses for integration tests
- Test both `skipTransaction` true and false paths
- Test error cases (insufficient balance, API failures)
- Test with multiple required tokens
- Test quote refresh behavior

### 8. Security Considerations

- **User Approval Required**: All transactions require explicit user approval
- **Slippage Protection**: Relay quotes include `minimumAmount` to protect against slippage
- **Balance Checks**: Controller verifies sufficient balance before proceeding
- **Transaction Linking**: `requiredTransactionIds` ensures dependency tracking
- **Rate Limits**: Be aware of Relay API rate limits

### 9. UX Recommendations

For the best user experience:

1. **Show Loading States**: Display while quotes are being fetched
2. **Display All Fees**: Show breakdown of provider, source, and target network fees
3. **Show Time Estimates**: Use `quote.details.timeEstimate` to set expectations
4. **Allow Token Comparison**: Let users compare costs across different source tokens
5. **Handle Errors Gracefully**: Provide clear error messages and recovery options
6. **Show Progress**: Update UI during multi-step execution
7. **Confirm Success**: Show clear confirmation when conversion completes

### 10. Performance Optimization

- **Quote Caching**: Quotes are cached in state and auto-refreshed
- **Parallel Quote Fetching**: Can fetch quotes for multiple tokens simultaneously
- **Batch Transactions**: Relay supports batching approval + transfer
- **Gas Estimation**: Uses provider gas estimates when available

---

## Advanced Topics

### Custom Strategy Implementation

If you need custom behavior beyond Relay:

```typescript
import { PayStrategy } from '@metamask/transaction-pay-controller';

class CustomStrategy implements PayStrategy<CustomQuote> {
  async getQuotes(request: PayStrategyGetQuotesRequest) {
    // Your custom quote logic
    return quotes;
  }

  async execute(request: PayStrategyExecuteRequest<CustomQuote>) {
    // Your custom execution logic
    return { transactionHash };
  }

  async getRefreshInterval(request) {
    return 60000; // 1 minute
  }
}

// Register your strategy
const controller = new TransactionPayController({
  messenger,
  getStrategy: async (transaction) => {
    if (shouldUseCustomStrategy(transaction)) {
      return 'custom' as TransactionPayStrategy;
    }
    return TransactionPayStrategy.Relay;
  },
});
```

### Extending for Conversion-Only Mode

To support conversions without transactions:

```typescript
// Extension to TransactionPayController
class ExtendedTransactionPayController extends TransactionPayController {
  async addConversion({
    targetToken,
    targetChain,
    targetAmount,
    sourceToken,
    sourceChain,
    from,
  }) {
    // Create a synthetic transaction ID
    const syntheticTxId = `conversion-${Date.now()}`;
    
    // Manually set required tokens
    this.updateTransactionData(syntheticTxId, (data) => {
      data.tokens = [{
        address: targetToken,
        chainId: targetChain,
        amountRaw: targetAmount,
        // ... other fields
      }];
    });
    
    // Set payment token
    await this.updatePaymentToken({
      transactionId: syntheticTxId,
      tokenAddress: sourceToken,
      chainId: sourceChain,
    });
    
    return syntheticTxId;
  }
}
```

---

## Troubleshooting

### Common Issues

1. **"Transaction not found"**
   - Ensure transaction was created in TransactionController
   - Check that controller is subscribed to state changes
   - Verify transaction hasn't been finalized/removed

2. **"Payment token not found"**
   - Verify token is in TokensController state
   - Check TokenRatesController has rates for the token
   - Ensure token address is correct format (checksummed)

3. **"No quotes available"**
   - Check Relay API is accessible
   - Verify source/target chain combination is supported
   - Ensure sufficient liquidity exists for the pair
   - Check RemoteFeatureFlagController for feature flags

4. **"Insufficient balance"**
   - User doesn't have enough source token
   - Balance data might be stale (refresh balances)
   - Check if gas token balance is also needed

5. **Quotes not refreshing**
   - Verify transaction is still in `unapproved` state
   - Check QuoteRefresher is running
   - Ensure no errors in quote fetching

### Debug Logging

Enable debug logging to troubleshoot:

```typescript
import { createModuleLogger } from '@metamask/utils';
import { projectLogger } from '@metamask/transaction-pay-controller';

// Logs will show:
// - Transaction changes detected
// - Required tokens identified
// - Payment token updates
// - Quote requests and responses
// - Execution progress
```

---

## Summary

The `TransactionPayController` with Relay integration provides a robust foundation for implementing stablecoin-to-mUSD conversions. Key takeaways:

1. **Two-Step Flow**: Create transaction → Select payment token
2. **Automatic Detection**: Controller identifies required tokens from transaction data
3. **Quote Management**: Fetches, caches, and refreshes quotes automatically
4. **Fee Abstraction**: Handles complex multi-chain fee payment transparently
5. **Relay Integration**: Production-ready integration with Relay API
6. **Transaction-Driven**: Current design requires a target transaction

For implementing 1-click mUSD conversion:
- **Quick Solution**: Use self-transfer approach (works today)
- **Optimal Solution**: Extend controller for conversion-only mode (requires dev work)

The architecture is well-designed, thoroughly tested, and ready for production use.

