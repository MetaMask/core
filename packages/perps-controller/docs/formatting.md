# Perps display formatting

The display formatters and price ranges are exported from `@metamask/perps-controller`.

## General rules

- Display prices show at most 6 decimals (`DECIMAL_PRECISION_CONFIG.MaxPriceDecimals`, the HyperLiquid limit). Two paths differ. A calculated TP/SL trigger price keeps 8 decimals below $0.01 (`TP_SL_PRECISION_CONFIG`), and an order price sent to HyperLiquid keeps at most 6 − `szDecimals` (see [venues/hyperliquid/trading-rules.md](./venues/hyperliquid/trading-rules.md)).
- Range conditions use |v|.
- `formatPerpsFiat` strips trailing zeros unless the caller passes `stripTrailingZeros: false`. With `PRICE_RANGES_UNIVERSAL` it strips every trailing zero. With `PRICE_RANGES_MINIMAL_VIEW`, the default, it strips only an all-zero `.00`.
- With `PRICE_RANGES_UNIVERSAL` only, significant digits are 6 above $100,000, 5 from $0.01 to $100,000 and 4 below $0.01.

Code: `src/constants/perpsConfig.ts` `DECIMAL_PRECISION_CONFIG`, `TP_SL_PRECISION_CONFIG`; `src/utils/perpsFormatters.ts` `formatPerpsFiat`, `formatWithSignificantDigits`.

## `PRICE_RANGES_UNIVERSAL`

Callers opt in by passing `{ ranges: PRICE_RANGES_UNIVERSAL }` to `formatPerpsFiat`. `formatPerpsOrderBookPrice` with no ladder format and `formatPerpsCompact` for order-book USD below 1,000 use it. The first matching row wins.

| \|v\|     | Sig digits | Decimals (min, max) | Threshold                               | Examples                                 |
| --------- | ---------- | ------------------- | --------------------------------------- | ---------------------------------------- |
| > 100,000 | 6          | 0, 0                | 100,000                                 | 123456.78 → $123,457                     |
| > 10,000  | 5          | 0, 0                | 10,000                                  | 12345.67 → $12,346                       |
| > 1,000   | 5          | 0, 1                | 1,000                                   | 1234.56 → $1,234.6                       |
| > 100     | 5          | 0, 2                | 100                                     | 123.456 → $123.46                        |
| > 10      | 5          | 0, 4                | 10                                      | 12.34567 → $12.346                       |
| ≥ 0.01    | 5          | 2, 6                | 0.01                                    | 1.3445555 → $1.3446, 0.333333 → $0.33333 |
| < 0.01    | 4          | 2, 6                | 0.000001 (`PRICE_THRESHOLD.VERY_SMALL`) | 0.004236 → $0.004236                     |

- Stripping runs after significant-digit rounding, so the minimum of 2 decimals does not hold: 1.5 → $1.5.
- A non-zero value below its row's threshold renders `<` plus the threshold at the decimals the rounding chose. 0.0000006 and 0.0000004 both render `<$0`.

Code: `src/utils/perpsFormatters.ts` `PRICE_RANGES_UNIVERSAL`, `PRICE_THRESHOLD`, `FiatRangeConfig`.

## `PRICE_RANGES_MINIMAL_VIEW`

The default `ranges`. Every value gets exactly 2 decimals, and an all-zero `.00` is dropped.

| Input  | Output    |
| ------ | --------- |
| 1250   | $1,250    |
| 1250.1 | $1,250.10 |
| 13.4   | $13.40    |
| 0.004  | <$0.01    |
| -0.004 | -<$0.01   |

Code: `src/utils/perpsFormatters.ts` `PRICE_RANGES_MINIMAL_VIEW`.

## Missing value or real zero

`undefined`, `null`, an empty or non-numeric string, `NaN` and an infinite value count as missing and render a placeholder from `PERPS_CONSTANTS`. A real `0` renders as a number, so the two never look alike.

| Formatter                                       | Missing                                     | Zero               |
| ----------------------------------------------- | ------------------------------------------- | ------------------ |
| `formatPerpsFiat`                               | `$---` (`--` with `symbol: false`)          | `$0`               |
| `formatPnl`                                     | `$---`                                      | `+$0.00`           |
| `formatPositionSize`                            | `--`                                        | `0`                |
| `formatPercentage`                              | `--%`                                       | `+0.00%`           |
| `formatFundingRate`                             | `--%` (empty string with `showZero: false`) | `0.0000%`          |
| `formatFeeBps`                                  | `--`                                        | `0 bps`            |
| `formatLiquidationDistance`                     | `--%`                                       |                    |
| `formatCrossMarginRatio`                        | `--%`                                       | `0%`               |
| `formatPerpsCompact`                            | `$---` (`--` for `orderBookSize`)           | `$0.00` (`volume`) |
| `formatPerpsOrderBookPrice`                     | `$---` (`--` with `symbol: false`)          |                    |
| `formatPositionFunding`, `formatFundingPayment` | `$---`                                      |                    |
| `formatPerpsDuration`                           | `--`                                        | `0 sec`            |

A value that rounds to zero at the shown precision counts as zero for the sign, so no sign mode shows `-0.00`.

Code: `src/utils/perpsFormatters.ts` `_parseDisplayNumber`, `_signPrefix`, `PerpsSignDisplay`; `src/constants/perpsConfig.ts` `PERPS_CONSTANTS.FallbackPriceDisplay`, `FallbackPercentageDisplay`, `FallbackDataDisplay`.

## Fixed decimals and locale

- Non-price values take `decimals` from `PERPS_DISPLAY_PRECISION`, for example `Pnl` 2, `RoePercent` 1, `FundingRatePercent` 4, `CrossMarginRatioPercent` 1.
- `formatCrossMarginRatio` takes a ratio (`0.174` renders `17.4%`) and renders it with the locale's percent style; `decimals` is the most decimals shown, and trailing zeros are dropped (`0.63` renders `63%`), so the `%` placement follows the locale. `formatPercentage`, `formatFundingRate` and `formatLiquidationDistance` append a bare `%` to a fixed-decimal number.
- Locale separators come from the `formatters` option, built by the client with `createFormatters({ locale })` from `@metamask/client-utils`. Without it the formatters use `en-US`.

Code: `src/constants/perpsConfig.ts` `PERPS_DISPLAY_PRECISION`; `src/utils/perpsFormatters.ts` `PerpsIntlFormatters`, `PerpsDisplayFormatOptions`.

## Durations

`formatPerpsDuration(durationMs, { formatters?, unitDisplay? })` renders TWAP running and elapsed time, slice intervals and chase windows. It rounds to whole seconds and shows each non-zero day, hour, minute and second in the locale's `Intl.NumberFormat` unit style, `short` by default: 90 minutes renders `1 hr 30 min`, and `unitDisplay: 'long'` renders 5 minutes as `5 minutes`.

Code: `src/utils/perpsFormatters.ts` `formatPerpsDuration`, `PerpsDurationFormatOptions`.
