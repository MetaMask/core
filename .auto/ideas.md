# Ideas backlog — assets-controller #updateState producer

Priority order (cheapest + highest leverage first). Every idea needs the
mirror-edit (AssetsController.ts + 04-candidate.js). See prompt.md for the
full parity-trap details.

1. **Fast-path amount normalization** — module-local `canonicalAmount(amount, decimals)`
   in AssetsController.ts returning the input unchanged when it provably equals what
   `normalizeAmountString` would return (canonical plain decimal, fracLen ≤
   floor(decimals) or natural-precision mode); else fall back. Kills
   `new BigNumber` + `toFixed` + regex trim for ~all warm-poll entries.
2. **Balance-object reuse** — reuse `previousBalance` reference when the new
   `{amount, metadata?}` is content-identical; also makes downstream `isEqual`
   shallow. Guard exact key-shape (1 or 2 keys).
3. **Changed-flag instead of per-account `isEqual`** — track key add/drop/amount
   change while building `effectiveAccountBalances`; `effectiveAccountBalancesV5`
   can report dropped keys in replace mode (it already walks them).
4. **Metadata loop churn** — skip `{...existing,...incoming,...}` rebuild when the
   merge result is content-identical to existing; reference quick-check before
   `isEqual`.
5. **Prices loop quick-check** — `previousPrices[key] === value` before `isEqual`
   (lodash already short-circuits this, so likely no win — measure first, discard
   fast if flat).

Stretch (only if the above stall):
6. V6 path same optimizations (out of bench scope — would need 04/harness additions;
   likely skip; V5 is the profiled path).
