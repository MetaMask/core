#!/bin/bash

echo "=== Analysis of Balance Aggregation Discrepancy ==="
echo ""

echo "1. allTokens (Extension - from MetaMask state logs.json):"
TRACKED_TOKENS=$(cat /Users/salim/metamask/core/allTokens-extracted.json | jq '[to_entries[] | .value | to_entries[] | .value | length] | add')
echo "   - Total tracked ERC20 tokens: $TRACKED_TOKENS"

echo ""
echo "2. tokenBalances state:"
echo "   Breakdown by account and chain (includes native + ERC20):"
cat /Users/salim/metamask/core/tokenBalances-extracted.json | jq '
  .tokenBalances | to_entries | map({
    account: .key,
    chains: (.value | keys),
    totalEntries: ([.value | to_entries[] | .value | length] | add)
  })
'

echo ""
echo "3. Key Insight from balances.ts code:"
echo "   The aggregation ONLY counts tokens that meet ALL criteria:"
echo "   - Have a balance in tokenBalances state"
echo "   - AND are in allTokens list (EXCEPT native & staked native)"  
echo "   - AND have market data/price available"
echo "   - AND have valid currency conversion rates"
echo ""

echo "4. What could cause 85 vs 157 difference:"
echo "   - Different number of tokens in allTokens (mobile vs extension)"
echo "   - Different market data availability"
echo "   - Different enabled chains"
echo "   - Different queryAllAccounts settings"
echo ""

echo "5. To identify the issue, extract from BOTH platforms:"
echo "   - Mobile: allTokens, marketData, enabledNetworkMap"
echo "   - Extension: allTokens, marketData, enabledNetworkMap"

