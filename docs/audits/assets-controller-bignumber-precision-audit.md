# Audit: BigNumber 15-significant-digit issue in `@metamask/assets-controller`

## Context

A separate audit on `metamask-extension` flagged that `bignumber.js` rejects (or
silently truncates, depending on configuration) JS `number` primitives that
carry more than 15 significant digits, e.g.:

```js
new BigNumber(40115252.21304121);   // 16 significant digits
new BigNumber(1.0000000000000002);  // 17 significant digits (FP artifact)
```

When `BigNumber.DEBUG === true` is set anywhere in the runtime (the extension
team reports this is the configuration that crashes in production for users on
weak-currency locales like VND / IDR), the constructor throws:

> `[BigNumber Error] Number primitive has more than 15 significant digits: ...`

Even without `DEBUG`, precision is silently lost — values written into state
become subtly wrong.

The original fix described in the audit upstream lives in
`assets-controllers/CurrencyRateController.ts` and proposed replacing
`boundedPrecisionNumber`'s `toFixed(9)` with `toPrecision(15)`. The question we
were asked here is whether the **new** `@metamask/assets-controller` package
exhibits the same class of bug.

**Short answer: yes — it ships the same pattern in a different place, and it
also feeds unbounded JS numbers into legacy-shaped state that downstream
controllers (notably `@metamask/bridge-controller`) consume by wrapping in
`new BigNumber(...)`.**

This document walks through each call site I inspected, classifies the risk,
and recommends a fix.

## How the crash works (recap)

`bignumber.js@9.x` source, relevant snippets (`bignumber.js`):

```js
// L270
if (BigNumber.DEBUG && str.replace(/^0\.0*|\./, '').length > 15) {
  throw Error(tooManyDigits + v);
}
// L328
if (isNum && BigNumber.DEBUG &&
  len > 15 && (v > MAX_SAFE_INTEGER || v !== mathfloor(v))) {
  throw Error(tooManyDigits + (x.s * v));
}
```

- The throw is gated on `BigNumber.DEBUG`. The clients (extension/mobile) can
  enable `DEBUG` at any time; the extension audit demonstrates this is already
  the case in some configurations.
- Importantly, every BigNumber **method** that accepts a value (e.g.
  `.multipliedBy(y)`, `.plus(y)`, `.div(y)`) internally executes
  `new BigNumber(y, b)`. So even if no source file in this package writes a
  literal `new BigNumber(jsNumber)`, calling `.multipliedBy(jsNumber)` is the
  same construction and is subject to the same check.
- The only fully safe input is a `string` (or `bigint` converted to string, or
  an integer literal `<= MAX_SAFE_INTEGER`).

## Audit findings in `@metamask/assets-controller`

I grepped every `BigNumber` / `BigNumberJS` call site in
`packages/assets-controller/src/**`:

| File (under `packages/assets-controller/src/`) | Line | Construction | Input type | Risk |
| --- | --- | --- | --- | --- |
| `selectors/balance.ts` | 62 | `new BigNumberJS(value)` | `string` (from `getAmountFromBalance`) | Safe |
| `selectors/balance.ts` | 63 | `new BigNumberJS(0)` | integer literal | Safe |
| `selectors/balance.ts` | 82 | `new BigNumberJS(10).pow(decimals)` | integer literal | Safe |
| `selectors/balance.ts` | 471 | `amount.multipliedBy(price)` | `price` is a **JS number** from `assetsPrice[...].price` | **At risk** |
| `data-sources/evm-rpc-services/utils/parsing.ts` | 30 | `new BigNumberJS(weiStr)` | `string` (or `bigint → string`) | Safe |
| `data-sources/RpcDataSource.ts` | 367 | `new BigNumberJS(rawBalance)` | `string` parameter | Safe |
| `data-sources/RpcDataSource.ts` | 373 | `new BigNumberJS(10).pow(decimals)` | integer literal | Safe |
| `data-sources/BackendWebsocketDataSource.ts` | 661 | `new BigNumberJS(rawBalanceStr)` | `string` | Safe |
| `data-sources/BackendWebsocketDataSource.ts` | 662 | `.dividedBy(new BigNumberJS(10).pow(...))` | integer literal | Safe |
| `AssetsController.ts` | 2366 | `new BigNumberJS(typedBalance.amount \|\| '0')` | `string` | Safe |
| `AssetsController.ts` | 2368 | `balanceAmount.multipliedBy(price.price \|\| 0)` | `price.price` is a **JS number** from state | **At risk** |

### Finding 1 — Unbounded JS numbers are written into `assetsPrice` state

`src/data-sources/PriceDataSource.ts`, around lines 311–332:

```311:332:packages/assets-controller/src/data-sources/PriceDataSource.ts
    for (const { selectedCurrencyPrices, usdPrices } of batchResults) {
      for (const [assetId, marketData] of Object.entries(
        selectedCurrencyPrices,
      )) {
        const usdMarketData = usdPrices[assetId];

        if (
          !isValidMarketData(marketData) ||
          !isValidMarketData(usdMarketData)
        ) {
          continue;
        }

        const caipAssetId = assetId as Caip19AssetId;
        prices[caipAssetId] = {
          ...marketData,
          assetPriceType: 'fungible',
          usdPrice: usdMarketData.price,
          lastUpdated: Date.now(),
        };
      }
    }
```

Every numeric field on `marketData` (`price`, `marketCap`, `allTimeHigh`,
`allTimeLow`, `circulatingSupply`, `totalVolume`, the `pricePercentChange*`
family, plus the synthesised `usdPrice`) is spread into `assetsPrice` **as a
raw JS number returned by the Price API**. The API gives no precision
guarantee — typical artifacts:

- weak-currency native rates like `40115252.21304121` (16 sig digits)
- floating-point round-trip artifacts like `1.0000000000000002` (17 sig digits)

This is structurally identical to the issue the upstream PR fixes in
`CurrencyRateController.boundedPrecisionNumber`, except this package never
bounds the values at all. Anything downstream that does
`new BigNumber(assetsPrice[id].price)` is now at risk.

### Finding 2 — In-package BigNumber math uses the unbounded JS-number prices directly

`src/selectors/balance.ts`, around the per-account aggregation:

```466:476:packages/assets-controller/src/selectors/balance.ts
    if (hasPrices) {
      const { price, pricePercentChange1d } = getPriceDatumFast(
        assetsPrice,
        assetId,
      );
      const contribution = amount.multipliedBy(price).toNumber();
      if (contribution > 0) {
        totalBalanceInFiat += contribution;
        weightedNumerator += contribution * pricePercentChange1d;
      }
    }
```

`getPriceDatumFast` returns `price` as a JS number lifted straight out of
state. `amount.multipliedBy(price)` calls
`new BigNumber(price, undefined)` internally. With `BigNumber.DEBUG = true` and
a >15-sig-digit `price`, this throws and the entire aggregated-balance
selector crashes — i.e. the user’s portfolio page goes blank.

`src/AssetsController.ts`, in the asset-iteration / fiat-value pass:

```2356:2369:packages/assets-controller/src/AssetsController.ts
        const typedBalance = balance;
        const priceRaw = this.state.assetsPrice[typedAssetId];
        const price: AssetPrice = priceRaw ?? {
          price: 0,
          lastUpdated: 0,
        };

        // Compute fiat value using BigNumber for precision
        // Note: typedBalance.amount is already in human-readable format (e.g., "1" for 1 ETH)
        // so we do NOT divide by 10^decimals here
        const balanceAmount = new BigNumberJS(typedBalance.amount || '0');
        const fiatValue = balanceAmount
          .multipliedBy(price.price || 0)
          .toNumber();
```

Same shape: `multipliedBy(price.price)` where `price.price` is an unbounded JS
number → same risk. Note this runs inside the messenger-exposed asset listing
action, so a crash here also propagates to whichever UI consumer is reading
the action.

### Finding 3 — `formatExchangeRatesForBridge` re-emits unbounded numbers into legacy state, where they ARE wrapped in `new BigNumber(...)`

`src/utils/formatExchangeRatesForBridge.ts`:

```128:150:packages/assets-controller/src/utils/formatExchangeRatesForBridge.ts
        if (tokenAddress) {
          const priceInNative =
            nativeAssetUsdPrice > 0 ? usdPrice / nativeAssetUsdPrice : usdPrice;
          if (!marketData[chainIdHex]) {
            marketData[chainIdHex] = {};
          }
          marketData[chainIdHex][tokenAddress] = {
            ...priceData,
            price: priceInNative,
            currency: nativeCurrencySymbol,
            assetId,
            chainId: chainIdHex,
            tokenAddress,
          } as MarketDataDetails;
        }

        if (isNative) {
          currencyRates[nativeCurrencySymbol] = {
            conversionDate: lastUpdatedInSeconds,
            conversionRate: price,
            usdConversionRate: usdPrice,
          };
        }
```

Two distinct problems here:

1. `conversionRate = price` and `usdConversionRate = usdPrice` — raw JS
   numbers from the API, written straight into the **legacy
   `CurrencyRateController` shape**. This is the exact field that the
   upstream audit fixes via `boundedPrecisionNumber` in the old controller;
   here we replicate the field without any clamp.
2. `priceInNative = usdPrice / nativeAssetUsdPrice` is a **JS float division**
   that routinely produces 16- or 17-sig-digit artifacts (the classic
   `1.0000000000000002` USDC case). This is then stored as
   `marketData[chainIdHex][tokenAddress].price`.

Confirmed downstream consumption — `packages/bridge-controller/src/selectors.ts`:

```196:202:packages/bridge-controller/src/selectors.ts
          ? new BigNumber(nativeCurrencyRate.usdConversionRate).div(
              nativeCurrencyRate.conversionRate,
            )
          : undefined;
      const usdExchangeRate = usersCurrencyToUsdRate
        ? new BigNumber(rate).times(usersCurrencyToUsdRate).toString()
        : undefined;
```

```241:250:packages/bridge-controller/src/selectors.ts
    const price = evmTokenExchangeRateForAddress?.price ?? 0;
    if (evmTokenExchangeRateForAddress && nativeCurrencyRate) {
      return {
        exchangeRate: new BigNumber(price)
          .multipliedBy(nativeCurrencyRate.conversionRate ?? 0)
          .toString(),
        usdExchangeRate: new BigNumber(price)
          .multipliedBy(nativeCurrencyRate.usdConversionRate ?? 0)
          .toString(),
      };
    }
```

`new BigNumber(price)`, `new BigNumber(nativeCurrencyRate.usdConversionRate)`,
`.multipliedBy(nativeCurrencyRate.conversionRate)`,
`.multipliedBy(nativeCurrencyRate.usdConversionRate)` — every one of these
inputs is sourced from the unbounded values that
`formatExchangeRatesForBridge` produces. This is the reproducer described in
the original audit, just routed through the new package’s bridge-compat shim
instead of `CurrencyRateController`. The same `formatStateForTransactionPay`
output (which re-uses `formatExchangeRatesForBridge` internally — see
`src/utils/formatStateForTransactionPay.ts` lines 182–197) feeds the
transaction-pay controller, so the surface area is identical.

### What is *not* affected

- All balance-value BigNumber sites take strings (`amount`, `rawBalance`,
  `weiStr`, `rawBalanceStr`). Balances are stored as decimal strings in
  state, so re-construction is safe.
- `new BigNumberJS(10).pow(decimals)` and `new BigNumberJS(0)` are integer
  literals and never trip the check.
- `weiToHumanReadable`, `RpcDataSource.#convertToHumanReadable`,
  `BackendWebsocketDataSource` raw-balance conversion: input strings only.

## Recommended fix

The minimal, consistent fix mirrors what the upstream audit recommends for
`CurrencyRateController`, but applied at the source of the bug in this
package — i.e. at the boundary where the Price API result is materialised
into state. Two complementary changes:

1. **Bound precision when constructing `assetsPrice` entries in
   `PriceDataSource`.** Introduce a `boundedPrecisionNumber` helper that
   clamps to 15 *significant* digits (not decimal places):

   ```ts
   const boundedPrecisionNumber = (
     value: number | null | undefined,
     precision = 15,
   ): number | undefined => {
     if (typeof value !== 'number' || !Number.isFinite(value)) {
       return undefined;
     }
     return Number(value.toPrecision(precision));
   };
   ```

   Apply it to every numeric field that gets spread into state: `price`,
   `usdPrice`, `marketCap`, `allTimeHigh`, `allTimeLow`,
   `circulatingSupply`, `totalVolume`, and each `pricePercentChange*`.

   This is functionally what the user’s upstream recommendation says about
   `CurrencyRateController`’s helper — switch from `toFixed(9)` (decimal
   places) to `toPrecision(15)` (significant digits) — but it should be done
   here directly rather than retrofitted later, since the new package never
   had `toFixed(9)` to begin with.

2. **Defensive string-conversion at the BigNumber boundary inside this
   package.** Even with bounding upstream, the in-package multipliers should
   not construct from JS numbers. Two affected sites:

   ```ts
   // src/selectors/balance.ts:471
   const contribution = amount.multipliedBy(String(price)).toNumber();

   // src/AssetsController.ts:2368
   const fiatValue = balanceAmount
     .multipliedBy(String(price.price || 0))
     .toNumber();
   ```

   Stringifying the JS number sidesteps the >15-sig-digit constructor branch
   entirely (the string branch has no such check) and protects this package
   even if a future Price API contract regresses, and even when `DEBUG=true`
   is enabled by a host application.

3. **Bound precision (or stringify) inside
   `formatExchangeRatesForBridge`.** Specifically:

   - Clamp `price`, `usdPrice`, and `priceInNative = usdPrice / nativeAssetUsdPrice`
     before assignment.
   - Clamp / stringify the entries written into `currencyRates[symbol]`
     (`conversionRate`, `usdConversionRate`) and into
     `marketData[chainIdHex][tokenAddress]` (`price` and any of the spread
     fields that the bridge selectors may consume).

   This is the change that actually unblocks the extension crash, since the
   bridge-controller selector path (Finding 3) is the direct downstream
   consumer of these fields.

## Test recommendations

- Add a `PriceDataSource` test where the API returns a price like
  `1.0000000000000002` or `40115252.21304121` and assert the value stored in
  state has ≤ 15 significant digits (or, if string-stored, can round-trip
  through `new BigNumber(value)` without throwing under `BigNumber.config({ DEBUG: true })`).
- Add a `formatExchangeRatesForBridge` test where `usdPrice / nativeAssetUsdPrice`
  would produce a >15-sig-digit artifact (e.g. `usdPrice = 1`,
  `nativeAssetUsdPrice = 0.9999999999999999`) and assert the resulting
  `marketData[...][tokenAddress].price` and `currencyRates[...].conversionRate`
  / `usdConversionRate` are safe to wrap in `new BigNumber(...)` with
  `DEBUG: true`.
- Add a regression test in `selectors/balance.ts` that runs the aggregation
  with a >15-sig-digit price in `assetsPrice` while `BigNumber.config({ DEBUG: true })`
  is set in the test scope, and asserts the selector does not throw.

## Out of scope (per the request)

The matching audit in the older `@metamask/assets-controllers` package
(`CurrencyRateController.boundedPrecisionNumber` using `toFixed(9)` → should
be `toPrecision(15)`) is acknowledged but deliberately not addressed here —
that work was called out as a separate follow-up by the original audit
author.
