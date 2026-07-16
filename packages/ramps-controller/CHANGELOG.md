# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** Bump minimum Node.js version to 22 ([#9168](https://github.com/MetaMask/core/pull/9168))

## [17.0.0]

### Added

- Add the `MONEY_HEADLESS_ALL_PROVIDERS_FLAG_KEY` constant (`moneyHeadlessAllProviders`) and the pure `isHeadlessAllProvidersEnabled(remoteFeatureFlagState)` helper (with a `HeadlessFeatureFlagsLookup` type) that own the flag key lookup, `localOverrides`-over-`remoteFeatureFlags` merging, and boolean coercion (only the literal `true` enables), so UI consumers resolve the flag exactly like the controller does ([#9409](https://github.com/MetaMask/core/pull/9409))
- Add pure provider-availability helpers `providerServesAsset`, `getProvidersServingAsset`, `regionHasProviderForAsset`, and `isFiatDepositAvailable` so headless-buy consumers can share the controller's case-insensitive CAIP-19 asset matching and flag-aware region/availability gating instead of re-deriving it, keeping the two from disagreeing; `regionHasProviderForAsset` and `isFiatDepositAvailable` take an `allProvidersEnabled` boolean ([#9409](https://github.com/MetaMask/core/pull/9409))
- Add pure quote-classification helpers `isExternalBrowserQuote`, `isCustomActionQuote`, and `isInAppOnlyQuote` so consumers can share the in-app-vs-external browser-mode classification without owning host redirect/deeplink concerns ([#9409](https://github.com/MetaMask/core/pull/9409))
- Add pure error-normalization helpers `getErrorMessage`, `extractExplicitTypedError`, and `normalizeToTypedError` (with a `TypedError<Code>` type) so consumers can share error-shape extraction while keeping their own error-code taxonomy ([#9409](https://github.com/MetaMask/core/pull/9409))
- Add `@metamask/remote-feature-flag-controller` `^4.2.2` as a runtime dependency ([#9409](https://github.com/MetaMask/core/pull/9409))

### Changed

- **BREAKING:** Replace the `getProviderScope` constructor option and the exported `ProviderScope` type (`'off' | 'in-app' | 'all'`) with a controller-side read of the `moneyHeadlessAllProviders` boolean remote feature flag ([#9409](https://github.com/MetaMask/core/pull/9409))
  - `RampsController.getQuotes` resolves the flag through the `RemoteFeatureFlagController:getState` messenger action on each auto-selection call, so a remote fetch or a local dev override takes effect at runtime; consumers should delegate that action to the controller's messenger (when it is missing, the flag read fails closed and quoting stays native-only)
  - When the flag is `true`, the auto-selection path (`autoSelectProvider` / `restrictToKnownOrNativeProviders`) widens to every supporting provider class (native, in-app WebView aggregator, and external-browser / custom-action) and returns the best quote at `success[0]`, enforcing per-provider fiat limits; when the flag is `false`, missing, or any non-boolean value, the path stays native-only
  - The intermediate `in-app` scope (which excluded external-browser and custom-action quotes from selection) is removed
- `RampsController` now derives its internal region provider-asset matching from the shared `providerAvailability` helpers, so the exposed helpers stay behaviourally identical to the controller's own selection ([#9409](https://github.com/MetaMask/core/pull/9409))

## [16.0.0]

### Changed

- **BREAKING:** Provider IDs are no longer normalized by stripping a `/providers/` prefix. `RampsController.getQuotes` now matches provider IDs from the providers list, quotes, custom actions, and sort order as-is, and a precreated stub order's `provider.id` is the canonical provider code passed to the create-order call rather than a `/providers/`-prefixed value. Consumers must supply non-prefixed (canonical) provider IDs ([#9448](https://github.com/MetaMask/core/pull/9448))
- Update `LICENSE` text ([#9472](https://github.com/MetaMask/core/pull/9472))
- Bump `@metamask/profile-sync-controller` from `^28.2.0` to `^28.3.0` ([#9463](https://github.com/MetaMask/core/pull/9463))

### Removed

- **BREAKING:** Remove the `normalizeProviderCode` export ([#9448](https://github.com/MetaMask/core/pull/9448))

## [15.1.0]

### Added

- Add an optional `getProviderScope` callback to `RampsControllerOptions` and export the `ProviderScope` type (`'off' | 'in-app' | 'all'`); when it returns a non-`off` scope, `RampsController.getQuotes` widens its native-only auto-selection (the `autoSelectProvider` / `restrictToKnownOrNativeProviders` path) to every supporting provider and returns the best in-app quote at `success[0]`, excluding external-browser and custom-action quotes and enforcing per-provider fiat limits, while the default stays native-only and explicit-`providers` callers are unaffected ([#9353](https://github.com/MetaMask/core/pull/9353))
- Add an optional `getDefaultRedirectUrl` callback to `RampsControllerOptions`; on the widened in-app auto-selection path, when the caller omits `redirectUrl`, `RampsController.getQuotes` now supplies this default so aggregator quotes carry the `buyURL`/`buyWidget` widget URL the app needs, while an explicit caller `redirectUrl` always wins and scope `off` never injects a default ([#9353](https://github.com/MetaMask/core/pull/9353))

### Changed

- Refetch the countries catalog on every app startup via `init()` so region preset amounts (e.g. default amounts) stay current ([#9261](https://github.com/MetaMask/core/pull/9261))
- Re-sync `userRegion` preset amounts from the countries catalog after each `getCountries()` call ([#9261](https://github.com/MetaMask/core/pull/9261))
- On startup, `init()` now preserves an already-persisted `userRegion` when the refreshed countries catalog is momentarily empty or no longer lists that region, instead of clearing it ([#9261](https://github.com/MetaMask/core/pull/9261))
- Bump `@metamask/messenger` from `^1.2.0` to `^2.0.0` ([#9392](https://github.com/MetaMask/core/pull/9392))

## [15.0.0]

### Changed

- **BREAKING:** `RampsController.getProviders`, `RampsService.getProviders`, `RampsController.getPaymentMethods`, and `RampsService.getPaymentMethods` no longer accept a `fiat` query filter; region local fiat filtering is applied server-side when omitted ([#9245](https://github.com/MetaMask/core/pull/9245))
- Bump `@metamask/controller-utils` from `^12.2.0` to `^12.3.0` ([#9218](https://github.com/MetaMask/core/pull/9218))

## [14.3.0]

### Added

- Export `getTransakApiMessage` and `isTransakPhoneRegisteredError` for consumers handling `TransakApiError`, and centralize known Transak API error codes in `transakErrorCodes.ts` ([#9135](https://github.com/MetaMask/core/pull/9135))

### Changed

- Bump `@metamask/profile-sync-controller` from `^28.1.1` to `^28.2.0` ([#9119](https://github.com/MetaMask/core/pull/9119))

### Fixed

- Compare internal order codes (from canonical order `id`) instead of provider-native `providerOrderId` when merging orders in `RampsController.addOrder` and `RampsController.getOrder` ([#9159](https://github.com/MetaMask/core/pull/9159))

## [14.2.0]

### Changed

- `RampsService.getQuotes` now sends an `Authorization: Bearer <token>` header, sourcing the token from `AuthenticationController:getBearerToken` (already a required messenger action since `14.0.0`); the call throws if no token is available (e.g. the wallet is locked or the user is signed out) ([#8888](https://github.com/MetaMask/core/pull/8888))
- Bump `@metamask/controller-utils` from `^12.1.0` to `^12.2.0` ([#9058](https://github.com/MetaMask/core/pull/9058), [#9083](https://github.com/MetaMask/core/pull/9083))

## [14.1.1]

### Fixed

- Fix Transak Native deposits failing on staging/UAT with a 400 `paymentMethod is required parameter` error by mapping canonical payment method IDs supplied without the `/payments/` prefix (e.g. `apple-pay`) to their deposit-format equivalents, in addition to the prefixed forms (e.g. `/payments/apple-pay`) ([#8980](https://github.com/MetaMask/core/pull/8980))

## [14.1.0]

### Added

- Add `autoSelectProvider`, `preferredProviderIds`, and `restrictToKnownOrNativeProviders` options to the `getQuotes` method (and `RampsController:getQuotes` messenger action) ([#8949](https://github.com/MetaMask/core/pull/8949))
  - When `autoSelectProvider` is `true` and `providers` is omitted, `getQuotes` resolves a provider supporting the requested `assetId` for that request only, against the provider list for the requested region. It prefers the currently selected provider (when it supports the asset), then preferred providers — taken from `preferredProviderIds` when supplied, otherwise derived from the user's completed-order history (most recent first) — then a native provider (identified by the API's `type` field, e.g. Transak Native), then the first supporting provider. The selected-provider state is never mutated.
  - When `restrictToKnownOrNativeProviders` is `true`, auto-selection still honors a previously-used provider (selected, then completed-order history) but otherwise resolves only a native provider, introducing no other provider; an explicitly passed `providers` list is filtered to those supporting the region/asset. If nothing qualifies, `getQuotes` returns an empty response instead of quoting other providers.
- Add an optional `type` field (`'native' | 'aggregator'`) to the `Provider` type, mirroring the v2 providers API ([#8949](https://github.com/MetaMask/core/pull/8949))

### Changed

- Bump `@metamask/profile-sync-controller` from `^28.1.0` to `^28.1.1` ([#8912](https://github.com/MetaMask/core/pull/8912))

## [14.0.0]

### Added

- Authenticate ramps requests by sourcing a bearer token from `AuthenticationController:getBearerToken` and sending it as an `Authorization: Bearer <token>` header for `getBuyWidgetUrl` ([#8843](https://github.com/MetaMask/core/pull/8843))
- Add `@metamask/profile-sync-controller` `^28.1.0` as a runtime dependency ([#8843](https://github.com/MetaMask/core/pull/8843))

### Changed

- **BREAKING:** `RampsServiceMessenger` now requires the `AuthenticationController:getBearerToken` action to be delegated to it; consumers must register this action handler before calling `getBuyWidgetUrl`, otherwise the call will throw ([#8843](https://github.com/MetaMask/core/pull/8843))
- Bump `@metamask/controller-utils` from `^12.0.0` to `^12.1.0` ([#8774](https://github.com/MetaMask/core/pull/8774))

## [13.3.1]

### Changed

- Bump `@metamask/controller-utils` from `^11.20.0` to `^12.0.0` ([#8755](https://github.com/MetaMask/core/pull/8755))

## [13.3.0]

### Changed

- Bump `@metamask/messenger` from `^1.1.1` to `^1.2.0` ([#8632](https://github.com/MetaMask/core/pull/8632))
- `RampsService` routes `RampsEnvironment.Development` to dev-api base URLs; regions requests in development omit the `-cache` hostname segment used in staging and production ([#8574](https://github.com/MetaMask/core/pull/8574))

### Fixed

- Tag circuit-breaker errors in `RampsController` with a stable `CIRCUIT_BREAKER_OPEN` error key so clients can localize the fallback copy without depending on internal Cockatiel text. ([#8596](https://github.com/MetaMask/core/pull/8596))

## [13.2.0]

### Changed

- Bump `@metamask/base-controller` from `^9.0.1` to `^9.1.0` ([#8457](https://github.com/MetaMask/core/pull/8457))

### Fixed

- `TransakService.verifyUserOtp` no longer retries on failure, preventing single-use OTP attempts from being silently consumed when consumers configure a non-zero `maxRetries` in `policyOptions` ([#8468](https://github.com/MetaMask/core/pull/8468))

## [13.1.0]

### Added

- Add optional provider fiat/payment buy limits to `Provider` so consumers can validate quote amounts before requesting quotes ([#8405](https://github.com/MetaMask/core/pull/8405))

## [13.0.0]

### Changed

- Bump `@metamask/controller-utils` from `^11.19.0` to `^11.20.0` ([#8344](https://github.com/MetaMask/core/pull/8344))
- Bump `@metamask/messenger` from `^1.0.0` to `^1.1.1` ([#8364](https://github.com/MetaMask/core/pull/8364), [#8373](https://github.com/MetaMask/core/pull/8373))
- **BREAKING:** Removed controller-side data fetching (`fireAndForget`) from `setSelectedToken`, `setSelectedProvider`, and `setUserRegion`; ramp data fetching is now fully driven by the client ([#8354](https://github.com/MetaMask/core/pull/8354))
  - Client migration: trigger `getTokens`, `getProviders`, and `getPaymentMethods` from the client layer (for example, React Query hooks/effects) when region/provider/token changes.
  - `setSelectedProvider`/`setSelectedToken`/`setUserRegion` now focus on selection/state updates and no longer implicitly fetch dependent resources.
- `setSelectedProvider` and `setSelectedPaymentMethod` accept a full object in addition to an ID string; no longer throw when data is not loaded ([#8354](https://github.com/MetaMask/core/pull/8354))

### Fixed

- `init` no longer overrides a persisted `userRegion` with the geolocation endpoint response ([#8354](https://github.com/MetaMask/core/pull/8354))

## [12.1.0]

### Added

- Add `providerAutoSelected` boolean to `RampsControllerState` to track whether the selected provider was system-guessed (soft selection) or user-chosen ([#8305](https://github.com/MetaMask/core/pull/8305))
- Add optional `options` parameter to `setSelectedProvider` accepting `{ autoSelected?: boolean }` to control the `providerAutoSelected` flag ([#8305](https://github.com/MetaMask/core/pull/8305))

### Changed

- Bump `@metamask/base-controller` from `^9.0.0` to `^9.0.1` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Bump `@metamask/messenger` from `^0.3.0` to `^1.0.0` ([#8317](https://github.com/MetaMask/core/pull/8317))
- Stop persisting `providers` and `tokens` state across sessions to prevent stale data when API availability changes ([#8307](https://github.com/MetaMask/core/pull/8307))
- `RampsService.getOrder` and `getOrderFromCallback` accept provider codes with or without a `/providers/` prefix; API paths use the short provider segment. `RampsController` forwards provider ids from order polling to the service without stripping the prefix. ([#8278](https://github.com/MetaMask/core/pull/8278))

### Fixed

- `addPrecreatedOrder` normalizes `providerCode` (stripping a leading `/providers/` when present) and sets stub `provider.id` to `/providers/{code}` so precreated stubs match the resource id shape used elsewhere for polling. ([#8289](https://github.com/MetaMask/core/pull/8289))

## [12.0.1]

### Added

- Expose all public `RampsController` methods through its messenger ([#8221](https://github.com/MetaMask/core/pull/8221))
  - The following actions are now available:
    - `RampsController:executeRequest`
    - `RampsController:abortRequest`
    - `RampsController:getRequestState`
    - `RampsController:setUserRegion`
    - `RampsController:setSelectedProvider`
    - `RampsController:init`
    - `RampsController:getCountries`
    - `RampsController:getTokens`
    - `RampsController:getProviders`
    - `RampsController:getPaymentMethods`
    - `RampsController:setSelectedPaymentMethod`
    - `RampsController:addOrder`
    - `RampsController:removeOrder`
    - `RampsController:startOrderPolling`
    - `RampsController:stopOrderPolling`
    - `RampsController:getBuyWidgetData`
    - `RampsController:addPrecreatedOrder`
    - `RampsController:getOrderFromCallback`
    - `RampsController:transakSetApiKey`
    - `RampsController:transakSetAccessToken`
    - `RampsController:transakClearAccessToken`
    - `RampsController:transakSetAuthenticated`
    - `RampsController:transakResetState`
    - `RampsController:transakSendUserOtp`
    - `RampsController:transakVerifyUserOtp`
    - `RampsController:transakLogout`
    - `RampsController:transakGetUserDetails`
    - `RampsController:transakGetBuyQuote`
    - `RampsController:transakGetKycRequirement`
    - `RampsController:transakGetAdditionalRequirements`
    - `RampsController:transakCreateOrder`
    - `RampsController:transakGetOrder`
    - `RampsController:transakGetUserLimits`
    - `RampsController:transakRequestOtt`
    - `RampsController:transakGeneratePaymentWidgetUrl`
    - `RampsController:transakSubmitPurposeOfUsageForm`
    - `RampsController:transakPatchUser`
    - `RampsController:transakSubmitSsnDetails`
    - `RampsController:transakConfirmPayment`
    - `RampsController:transakGetTranslation`
    - `RampsController:transakGetIdProofStatus`
    - `RampsController:transakCancelOrder`
    - `RampsController:transakCancelAllActiveOrders`
    - `RampsController:transakGetActiveOrders`
  - Corresponding action types are now exported (e.g. `RampsControllerGetOrderAction`)

### Fixed

- Fix `getOrder` wallet handling so API requests and event payloads stay valid and consistent ([#8251](https://github.com/MetaMask/core/pull/8251))
  - `RampsService.getOrder` no longer sends an empty `wallet` query parameter, avoiding invalid API responses (e.g. 400).
  - `RampsController.getOrder` persists and returns a healed order (`walletAddress` and `providerOrderId`) so controller state matches the return value and `RampsController:orderStatusChanged` listeners.

## [12.0.0]

### Changed

- **BREAKING:** Update state hydration to make `init()` idempotent and remove `hydrateState()` ([#8157](https://github.com/MetaMask/core/pull/8157))

### Removed

- Remove `hydrateState()` — use `init()` as the single entry point for controller hydration

## [11.0.0]

### Changed

- **BREAKING:** Replace `getWidgetUrl` with `getBuyWidgetData` (returns `BuyWidget | null`); add `addPrecreatedOrder` for custom-action ramp flows (e.g., PayPal, Robinhood, Coinbase) ([#8100](https://github.com/MetaMask/core/pull/8100))

## [10.2.0]

### Fixed

- `setSelectedProvider` no longer fetches payment methods when the selected token is explicitly not supported by the new provider, preventing empty payment method state with no user feedback ([#8103](https://github.com/MetaMask/core/pull/8103))

## [10.1.0]

### Added

- Added `orders: RampsOrder[]` to controller state with persistence, along with crud methods([#8045](https://github.com/MetaMask/core/pull/8045))
- Added `apiMessage` property to `TransakApiError` to surface human-readable error messages from the Transak API (e.g. OTP rate-limit cooldown) ([#8072](https://github.com/MetaMask/core/pull/8072))
- Added `RampsController:orderStatusChanged` event, published when a polled order's status transitions ([#8045](https://github.com/MetaMask/core/pull/8045))
- Add messenger actions for `RampsController:setSelectedToken`, `RampsController:getQuotes`, and `RampsController:getOrder`, register their handlers in `RampsController`, and export the action types from the package index ([#8081](https://github.com/MetaMask/core/pull/8081))

## [10.0.0]

### Changed

- **BREAKING:** Remove `state.quotes` and `state.widgetUrl` from RampsController state. Quote and widget URL data are now managed by consuming components ([#8013](https://github.com/MetaMask/core/pull/8013))
- **BREAKING:** Remove `fetchQuotesForSelection()` and `setSelectedQuote()`. Components call `getQuotes()` directly and manage selection locally ([#8013](https://github.com/MetaMask/core/pull/8013))
- Simplify `getWidgetUrl()` to a pure fetch-and-return API; it no longer reads or writes controller state ([#8013](https://github.com/MetaMask/core/pull/8013))
- Improve `TransakService` error handling ([#8010](https://github.com/MetaMask/core/pull/8010))
- **BREAKING:** Replace `startQuotePolling()`/`stopQuotePolling()` with `fetchQuotesForSelection()` — quotes are now fetched once per call instead of polling on a 15-second interval ([#7999](https://github.com/MetaMask/core/pull/7999))

### Removed

- Remove `stopQuotePolling()` method (no interval to stop) ([#7999](https://github.com/MetaMask/core/pull/7999))
- Remove internal polling restart logic (`#restartPollingIfActive`) from `setSelectedProvider`, `setSelectedToken`, and `setSelectedPaymentMethod` ([#7999](https://github.com/MetaMask/core/pull/7999))

### Fixed

- Fix RampsController flaky test ([#8018](https://github.com/MetaMask/core/pull/8018))

## [9.0.0]

### Added

- Add `getOrder` and `getOrderFromCallback` methods to `RampsService` and `RampsController` for V2 unified order polling, along with new `RampsOrder`, `RampsOrderFiatCurrency`, `RampsOrderCryptoCurrency`, `RampsOrderPaymentMethod`, and `RampsOrderStatus` types ([#7934](https://github.com/MetaMask/core/pull/7934))

### Changed

- **BREAKING:** Use concrete types in `RampsOrder` instead of `string | Object` unions for `provider`, `cryptoCurrency`, `fiatCurrency`, `paymentMethod`, and `network` fields ([#8000](https://github.com/MetaMask/core/pull/8000))
- Bump `@metamask/controller-utils` from `^11.18.0` to `^11.19.0` ([#7995](https://github.com/MetaMask/core/pull/7995))

## [8.1.0]

### Added

- Add `widgetUrl` resource state that automatically fetches and stores the buy widget URL whenever the selected quote changes ([#7920](https://github.com/MetaMask/core/pull/7920))
- Add `TransakService` for native Transak deposit flow with OTP auth, KYC, quoting, order lifecycle, and payment widget URL generation ([#7922](https://github.com/MetaMask/core/pull/7922))
- Add `nativeProviders.transak` state slice and controller convenience methods for driving the Transak native deposit flow ([#7922](https://github.com/MetaMask/core/pull/7922))

### Changed

- Refactor: Consolidate reset logic with a shared resetResource helper and fix abort handling for dependent resources ([#7818](https://github.com/MetaMask/core/pull/7818))

## [8.0.0]

### Changed

- **BREAKING:** Quote filter param renamed from `provider` to `providers` array in `getQuotes()` and `RampsService.getQuotes()` ([#7892](https://github.com/MetaMask/core/pull/7892))
- **BREAKING:** Make `getWidgetUrl()` async to fetch the actual provider widget URL from the `buyURL` endpoint ([#7881](https://github.com/MetaMask/core/pull/7881))

## [7.1.0]

### Fixed

- Fixes quote race condition bug with missing payment method ([#7863](https://github.com/MetaMask/core/pull/7863))

## [7.0.0]

### Added

- Update payment method delay type to match API response structure ([#7845](https://github.com/MetaMask/core/pull/7845))
- Add automatic quote polling with `startQuotePolling()`, `stopQuotePolling()`, and `setSelectedQuote()` methods, with auto-selection when a single quote is returned ([#7824](https://github.com/MetaMask/core/pull/7824))

### Changed

- **BREAKING:** Require provider selection for quote polling and update quotes API endpoint to `/v2/quotes` ([#7846](https://github.com/MetaMask/core/pull/7846))

## [6.0.0]

### Changed

- **BREAKING:** Restructure `RampsControllerState` to use nested `ResourceState` objects for each resource with `data`, `selected`, `isLoading`, and `error` ([#7779](https://github.com/MetaMask/core/pull/7779))

## [5.1.0]

### Added

- Add quotes functionality to RampsController ([#7747](https://github.com/MetaMask/core/pull/7747))

### Fixed

- Fix `getQuotes()` to trim `assetId` and `walletAddress` parameters before use ([#7793](https://github.com/MetaMask/core/pull/7793))

## [5.0.0]

### Added

- Add `hydrateState()` method to fetch providers and tokens for user region ([#7707](https://github.com/MetaMask/core/pull/7707))
- Add `countries` state to RampsController with 24 hour TTL caching ([#7707](https://github.com/MetaMask/core/pull/7707))
- Add `SupportedActions` type for `{ buy: boolean; sell: boolean }` support info
- Add `selectedToken` state and `setSelectedToken()` method to RampsController ([#7734](https://github.com/MetaMask/core/pull/7734))
- Add `RampsEnvironment.Local` option to RampsService for local development ([#7734](https://github.com/MetaMask/core/pull/7734))

### Changed

- Reorganize `init()` to only fetch geolocation and countries; remove token and provider fetching ([#7707](https://github.com/MetaMask/core/pull/7707))
- **BREAKING:** Change `Country.supported` and `State.supported` from `boolean` to `SupportedActions` object. The API now returns buy/sell support info in a single call.
- **BREAKING:** Remove `action` parameter from `getCountries()`. Countries are no longer fetched separately for buy/sell actions.
- **BREAKING:** Rename `preferredProvider` to `selectedProvider` and `setPreferredProvider()` to `setSelectedProvider()` in RampsController ([#7734](https://github.com/MetaMask/core/pull/7734))
- **BREAKING:** Change `getPaymentMethods(options)` to `getPaymentMethods(region, options)` with region as first parameter ([#7734](https://github.com/MetaMask/core/pull/7734))

## [4.1.0]

### Added

- Add sync trigger methods to RampsController ([#7662](https://github.com/MetaMask/core/pull/7662))
- Export `RampAction` type for `'buy' | 'sell'` ramp actions ([#7663](https://github.com/MetaMask/core/pull/7663))
- Add payment methods support with `getPaymentMethods()` method, `paymentMethods` and `selectedPaymentMethod` state ([#7665](https://github.com/MetaMask/core/pull/7665))

### Changed

- Evict expired cache entries based on TTL in addition to size-based eviction ([#7674](https://github.com/MetaMask/core/pull/7674))
- Update `getTokens()` to use v2 API endpoint and support optional provider parameter ([#7664](https://github.com/MetaMask/core/pull/7664))

## [4.0.0]

### Added

- Add `preferredProvider` state and `setPreferredProvider()` method to RampsController ([#7617](https://github.com/MetaMask/core/pull/7617))
- Export `UserRegion` type ([#7646](https://github.com/MetaMask/core/pull/7646))
- Add `defaultAmount` and `quickAmounts` fields to the `Country` type ([#7645](https://github.com/MetaMask/core/pull/7645))
- Add `providers` state and `getProviders()` method to RampsController. Providers are automatically fetched on init and when the region changes ([#7652](https://github.com/MetaMask/core/pull/7652))

### Changed

- **BREAKING:** Change `userRegion` from `string | null` to `UserRegion | null`. Access region code via `userRegion.regionCode`. ([#7646](https://github.com/MetaMask/core/pull/7646))
- Update `getCountries()` endpoint to use v2 API (`v2/regions/countries`) ([#7645](https://github.com/MetaMask/core/pull/7645))
- Add `getApiPath()` helper function for versioned API paths with v2 default ([#7645](https://github.com/MetaMask/core/pull/7645))

### Removed

- **BREAKING:** Remove eligibility concept from RampsController. The `eligibility` state, `updateEligibility()` method, and `getEligibility()` service method have been removed. The `Eligibility` type and `RampsServiceGetEligibilityAction` are no longer exported. ([#7651](https://github.com/MetaMask/core/pull/7651))

## [3.0.0]

### Added

- Add `getTokens()` method to RampsController for fetching available tokens by region and action ([#7607](https://github.com/MetaMask/core/pull/7607))

### Changed

- **BREAKING:** Rename `geolocation` to `userRegion` and `updateGeolocation()` to `updateUserRegion()` in RampsController ([#7563](https://github.com/MetaMask/core/pull/7563))
- Bump `@metamask/controller-utils` from `^11.17.0` to `^11.18.0` ([#7583](https://github.com/MetaMask/core/pull/7583))

## [2.1.0]

### Added

- Add eligibility state ([#7539](https://github.com/MetaMask/core/pull/7539))
- Add `createRequestSelector` utility function for creating memoized selectors for RampsController request states ([#7554](https://github.com/MetaMask/core/pull/7554))
- Add request caching infrastructure with TTL, deduplication, and abort support ([#7536](https://github.com/MetaMask/core/pull/7536))
- Add `init()` and `setUserRegion()` methods to RampsController ([#7563](https://github.com/MetaMask/core/pull/7563))

### Changed

- Bump `@metamask/controller-utils` from `^11.16.0` to `^11.17.0` ([#7534](https://github.com/MetaMask/core/pull/7534))

## [2.0.0]

### Changed

- **BREAKING:** Rename `OnRampService` to `RampsService` and `OnRampEnvironment` to `RampsEnvironment` ([#7502](https://github.com/MetaMask/core/pull/7502))
- **BREAKING:** Rename action types from `OnRampService:*` to `RampsService:*` (e.g., `OnRampService:getGeolocation` → `RampsService:getGeolocation`) ([#7502](https://github.com/MetaMask/core/pull/7502))

### Fixed

- Fix `RampsService#getGeolocation` to read response text within the policy execution and return parsed text ([#7502](https://github.com/MetaMask/core/pull/7502))

## [1.0.0]

### Added

- Initial release ([#7316](https://github.com/MetaMask/core/pull/7316))
  - Add `RampsController` for managing on/off ramps state
  - Add `OnRampService` for interacting with the OnRamp API
  - Add geolocation detection via IP address lookup

[Unreleased]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@17.0.0...HEAD
[17.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@16.0.0...@metamask/ramps-controller@17.0.0
[16.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@15.1.0...@metamask/ramps-controller@16.0.0
[15.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@15.0.0...@metamask/ramps-controller@15.1.0
[15.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@14.3.0...@metamask/ramps-controller@15.0.0
[14.3.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@14.2.0...@metamask/ramps-controller@14.3.0
[14.2.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@14.1.1...@metamask/ramps-controller@14.2.0
[14.1.1]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@14.1.0...@metamask/ramps-controller@14.1.1
[14.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@14.0.0...@metamask/ramps-controller@14.1.0
[14.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@13.3.1...@metamask/ramps-controller@14.0.0
[13.3.1]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@13.3.0...@metamask/ramps-controller@13.3.1
[13.3.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@13.2.0...@metamask/ramps-controller@13.3.0
[13.2.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@13.1.0...@metamask/ramps-controller@13.2.0
[13.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@13.0.0...@metamask/ramps-controller@13.1.0
[13.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@12.1.0...@metamask/ramps-controller@13.0.0
[12.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@12.0.1...@metamask/ramps-controller@12.1.0
[12.0.1]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@12.0.0...@metamask/ramps-controller@12.0.1
[12.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@11.0.0...@metamask/ramps-controller@12.0.0
[11.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@10.2.0...@metamask/ramps-controller@11.0.0
[10.2.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@10.1.0...@metamask/ramps-controller@10.2.0
[10.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@10.0.0...@metamask/ramps-controller@10.1.0
[10.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@9.0.0...@metamask/ramps-controller@10.0.0
[9.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@8.1.0...@metamask/ramps-controller@9.0.0
[8.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@8.0.0...@metamask/ramps-controller@8.1.0
[8.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@7.1.0...@metamask/ramps-controller@8.0.0
[7.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@7.0.0...@metamask/ramps-controller@7.1.0
[7.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@6.0.0...@metamask/ramps-controller@7.0.0
[6.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@5.1.0...@metamask/ramps-controller@6.0.0
[5.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@5.0.0...@metamask/ramps-controller@5.1.0
[5.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@4.1.0...@metamask/ramps-controller@5.0.0
[4.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@4.0.0...@metamask/ramps-controller@4.1.0
[4.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@3.0.0...@metamask/ramps-controller@4.0.0
[3.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@2.1.0...@metamask/ramps-controller@3.0.0
[2.1.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@2.0.0...@metamask/ramps-controller@2.1.0
[2.0.0]: https://github.com/MetaMask/core/compare/@metamask/ramps-controller@1.0.0...@metamask/ramps-controller@2.0.0
[1.0.0]: https://github.com/MetaMask/core/releases/tag/@metamask/ramps-controller@1.0.0
