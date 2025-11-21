# MetaMask Pay: Latest Usage Patterns & mUSD Conversion Implementation Guide

## Document Purpose

This guide provides up-to-date information on how to use the `TransactionPayController` (MetaMask Pay) with Relay integration, specifically for implementing a new `musdConversion` transaction type. It addresses common issues and provides the correct implementation patterns based on the latest codebase analysis (commit: 88d6222f9c85d9cfdaee79be13cb4c3578d6cb4f).

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Root Cause Analysis](#root-cause-analysis)
3. [The Two-Step Initialization Flow](#the-two-step-initialization-flow)
4. [Implementation Steps](#implementation-steps)
5. [Adding the musdConversion Transaction Type](#adding-the-musdconversion-transaction-type)
6. [Complete Code Examples](#complete-code-examples)
7. [Architecture Deep Dive](#architecture-deep-dive)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Testing Recommendations](#testing-recommendations)

---

## Problem Statement

### The Issue

When creating a new transaction type called `musdConversion` to convert stablecoins to mUSD, Relay quotes are not being fetched even though the `TransactionPayController` is configured to use the Relay strategy.

### Symptoms

```typescript
const { transactionMeta } = await TransactionController.addTransaction(
  {
    to: MUSD_ADDRESS_ETHEREUM as Hex,
    from: selectedAddress as Hex,
    data: transferData,
    value: '0x0',
    chainId: ETHEREUM_MAINNET_CHAIN_ID as Hex,
  },
  {
    networkClientId,
    origin: 'metamask',
    type: 'musdConversion' as any,
  },
);

// Problem: No quotes are fetched from Relay
// The TransactionPayController state shows no quotes
```

### Expected Behavior

After creating the transaction, the `TransactionPayController` should automatically fetch Relay quotes showing how to convert a source stablecoin (e.g., USDC on Ethereum) to mUSD on the target chain.

---

## Root Cause Analysis

### The Missing Step

The `TransactionPayController` requires a **two-step initialization**:

1. **Step 1**: Create the transaction (defines WHAT tokens are needed)
2. **Step 2**: Set the payment token (defines HOW the user will pay) ← **THIS IS MISSING**

### Code Path Analysis

When quotes are built, the function checks for a payment token first:

```typescript
// packages/transaction-pay-controller/src/utils/quotes.ts:220-235
function buildQuoteRequests({
  from,
  paymentToken,
  sourceAmounts,
  tokens,
  transactionId,
}: {
  from: Hex;
  paymentToken: TransactionPaymentToken | undefined;
  sourceAmounts: TransactionPaySourceAmount[] | undefined;
  tokens: TransactionPayRequiredToken[];
  transactionId: string;
}): QuoteRequest[] {
  if (!paymentToken) {
    return []; // ← No payment token = no quote requests
  }

  const requests = (sourceAmounts ?? []).map((sourceAmount) => {
    // ... build quote requests
  });

  return requests;
}
```

**Without a payment token, no quote requests are generated, and therefore no Relay quotes are fetched.**

### Why This Design?

The separation between "what you need" and "how you'll pay" exists because:

1. Users may have multiple token options across different chains
2. The UI can show multiple payment options and let users compare costs
3. Each payment option generates different quotes with different fees
4. The controller needs to know both the source token AND target token to fetch cross-chain quotes

---

## The Two-Step Initialization Flow

### Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: addTransaction()                                        │
│ Purpose: Define WHAT tokens are needed                         │
├─────────────────────────────────────────────────────────────────┤
│ 1. Transaction added to TransactionController                   │
│ 2. TransactionPayController detects new transaction            │
│ 3. parseRequiredTokens() analyzes transaction data:            │
│    - ERC-20 transfers (via 0xa9059cbb signature)               │
│    - Gas fees (native token)                                    │
│    - Nested calls (EIP-7702)                                    │
│ 4. Updates state.transactionData[id].tokens = [...]           │
│                                                                 │
│ Result: Controller knows "needs X tokens on chain Y"           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                     ⚠️ NO QUOTES YET ⚠️
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: updatePaymentToken()                                    │
│ Purpose: Define HOW user will pay (source token)               │
├─────────────────────────────────────────────────────────────────┤
│ 1. Get payment token info (decimals, symbol, balance)          │
│ 2. Update state with payment token                             │
│ 3. updateSourceAmounts() - calculate how much source needed    │
│ 4. ✅ updateQuotes() - FETCH RELAY QUOTES                      │
│ 5. calculateTotals() - compute fees and totals                 │
│ 6. Update transaction metadata with metamaskPay field          │
│                                                                 │
│ Result: Quotes available, ready to display to user             │
└─────────────────────────────────────────────────────────────────┘
```

### What Happens in Each Step

#### Step 1: Transaction Creation (Automatic)

```typescript
// User creates transaction
const tx = await TransactionController.addTransaction({ ... });

// Automatic processing by TransactionPayController:
pollTransactionChanges() →
  onTransactionChange() →
    parseRequiredTokens() →
      state.transactionData[id].tokens = [
        {
          address: '0x...',
          chainId: '0xa4b1',
          amountRaw: '100000000',
          symbol: 'mUSD',
          // ...
        }
      ]
```

#### Step 2: Payment Token Selection (Manual Trigger Required)

```typescript
// YOU MUST CALL THIS to fetch quotes
await messenger.call('TransactionPayController:updatePaymentToken', {
  transactionId: tx.id,
  tokenAddress: USDC_ADDRESS,
  chainId: '0x1',
});

// This triggers:
updatePaymentToken() →
  #updateTransactionData() →
    updateSourceAmounts() →  // Calculate how much USDC needed
      updateQuotes() →          // ✅ FETCH RELAY QUOTES HERE
        getStrategy() →
          RelayStrategy.getQuotes() →
            Relay API call
```

---

## Implementation Steps

### Prerequisites

Ensure your client codebase has:

1. ✅ `TransactionPayController` initialized with Relay strategy
2. ✅ `TransactionPayPublishHook` registered with `TransactionController`
3. ✅ All required controller dependencies available via messenger
4. ✅ Token info available in `TokensController` and `TokenRatesController`

### Step-by-Step Implementation

#### 1. Initialize Controllers (One-Time Setup)

```typescript
import { TransactionPayController } from '@metamask/transaction-pay-controller';
import { TransactionPayPublishHook } from '@metamask/transaction-pay-controller';
import { TransactionPayStrategy } from '@metamask/transaction-pay-controller';

// During app initialization
const transactionPayController = new TransactionPayController({
  messenger,
  getDelegationTransaction: async (args) => {
    // Your delegation transaction logic
    return delegationTx;
  },
  getStrategy: async (transaction) => {
    // Return Relay strategy for musdConversion type
    if (transaction.type === 'musdConversion') {
      return TransactionPayStrategy.Relay;
    }
    // Default strategy for other types
    return TransactionPayStrategy.Relay;
  },
});

// Set up publish hook
const publishHook = new TransactionPayPublishHook({
  messenger,
  isSmartTransaction: (chainId) => {
    return smartTransactionEnabledChains.includes(chainId);
  },
});

transactionController.setPublishHook(publishHook.getHook());
```

#### 2. Create the mUSD Conversion Transaction

```typescript
import { encodeFunctionData, parseUnits } from 'viem';
import { Hex } from '@metamask/utils';

// Constants
const MUSD_ADDRESS_ETHEREUM = '0x...'; // mUSD contract address
const ETHEREUM_MAINNET_CHAIN_ID = '0x1';
const ARBITRUM_CHAIN_ID = '0xa4b1';

// Encode the transfer data
// Example: Transfer 100 mUSD to user's own address (self-transfer for conversion)
const transferData = encodeFunctionData({
  abi: [
    {
      name: 'transfer',
      type: 'function',
      inputs: [
        { name: 'recipient', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      outputs: [{ name: 'success', type: 'bool' }],
    },
  ],
  functionName: 'transfer',
  args: [
    selectedAddress, // Recipient (self)
    parseUnits('100', 6), // Amount (100 mUSD with 6 decimals)
  ],
});

// STEP 1: Create the transaction
const { transactionMeta } = await TransactionController.addTransaction(
  {
    to: MUSD_ADDRESS_ETHEREUM as Hex,
    from: selectedAddress as Hex,
    data: transferData,
    value: '0x0',
    chainId: ETHEREUM_MAINNET_CHAIN_ID as Hex,
  },
  {
    networkClientId,
    origin: 'metamask',
    type: 'musdConversion' as any, // Custom type (add to enum - see below)
  },
);

console.log('Transaction created:', transactionMeta.id);
```

#### 3. Wait for Token Detection (Optional but Recommended)

```typescript
// Option A: Simple timeout
await new Promise((resolve) => setTimeout(resolve, 100));

// Option B: Subscribe and wait for tokens
await new Promise((resolve) => {
  const unsubscribe = messenger.subscribe(
    'TransactionPayController:stateChange',
    (state) => {
      const txData = state.transactionData[transactionMeta.id];
      if (txData?.tokens && txData.tokens.length > 0) {
        unsubscribe();
        resolve();
      }
    },
  );

  // Timeout after 5 seconds
  setTimeout(() => {
    unsubscribe();
    resolve();
  }, 5000);
});
```

#### 4. Set Payment Token to Trigger Quote Fetching

```typescript
// STEP 2: Set the payment token (THIS IS THE CRITICAL MISSING STEP)
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const sourceChainId = '0x1'; // Ethereum mainnet

try {
  await messenger.call('TransactionPayController:updatePaymentToken', {
    transactionId: transactionMeta.id,
    tokenAddress: USDC_ADDRESS,
    chainId: sourceChainId,
  });

  console.log('Payment token set, quotes will be fetched');
} catch (error) {
  console.error('Failed to set payment token:', error);
  // Handle error (e.g., token not found, rates unavailable)
}
```

#### 5. Wait for Quotes and Display to User

```typescript
// Wait for quotes to load
await new Promise((resolve) => {
  const unsubscribe = messenger.subscribe(
    'TransactionPayController:stateChange',
    (state) => {
      const txData = state.transactionData[transactionMeta.id];

      // Check if quotes are loaded (not loading and quotes exist)
      if (!txData?.isLoading && txData?.quotes && txData.quotes.length > 0) {
        unsubscribe();
        resolve();
      }
    },
  );

  // Timeout after 10 seconds
  setTimeout(() => {
    unsubscribe();
    resolve();
  }, 10000);
});

// Get the final quote data
const state = messenger.call('TransactionPayController:getState');
const txData = state.transactionData[transactionMeta.id];

if (txData.quotes && txData.quotes.length > 0) {
  console.log('✅ Relay quotes available!');

  // Display to user
  const quote = txData.quotes[0];
  const totals = txData.totals;

  console.log({
    sourceToken: txData.paymentToken?.symbol,
    sourceChain: txData.paymentToken?.chainId,
    sourceAmount: txData.sourceAmounts?.[0]?.sourceAmountHuman,

    targetToken: txData.tokens[0]?.symbol,
    targetChain: txData.tokens[0]?.chainId,
    targetAmount: txData.tokens[0]?.amountHuman,

    relayFee: totals?.fees.provider.usd,
    networkFee: totals?.fees.sourceNetwork.usd,
    totalCost: totals?.total.usd,
  });
} else {
  console.error('❌ No quotes available');
  console.log('Transaction data:', txData);
}
```

#### 6. Monitor Transaction Approval and Execution

```typescript
// Subscribe to transaction state changes
messenger.subscribe('TransactionController:stateChange', (state) => {
  const tx = state.transactions.find((t) => t.id === transactionMeta.id);

  if (!tx) return;

  switch (tx.status) {
    case 'unapproved':
      console.log('Waiting for user approval');
      break;

    case 'approved':
      console.log('User approved, Relay execution starting');
      break;

    case 'signed':
      console.log('Transaction signed');
      break;

    case 'submitted':
      console.log('Transaction submitted to network');

      // Check for Relay's required transactions
      if (tx.requiredTransactionIds?.length) {
        console.log('Relay transactions:', tx.requiredTransactionIds);
        tx.requiredTransactionIds.forEach((reqId) => {
          const reqTx = state.transactions.find((t) => t.id === reqId);
          console.log(`  ${reqId}: ${reqTx?.status}`);
        });
      }
      break;

    case 'confirmed':
      console.log('✅ Conversion complete!');
      break;

    case 'failed':
      console.error('❌ Transaction failed:', tx.error);
      break;
  }

  // Check if Relay handled everything (skipTransaction mode)
  if (tx.isIntentComplete) {
    console.log('✅ Relay completed the entire flow!');
  }
});
```

---

## Adding the musdConversion Transaction Type

### 1. Add to TransactionType Enum

**File**: `packages/transaction-controller/src/types.ts`

```typescript
export enum TransactionType {
  // ... existing types ...

  /**
   * A transaction sending a network's native asset to a recipient.
   */
  simpleSend = 'simpleSend',

  /**
   * A transaction that converts stablecoins to mUSD using MetaMask Pay.
   */
  musdConversion = 'musdConversion',

  /**
   * A transaction that is signing typed data.
   */
  signTypedData = 'eth_signTypedData',

  // ... more types ...
}
```

**Location**: Insert after line ~808, between `simpleSend` and `signTypedData`

### 2. Update Type Annotations

If you're using TypeScript, remove the `as any` cast:

```typescript
// Before (with workaround)
type: 'musdConversion' as any,

// After (properly typed)
type: TransactionType.musdConversion,
```

### 3. Configure Strategy for musdConversion

In your controller initialization:

```typescript
const transactionPayController = new TransactionPayController({
  messenger,
  getDelegationTransaction: async (args) => {
    // Your delegation logic
    return delegationTx;
  },
  getStrategy: async (transaction) => {
    // Use Relay for musdConversion transactions
    if (transaction.type === TransactionType.musdConversion) {
      return TransactionPayStrategy.Relay;
    }

    // Use Bridge for bridge transactions
    if (transaction.type === TransactionType.bridge) {
      return TransactionPayStrategy.Bridge;
    }

    // Default to Relay for other types
    return TransactionPayStrategy.Relay;
  },
});
```

---

## Complete Code Examples

### Example 1: Basic mUSD Conversion Flow

```typescript
import { TransactionController } from '@metamask/transaction-controller';
import { TransactionType } from '@metamask/transaction-controller';
import { encodeFunctionData, parseUnits } from 'viem';
import type { Hex } from '@metamask/utils';

/**
 * Convert stablecoins to mUSD using MetaMask Pay with Relay
 */
async function convertToMUSD({
  amount,
  sourceTokenAddress,
  sourceChainId,
  targetChainId = '0xa4b1', // Arbitrum
  userAddress,
}: {
  amount: string; // Human readable amount (e.g., "100")
  sourceTokenAddress: Hex;
  sourceChainId: Hex;
  targetChainId?: Hex;
  userAddress: Hex;
}): Promise<void> {
  const MUSD_ADDRESS = '0x...'; // mUSD contract address
  const MUSD_DECIMALS = 6;

  // Step 1: Encode the mUSD transfer (self-transfer)
  const transferData = encodeFunctionData({
    abi: [
      {
        name: 'transfer',
        type: 'function',
        inputs: [
          { name: 'recipient', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: 'success', type: 'bool' }],
      },
    ],
    functionName: 'transfer',
    args: [userAddress, parseUnits(amount, MUSD_DECIMALS)],
  });

  // Step 2: Create the target transaction
  console.log('Creating mUSD conversion transaction...');
  const { transactionMeta } = await TransactionController.addTransaction(
    {
      to: MUSD_ADDRESS,
      from: userAddress,
      data: transferData,
      value: '0x0',
      chainId: targetChainId,
    },
    {
      networkClientId: undefined,
      origin: 'metamask-musd-conversion',
      type: TransactionType.musdConversion,
    },
  );

  console.log(`Transaction created: ${transactionMeta.id}`);

  // Step 3: Wait for required tokens to be detected
  await waitForTokens(transactionMeta.id);

  // Step 4: Set payment token to trigger quote fetching
  console.log('Fetching Relay quotes...');
  await messenger.call('TransactionPayController:updatePaymentToken', {
    transactionId: transactionMeta.id,
    tokenAddress: sourceTokenAddress,
    chainId: sourceChainId,
  });

  // Step 5: Wait for quotes
  const quotes = await waitForQuotes(transactionMeta.id);

  if (!quotes || quotes.length === 0) {
    throw new Error('No Relay quotes available for this conversion');
  }

  // Step 6: Display quote to user
  const state = messenger.call('TransactionPayController:getState');
  const txData = state.transactionData[transactionMeta.id];

  console.log('Quote received:');
  console.log(
    `  Source: ${txData.sourceAmounts?.[0]?.sourceAmountHuman} ${txData.paymentToken?.symbol} on chain ${txData.paymentToken?.chainId}`,
  );
  console.log(`  Target: ${amount} mUSD on chain ${targetChainId}`);
  console.log(`  Relay Fee: $${txData.totals?.fees.provider.usd}`);
  console.log(`  Network Fee: $${txData.totals?.fees.sourceNetwork.usd}`);
  console.log(`  Total Cost: $${txData.totals?.total.usd}`);

  // Transaction is now ready for user approval
  // The TransactionPayPublishHook will handle execution when user approves
}

/**
 * Helper: Wait for required tokens to be detected
 */
async function waitForTokens(transactionId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timeout waiting for token detection'));
    }, 5000);

    const unsubscribe = messenger.subscribe(
      'TransactionPayController:stateChange',
      (state) => {
        const txData = state.transactionData[transactionId];
        if (txData?.tokens && txData.tokens.length > 0) {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      },
    );
  });
}

/**
 * Helper: Wait for quotes to be fetched
 */
async function waitForQuotes(transactionId: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timeout waiting for quotes'));
    }, 15000);

    const unsubscribe = messenger.subscribe(
      'TransactionPayController:stateChange',
      (state) => {
        const txData = state.transactionData[transactionId];

        // Wait until not loading and quotes exist
        if (!txData?.isLoading && txData?.quotes) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(txData.quotes);
        }
      },
    );
  });
}

// Usage
await convertToMUSD({
  amount: '100',
  sourceTokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  sourceChainId: '0x1', // Ethereum
  targetChainId: '0xa4b1', // Arbitrum
  userAddress: '0x...',
});
```

### Example 2: Let User Choose From Multiple Payment Options

```typescript
/**
 * Show user multiple payment options with cost comparison
 */
async function showPaymentOptions({
  targetAmount,
  targetTokenAddress,
  targetChainId,
  userAddress,
  paymentOptions,
}: {
  targetAmount: string;
  targetTokenAddress: Hex;
  targetChainId: Hex;
  userAddress: Hex;
  paymentOptions: Array<{
    symbol: string;
    address: Hex;
    chainId: Hex;
    chainName: string;
  }>;
}): Promise<void> {
  // Create the target transaction
  const transferData = encodeFunctionData({
    abi: [
      /* ERC20 transfer ABI */
    ],
    functionName: 'transfer',
    args: [userAddress, parseUnits(targetAmount, 6)],
  });

  const { transactionMeta } = await TransactionController.addTransaction(
    {
      to: targetTokenAddress,
      from: userAddress,
      data: transferData,
      value: '0x0',
      chainId: targetChainId,
    },
    {
      networkClientId: undefined,
      origin: 'metamask-musd-conversion',
      type: TransactionType.musdConversion,
    },
  );

  await waitForTokens(transactionMeta.id);

  // Fetch quotes for each payment option
  const quotesWithOptions = [];

  for (const option of paymentOptions) {
    console.log(
      `Fetching quote for ${option.symbol} on ${option.chainName}...`,
    );

    // Set payment token
    await messenger.call('TransactionPayController:updatePaymentToken', {
      transactionId: transactionMeta.id,
      tokenAddress: option.address,
      chainId: option.chainId,
    });

    // Wait for quote
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get quote from state
    const state = messenger.call('TransactionPayController:getState');
    const txData = state.transactionData[transactionMeta.id];

    if (txData.quotes && txData.quotes.length > 0) {
      quotesWithOptions.push({
        option,
        sourceAmount: txData.sourceAmounts?.[0]?.sourceAmountHuman,
        totalCost: txData.totals?.total.usd,
        relayFee: txData.totals?.fees.provider.usd,
        networkFee: txData.totals?.fees.sourceNetwork.usd,
      });
    }
  }

  // Display options to user
  console.log('\nPayment Options:');
  quotesWithOptions
    .sort((a, b) => parseFloat(a.totalCost) - parseFloat(b.totalCost))
    .forEach((quote, index) => {
      console.log(
        `\n${index + 1}. ${quote.option.symbol} on ${quote.option.chainName}`,
      );
      console.log(`   Amount: ${quote.sourceAmount} ${quote.option.symbol}`);
      console.log(`   Total Cost: $${quote.totalCost}`);
      console.log(
        `   (Relay Fee: $${quote.relayFee}, Network Fee: $${quote.networkFee})`,
      );
    });

  // User selects their preferred option
  // Then you set that payment token one final time before they approve
}
```

### Example 3: Error Handling

```typescript
/**
 * Robust conversion with comprehensive error handling
 */
async function convertToMUSDWithErrorHandling({
  amount,
  sourceTokenAddress,
  sourceChainId,
  targetChainId,
  userAddress,
}: {
  amount: string;
  sourceTokenAddress: Hex;
  sourceChainId: Hex;
  targetChainId: Hex;
  userAddress: Hex;
}): Promise<{ success: boolean; transactionId?: string; error?: string }> {
  try {
    // Validate inputs
    if (!amount || parseFloat(amount) <= 0) {
      return { success: false, error: 'Invalid amount' };
    }

    if (
      !sourceTokenAddress ||
      !sourceChainId ||
      !targetChainId ||
      !userAddress
    ) {
      return { success: false, error: 'Missing required parameters' };
    }

    // Create transaction
    const transferData = encodeFunctionData({
      abi: [
        /* ERC20 ABI */
      ],
      functionName: 'transfer',
      args: [userAddress, parseUnits(amount, 6)],
    });

    let transactionMeta;
    try {
      const result = await TransactionController.addTransaction(
        {
          to: sourceTokenAddress,
          from: userAddress,
          data: transferData,
          value: '0x0',
          chainId: targetChainId,
        },
        {
          networkClientId: undefined,
          origin: 'metamask-musd-conversion',
          type: TransactionType.musdConversion,
        },
      );
      transactionMeta = result.transactionMeta;
    } catch (error) {
      return {
        success: false,
        error: `Failed to create transaction: ${error.message}`,
      };
    }

    // Wait for token detection
    try {
      await waitForTokens(transactionMeta.id);
    } catch (error) {
      return {
        success: false,
        error: 'Failed to detect required tokens',
        transactionId: transactionMeta.id,
      };
    }

    // Set payment token
    try {
      await messenger.call('TransactionPayController:updatePaymentToken', {
        transactionId: transactionMeta.id,
        tokenAddress: sourceTokenAddress,
        chainId: sourceChainId,
      });
    } catch (error) {
      return {
        success: false,
        error: `Failed to set payment token: ${error.message}`,
        transactionId: transactionMeta.id,
      };
    }

    // Wait for quotes
    let quotes;
    try {
      quotes = await waitForQuotes(transactionMeta.id);
    } catch (error) {
      return {
        success: false,
        error: 'Timeout waiting for Relay quotes',
        transactionId: transactionMeta.id,
      };
    }

    if (!quotes || quotes.length === 0) {
      return {
        success: false,
        error: 'No Relay quotes available for this conversion pair',
        transactionId: transactionMeta.id,
      };
    }

    // Check balance
    const state = messenger.call('TransactionPayController:getState');
    const txData = state.transactionData[transactionMeta.id];

    const sourceAmount = txData.sourceAmounts?.[0]?.sourceAmountRaw;
    const paymentBalance = txData.paymentToken?.balanceRaw;

    if (sourceAmount && paymentBalance) {
      const needsBigNumber = BigInt(sourceAmount);
      const hasBigNumber = BigInt(paymentBalance);

      if (needsBigNumber > hasBigNumber) {
        return {
          success: false,
          error: `Insufficient ${txData.paymentToken.symbol} balance. Need: ${txData.sourceAmounts?.[0]?.sourceAmountHuman}, Have: ${txData.paymentToken.balanceHuman}`,
          transactionId: transactionMeta.id,
        };
      }
    }

    return {
      success: true,
      transactionId: transactionMeta.id,
    };
  } catch (error) {
    return {
      success: false,
      error: `Unexpected error: ${error.message}`,
    };
  }
}
```

---

## Architecture Deep Dive

### How TransactionPayController Detects Transactions

The controller subscribes to `TransactionController:stateChange` events:

```typescript
// packages/transaction-pay-controller/src/utils/transaction.ts:51-103
export function pollTransactionChanges(
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: UpdateTransactionDataCallback,
  removeTransactionData: (transactionId: string) => void,
) {
  messenger.subscribe(
    'TransactionController:stateChange',
    (
      transactions: TransactionMeta[],
      previousTransactions: TransactionMeta[] | undefined,
    ) => {
      // Detect new transactions
      const newTransactions = transactions.filter(
        (tx) => !previousTransactions?.find((prevTx) => prevTx.id === tx.id),
      );

      // Detect updated transactions (data changed)
      const updatedTransactions = transactions.filter((tx) => {
        const previousTransaction = previousTransactions?.find(
          (prevTx) => prevTx.id === tx.id,
        );
        return (
          previousTransaction &&
          previousTransaction?.txParams.data !== tx.txParams.data
        );
      });

      // Process new and updated transactions
      [...newTransactions, ...updatedTransactions].forEach((tx) =>
        onTransactionChange(tx, messenger, updateTransactionData),
      );
    },
    (state) => state.transactions,
  );
}
```

### How Required Tokens Are Identified

```typescript
// packages/transaction-pay-controller/src/utils/required-tokens.ts:29-37
export function parseRequiredTokens(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionPayRequiredToken[] {
  return [
    getTokenTransferToken(transaction, messenger), // ERC-20 transfers
    getGasFeeToken(transaction, messenger), // Gas fees
  ].filter(Boolean) as TransactionPayRequiredToken[];
}
```

**ERC-20 Transfer Detection**:

- Looks for `0xa9059cbb` function signature (ERC-20 `transfer`)
- Supports both direct calls and nested calls (EIP-7702)
- Decodes the recipient and amount using ethers ABI decoder

**Gas Fee Detection**:

- Calculates `gas * maxFeePerGas` for max gas cost
- Converts to USD value
- If less than $1 USD, requests $1 equivalent (with `allowUnderMinimum: true`)
- Marked with `skipIfBalance: true` (won't request if user has native token)

### How Quotes Are Fetched

```typescript
// packages/transaction-pay-controller/src/utils/quotes.ts:42-110
export async function updateQuotes(
  request: UpdateQuotesRequest,
): Promise<boolean> {
  const { messenger, transactionData, transactionId, updateTransactionData } =
    request;

  const transaction = getTransaction(transactionId, messenger);
  if (!transaction || !transactionData) {
    throw new Error('Transaction not found');
  }

  // Only fetch quotes for unapproved transactions
  if (transaction?.status !== TransactionStatus.unapproved) {
    return false;
  }

  const { paymentToken, sourceAmounts, tokens } = transactionData;

  // Build quote requests (returns [] if no paymentToken)
  const requests = buildQuoteRequests({
    from: transaction.txParams.from as Hex,
    paymentToken,
    sourceAmounts,
    tokens,
    transactionId,
  });

  updateTransactionData(transactionId, (data) => {
    data.isLoading = true;
  });

  try {
    // Get the strategy (Relay, Bridge, or Test)
    const strategy = await getStrategy(messenger as never, transaction);

    // Fetch quotes from the strategy
    const quotes = requests?.length
      ? await strategy.getQuotes({ messenger, requests, transaction })
      : [];

    // Calculate totals and fees
    const totals = calculateTotals({
      quotes: quotes as TransactionPayQuote<unknown>[],
      messenger,
      tokens,
      transaction,
    });

    // Update transaction metadata
    syncTransaction({
      batchTransactions,
      messenger: messenger as never,
      paymentToken,
      totals,
      transactionId,
    });

    // Store quotes in state
    updateTransactionData(transactionId, (data) => {
      data.quotes = quotes as never;
      data.quotesLastUpdated = Date.now();
      data.totals = totals;
    });
  } finally {
    updateTransactionData(transactionId, (data) => {
      data.isLoading = false;
    });
  }

  return true;
}
```

### How Relay Strategy Works

```typescript
// packages/transaction-pay-controller/src/strategy/relay/RelayStrategy.ts
export class RelayStrategy implements PayStrategy<RelayQuote> {
  async getQuotes(request: PayStrategyGetQuotesRequest) {
    // Fetches quotes from Relay API
    return getRelayQuotes(request);
  }

  async execute(request: PayStrategyExecuteRequest<RelayQuote>) {
    // Submits transactions and monitors Relay status
    return await submitRelayQuotes(request);
  }

  async getRefreshInterval(request: PayStrategyGetRefreshIntervalRequest) {
    // Returns 30 seconds by default
    return 30000;
  }
}
```

**Relay API Flow**:

1. **Quote Request**: POST to `https://api.relay.link/quote`

   ```json
   {
     "amount": "100000000",
     "destinationChainId": 42161,
     "destinationCurrency": "0x...",
     "originChainId": 1,
     "originCurrency": "0x...",
     "recipient": "0x...",
     "tradeType": "EXPECTED_OUTPUT",
     "user": "0x..."
   }
   ```

2. **Quote Response**: Contains transaction steps and fee info

   ```json
   {
     "steps": [{
       "items": [
         { "data": {...}, "status": "incomplete" },  // Approval
         { "data": {...}, "status": "incomplete" }   // Deposit
       ],
       "kind": "transaction"
     }],
     "fees": {
       "relayer": { "amountUsd": "0.50" }
     },
     "skipTransaction": false
   }
   ```

3. **Execution**: Creates approval + deposit transactions
4. **Monitoring**: Polls Relay status endpoint until success
5. **Completion**: Publishes original transaction (or marks as complete if `skipTransaction: true`)

---

## Troubleshooting Guide

### Issue 1: No Quotes Fetched

**Symptoms**:

- `transactionData[id].quotes` is `undefined` or empty array
- `transactionData[id].isLoading` stays `false`

**Diagnosis**:

```typescript
const state = messenger.call('TransactionPayController:getState');
const txData = state.transactionData[transactionId];

console.log('Payment Token:', txData?.paymentToken); // Should not be undefined
console.log('Source Amounts:', txData?.sourceAmounts); // Should have values
console.log('Tokens:', txData?.tokens); // Should have required tokens
```

**Solution**:

- Ensure you called `updatePaymentToken` after creating the transaction
- Verify the payment token exists in `TokensController`
- Check that token rates are available in `TokenRatesController`

### Issue 2: "Transaction not found" Error

**Symptoms**:

- Error when calling `updatePaymentToken`
- Transaction ID doesn't exist in state

**Diagnosis**:

```typescript
const txState = messenger.call('TransactionController:getState');
const tx = txState.transactions.find((t) => t.id === transactionId);
console.log('Transaction exists:', !!tx);
console.log('Transaction status:', tx?.status);
```

**Solution**:

- Verify transaction was created successfully
- Check transaction wasn't already finalized (confirmed, failed, dropped)
- Ensure you're using the correct transaction ID

### Issue 3: "Payment token not found" Error

**Symptoms**:

- Error when calling `updatePaymentToken`
- Token info not available

**Diagnosis**:

```typescript
const tokensState = messenger.call('TokensController:getState');
const token = tokensState.tokens.find(
  (t) =>
    t.address.toLowerCase() === tokenAddress.toLowerCase() &&
    t.chainId === chainId,
);
console.log('Token in TokensController:', token);

const ratesState = messenger.call('TokenRatesController:getState');
console.log('Token rates available:', ratesState.contractExchangeRates);
```

**Solution**:

- Add the token to TokensController if not present
- Ensure TokenRatesController has rate data for the token
- Verify the token address is checksummed correctly

### Issue 4: Quotes Loading Forever

**Symptoms**:

- `transactionData[id].isLoading` stays `true`
- No quotes appear after waiting

**Diagnosis**:

```typescript
// Check Relay API connectivity
const testQuote = await fetch('https://api.relay.link/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: '1000000',
    destinationChainId: 42161,
    destinationCurrency: '0x...',
    originChainId: 1,
    originCurrency: '0x...',
    recipient: '0x...',
    tradeType: 'EXPECTED_OUTPUT',
    user: '0x...',
  }),
});
console.log('Relay API response:', await testQuote.json());
```

**Solution**:

- Check network connectivity to Relay API
- Verify the token pair is supported by Relay
- Check RemoteFeatureFlagController for any feature flags blocking Relay
- Look for errors in the console (Relay API might be returning an error)

### Issue 5: Insufficient Balance Error

**Symptoms**:

- Quotes show but transaction fails on approval
- Error about insufficient balance

**Diagnosis**:

```typescript
const state = messenger.call('TransactionPayController:getState');
const txData = state.transactionData[transactionId];

const needed = BigInt(txData.sourceAmounts?.[0]?.sourceAmountRaw || '0');
const available = BigInt(txData.paymentToken?.balanceRaw || '0');

console.log('Needed:', needed.toString());
console.log('Available:', available.toString());
console.log('Sufficient:', available >= needed);
```

**Solution**:

- User needs more of the source token
- Show clear error message with required vs. available amounts
- Offer alternative payment tokens

### Issue 6: Strategy Returns Test Instead of Relay

**Symptoms**:

- Quotes don't match Relay format
- Execution doesn't work as expected

**Diagnosis**:

```typescript
const strategy = await messenger.call(
  'TransactionPayController:getStrategy',
  transactionMeta,
);
console.log('Strategy:', strategy); // Should be 'relay'
```

**Solution**:

- Check your `getStrategy` callback in controller initialization
- Ensure it returns `TransactionPayStrategy.Relay` for `musdConversion` type
- Verify the transaction type is set correctly

---

## Testing Recommendations

### Unit Tests

```typescript
import { TransactionPayController } from '@metamask/transaction-pay-controller';
import { TransactionPayStrategy } from '@metamask/transaction-pay-controller';
import { TransactionType } from '@metamask/transaction-controller';

describe('TransactionPayController - musdConversion', () => {
  let controller: TransactionPayController;
  let messenger: TransactionPayControllerMessenger;

  beforeEach(() => {
    // Setup messenger and controller
    controller = new TransactionPayController({
      messenger,
      getDelegationTransaction: jest.fn(),
      getStrategy: async (transaction) => {
        if (transaction.type === TransactionType.musdConversion) {
          return TransactionPayStrategy.Relay;
        }
        return TransactionPayStrategy.Relay;
      },
    });
  });

  it('should use Relay strategy for musdConversion transactions', async () => {
    const transaction = {
      id: '1',
      type: TransactionType.musdConversion,
      // ... other fields
    };

    const strategy = await messenger.call(
      'TransactionPayController:getStrategy',
      transaction,
    );

    expect(strategy).toBe(TransactionPayStrategy.Relay);
  });

  it('should fetch quotes after setting payment token', async () => {
    // Create mock transaction
    const txMeta = await TransactionController.addTransaction(
      {
        to: MUSD_ADDRESS,
        from: USER_ADDRESS,
        data: transferData,
        chainId: '0xa4b1',
      },
      {
        type: TransactionType.musdConversion,
      },
    );

    // Wait for token detection
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Set payment token
    await messenger.call('TransactionPayController:updatePaymentToken', {
      transactionId: txMeta.id,
      tokenAddress: USDC_ADDRESS,
      chainId: '0x1',
    });

    // Wait for quotes
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify quotes were fetched
    const state = messenger.call('TransactionPayController:getState');
    const txData = state.transactionData[txMeta.id];

    expect(txData.quotes).toBeDefined();
    expect(txData.quotes.length).toBeGreaterThan(0);
    expect(txData.totals).toBeDefined();
  });

  it('should calculate correct source amounts', async () => {
    // Create transaction requiring 100 mUSD
    const amount = '100';
    const transferData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [USER_ADDRESS, parseUnits(amount, 6)],
    });

    const txMeta = await TransactionController.addTransaction(
      {
        to: MUSD_ADDRESS,
        from: USER_ADDRESS,
        data: transferData,
        chainId: '0xa4b1',
      },
      {
        type: TransactionType.musdConversion,
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    await messenger.call('TransactionPayController:updatePaymentToken', {
      transactionId: txMeta.id,
      tokenAddress: USDC_ADDRESS,
      chainId: '0x1',
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const state = messenger.call('TransactionPayController:getState');
    const txData = state.transactionData[txMeta.id];

    expect(txData.sourceAmounts).toBeDefined();
    expect(txData.sourceAmounts.length).toBeGreaterThan(0);
    expect(
      parseFloat(txData.sourceAmounts[0].sourceAmountHuman),
    ).toBeGreaterThanOrEqual(parseFloat(amount));
  });
});
```

### Integration Tests

```typescript
describe('TransactionPayController Integration - musdConversion', () => {
  it('should complete full conversion flow', async () => {
    // Mock Relay API
    const mockRelayQuote = {
      steps: [
        {
          items: [
            {
              data: {
                to: RELAY_CONTRACT,
                data: '0x...',
                value: '0',
                chainId: 1,
                // ... other fields
              },
              status: 'incomplete',
            },
          ],
          kind: 'transaction',
        },
      ],
      fees: {
        relayer: { amountUsd: '0.50' },
      },
      skipTransaction: false,
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => mockRelayQuote,
    });

    // Run full flow
    const txMeta = await TransactionController.addTransaction(
      {
        to: MUSD_ADDRESS,
        from: USER_ADDRESS,
        data: transferData,
        chainId: '0xa4b1',
      },
      {
        type: TransactionType.musdConversion,
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    await messenger.call('TransactionPayController:updatePaymentToken', {
      transactionId: txMeta.id,
      tokenAddress: USDC_ADDRESS,
      chainId: '0x1',
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const state = messenger.call('TransactionPayController:getState');
    const txData = state.transactionData[txMeta.id];

    expect(txData.quotes).toBeDefined();
    expect(txData.quotes[0]).toMatchObject({
      strategy: TransactionPayStrategy.Relay,
      // ... other expected fields
    });
  });
});
```

### E2E Tests

```typescript
describe('E2E: mUSD Conversion', () => {
  it('should convert USDC to mUSD using Relay', async () => {
    // Setup: User has 200 USDC on Ethereum, needs 100 mUSD on Arbitrum

    // 1. Create conversion transaction
    const result = await convertToMUSD({
      amount: '100',
      sourceTokenAddress: USDC_ADDRESS,
      sourceChainId: '0x1',
      targetChainId: '0xa4b1',
      userAddress: TEST_USER_ADDRESS,
    });

    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();

    // 2. Verify quotes were fetched
    const state = messenger.call('TransactionPayController:getState');
    const txData = state.transactionData[result.transactionId];

    expect(txData.quotes).toBeDefined();
    expect(txData.totals?.total.usd).toBeDefined();

    // 3. Approve transaction
    await messenger.call('TransactionController:approveTransaction', {
      id: result.transactionId,
    });

    // 4. Wait for execution
    await waitForTransactionStatus(result.transactionId, 'confirmed');

    // 5. Verify completion
    const finalTx = await getTransaction(result.transactionId);
    expect(finalTx.status).toBe('confirmed');
  }, 60000); // 60 second timeout for E2E test
});
```

---

## Key Takeaways for LLM Implementation

### Critical Points

1. **Two-Step Flow is Mandatory**:

   - Step 1: `addTransaction()` - defines what tokens are needed
   - Step 2: `updatePaymentToken()` - triggers quote fetching
   - Missing step 2 = no quotes

2. **Transaction Type is Optional**:

   - Adding `musdConversion` to the enum is good practice
   - But the controller works regardless of transaction type
   - The `getStrategy` callback can use the type to select strategy

3. **Required Token Detection is Automatic**:

   - Controller automatically parses ERC-20 transfers
   - Gas fees are always detected
   - No manual intervention needed

4. **Quote Fetching is Async**:

   - Always wait for quotes using state subscriptions
   - Check `isLoading` flag before reading quotes
   - Implement timeout fallbacks

5. **Strategy Selection**:
   - Configure in controller initialization via `getStrategy` callback
   - Can be dynamic based on transaction properties
   - Relay is the default if no callback provided

### Common Mistakes to Avoid

❌ **Don't**: Skip calling `updatePaymentToken`
✅ **Do**: Always call it after transaction creation

❌ **Don't**: Immediately read quotes after `updatePaymentToken`
✅ **Do**: Wait for `isLoading: false` and `quotes.length > 0`

❌ **Don't**: Assume token info is always available
✅ **Do**: Verify tokens are in TokensController and have rates

❌ **Don't**: Ignore the `paymentToken` check in buildQuoteRequests
✅ **Do**: Understand that no payment token = no quotes by design

❌ **Don't**: Create transactions without proper token transfer data
✅ **Do**: Use proper ERC-20 `transfer` encoding with correct decimals

### Implementation Checklist

- [ ] Add `musdConversion` to `TransactionType` enum
- [ ] Configure `TransactionPayController` with Relay strategy for `musdConversion`
- [ ] Register `TransactionPayPublishHook` with `TransactionController`
- [ ] Implement transaction creation with proper ERC-20 encoding
- [ ] Implement payment token selection (call `updatePaymentToken`)
- [ ] Implement quote waiting with timeout
- [ ] Display quote information to user (amounts, fees, totals)
- [ ] Handle error cases (no quotes, insufficient balance, API failures)
- [ ] Monitor transaction execution progress
- [ ] Add unit tests for token detection
- [ ] Add integration tests for quote fetching
- [ ] Add E2E tests for full flow

---

## Additional Resources

### Relevant Files

- `packages/transaction-pay-controller/src/TransactionPayController.ts` - Main controller
- `packages/transaction-pay-controller/src/utils/quotes.ts` - Quote fetching logic
- `packages/transaction-pay-controller/src/utils/required-tokens.ts` - Token detection
- `packages/transaction-pay-controller/src/utils/transaction.ts` - Transaction polling
- `packages/transaction-pay-controller/src/strategy/relay/RelayStrategy.ts` - Relay integration
- `packages/transaction-controller/src/types.ts` - TransactionType enum (line ~685-850)

### Related Documentation

- `packages/transaction-pay-controller/ARCHITECTURE.md` - Controller architecture
- `packages/transaction-pay-controller/METAMASK_PAY_MUSD.md` - Original mUSD guide
- `packages/transaction-controller/README.md` - Transaction controller docs

### API References

- Relay API: https://docs.relay.link/what-is-relay
- Relay Quote Endpoint: https://api.relay.link/quote

---

## Summary

The `TransactionPayController` with Relay integration provides a robust system for cross-chain token conversions. The key insight for implementing `musdConversion` support is understanding the **mandatory two-step flow**:

1. Create the transaction (defines what tokens are needed)
2. Set the payment token (triggers quote fetching)

Without step 2, no quotes will be fetched because the controller doesn't know which source token to get quotes for. This design is intentional to support multiple payment options and cost comparison.

For implementing mUSD conversion:

1. Add `musdConversion` to the `TransactionType` enum
2. Configure the controller to use Relay strategy for this type
3. Create transactions with proper ERC-20 transfer encoding
4. **Always call `updatePaymentToken` to trigger quote fetching**
5. Wait for quotes asynchronously before displaying to users

This pattern works for any cross-chain token conversion scenario, not just mUSD.





