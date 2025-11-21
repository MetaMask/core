# Plan: Update mUSD Conversion to Match Payment Token Chain

## Problem
When users convert stablecoins to mUSD, the output token is hardcoded to Ethereum mainnet. When they change the "Pay with" token to a different chain (e.g., Linea), only the payment metadata updates, but the actual transaction still targets the wrong chain and mUSD contract.

## Solution
Update the transaction in place using `TransactionController.updateEditableParams()` when the payment token changes, avoiding the need to cancel and recreate the transaction.

## Implementation

### 1. Fix Initial Transaction Creation
**File**: `app/components/UI/Stake/components/StakeButton/index.tsx`

In the `handleConvertToMUSD` handler (around line 241-256):
- Change `chainId: ETHEREUM_MAINNET_CHAIN_ID` to `chainId: toHex(asset.chainId)` in the `outputToken` parameter
- This ensures the initial transaction is created on the same chain as the selected asset

```typescript
await initiateConversion({
  outputToken: {
    address: MUSD_ADDRESS_ETHEREUM, // Same address on mainnet and Linea: 0xaca92e438df0b2401ff60da7e4337b687a2435da
    chainId: toHex(asset.chainId), // Use asset's chain instead of hardcoded mainnet
    symbol: MUSD_TOKEN_MAINNET.symbol,
    name: MUSD_TOKEN_MAINNET.name,
    decimals: MUSD_TOKEN_MAINNET.decimals,
  },
  preferredPaymentToken: { ... },
  ...
});
```

### 2. Update Transaction When Payment Token Changes
**File**: `app/components/Views/confirmations/components/EarnPayWithRow/pay-with-modal.tsx`

In the `setPayToken` callback (or wherever it's defined):

**Key Changes**:
1. After calling `TransactionPayController.updatePaymentToken()`, check if the payment token's chain differs from the current transaction's chain
2. If different, use `TransactionController.updateEditableParams()` to update:
   - `txParams.chainId` 
   - `txParams.to` (mUSD contract address)
   - `txParams.data` (regenerate transfer data with same amount)
3. Then call `TransactionController.updateBatchTransactions()` to update the `nestedTransactions` array with the same changes

**Implementation**:
```typescript
const setPayToken = useCallback(
  async (newPayToken: { address: Hex; chainId: Hex }) => {
    const { 
      GasFeeController, 
      NetworkController, 
      TransactionPayController,
      TransactionController 
    } = Engine.context;
    
    const networkClientId = NetworkController.findNetworkClientIdByChainId(
      newPayToken.chainId,
    );
    
    await GasFeeController.fetchGasFeeEstimates({ networkClientId });
    
    try {
      TransactionPayController.updatePaymentToken({
        transactionId: transactionId as string,
        tokenAddress: newPayToken.address,
        chainId: newPayToken.chainId,
      });
      
      // Get current transaction to check if chain changed
      const transactions = TransactionController.getTransactions({
        searchCriteria: { id: transactionId },
      });
      const currentTx = transactions[0];
      
      if (!currentTx) {
        throw new Error('Transaction not found');
      }
      
      // Only update if chain actually changed
      if (currentTx.chainId !== newPayToken.chainId) {
        const MUSD_ADDRESS = '0xaca92e438df0b2401ff60da7e4337b687a2435da';
        
        // Regenerate transfer data with current amount from txParams
        const currentData = currentTx.txParams.data;
        const transferData = generateTransferData('transfer', {
          toAddress: currentTx.txParams.from,
          amount: currentData ? extractAmountFromTransferData(currentData) : '0x0',
        });
        
        // Update main transaction params
        await TransactionController.updateEditableParams(
          transactionId as string,
          {
            to: MUSD_ADDRESS,
            data: transferData,
            // chainId update is handled by networkClientId change
          }
        );
        
        // Update nested transactions for Relay
        if (currentTx.nestedTransactions?.length) {
          TransactionController.updateBatchTransactions({
            transactionId: transactionId as string,
            batchTransactions: [{
              to: MUSD_ADDRESS,
              data: transferData as Hex,
              value: '0x0',
            }],
          });
        }
      }
    } catch (e) {
      console.error('Error updating payment token and transaction', e);
    }
  },
  [transactionId],
);
```

### 3. Helper Function (if needed)
**Location**: Same file or utility file

Add a helper to extract the amount from existing transfer data:
```typescript
function extractAmountFromTransferData(data: string): string {
  // Transfer data format: 0xa9059cbb (method) + 32 bytes (address) + 32 bytes (amount)
  if (data.length >= 138) { // 0x + 8 (method) + 64 (address) + 64 (amount)
    return '0x' + data.slice(74, 138).replace(/^0+/, '') || '0x0';
  }
  return '0x0';
}
```

### 4. Validation
Add validation to only allow Ethereum mainnet and Linea chains for mUSD conversion:
```typescript
const SUPPORTED_MUSD_CHAINS = ['0x1', '0xe708']; // Mainnet and Linea
if (!SUPPORTED_MUSD_CHAINS.includes(newPayToken.chainId)) {
  throw new Error('mUSD is only available on Ethereum mainnet and Linea');
}
```

## Key TransactionController Methods Used

1. **`updateEditableParams(txId, params)`** - Updates transaction data in place for unapproved transactions (lines 2130-2215 in TransactionController.ts)
   - Supports updating: `to`, `from`, `data`, `value`, `gas`, `gasPrice`, `maxFeePerGas`, `maxPriorityFeePerGas`
   - Automatically recalculates transaction type if needed
   - Updates layer1 gas fees for L2 chains

2. **`updateBatchTransactions(request)`** - Updates the `nestedTransactions` array (lines 2739-2757 in TransactionController.ts)
   - Required for Relay functionality
   - Updates the batch transactions that will be submitted alongside the main transaction

3. **`getTransactions(opts)`** - Retrieves current transaction state (lines 2420-2505 in TransactionController.ts)
   - Use `searchCriteria: { id: transactionId }` to find specific transaction
   - Returns array of matching transactions

These methods update the transaction without changing its status or requiring user re-approval, providing instant UX updates without the 1-3 second delay.

## Important Notes

### Why This Works
- The TransactionController allows updating "editable params" on **unapproved** transactions
- This includes changing the `to` address, `data`, and implicitly the chain through network client updates
- The transaction maintains its ID and approval state throughout
- No re-approval is needed from the user

### Transaction States
Only transactions with `status: 'unapproved'` can be edited. Once a transaction moves to `'approved'`, `'signed'`, or `'submitted'`, it cannot be modified.

### Network Client ID
When updating to a different chain:
- The `updateEditableParams` method handles the network transition internally
- You don't need to explicitly pass `chainId` to `updateEditableParams`
- The chain is determined by the current `networkClientId` of the transaction
- However, you may need to update the transaction's `networkClientId` first if switching chains

### Alternative Approach (if needed)
If `updateEditableParams` doesn't handle cross-chain updates properly, you may need to:
1. Get the new `networkClientId` for the target chain
2. Update the transaction's `networkClientId` property first
3. Then call `updateEditableParams`

This can be investigated during implementation if issues arise.

## Testing Checklist

- [ ] Initial conversion from mainnet USDC → mainnet mUSD works
- [ ] Initial conversion from Linea USDC → Linea mUSD works  
- [ ] Changing payment token from mainnet to Linea updates transaction chain instantly
- [ ] Changing payment token from Linea to mainnet updates transaction chain instantly
- [ ] Transaction amount is preserved when switching chains
- [ ] Relay functionality continues to work with updated transaction
- [ ] No 1-3 second delay when changing payment tokens
- [ ] Gas estimates update correctly when switching chains
- [ ] Transaction confirmation screen shows correct chain and mUSD address
- [ ] BSC tokens are filtered out from payment options

## Additional Considerations

### Error Handling
- Handle case where mUSD contract doesn't exist on selected chain
- Gracefully handle network switching failures
- Provide clear error messages to users

### UI Updates
- Ensure the confirmation screen reflects the updated chain immediately
- Update any chain-specific UI elements (network badge, gas token, etc.)
- Show loading states during transaction updates if needed

### Performance
- The update operations should be nearly instantaneous (< 100ms)
- No need for loading spinners or delays
- User should see immediate feedback


