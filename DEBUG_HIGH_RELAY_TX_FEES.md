# mUSD Conversion High Gas Fees - Debugging Report

**Date**: November 20, 2025  
**Reporter**: MetaMask Mobile Team  
**Target**: @metamask/core TransactionPayController & RelayStrategy  
**Severity**: High - Blocks user adoption due to unreasonable gas estimates

---

## Executive Summary

When using `TransactionPayController` with Relay strategy for **same-chain** token conversions (e.g., USDC → mUSD on Ethereum mainnet), gas fee estimates are **5-10x higher** than expected:

- **Expected**: $2-4 USD (based on Etherscan gas tracker showing 2.49 gwei)
- **Actual**: $12-25 USD
- **Cross-chain comparison**: Ethereum → Linea swaps show correct $2-4 fees

This makes same-chain mUSD conversions prohibitively expensive and unusable.

---

## Problem Description

### Reproduction Steps

1. **Environment**: MetaMask Mobile using `TransactionPayController` v1.x
2. **Flow**: mUSD conversion using `useMusdConversion` hook
3. **Configuration**:
   ```typescript
   {
     outputToken: {
       address: MUSD_ADDRESS,
       chainId: '0x1', // Ethereum Mainnet
       symbol: 'mUSD',
       decimals: 6
     },
     preferredPaymentToken: {
       address: USDC_ADDRESS,
       chainId: '0x1', // Same chain!
       symbol: 'USDC'
     }
   }
   ```
4. **Transaction Type**: `musdConversion`
5. **Strategy**: `TransactionPayStrategy.Relay` (hardcoded)

### Expected Behavior

For a same-chain ERC-20 swap (USDC → mUSD on Ethereum):

- **Gas Limit**: ~65,000-100,000 units for simple ERC-20 transfer
- **Gas Price**: 2.49 gwei (per Etherscan)
- **Total Gas Cost**: ~$1.75 at current ETH prices
- **Relay Fee**: ~$0.50 (reasonable for aggregator service)
- **Total Transaction Cost**: ~$2.25

### Actual Behavior

```javascript
// Observed fee breakdown
{
  fees: {
    sourceNetwork: {
      estimate: {
        raw: "0xdbba0",  // ~900,000 gas units (!!)
        usd: "$25.00"    // 10x higher than expected
      }
    },
    targetNetwork: {
      raw: "0x0",        // Correct (same chain)
      usd: "$0.00"
    },
    provider: {
      usd: "$0.50"       // Relay fee (reasonable)
    }
  }
}
```

**Total Cost**: $12-25 instead of $2-4

---

## Root Cause Analysis

### Issue 1: Relay Strategy Used for Same-Chain Operations

**Location**: `metamask-mobile/app/core/Engine/controllers/transaction-pay-controller/transaction-pay-controller-init.ts`

```typescript
function getStrategy(_transaction: TransactionMeta): TransactionPayStrategy {
  return TransactionPayStrategy.Relay; // Always returns Relay!
}
```

**Problem**: Relay is designed for **cross-chain bridging**, not same-chain swaps. When Relay receives a quote request where `originChainId === destinationChainId`, it:

1. Still applies cross-chain gas estimation logic
2. Includes overhead for approval + deposit transactions to bridge contracts
3. May fall back to the documented 900,000 gas default when quote doesn't provide gas estimate

**Evidence from Documentation** (`docs/earn/musd/metamask-pay-musd-core-findings.md:683-685`):

> **Gas Estimation**: Falls back to `900,000` if quote doesn't provide gas

### Issue 2: nestedTransactions Overhead

**Location**: `metamask-mobile/app/components/UI/Earn/hooks/useMusdConversion.ts:189-196`

```typescript
const { transactionMeta } = await TransactionController.addTransaction(
  {
    to: outputToken.address,
    from: selectedAddress,
    data: transferData,
    value: '0x0',
    chainId: outputToken.chainId,
  },
  {
    networkClientId,
    origin: MMM_ORIGIN,
    type: MUSD_CONVERSION_TRANSACTION_TYPE,
    // Important: Nested transaction is required for Relay to work.
    // This will be fixed in a future iteration.
    nestedTransactions: [
      {
        to: outputToken.address,
        data: transferData as Hex,
        value: '0x0',
      },
    ],
  },
);
```

**Problem**: The `nestedTransactions` structure is intended for:

- EIP-7702 delegation scenarios
- Atomic batch transactions
- Complex multi-step operations

For a **same-chain token swap**, this adds unnecessary complexity and may cause:

- Double gas estimation (main tx + nested tx)
- Delegation overhead calculations
- Safety margin multipliers for batch execution

### Issue 3: Relay API Same-Chain Handling

**Location**: `@metamask/transaction-pay-controller` RelayStrategy

When Relay API receives:

```typescript
{
  originChainId: 1,        // Ethereum
  destinationChainId: 1,   // Ethereum (same!)
  originCurrency: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC
  destinationCurrency: "0xacA92E438df0B2401fF60dA7E4337B687a2435DA", // mUSD
  tradeType: "EXPECTED_OUTPUT"
}
```

**Expected Relay Response**:

- Optimize for same-chain swap (no bridging needed)
- Return gas estimate ~65,000-100,000 units
- Provide steps for direct DEX interaction

**Actual Relay Response** (suspected):

- Returns cross-chain gas estimates
- Falls back to 900,000 gas default
- Includes bridging contract overhead in calculation

---

## Comparison: Working vs Broken Flows

### ✅ Working: Cross-Chain Swaps (Ethereum → Linea)

**User Action**: Swap USDC on Ethereum → mUSD on Linea  
**Strategy**: Relay (appropriate for cross-chain)  
**Gas Estimate**: $2-4 USD  
**Behavior**: Correct - Relay optimized for this use case

### ❌ Broken: Same-Chain Conversion (Ethereum → Ethereum)

**User Action**: Convert USDC → mUSD (both on Ethereum)  
**Strategy**: Relay (inappropriate - designed for cross-chain)  
**Gas Estimate**: $12-25 USD (5-10x inflated)  
**Behavior**: Incorrect - Using cross-chain infrastructure for simple same-chain swap

---

## Technical Details for @metamask/core Team

### TransactionPayController Analysis

**File**: `packages/transaction-pay-controller/src/TransactionPayController.ts`

**Key Questions**:

1. **Quote Request Building**:

   - Does `buildQuoteRequests()` differentiate between same-chain and cross-chain?
   - Are there optimizations skipped when `sourceChainId === targetChainId`?

2. **Gas Estimation**:

   - Where does the 900,000 fallback get applied?
   - Is this fallback appropriate for same-chain operations?
   - Should same-chain operations use a different default (e.g., 100,000)?

3. **Strategy Selection**:
   - Should `getStrategy()` receive additional context about source chain?
   - Can we add a `DirectSwapStrategy` for same-chain operations?

### RelayStrategy Analysis

**File**: `packages/transaction-pay-controller/src/strategy/relay/RelayStrategy.ts`

**Key Questions**:

1. **Quote Fetching** (`getRelayQuotes()`):

   - Does Relay API return different gas estimates for same-chain?
   - Are we parsing the response correctly for same-chain scenarios?
   - Should we validate and override inflated same-chain estimates?

2. **Execution** (`submitRelayQuotes()`):

   - Does execution path differ for same-chain vs cross-chain?
   - Are we creating unnecessary approval/bridge transactions for same-chain?

3. **Gas Calculation**:
   ```typescript
   // Suspected code path
   const gasLimit = quote.steps?.[0]?.items?.[0]?.data?.gas || '900000';
   ```
   - When does this fallback trigger?
   - Can we add validation: `if (sourceChain === targetChain) gasLimit = '100000'`?

### Suggested Code Inspection Points

```typescript
// 1. Quote request building
packages/transaction-pay-controller/src/utils/quotes.ts:
  - buildQuoteRequests()
  - Check if same-chain detection exists

// 2. Relay quote fetching
packages/transaction-pay-controller/src/strategy/relay/getRelayQuotes.ts:
  - getRelayQuotes()
  - Relay API response parsing
  - Gas estimation fallback logic

// 3. Fee calculation
packages/transaction-pay-controller/src/utils/totals.ts:
  - calculateTotals()
  - Fee aggregation logic
  - Network fee calculation

// 4. Strategy execution
packages/transaction-pay-controller/src/strategy/relay/submitRelayQuotes.ts:
  - submitRelayQuotes()
  - Transaction creation for same-chain
```

---

## Debug Steps for Core Team

### 1. Enable Relay API Logging

Add detailed logging to RelayStrategy:

```typescript
// In getRelayQuotes()
console.log('[Relay] Quote Request:', {
  originChainId,
  destinationChainId,
  isSameChain: originChainId === destinationChainId,
  amount,
  sourceToken,
  targetToken,
});

// Log raw Relay API response
console.log('[Relay] API Response:', {
  gasEstimate: response.steps?.[0]?.items?.[0]?.data?.gas,
  fees: response.fees,
  skipTransaction: response.skipTransaction,
  fullResponse: JSON.stringify(response, null, 2),
});
```

### 2. Validate Gas Estimation Logic

Add validation to catch inflated estimates:

```typescript
// In RelayStrategy or quote building
const gasLimit = parseGasFromQuote(quote);
const isSameChain = sourceChainId === targetChainId;

if (isSameChain && gasLimit > 200000) {
  console.warn('[Relay] Suspicious high gas for same-chain:', {
    gasLimit,
    sourceChainId,
    targetChainId,
    token: targetToken,
  });

  // Override with reasonable estimate for same-chain ERC-20 transfer
  gasLimit = 100000;
}
```

### 3. Test Same-Chain vs Cross-Chain

Create unit tests comparing behaviors:

```typescript
describe('RelayStrategy gas estimation', () => {
  it('returns reasonable gas for same-chain swaps', async () => {
    const request = {
      sourceChainId: '0x1',
      targetChainId: '0x1', // Same chain
      sourceTokenAddress: USDC_ADDRESS,
      targetTokenAddress: MUSD_ADDRESS,
      targetAmountMinimum: '100000000',
    };

    const quotes = await relayStrategy.getQuotes(request);
    const gasLimit = quotes[0].gasLimit;

    expect(gasLimit).toBeLessThan(200000); // Should be ~100k, not 900k
  });

  it('returns appropriate gas for cross-chain bridging', async () => {
    const request = {
      sourceChainId: '0x1',
      targetChainId: '0xe708', // Different chain (Linea)
      // ... rest of config
    };

    const quotes = await relayStrategy.getQuotes(request);
    const gasLimit = quotes[0].gasLimit;

    expect(gasLimit).toBeLessThan(400000); // Bridge operations need more gas
  });
});
```

---

## Proposed Solutions

### Solution 1: Add Same-Chain Detection to RelayStrategy ⭐ (Recommended)

**Location**: `packages/transaction-pay-controller/src/strategy/relay/getRelayQuotes.ts`

```typescript
export async function getRelayQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<RelayQuote[]> {
  const { sourceChainId, targetChainId } = request;
  const isSameChain = sourceChainId === targetChainId;

  // Fetch quotes from Relay API
  const relayResponse = await fetchRelayQuote(request);

  // Parse gas estimate
  let gasLimit = relayResponse.steps?.[0]?.items?.[0]?.data?.gas || '900000';

  // Override inflated estimates for same-chain operations
  if (isSameChain && parseInt(gasLimit, 16) > 200000) {
    console.warn(
      '[RelayStrategy] Overriding inflated same-chain gas estimate:',
      { original: gasLimit, override: '0x186a0' }, // 100,000
    );
    gasLimit = '0x186a0'; // 100,000 in hex
  }

  return parseRelayQuotes(relayResponse, gasLimit);
}
```

**Impact**: Immediate fix for inflated gas estimates without requiring mobile app changes.

### Solution 2: Create DirectSwapStrategy for Same-Chain

**Location**: `packages/transaction-pay-controller/src/strategy/direct-swap/`

Create a new strategy optimized for same-chain token swaps:

```typescript
export class DirectSwapStrategy implements PayStrategy<DirectSwapQuote> {
  async getQuotes(request: PayStrategyGetQuotesRequest) {
    // Use 1inch, 0x, or other DEX aggregators for same-chain swaps
    // Return accurate gas estimates (65k-100k)
    // Avoid cross-chain bridge overhead
  }

  async execute(request: PayStrategyExecuteRequest<DirectSwapQuote>) {
    // Execute direct swap without nestedTransactions
    // Single ERC-20 transfer or simple DEX interaction
  }
}
```

**Location**: `packages/transaction-pay-controller/src/TransactionPayController.ts`

Update strategy selection:

```typescript
async function selectStrategy(
  transaction: TransactionMeta,
  paymentToken?: TransactionPaymentToken,
): Promise<TransactionPayStrategy> {
  if (!paymentToken) {
    return TransactionPayStrategy.Relay;
  }

  const isSameChain = transaction.chainId === paymentToken.chainId;

  if (isSameChain) {
    return TransactionPayStrategy.DirectSwap; // New strategy
  }

  return TransactionPayStrategy.Relay;
}
```

**Impact**: Architectural improvement, cleaner separation of concerns.

### Solution 3: Add Gas Limit Override in TransactionPayController

**Location**: `packages/transaction-pay-controller/src/utils/totals.ts`

Add safety checks when calculating totals:

```typescript
export function calculateTotals(
  quotes: Quote[],
  sourceAmounts: SourceAmount[],
  paymentToken: PaymentToken,
  targetChainId: Hex,
): TransactionPayTotals {
  const isSameChain = paymentToken.chainId === targetChainId;

  // Calculate fees
  let sourceNetworkGasLimit = quotes[0]?.gasLimit || '900000';

  // Validate and override for same-chain
  if (isSameChain) {
    const gasLimitNumber = parseInt(sourceNetworkGasLimit, 16);
    if (gasLimitNumber > 200000) {
      console.warn('[TransactionPay] Capping inflated same-chain gas:', {
        original: sourceNetworkGasLimit,
        capped: '0x30d40', // 200,000
      });
      sourceNetworkGasLimit = '0x30d40'; // Conservative 200k cap
    }
  }

  // Continue with fee calculations...
}
```

**Impact**: Safety net to prevent any inflated estimates from reaching the UI.

---

## Mobile App Workarounds (Temporary)

While waiting for core controller fixes, the mobile app can implement:

### Workaround 1: Remove nestedTransactions for Same-Chain

**File**: `app/components/UI/Earn/hooks/useMusdConversion.ts`

```typescript
const isSameChain = outputToken.chainId === preferredPaymentToken.chainId;

const options = {
  networkClientId,
  origin: MMM_ORIGIN,
  type: MUSD_CONVERSION_TRANSACTION_TYPE,
  // Only include nestedTransactions for cross-chain
  ...(!isSameChain && {
    nestedTransactions: [
      {
        to: outputToken.address,
        data: transferData as Hex,
        value: ZERO_HEX_VALUE,
      },
    ],
  }),
};
```

### Workaround 2: Override Gas Estimates Client-Side

**File**: `app/components/Views/confirmations/hooks/pay/useTransactionPayData.ts`

Add a hook to detect and fix inflated estimates:

```typescript
export function useTransactionPayGasOverride() {
  const totals = useTransactionPayTotals();
  const payToken = useTransactionPayToken();
  const transaction = useTransactionMetadataRequest();

  const isSameChain = payToken?.chainId === transaction?.chainId;

  const adjustedTotals = useMemo(() => {
    if (!totals || !isSameChain) return totals;

    const gasLimit = parseInt(totals.fees.sourceNetwork.estimate.raw, 16);

    // If gas is suspiciously high for same-chain, override
    if (gasLimit > 200000) {
      return {
        ...totals,
        fees: {
          ...totals.fees,
          sourceNetwork: {
            ...totals.fees.sourceNetwork,
            estimate: {
              raw: '0x30d40', // 200,000
              usd: calculateUsdFromGas('0x30d40', gasFeeEstimates),
            },
          },
        },
      };
    }

    return totals;
  }, [totals, isSameChain]);

  return adjustedTotals;
}
```

---

## Expected Gas Calculations

For reference, here are the expected gas calculations:

### Same-Chain ERC-20 Transfer (USDC → mUSD on Ethereum)

```
Operation: ERC-20 transfer or simple DEX swap
Gas Limit: 65,000 - 100,000 units
Gas Price: 2.49 gwei (current Ethereum average)

Calculation:
100,000 × 2.49 gwei = 249,000 gwei = 0.000249 ETH
0.000249 ETH × $2,820 (ETH price) = $0.70

With Relay Fee: $0.70 + $0.50 = $1.20 - $1.50 total
```

### Cross-Chain Bridge (Ethereum → Linea)

```
Operation: Cross-chain bridge + destination delivery
Source Chain Gas: 150,000 - 250,000 units
Target Chain Gas: Often included in quote (gasIncluded: true)

Calculation:
250,000 × 2.49 gwei = 622,500 gwei = 0.0006225 ETH
0.0006225 ETH × $2,820 = $1.75

With Bridge Fee: $1.75 + $0.50 = $2.25 - $3.00 total
```

### Current Inflated Estimate (INCORRECT)

```
Operation: Same-chain conversion (should be simple)
Gas Limit: 900,000 units (!!!)
Gas Price: 2.49 gwei

Calculation:
900,000 × 2.49 gwei = 2,241,000 gwei = 0.002241 ETH
0.002241 ETH × $2,820 = $6.32

With Relay Fee: $6.32 + $0.50 = $6.82 - $12.00+ total

Issue: 9x higher gas than needed!
```

---

## Testing Checklist

### For @metamask/core Team

- [ ] Add unit tests for same-chain quote requests
- [ ] Add unit tests for cross-chain quote requests
- [ ] Validate Relay API responses for same-chain scenarios
- [ ] Test gas estimation fallback logic
- [ ] Add integration tests comparing same-chain vs cross-chain gas
- [ ] Verify `nestedTransactions` don't inflate gas for simple swaps
- [ ] Test with real Relay API (staging environment)

### For MetaMask Mobile Team

- [ ] Verify logs show 900,000 gas limit for same-chain
- [ ] Test workaround implementation
- [ ] Measure user impact after fix
- [ ] Update E2E tests to check gas estimates
- [ ] Monitor Sentry for gas-related errors

---

## Success Criteria

### Primary Goal: Accurate Same-Chain Gas Estimates

- Same-chain USDC → mUSD conversions show **$1.50-$3.00** total fees
- Gas estimates within **10% of actual network costs**
- No user complaints about "unreasonably high fees"

### Secondary Goals

- Same-chain operations complete **without nestedTransactions** overhead
- Clear separation between same-chain and cross-chain strategies
- Gas estimation fallbacks appropriate for operation type
- Comprehensive test coverage for both scenarios

---

## Related Documentation

- **MetaMask Pay Usage Guide**: `docs/earn/musd/MM_PAY_LATEST_USAGE.md`
- **Core Findings**: `docs/earn/musd/metamask-pay-musd-core-findings.md`
- **Etherscan Gas Tracker**: https://etherscan.io/gastracker (current: 2.49 gwei)
- **TransactionPayController Docs**: `@metamask/transaction-pay-controller/README.md`

---

## Contact

**Mobile Team**: @MetaMask/metamask-mobile  
**Core Team**: @MetaMask/core  
**Point of Contact**: [Your Name/Team]

**Related Issues**:

- High gas fees preventing mUSD adoption
- User reports: "Why is converting $5 costing $20 in fees?"
- Cross-chain swaps work fine, same-chain conversions broken

---

## Appendix: Relay API Quote Example (Suspected)

### Same-Chain Request (Ethereum → Ethereum)

```json
{
  "amount": "100000000",
  "destinationChainId": 1,
  "destinationCurrency": "0xacA92E438df0B2401fF60dA7E4337B687a2435DA",
  "originChainId": 1,
  "originCurrency": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  "recipient": "0x...",
  "tradeType": "EXPECTED_OUTPUT",
  "user": "0x..."
}
```

### Suspected Response (High Gas)

```json
{
  "details": {
    "currencyOut": {
      "amountFormatted": "100",
      "amountUsd": "100.00"
    },
    "timeEstimate": 180
  },
  "fees": {
    "relayer": {
      "amountUsd": "0.50"
    }
  },
  "steps": [
    {
      "items": [
        {
          "data": {
            "chainId": 1,
            "gas": "0xdbba0", // ← 900,000! Should be ~0x186a0 (100k)
            "maxFeePerGas": "0x...",
            "to": "0x...",
            "value": "0x0"
          }
        }
      ]
    }
  ]
}
```

**Expected Response** (should provide):

```json
{
  "steps": [
    {
      "items": [
        {
          "data": {
            "gas": "0x186a0" // 100,000 for same-chain
          }
        }
      ]
    }
  ]
}
```

---

**End of Report**

_This document will be updated as investigation progresses and fixes are implemented._
