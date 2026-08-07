# Audit: BigNumber 15-significant-digit issue in `@metamask/assets-controller`

## Context

A separate audit on `metamask-extension` flagged that `bignumber.js` rejects (or
silently truncates, depending on configuration) JS `number` primitives that
carry more than 15 significant digits, e.g.:

```js
new BigNumber(40115252.21304121); // 16 significant digits
new BigNumber(1.0000000000000002); // 17 significant digits (FP artifact)
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
if (
  isNum &&
  BigNumber.DEBUG &&
  len > 15 &&
  (v > MAX_SAFE_INTEGER || v !== mathfloor(v))
) {
  throw Error(tooManyDigits + x.s * v);
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

| File (under `packages/assets-controller/src/`)   | Line | Construction                                     | Input type                                               | Risk        |
| ------------------------------------------------ | ---- | ------------------------------------------------ | -------------------------------------------------------- | ----------- |
| `selectors/balance.ts`                           | 62   | `new BigNumberJS(value)`                         | `string` (from `getAmountFromBalance`)                   | Safe        |
| `selectors/balance.ts`                           | 63   | `new BigNumberJS(0)`                             | integer literal                                          | Safe        |
| `selectors/balance.ts`                           | 82   | `new BigNumberJS(10).pow(decimals)`              | integer literal                                          | Safe        |
| `selectors/balance.ts`                           | 471  | `amount.multipliedBy(price)`                     | `price` is a **JS number** from `assetsPrice[...].price` | **At risk** |
| `data-sources/evm-rpc-services/utils/parsing.ts` | 30   | `new BigNumberJS(weiStr)`                        | `string` (or `bigint → string`)                          | Safe        |
| `data-sources/RpcDataSource.ts`                  | 367  | `new BigNumberJS(rawBalance)`                    | `string` parameter                                       | Safe        |
| `data-sources/RpcDataSource.ts`                  | 373  | `new BigNumberJS(10).pow(decimals)`              | integer literal                                          | Safe        |
| `data-sources/BackendWebsocketDataSource.ts`     | 661  | `new BigNumberJS(rawBalanceStr)`                 | `string`                                                 | Safe        |
| `data-sources/BackendWebsocketDataSource.ts`     | 662  | `.dividedBy(new BigNumberJS(10).pow(...))`       | integer literal                                          | Safe        |
| `AssetsController.ts`                            | 2366 | `new BigNumberJS(typedBalance.amount \|\| '0')`  | `string`                                                 | Safe        |
| `AssetsController.ts`                            | 2368 | `balanceAmount.multipliedBy(price.price \|\| 0)` | `price.price` is a **JS number** from state              | **At risk** |

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

### What is _not_ affected

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
   clamps to 15 _significant_ digits (not decimal places):

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

## Why `toPrecision(15)` and not `toFixed(9)` (or anything else)?

The older `boundedPrecisionNumber` in `CurrencyRateController` clamps decimal
places (`toFixed(9)`). That helper was introduced to deflake fiat rates near
`1` (USD/EUR-style values with 17-sig-digit floating-point artifacts like
`1.0000000000000002`) — not to bound large-magnitude rates. As soon as the
input is a weak-currency rate with eight integer digits (VND, IDR, etc.),
`toFixed(9)` does not cap significant digits at all: it just keeps every
fractional digit unchanged.

Empirically, with `BigNumber.DEBUG = true` and `bignumber.js@9.1.2`:

| Input (number)                         | `toFixed(9)` clamp value | `new BigNumber(clamped)` | `toPrecision(15)` clamp value | `new BigNumber(clamped)` |
| -------------------------------------- | ------------------------ | ------------------------ | ----------------------------- | ------------------------ |
| `40115252.21304121` (VND, 16 sd)       | `40115252.21304121`      | **throws**               | `40115252.2130412`            | OK                       |
| `11259865.090939905` (IDR, 17 sd)      | `11259865.090939905`     | **throws**               | `11259865.0909399`            | OK                       |
| `12345678901.234568` (big rate, 17 sd) | `12345678901.234568`     | **throws**               | `12345678901.2346`            | OK                       |
| `12345678901234568` (int, 17 sd)       | `12345678901234568`      | **throws**               | `12345678901234600`           | OK                       |
| `1.0000000000000002` (fp artifact)     | `1`                      | OK                       | `1`                           | OK                       |
| `2308.478753378` (USD, 13 sd)          | `2308.478753378`         | OK                       | `2308.478753378`              | OK                       |
| `1.2345678901234566e-7` (small, 16 sd) | `1.23e-7`                | OK                       | `1.23456789012346e-7`         | OK                       |
| `1.23456789e-10` (sub-nano dust)       | `0` (**lost**)           | OK                       | `1.23456789e-10`              | OK                       |
| `1.234567890123456e-15` (micro-dust)   | `0` (**lost**)           | OK                       | `1.23456789012346e-15`        | OK                       |

In short, on the dimension we care about here `toPrecision(15)` strictly
dominates `toFixed(9)`:

- It is the only one of the two that actually defangs large-magnitude rates;
  `toFixed(9)` only happens to deflake the small-magnitude floating-point
  artifact case, not the weak-currency case the upstream audit reproduces.
- It also _preserves more dust precision_, not less: `toFixed(9)` rounds
  anything below `1e-9` to literal `0`. `toPrecision(15)` keeps up to fifteen
  significant digits regardless of magnitude.

### Cons of `toPrecision(15)`, such as they are

1. **Exponential string form for `|x| < 1e-6`.** Once the bounded value is
   round-tripped through `Number(...)`, its `.toString()` for sub-`1e-6`
   magnitudes is exponential notation (e.g. `"1.23456789012346e-7"`). The
   numeric value is preserved exactly; the only consumer-visible difference
   is in raw string display. Fiat / price-API values never approach this
   magnitude in practice (USD-priced assets bottom out far above `1e-6`),
   and the controller has no path that builds a UI string off the bare
   number anyway — formatting is consistently routed through bignumber.js'
   `.toFixed(n)`.

2. **Trailing-digit erosion for integers near `MAX_SAFE_INTEGER`.**
   `12345678901234568` → `12345678901234600`. The source value is already
   beyond IEEE-754's exact-integer range (`2^53 ≈ 9.007e15`), so the
   "precision" was illusory; we are trading "looks precise but isn't" for
   "fifteen genuine significant digits". No Price API field ever lands in
   this range.

3. **Rounding boundary moves with magnitude.** `toFixed(9)` rounds at the
   ninth decimal place irrespective of magnitude; `toPrecision(15)` rounds
   at the fifteenth significant digit. For values that previously rounded
   to the same `toFixed(9)` output (e.g. `1.0000000001` and `1.0000000002`
   both → `1.000000000`), `toPrecision(15)` keeps them distinct. This is
   more correct, but tests that asserted on coarse-rounding collisions will
   need updates.

### Recommended utility: significant-digit cap + decimal-place cap

Pure `toPrecision(15)` solves the crash and preserves precision, but the
round-tripped JS number for any value with magnitude `< 1e-6` re-serialises
as exponential notation (`"1.23456789012346e-7"`). For state that may be
JSON-serialised, logged, or surfaced in audit traces, we generally do not
want `"e"`-form numbers leaking out. The fix is to compose both bounds:
clamp significant digits _first_ (defeats the crash for large-magnitude
rates) and clamp decimal places _second_ (locks the value to a fixed-decimal
form for any practical price/rate magnitude).

```ts
/**
 * Bound a numeric value so that it
 *
 * 1. Safely round-trips through `new BigNumber(value)` (i.e. the resulting
 *    JS number has at most 15 significant digits in its native string form,
 *    so bignumber.js' `DEBUG` check cannot trip).
 * 2. Serialises as a fixed-decimal number (no `"e"` notation) for any
 *    realistic price/rate magnitude.
 *
 * Order matters: significant-digit clamping comes first, because
 * `toFixed(decimalPlaces)` on a large-magnitude input (e.g. a weak-currency
 * conversion rate like 40115252.21304121) does nothing to its significant
 * digit count.
 *
 * @param value - Numeric value to bound. `null`, `undefined`, `NaN`, and
 * `Infinity` yield `undefined`.
 * @param significantDigits - Maximum significant digits. Default `15`
 * matches IEEE-754 double precision and the bignumber.js cap.
 * @param decimalPlaces - Maximum decimal places. Default `9` matches the
 * historical `boundedPrecisionNumber` helper in
 * `@metamask/assets-controllers/CurrencyRateController`. Values whose
 * magnitude rounds below `10 ** -decimalPlaces` snap to `0`.
 * @returns Bounded number, or `undefined` for non-finite inputs.
 */
function boundedPriceNumber(
  value: number | null | undefined,
  significantDigits = 15,
  decimalPlaces = 9,
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const sigBounded = Number(value.toPrecision(significantDigits));
  return Number(sigBounded.toFixed(decimalPlaces));
}
```

Empirical behaviour (verified against `bignumber.js@9.1.2` with
`BigNumber.DEBUG = true`):

| Input                                     | Bounded value       | `String(bounded)`   | Has `"e"`? | `new BigNumber(bounded)` |
| ----------------------------------------- | ------------------- | ------------------- | ---------- | ------------------------ |
| `40115252.21304121` (VND rate)            | `40115252.2130412`  | `40115252.2130412`  | no         | OK                       |
| `11259865.090939905` (IDR rate)           | `11259865.0909399`  | `11259865.0909399`  | no         | OK                       |
| `12345678901.234568` (big rate)           | `12345678901.2346`  | `12345678901.2346`  | no         | OK                       |
| `2308.478753378` (mid USD rate)           | `2308.478753378`    | `2308.478753378`    | no         | OK                       |
| `1.0000000000000002` (fp artifact, up)    | `1`                 | `1`                 | no         | OK                       |
| `0.9999999999999998` (fp artifact, down)  | `1`                 | `1`                 | no         | OK                       |
| `0.00010234567891234` (token ≈ $0.0001)   | `0.000102346`       | `0.000102346`       | no         | OK                       |
| `0.0000012345678912` (token ≈ $0.000001)  | `0.000001235`       | `0.000001235`       | no         | OK                       |
| `1.2345678901234566e-7` (sub-`1e-6` dust) | `1.23e-7`           | `1.23e-7`           | **yes**    | OK                       |
| `1.23456789e-10` (sub-nano)               | `0`                 | `0`                 | no         | OK                       |
| `1.234567890123456e-15` (micro-dust)      | `0`                 | `0`                 | no         | OK                       |
| `-40115252.21304121`                      | `-40115252.2130412` | `-40115252.2130412` | no         | OK                       |

The only band where exponential notation survives is `1e-9 ≤ |x| < 1e-6` —
a price range of roughly `$0.000000001` to `$0.000001` per token unit. This
is below where any realistic fiat or asset price lives; nothing in the
Price API contract approaches this magnitude. If a future use case needs to
eliminate exponential output even for that band, two alternatives:

- **Snap the band to zero.** Tighten `decimalPlaces` to `6`. `(1.23e-7).toFixed(6)`
  rounds to `"0.000000"`, so anything below `1e-6` becomes literal `0` and
  `String(0)` is `"0"`. The cost is losing precision for sub-`1e-6` prices —
  acceptable for fiat / token prices, never acceptable for raw balances (which
  this package already stores as `string`, so this concern does not apply
  there).
- **Return the `toFixed` string directly** instead of round-tripping through
  `Number(...)`. The `toFixed(dp)` return value is always fixed-decimal by
  construction. The cost is changing the field type from `number` to
  `string`, which is the broader refactor discussed in the next section.

### Did the `"e"` issue already exist in the old controller's bounded helper?

Yes, latently — though it never bit in production. The old
`boundedPrecisionNumber` in `CurrencyRateController` shares the final
`Number(...)` round-trip step, and `Number.prototype.toString` chooses
exponential notation whenever the decimal exponent is `< -6`. No bounding
strategy that returns a `number` can change that; only storing the
already-formatted string can.

Verified against the old helper as it ships in `@metamask/assets-controllers`:

| Input                              | Old `boundedPrecisionNumber(value)` | `String(bounded)`    | Has `"e"`? | `new BigNumber(bounded)` |
| ---------------------------------- | ----------------------------------- | -------------------- | ---------- | ------------------------ |
| VND `40160642.570281126`           | `40160642.570281126`                | `40160642.570281126` | no         | **THROWS** (the bug)     |
| IDR `11261261.261261262`           | `11261261.261261262`                | `11261261.261261262` | no         | **THROWS** (the bug)     |
| USD `2309.4688221709007`           | `2309.468822171`                    | `2309.468822171`     | no         | OK                       |
| BTC `0.043478260869565216`         | `0.043478261`                       | `0.043478261`        | no         | OK                       |
| `1.0000000000000002` (fp artifact) | `1`                                 | `1`                  | no         | OK                       |
| `1.23e-7` (sub-`1e-6` price)       | `1.23e-7`                           | `1.23e-7`            | **yes**    | OK                       |
| `1.23e-10` (sub-nano)              | `0`                                 | `0`                  | no         | OK                       |

Reading the table:

- The old helper produces `"e"`-form output in exactly the same
  `1e-9 ≤ |x| < 1e-6` band as the unbounded number would. The bounding does
  not eliminate the band; it only collapses sub-`1e-9` values to `0`.
- The reason this has not been a reported problem is the input distribution.
  `boundedPrecisionNumber` in `CurrencyRateController` is only called on
  fiat-currency conversion rates and asset prices in fiat. Both live far
  above `1e-6` in production — the state dump cited in the upstream audit
  (`40115252.21304121`, `2308.478753378`, …) has no `"e"`-form values for
  exactly that reason.
- Conversely, the old helper does **not** prevent the throw for VND/IDR-class
  rates. That is the actual user-visible bug.

So the hybrid utility recommended above is strictly an improvement on both
axes: it fixes the crash that `toFixed(9)` alone misses, and it tightens a
latent edge that has been silently present in the old helper since it was
introduced. It does not regress on the dust-handling property of the old
helper either (sub-`1e-9` values still snap to `0` because of the
`toFixed(decimalPlaces)` step).

### Why we need the bound now even though we didn't before

The original `boundedPrecisionNumber` shipped in
`@metamask/assets-controllers` PR #7324 specifically to handle dust-token
floating-point artifacts (the `1.0000000000000002` family). That works
because those values shrink in significant-digit count after `toFixed(9)`
rounds at the ninth decimal. The new failure mode — surfaced by
weak-currency locales (VND, IDR) and by `usdPrice / nativeAssetUsdPrice`
divisions that produce 17-sig-digit values — operates at the _opposite_ end
of the magnitude scale: the digits that exceed fifteen significant are
_to the left of the decimal point_, where `toFixed(9)` cannot reach. A
significant-digit cap covers both ends and is the smallest change that
restores the original intent ("store rates in a form that safely
round-trips through `new BigNumber(...)`").

### Subtle gotcha: bignumber.js' DEBUG regex on exponential strings

`bignumber.js@9.x` enforces the 15-significant-digit limit by stringifying
the input number and applying

```js
str.replace(/^0\.0*|\./, '').length > 15;
```

That regex strips at most one decimal point or leading-zero run and then
counts the remaining characters — _including_ an exponential suffix like
`e-7` as if it were digits:

```js
'1.23456789012346e-7'.replace(/^0\.0*|\./, ''); // "123456789012346e-7", length 18
```

Empirically, this does _not_ trip on our `toPrecision(15)` outputs when
they reach `new BigNumber(value)` via the number-input path — the float
constructor branch normalises through JS' default
`(1.23456789012346e-7).toString()` which collapses the trailing zeros and
the regex passes. But the same value handed in as a literal _string_ would
trip the throw under `DEBUG`. The implication is:

- Bound via `toPrecision(15)` _at the source_ (when we read from the API
  / when we compute the divided rate), not at the BigNumber call site, so
  every downstream caller — whether they pass the value as a number or as
  a stringified form — is safe.
- Do not stringify a bounded value explicitly before passing to BigNumber.
  `new BigNumber(state.assetsPrice[id].price)` is fine after bounding;
  `new BigNumber(String(state.assetsPrice[id].price))` may not be in
  DEBUG mode for sub-`1e-6` values.

## Should `AssetPrice.*` numeric fields just be strings?

A reasonable follow-up question is: bounding is only required for `number`
inputs to `bignumber.js`. The string constructor branch
(`bignumber.js` lines ~268–278) has no significant-digit check; only the
number branch (lines ~325–332) does. So if `AssetPrice.price`, `usdPrice`,
`marketCap`, etc. were typed as `string`, the crash would be structurally
impossible inside this package. Is that a cleaner fix than `boundedPrecisionNumber`?

It is a viable internal fix, but it does **not** remove the need to bound
precision at the shim layer. Three considerations:

1. **It is a breaking change to the public type surface.** `AssetPrice`,
   `FungibleAssetPrice`, and `NFTAssetPrice` are exported. Consumers that do
   `priceData.price * x`, comparisons like
   `priceData.marketCap > threshold`, sums via `+`, etc. would silently
   coerce to string concatenation or lexicographic compare unless they
   re-cast through `Number(...)`. Persisted state would also need a
   migration to convert existing number-typed values to strings on read,
   since `JSON.parse` does not infer a quoted form from a numeric literal.

2. **The bridge-compat shim cannot go fully-string anyway.**
   `formatExchangeRatesForBridge` writes into the legacy
   `CurrencyRateState` / `MarketDataDetails` shapes which are owned by the
   older `@metamask/assets-controllers` package and typed as `number | null`
   (`CurrencyRateState.currencyRates[symbol].conversionRate`,
   `usdConversionRate`) or `number` (`MarketDataDetails.price`). The
   `@metamask/bridge-controller` selector wraps those exact `number` fields
   in `new BigNumber(...)`. Even if `AssetPrice.*` were strings inside this
   package, the shim still has to emit numbers, so the precision-bounding
   step at the shim boundary is still required to actually unblock the
   extension crash.

   Of note, the non-EVM path inside `formatExchangeRatesForBridge` already
   string-encodes at the boundary (`rate: String(price)`, and the
   `allTimeHigh`/`allTimeLow`/`circulatingSupply`/`marketCap`/`totalVolume`
   fields under `marketData` are written via template literals). The
   crash-relevant fields are the ones the EVM path writes into
   `marketData[chainIdHex][tokenAddress]` and `currencyRates[symbol]`, which
   keep `number` typing to match the legacy shape.

3. **In-package consumers are easier with strings, not harder.** Both
   at-risk BigNumber sites (`selectors/balance.ts:471`,
   `AssetsController.ts:2368`) feed the value to `.multipliedBy(...)`,
   which accepts strings. The only mixed-arithmetic site is
   `selectors/balance.ts:474`
   (`weightedNumerator += contribution * pricePercentChange1d`), which
   would need an explicit `Number(...)` cast if the percent fields were
   strings.

### Summary recommendation

- **Smallest, non-breaking fix that resolves the production crash:**
  do precision-bounding (`toPrecision(15)`) at the two boundaries — in
  `PriceDataSource` before writing into state, and inside
  `formatExchangeRatesForBridge` for `conversionRate`,
  `usdConversionRate`, and the derived
  `priceInNative = usdPrice / nativeAssetUsdPrice` (the float division
  re-introduces >15-sig-digit artifacts even after bounding the inputs).
- **Structurally cleanest fix:** also switch `AssetPrice.*` numeric fields
  to `string`, mirroring `FungibleAssetBalance.amount`. This is a
  breaking change requiring a state migration and a `Number(...)` cast at
  the one mixed-arithmetic site in `selectors/balance.ts`. It does **not**
  remove the bounding step inside `formatExchangeRatesForBridge`, because
  the legacy shape this package emits to is owned externally and uses
  `number`.

Put differently: bounding is needed only for `number`. Strings everywhere
inside this package is structurally tidier, but the legacy bridge / token-rates
shapes that this package converts into are typed `number` and consumed via
`new BigNumber(...)` downstream, so the bound has to happen at the shim layer
regardless of what the internal `AssetPrice` type chooses.

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
