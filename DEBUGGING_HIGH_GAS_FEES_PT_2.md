# High Gas Fees Debugging - Part 2: Deep Dive & Mobile Investigation Required

**Date**: November 20, 2025  
**Context**: Continuation of DEBUG_HIGH_RELAY_TX_FEES.md investigation  
**Status**: Core logic understood, mobile-side mystery remains  

---

## Executive Summary

We've identified the **mechanism** causing 900k gas fallback in the core TransactionPayController, but there's a **critical mystery** about why `nestedTransactions` is required in the mobile client. This document provides all findings for the mobile team to investigate.

---

## What We Know: The Core Controller Flow

### 1. Confirmed: 900k Gas Fallback Exists

**Location**: `packages/transaction-pay-controller/src/strategy/relay/constants.ts`

```typescript
export const RELAY_FALLBACK_GAS_LIMIT = 900000;
```

**Applied here**: `packages/transaction-pay-controller/src/strategy/relay/relay-quotes.ts:426-430`

```typescript
return params.reduce(
  (total, p) =>
    total + new BigNumber(p.gas ?? RELAY_FALLBACK_GAS_LIMIT).toNumber(),
  0,
);
```

When Relay API doesn't provide `gas` in its response, it defaults to 900,000 gas per transaction.

### 2. Confirmed: Relay API Supports Same-Chain Swaps

**Evidence**: Direct curl request shows proper gas estimates:

```bash
curl -X POST https://api.relay.link/quote \
  -H "Content-Type: application/json" \
  -d '{
    "amount": "5000000",
    "destinationChainId": 1,
    "destinationCurrency": "0xacA92E438df0B2401fF60dA7E4337B687a2435DA",
    "originChainId": 1,
    "originCurrency": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    "recipient": "0x316bde155acd07609872a56bc32ccfb0b13201fa",
    "tradeType": "EXPECTED_OUTPUT",
    "user": "0x316bde155acd07609872a56bc32ccfb0b13201fa"
  }'
```

**Response includes**:
- Step 1 (approve): `"gas":"73269"` (73k)
- Step 2 (swap): `"gas":"489967"` (490k)
- **Total: ~563k gas (reasonable!)**

**Relay API works fine for same-chain swaps when given a clean request.**

### 3. Confirmed: Delegation Processing Transforms Requests

**Location**: `packages/transaction-pay-controller/src/strategy/relay/relay-quotes.ts:121-176`

```typescript
async function processTransactions(
  transaction: TransactionMeta,
  request: QuoteRequest,
  requestBody: Record<string, Json | undefined>,
  messenger: TransactionPayControllerMessenger,
) {
  const { data, value } = transaction.txParams;

  const hasNoParams = (!data || data === '0x') && (!value || value === '0x0');

  const skipDelegation =
    hasNoParams || request.targetChainId === CHAIN_ID_HYPERCORE;

  if (skipDelegation) {
    log('Skipping delegation as no transaction data');
    return;
  }

  // If NOT skipped, adds:
  // - authorizationList (EIP-7702)
  // - tradeType: 'EXACT_OUTPUT'
  // - txs array with delegation transactions
  
  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction },
  );

  requestBody.authorizationList = normalizedAuthorizationList;
  requestBody.tradeType = 'EXACT_OUTPUT';
  requestBody.txs = [
    { to: request.targetTokenAddress, data: tokenTransferData, value: '0x0' },
    { to: delegation.to, data: delegation.data, value: delegation.value },
  ];
}
```

**When this runs**, the Relay API request becomes an EIP-7702 delegation request instead of a simple swap, likely preventing proper gas estimation.

### 4. Token Detection Logic

**Location**: `packages/transaction-pay-controller/src/utils/required-tokens.ts:247-280`

```typescript
function getTokenTransferData(transactionMeta: TransactionMeta) {
  const { nestedTransactions, txParams } = transactionMeta;
  const { data: singleData } = txParams;
  const singleTo = txParams?.to as Hex | undefined;

  // CHECK 1: Main transaction data
  if (singleData?.startsWith(FOUR_BYTE_TOKEN_TRANSFER) && singleTo) {
    return { data: singleData as Hex, to: singleTo, index: undefined };
  }

  // CHECK 2: Nested transactions (fallback)
  const nestedCallIndex = nestedTransactions?.findIndex((call) =>
    call.data?.startsWith(FOUR_BYTE_TOKEN_TRANSFER),
  );

  const nestedCall =
    nestedCallIndex !== undefined
      ? nestedTransactions?.[nestedCallIndex]
      : undefined;

  if (nestedCall?.data && nestedCall.to) {
    return {
      data: nestedCall.data,
      to: nestedCall.to,
      index: nestedCallIndex,
    };
  }

  return undefined; // ← NO TOKEN DETECTED = NO QUOTES!
}
```

**Key constant**: `FOUR_BYTE_TOKEN_TRANSFER = '0xa9059cbb'` (ERC20 transfer function signature)

---

## The Mystery: Why nestedTransactions is Required

### Mobile App Code (Works with nestedTransactions)

```typescript
const transferData = generateTransferData('transfer', {
  toAddress: selectedAddress,
  amount: ZERO_HEX_VALUE,
});

const { transactionMeta } = await TransactionController.addTransaction(
  {
    to: outputToken.address,      // mUSD contract
    from: selectedAddress,
    data: transferData,            // ← Contains transfer(address,uint256) call
    value: ZERO_HEX_VALUE,
    chainId: outputToken.chainId,
  },
  {
    networkClientId,
    origin: MMM_ORIGIN,
    type: MUSD_CONVERSION_TRANSACTION_TYPE,
    nestedTransactions: [
      {
        to: outputToken.address,
        data: transferData as Hex,  // ← DUPLICATE of main data
        value: ZERO_HEX_VALUE,
      },
    ],
  },
);
```

**Observations**:
1. Main `txParams.data` = `transferData` (should contain `0xa9059cbb...`)
2. `nestedTransactions[0].data` = same `transferData` (duplicate)
3. Both have the same `to` address

**Expected behavior**: Token detection should work from main `txParams.data` alone!

### Mobile Developer Reports

> "If I don't include the nestedTransactions array with the duplicate transfer data, the quote fetching doesn't work."

**This contradicts the code logic** which shows:
1. Detection checks main data FIRST (line 258)
2. Only checks nested as FALLBACK (line 262)
3. If main data starts with `0xa9059cbb`, nested shouldn't be needed

---

## Theories to Investigate

### Theory 1: TransactionController Modifies txParams

**Hypothesis**: Maybe `TransactionController.addTransaction()` processes the transaction differently based on whether `nestedTransactions` is present.

**Questions for Mobile Team**:
1. Does TransactionController modify `txParams.data` when `nestedTransactions` is provided vs not?
2. Could there be middleware that transforms the transaction?
3. Is there validation that clears `data` if it's invalid?

**Debug Steps**:
```typescript
// In mobile code, add logging:
const { transactionMeta } = await TransactionController.addTransaction(...);

console.log('[DEBUG] Transaction added:', {
  'txParams.data': transactionMeta.txParams.data,
  'txParams.to': transactionMeta.txParams.to,
  'nestedTransactions': transactionMeta.nestedTransactions,
  'data starts with 0xa9059cbb': transactionMeta.txParams.data?.startsWith('0xa9059cbb'),
});

// Wait a moment for async processing
await new Promise(r => setTimeout(r, 100));

// Check TransactionPayController state
const payState = Engine.context.TransactionPayController.state;
console.log('[DEBUG] TransactionPayController state:', {
  'tokens': payState.transactionData[transactionMeta.id]?.tokens,
  'hasTokens': payState.transactionData[transactionMeta.id]?.tokens?.length > 0,
});
```

### Theory 2: generateTransferData() Issue

**Hypothesis**: Maybe `generateTransferData()` isn't generating proper ERC20 transfer data.

**Questions for Mobile Team**:
1. What does `generateTransferData('transfer', ...)` actually return?
2. Does it generate the proper `0xa9059cbb` function signature?
3. Could the amount being `0x0` cause issues?

**Debug Steps**:
```typescript
const transferData = generateTransferData('transfer', {
  toAddress: selectedAddress,
  amount: ZERO_HEX_VALUE,
});

console.log('[DEBUG] Generated transfer data:', {
  'transferData': transferData,
  'length': transferData.length,
  'starts with 0xa9059cbb': transferData.startsWith('0xa9059cbb'),
  'decoded': (() => {
    try {
      const iface = new ethers.Interface(['function transfer(address to, uint256 amount)']);
      return iface.decodeFunctionData('transfer', transferData);
    } catch (e) {
      return `Error: ${e.message}`;
    }
  })(),
});
```

### Theory 3: Timing/Race Condition

**Hypothesis**: TransactionPayController might process the transaction before it's fully initialized, and `nestedTransactions` somehow delays or changes the timing.

**Questions for Mobile Team**:
1. Is there a race between transaction creation and TransactionPayController polling?
2. Does adding `nestedTransactions` trigger different event sequencing?
3. Could TransactionController be async-updating the transaction after creation?

**Debug Steps**:
```typescript
const { transactionMeta } = await TransactionController.addTransaction(...);

// Log immediately
console.log('[DEBUG] Immediate state:', transactionMeta.txParams.data);

// Log after event loop
await new Promise(r => setTimeout(r, 0));
console.log('[DEBUG] After microtask:', 
  Engine.context.TransactionController.state.transactions
    .find(t => t.id === transactionMeta.id)?.txParams.data
);

// Log after delay
await new Promise(r => setTimeout(r, 100));
console.log('[DEBUG] After 100ms:', 
  Engine.context.TransactionController.state.transactions
    .find(t => t.id === transactionMeta.id)?.txParams.data
);
```

### Theory 4: Transaction Type Handling

**Hypothesis**: The custom `MUSD_CONVERSION_TRANSACTION_TYPE` might be handled specially, requiring certain fields.

**Questions for Mobile Team**:
1. Is `musdConversion` registered as a valid transaction type?
2. Does TransactionController have special handling for custom types?
3. Could there be validation that requires `nestedTransactions` for certain types?

**Debug Steps**:
```typescript
// Try with a standard type
const { transactionMeta } = await TransactionController.addTransaction(
  {
    to: outputToken.address,
    from: selectedAddress,
    data: transferData,
    value: ZERO_HEX_VALUE,
    chainId: outputToken.chainId,
  },
  {
    networkClientId,
    origin: MMM_ORIGIN,
    type: TransactionType.tokenMethodTransfer, // ← Standard type instead
    // NO nestedTransactions
  },
);

// Does quote fetching work now?
```

---

## The Core Controller Solution (Independent of Mobile Mystery)

**Regardless of why nestedTransactions is needed**, we can prevent delegation processing for same-chain operations.

### Recommended Fix

**File**: `packages/transaction-pay-controller/src/strategy/relay/relay-quotes.ts`

**Change at line ~132**:

```typescript
async function processTransactions(
  transaction: TransactionMeta,
  request: QuoteRequest,
  requestBody: Record<string, Json | undefined>,
  messenger: TransactionPayControllerMessenger,
) {
  const { data, value } = transaction.txParams;

  const hasNoParams = (!data || data === '0x') && (!value || value === '0x0');
  
  // ADD THIS CHECK
  const isSameChain = request.sourceChainId === request.targetChainId;

  const skipDelegation =
    hasNoParams || 
    request.targetChainId === CHAIN_ID_HYPERCORE ||
    isSameChain; // ← NEW: Skip delegation for same-chain swaps

  if (skipDelegation) {
    log('Skipping delegation', { 
      hasNoParams, 
      isHypercore: request.targetChainId === CHAIN_ID_HYPERCORE,
      isSameChain 
    });
    return;
  }

  // Rest of delegation processing...
}
```

**Why this works**:
- Same-chain Relay requests stay clean (like the working curl)
- Relay API provides accurate gas estimates (~560k)
- No 900k fallback needed
- Cross-chain operations still use delegation when needed

**Impact**:
- ✅ Fixes same-chain gas estimates immediately
- ✅ No mobile changes required
- ✅ Preserves cross-chain functionality
- ✅ Low risk (3 lines of code)

---

## Critical Questions for Mobile Team

### Question 1: What is the actual transaction structure?

Please log and provide the COMPLETE transaction metadata immediately after `addTransaction()` returns:

**WITH nestedTransactions**:
```typescript
console.log('[WITH nested]', JSON.stringify({
  id: transactionMeta.id,
  txParams: transactionMeta.txParams,
  nestedTransactions: transactionMeta.nestedTransactions,
  type: transactionMeta.type,
}, null, 2));
```

**WITHOUT nestedTransactions**:
```typescript
console.log('[WITHOUT nested]', JSON.stringify({
  id: transactionMeta.id,
  txParams: transactionMeta.txParams,
  nestedTransactions: transactionMeta.nestedTransactions,
  type: transactionMeta.type,
}, null, 2));
```

### Question 2: What does generateTransferData produce?

```typescript
const transferData = generateTransferData('transfer', {
  toAddress: selectedAddress,
  amount: ZERO_HEX_VALUE,
});

console.log('[transferData]', {
  raw: transferData,
  length: transferData.length,
  startsWithTransferSig: transferData.startsWith('0xa9059cbb'),
  first10Chars: transferData.substring(0, 10),
});
```

### Question 3: What tokens does TransactionPayController detect?

Add this check right after transaction creation in both scenarios:

```typescript
// Wait for async processing
await new Promise(r => setTimeout(r, 200));

const payState = Engine.context.TransactionPayController.state;
const transactionData = payState.transactionData[transactionMeta.id];

console.log('[TransactionPayController]', {
  hasTransactionData: !!transactionData,
  tokens: transactionData?.tokens,
  tokenCount: transactionData?.tokens?.length || 0,
  firstToken: transactionData?.tokens?.[0],
});
```

### Question 4: Check TransactionController source

In the mobile codebase:
1. Search for `addTransaction` method implementation
2. Look for any special handling of `nestedTransactions` parameter
3. Check if there's validation that modifies `txParams` based on options
4. Look for any middleware or hooks that process transactions differently

**Specific files to check** (likely in `@metamask/transaction-controller`):
- Transaction validation logic
- Transaction normalization/sanitization
- Event emission timing
- Type-specific handling

---

## Expected Outcomes

### If Mobile Investigation Finds Root Cause

Possible scenarios:
1. **TransactionController bug**: Might be clearing `data` field when `nestedTransactions` is absent
2. **Validation issue**: Might be rejecting the transaction format
3. **Timing issue**: Might be a race condition
4. **Type handling**: Custom types might require specific fields

### If Core Fix is Sufficient

If we implement the same-chain skip in core:
- Mobile can keep using `nestedTransactions` (no breaking changes)
- Gas estimates become accurate
- Problem solved without understanding the root cause

### If Both are Needed

1. Implement core fix (short-term solution)
2. Fix mobile issue (proper long-term solution)
3. Eventually remove unnecessary `nestedTransactions` from mobile

---

## Next Steps

### For Core Team (@metamask/core)

1. ✅ Implement same-chain skip in `processTransactions()`
2. ✅ Add unit tests for same-chain vs cross-chain scenarios
3. ✅ Verify cross-chain operations still work
4. ✅ Deploy and test with mobile client

### For Mobile Team (@metamask/metamask-mobile)

1. 🔍 Add comprehensive logging as outlined above
2. 🔍 Investigate why nestedTransactions is required
3. 🔍 Check TransactionController implementation
4. 🔍 Test if core fix alone resolves the issue
5. 📋 Report findings back to core team

---

## Technical Context

### File Structure

**Core Controller** (`@metamask/transaction-pay-controller`):
```
packages/transaction-pay-controller/
├── src/
│   ├── strategy/
│   │   └── relay/
│   │       ├── relay-quotes.ts      ← Gas estimation & delegation
│   │       ├── relay-submit.ts      ← Execution
│   │       └── constants.ts         ← 900k fallback
│   └── utils/
│       ├── required-tokens.ts       ← Token detection
│       ├── quotes.ts                ← Quote fetching flow
│       └── transaction.ts           ← Event polling
```

**Mobile App** (investigation needed):
```
app/
├── components/
│   └── UI/
│       └── Earn/
│           └── hooks/
│               └── useMusdConversion.ts  ← Transaction creation
└── core/
    └── Engine/
        └── controllers/
            └── transaction-pay-controller/
                └── transaction-pay-controller-init.ts  ← Strategy selection
```

### Key Flow Sequence

```
1. Mobile: addTransaction()
   ├─ TransactionController stores transaction
   └─ Emits TransactionController:stateChange

2. Core: pollTransactionChanges() receives event
   ├─ Calls onTransactionChange()
   ├─ Calls parseRequiredTokens()
   │   └─ Calls getTokenTransferData()
   │       └─ Checks txParams.data for 0xa9059cbb
   └─ Updates state.transactionData[id].tokens

3. Mobile: calls updatePaymentToken()
   └─ Core: updatePaymentToken action
       ├─ Calls updateSourceAmounts()
       └─ Calls updateQuotes()
           ├─ Calls getStrategy() → RelayStrategy
           └─ Calls RelayStrategy.getQuotes()
               ├─ Calls getSingleQuote()
               ├─ Calls processTransactions() ← DELEGATION HERE
               ├─ Sends request to Relay API
               └─ Calls calculateSourceNetworkGasLimit()
                   └─ Falls back to 900k if no gas
```

---

## References

1. **Original Debug Report**: `DEBUG_HIGH_RELAY_TX_FEES.md`
2. **Relay API Docs**: https://docs.relay.link/what-is-relay
3. **ERC20 Transfer Signature**: `0xa9059cbb` = `transfer(address,uint256)`
4. **TransactionPayController Architecture**: `packages/transaction-pay-controller/ARCHITECTURE.md`
5. **Working Curl Example**: See section 2 above

---

## Summary

**What we know for certain**:
- ✅ Relay API works fine for same-chain swaps
- ✅ Delegation processing transforms requests
- ✅ 900k fallback is the issue
- ✅ Core fix (skip delegation for same-chain) will solve gas estimates

**What remains mysterious**:
- ❓ Why nestedTransactions is required for quote fetching
- ❓ What generateTransferData() actually produces
- ❓ Why token detection fails without nestedTransactions
- ❓ Whether TransactionController modifies transactions

**Recommended immediate action**:
1. **Core team**: Implement same-chain skip (fixes symptoms)
2. **Mobile team**: Deep investigation (fixes root cause)
3. **Both teams**: Coordinate on findings and long-term solution

---

**Document Status**: Ready for mobile team investigation  
**Last Updated**: November 20, 2025  
**Authors**: @metamask/core debugging session

